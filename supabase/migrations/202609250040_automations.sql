begin;
alter table public.automation_runs add column next_attempt_at timestamptz not null default now();
create index automation_runs_due on public.automation_runs(next_attempt_at,id) where state='pending';

create function app_private.render_automation(p_template text,p_business text,p_reward text) returns text
language plpgsql immutable set search_path='' as $$
declare rendered text;
begin
 rendered:=replace(p_template,'{{business_name}}',p_business);
 if p_reward is not null then rendered:=replace(rendered,'{{reward_name}}',p_reward); end if;
 if rendered ~ '[{}]' then return null; end if;
 return btrim(rendered);
end $$;

create function public.automation_configuration(p_business uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.communication_staff(p_business);
 return jsonb_build_object('businessId',p_business,'businessName',(select display_name from public.businesses where id=p_business),
  'rules',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'enabled',r.enabled,
   'titleTemplate',r.title_template,'bodyTemplate',r.body_template,'inactiveDays',r.inactive_days,
   'rewardVersionId',r.reward_version_id,'offerId',r.offer_id,'birthdayValidityDays',r.birthday_validity_days,
   'version',r.version,'lastRun',(select max(a.created_at) from public.automation_runs a where a.rule_id=r.id),
   'suppressed',(select count(*) from public.automation_runs a where a.rule_id=r.id and a.state='suppressed'),
   'failed',(select count(*) from public.automation_runs a where a.rule_id=r.id and a.state='failed')) order by r.kind),'[]'::jsonb)
   from public.automation_rules r where r.business_id=p_business),
  'rewards',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'title',v.title,'unitCost',v.unit_cost) order by v.title),'[]'::jsonb)
   from public.rewards r join public.reward_versions v on v.id=r.published_version_id where r.business_id=p_business and r.status='published'),
  'offers',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'title',o.title,'isTemplate',o.is_automation_template,
   'kind',o.kind,'expiresAt',o.expires_at) order by o.title),'[]'::jsonb)
   from public.offers o where o.business_id=p_business and o.status='published' and o.expires_at>clock_timestamp()
    and o.generated_by_run_id is null),
  'history',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'kind',r.kind,'state',a.state,
   'scheduledAt',a.scheduled_at,'suppressionReason',a.suppression_reason) order by a.created_at desc,a.id desc),'[]'::jsonb)
   from (select * from public.automation_runs where business_id=p_business order by created_at desc,id desc limit 50) a
   join public.automation_rules r on r.id=a.rule_id));
end $$;

create function public.save_automation_rule(p_business uuid,p_input jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;r public.automation_rules;v_kind text;offer public.offers;
begin
 perform app_private.strict_keys(p_input,array['kind','enabled','titleTemplate','bodyTemplate','inactiveDays',
  'rewardVersionId','offerId','birthdayValidityDays','version']);
 staff:=app_private.communication_staff(p_business);
 if not app_private.entitled(p_business) then raise exception 'subscription_inactive' using errcode='42501'; end if;
 v_kind:=p_input->>'kind';
 if v_kind not in ('reward_available','inactivity','birthday') or (p_input->>'enabled')::boolean is null
  or char_length(btrim(coalesce(p_input->>'titleTemplate',''))) not between 3 and 80
  or char_length(btrim(coalesce(p_input->>'bodyTemplate',''))) not between 10 and 500
  or app_private.render_automation(p_input->>'titleTemplate','Sample cafe',case when v_kind='reward_available' then 'Sample reward' end) is null
  or app_private.render_automation(p_input->>'bodyTemplate','Sample cafe',case when v_kind='reward_available' then 'Sample reward' end) is null
  or (v_kind='reward_available' and (p_input->>'rewardVersionId' is null or p_input->>'inactiveDays' is not null
    or p_input->>'offerId' is not null or p_input->>'birthdayValidityDays' is not null))
  or (v_kind='inactivity' and ((p_input->>'inactiveDays')::integer not between 7 and 365 or p_input->>'rewardVersionId' is not null
    or p_input->>'birthdayValidityDays' is not null))
  or (v_kind='birthday' and (p_input->>'offerId' is null or (p_input->>'birthdayValidityDays')::integer not between 1 and 30
    or p_input->>'rewardVersionId' is not null or p_input->>'inactiveDays' is not null))
  then raise exception 'invalid_input' using errcode='22023'; end if;
 if p_input->>'rewardVersionId' is not null and not exists(select from public.rewards x
  where x.business_id=p_business and x.published_version_id=(p_input->>'rewardVersionId')::uuid and x.status='published')
 then raise exception 'invalid_reward' using errcode='22023'; end if;
 if p_input->>'offerId' is not null then
  select * into offer from public.offers where business_id=p_business and id=(p_input->>'offerId')::uuid;
  if offer.id is null or offer.status<>'published' or offer.expires_at<=clock_timestamp()
   or (v_kind='birthday' and (not offer.is_automation_template or offer.kind='informational' or offer.audience<>'recipient_list'))
   or (v_kind='inactivity' and offer.is_automation_template)
  then raise exception 'invalid_offer' using errcode='22023'; end if;
 end if;
 select * into r from public.automation_rules where business_id=p_business and automation_rules.kind=v_kind for update;
 if r.id is null then
  if p_input->>'version' is not null then raise exception 'stale' using errcode='40001'; end if;
  insert into public.automation_rules(business_id,kind,enabled,title_template,body_template,inactive_days,
   reward_version_id,offer_id,birthday_validity_days)
  values(p_business,v_kind,(p_input->>'enabled')::boolean,btrim(p_input->>'titleTemplate'),btrim(p_input->>'bodyTemplate'),
   (p_input->>'inactiveDays')::integer,(p_input->>'rewardVersionId')::uuid,(p_input->>'offerId')::uuid,
   (p_input->>'birthdayValidityDays')::integer) returning * into r;
 else
  if r.version<>(p_input->>'version')::integer then raise exception 'stale' using errcode='40001'; end if;
  update public.automation_rules set enabled=(p_input->>'enabled')::boolean,
   title_template=btrim(p_input->>'titleTemplate'),body_template=btrim(p_input->>'bodyTemplate'),
   inactive_days=(p_input->>'inactiveDays')::integer,reward_version_id=(p_input->>'rewardVersionId')::uuid,
   offer_id=(p_input->>'offerId')::uuid,birthday_validity_days=(p_input->>'birthdayValidityDays')::integer,
   version=version+1,updated_at=clock_timestamp() where id=r.id returning * into r;
 end if;
 perform app_private.audit(p_business,'automation.rule_saved','automation_rule',r.id,p_correlation,
  jsonb_build_object('kind',r.kind,'enabled',r.enabled,'version',r.version));
 return jsonb_build_object('ruleId',r.id,'version',r.version,'enabled',r.enabled);
end $$;

create function app_private.create_automation_run(p_rule public.automation_rules,p_member uuid,p_key text,
 p_scheduled timestamptz,p_expires timestamptz,p_purchase uuid default null,p_ledger uuid default null,p_year integer default null)
returns uuid language plpgsql set search_path='' as $$
declare business_name text;reward_name text;title text;body text;run_id uuid;invalid boolean;
begin
 if p_expires<=clock_timestamp() then return null; end if;
 select display_name into business_name from public.businesses where id=p_rule.business_id;
 if p_rule.reward_version_id is not null then select rv.title into reward_name from public.reward_versions rv where rv.id=p_rule.reward_version_id; end if;
 title:=app_private.render_automation(p_rule.title_template,business_name,reward_name);
 body:=app_private.render_automation(p_rule.body_template,business_name,reward_name);
 invalid:=title is null or body is null or char_length(title) not between 3 and 80 or char_length(body) not between 10 and 500;
 insert into public.automation_runs(business_id,rule_id,rule_version,membership_id,event_key,state,scheduled_at,
  expires_at,suppression_reason,rendered_title,rendered_body,rule_snapshot,source_purchase_id,source_ledger_entry_id,birthday_year)
 values(p_rule.business_id,p_rule.id,p_rule.version,p_member,p_key,case when invalid then 'failed' else 'pending' end,
  p_scheduled,p_expires,case when invalid then 'render_invalid' end,
  case when invalid then p_rule.title_template else title end,case when invalid then p_rule.body_template else body end,
  to_jsonb(p_rule),p_purchase,p_ledger,p_year)
 on conflict(business_id,membership_id,event_key) do nothing returning id into run_id;
 if run_id is not null then
  insert into public.outbox_events(business_id,event_type,event_key,schema_version,payload)
  values(p_rule.business_id,'automation.created',run_id::text,1,jsonb_build_object('runId',run_id))
  on conflict(event_type,event_key) do nothing;
 end if;
 return run_id;
end $$;

create function app_private.reward_crossing() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.automation_rules;reward public.reward_versions;balance_units bigint;
begin
 if new.units<=0 or new.entry_kind not in ('purchase_base','promotion_bonus','referral_bonus') then return new; end if;
 select * into r from public.automation_rules where business_id=new.business_id and kind='reward_available' and enabled;
 if r.id is null then return new; end if;
 select * into reward from public.reward_versions where id=r.reward_version_id;
 if not exists(select from public.rewards where business_id=new.business_id and published_version_id=reward.id and status='published') then return new; end if;
 select units into balance_units from public.balances where business_id=new.business_id and membership_id=new.membership_id;
 if balance_units>=reward.unit_cost and balance_units-new.units<reward.unit_cost then
  perform app_private.create_automation_run(r,new.membership_id,
   'reward:'||reward.id::text||':'||new.id::text,new.occurred_at,new.occurred_at+interval '24 hours',null,new.id,null);
 end if;
 return new;
end $$;
create trigger zz_automation_reward_crossing after insert on public.ledger_entries
 for each row execute function app_private.reward_crossing();

create function public.worker_scan_automations() returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.automation_rules;m record;run_id uuid;template public.offers;
 local_day date;day_start timestamptz;original_end timestamptz;instance public.offers;
 created integer:=0;year_number integer;birthday_day integer;
begin
 for r in select * from public.automation_rules where enabled and kind='inactivity'
  and exists(select from public.businesses b where b.id=public.automation_rules.business_id and b.status='active') limit 100 loop
  for m in select x.id,p.id as source_id,p.occurred_at from public.memberships x
   join lateral (select id,occurred_at from public.purchases p where p.business_id=r.business_id and p.membership_id=x.id
    and p.status='committed' and p.qualifies_for_loyalty order by occurred_at desc,id desc limit 1) p on true
   where x.business_id=r.business_id and x.status='active'
    and p.occurred_at+make_interval(days=>r.inactive_days)<=clock_timestamp()
    and p.occurred_at+make_interval(days=>r.inactive_days)+interval '72 hours'>clock_timestamp()
    and not exists(select from public.automation_runs a where a.business_id=r.business_id and a.membership_id=x.id
     and a.event_key='inactive:'||p.id::text)
   order by x.id limit 100 loop
   run_id:=app_private.create_automation_run(r,m.id,'inactive:'||m.source_id::text,
    m.occurred_at+make_interval(days=>r.inactive_days),
    m.occurred_at+make_interval(days=>r.inactive_days)+interval '72 hours',m.source_id,null,null);
   if run_id is not null then created:=created+1; end if;
  end loop;
 end loop;
 for r in select * from public.automation_rules where enabled and kind='birthday'
  and exists(select from public.businesses b where b.id=public.automation_rules.business_id and b.status='active') limit 100 loop
  select * into template from public.offers where business_id=r.business_id and id=r.offer_id and status='published'
   and is_automation_template and expires_at>clock_timestamp();
  if template.id is null then continue; end if;
  select (clock_timestamp() at time zone b.timezone)::date into local_day from public.businesses b where b.id=r.business_id;
  for m in select x.id,days.at_date::date as birthday_date,p.birthday_month,p.birthday_day,
    p.birthday_changed_at,cp.changed_at as consent_changed
   from public.memberships x join public.profiles p on p.user_id=x.customer_user_id
   join public.consent_preferences cp on cp.business_id=x.business_id and cp.membership_id=x.id
    and cp.channel='inbox' and cp.purpose='birthday' and cp.allowed
   cross join lateral generate_series(local_day-(r.birthday_validity_days-1),local_day,interval '1 day') days(at_date)
   where x.business_id=r.business_id and x.status='active' and p.birthday_month=extract(month from days.at_date)
    and (p.birthday_day=extract(day from days.at_date) or (p.birthday_month=2 and p.birthday_day=29
     and extract(month from days.at_date)=2 and extract(day from days.at_date)=28
     and extract(day from (date_trunc('month',days.at_date)+interval '1 month - 1 day'))=28))
   and p.birthday_changed_at<(days.at_date::date::timestamp at time zone
    (select timezone from public.businesses where id=r.business_id))
   and cp.changed_at<(days.at_date::date::timestamp at time zone
    (select timezone from public.businesses where id=r.business_id))
   and not exists(select from public.automation_runs a where a.business_id=r.business_id and a.membership_id=x.id
    and a.birthday_year=extract(year from days.at_date))
   order by days.at_date,x.id limit 100 loop
   day_start:=m.birthday_date::timestamp at time zone (select timezone from public.businesses where id=r.business_id);
   year_number:=extract(year from m.birthday_date);
   original_end:=((m.birthday_date+r.birthday_validity_days)::timestamp at time zone
    (select timezone from public.businesses where id=r.business_id));
   if original_end<=clock_timestamp() or template.starts_at>=original_end or template.expires_at<=day_start then continue; end if;
   run_id:=app_private.create_automation_run(r,m.id,'birthday:'||year_number::text,day_start,
    least(original_end,template.expires_at),null,null,year_number);
   if run_id is null then continue; end if;
   insert into public.offers(business_id,kind,title,description,terms,image_asset_id,starts_at,expires_at,status,audience,
    is_automation_template,source_template_id,generated_by_run_id,discount_percent,minimum_spend_paisa,
    max_discount_paisa,created_by)
   values(template.business_id,template.kind,template.title,template.description,template.terms,template.image_asset_id,
    greatest(day_start,template.starts_at),least(original_end,template.expires_at),'published','recipient_list',false,
    template.id,run_id,template.discount_percent,template.minimum_spend_paisa,template.max_discount_paisa,template.created_by)
   returning * into instance;
   insert into public.offer_branches(business_id,offer_id,branch_id)
    select r.business_id,instance.id,branch_id from public.offer_branches where offer_id=template.id;
   insert into public.offer_recipients(business_id,offer_id,membership_id,valid_from,valid_until,automation_run_id)
   values(r.business_id,instance.id,m.id,instance.starts_at,instance.expires_at,run_id);
   created:=created+1;
  end loop;
 end loop;
 return jsonb_build_object('created',created,'scannedAt',clock_timestamp());
end $$;

do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('automation_configuration','save_automation_rule') loop
  execute format('revoke all on function %s from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
revoke all on function public.worker_scan_automations() from public,anon,authenticated,loyalty_web_gateway,loyalty_worker;
grant execute on function public.worker_scan_automations() to loyalty_worker;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
