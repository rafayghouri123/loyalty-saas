begin;
alter table public.automation_runs add column observed_clicked_at timestamptz;

create function app_private.automation_still_eligible(p_run public.automation_runs) returns text
language plpgsql volatile set search_path='' as $$
declare r public.automation_rules;m public.memberships;kind text;source_id uuid;
begin
 select * into r from public.automation_rules where id=p_run.rule_id;
 select * into m from public.memberships where id=p_run.membership_id;
 kind:=r.kind;
 if not r.enabled then return 'rule_disabled'; end if;
 if p_run.expires_at<=clock_timestamp() then return 'expired'; end if;
 if m.status<>'active' or m.customer_user_id is null then return 'member_inactive'; end if;
 if not exists(select from public.businesses b where b.id=r.business_id and b.status='active')
  or not app_private.entitled(r.business_id) then return 'business_inactive'; end if;
 if kind='reward_available' then
  if not exists(select from public.consent_preferences cp where cp.business_id=r.business_id and cp.membership_id=m.id
   and cp.channel='push' and cp.purpose='reward_updates' and cp.allowed) then return 'consent_withdrawn'; end if;
  if not exists(select from public.rewards rw join public.reward_versions rv on rv.id=rw.published_version_id
   join public.balances bal on bal.business_id=rw.business_id and bal.membership_id=m.id
   where rw.business_id=r.business_id and rw.status='published' and rv.id=(p_run.rule_snapshot->>'reward_version_id')::uuid
   and bal.units>=rv.unit_cost) then return 'reward_unavailable'; end if;
 elsif kind='inactivity' then
  if not exists(select from public.consent_preferences cp where cp.business_id=r.business_id and cp.membership_id=m.id
   and cp.channel='push' and cp.purpose='marketing' and cp.allowed) then return 'consent_withdrawn'; end if;
  select id into source_id from public.purchases where business_id=r.business_id and membership_id=m.id
   and status='committed' and qualifies_for_loyalty order by occurred_at desc,id desc limit 1;
  if source_id is distinct from p_run.source_purchase_id then return 'purchase_changed'; end if;
  if p_run.rule_snapshot->>'offer_id' is not null and not exists(select from public.offers o
   where o.business_id=r.business_id and o.id=(p_run.rule_snapshot->>'offer_id')::uuid
   and o.status='published' and o.starts_at<=clock_timestamp() and o.expires_at>clock_timestamp()
   and (o.audience='all_members' or exists(select from public.offer_recipients rec where rec.offer_id=o.id
    and rec.membership_id=m.id and rec.valid_from<=clock_timestamp() and rec.valid_until>clock_timestamp()))
   and not exists(select from public.offer_claims c where c.offer_id=o.id and c.membership_id=m.id and c.status='fulfilled'))
  then return 'offer_unavailable'; end if;
 elsif kind='birthday' then
  if not exists(select from public.consent_preferences cp where cp.business_id=r.business_id and cp.membership_id=m.id
   and cp.channel='inbox' and cp.purpose='birthday' and cp.allowed) then return 'birthday_inbox_withdrawn'; end if;
  if not exists(select from public.offers o join public.offer_recipients rec on rec.offer_id=o.id
   where o.generated_by_run_id=p_run.id and o.status='published' and o.expires_at>clock_timestamp()
   and rec.membership_id=m.id and rec.valid_until>clock_timestamp()) then return 'birthday_offer_unavailable'; end if;
  if not exists(select from public.consent_preferences cp where cp.business_id=r.business_id and cp.membership_id=m.id
   and cp.channel='push' and cp.purpose='birthday' and cp.allowed) then return 'birthday_push_off'; end if;
 end if;
 return null;
end $$;

create function public.worker_claim_automation_delivery() returns jsonb
language plpgsql security definer set search_path='' as $$
declare run public.automation_runs;r public.automation_rules;m public.memberships;reason text;event_id text;
 user_tz text;next_time timestamptz;window_end timestamptz;business_count integer;global_count integer;
 v_kind text;limit_business integer;limit_global integer;window_interval interval;attempt_no integer;
 attempts jsonb;reservation public.contact_frequency_reservations;destination text;window_start timestamptz;local_day_end timestamptz;
begin
 for run in select * from public.automation_runs where state='pending' and next_attempt_at<=clock_timestamp()
  order by next_attempt_at,id limit 20 for update skip locked loop
  select * into r from public.automation_rules where id=run.rule_id;
  select * into m from public.memberships where id=run.membership_id;
  reason:=app_private.automation_still_eligible(run);
  if reason='birthday_push_off' then
   update public.automation_runs set state='completed',suppression_reason=reason where id=run.id;
   continue;
  elsif reason is not null then
   update public.automation_runs set state='suppressed',suppression_reason=reason where id=run.id;
   continue;
  end if;
  if not exists(select from public.push_devices d where d.customer_user_id=m.customer_user_id and d.status='active'
   and not exists(select from public.delivery_attempts a where a.automation_run_id=run.id and a.push_device_id=d.id
    and a.state in ('provider_accepted','unknown'))) then
   update public.automation_runs set state=case when r.kind='birthday' then 'completed' else 'suppressed' end,
    suppression_reason='no_active_device' where id=run.id;
   continue;
  end if;
  event_id:='automation:'||run.id::text;
  v_kind:=case when r.kind='reward_available' then 'reward_update' else 'marketing' end;
  limit_business:=case when v_kind='reward_update' then 1 else 2 end;
  limit_global:=case when v_kind='reward_update' then 3 else 5 end;
  window_interval:=case when v_kind='reward_update' then interval '1 day' else interval '7 days' end;
  select preferred_timezone into user_tz from public.profiles where user_id=m.customer_user_id;
  if user_tz is null then user_tz:='Asia/Karachi'; end if;
  if v_kind='reward_update' then
   window_start:=date_trunc('day',clock_timestamp() at time zone user_tz) at time zone user_tz;
   local_day_end:=(date_trunc('day',clock_timestamp() at time zone user_tz)+interval '1 day') at time zone user_tz;
  else window_start:=clock_timestamp()-window_interval;local_day_end:=null; end if;
  next_time:=app_private.next_marketing_time(user_tz,clock_timestamp());
  if next_time>clock_timestamp() then
   if next_time<run.expires_at then update public.automation_runs set next_attempt_at=next_time where id=run.id;
   else update public.automation_runs set state='suppressed',suppression_reason='quiet_hours_expired' where id=run.id; end if;
   continue;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('push-frequency:'||m.customer_user_id::text,0));
  select * into reservation from public.contact_frequency_reservations
   where customer_user_id=m.customer_user_id and business_id=run.business_id and event_key=event_id for update;
  if reservation.id is null then
   select count(*) into business_count from public.contact_frequency_reservations x
    where x.customer_user_id=m.customer_user_id and x.business_id=run.business_id and x.kind=v_kind
    and x.state<>'released' and x.reserved_at>=window_start;
   select count(*) into global_count from public.contact_frequency_reservations x
    where x.customer_user_id=m.customer_user_id and x.kind=v_kind
    and x.state<>'released' and x.reserved_at>=window_start;
   if business_count>=limit_business or global_count>=limit_global then
    if v_kind='reward_update' then window_end:=local_day_end;
    else
     select min(x.reserved_at)+window_interval into window_end from public.contact_frequency_reservations x
      where x.customer_user_id=m.customer_user_id and x.kind=v_kind and x.state<>'released'
      and x.reserved_at>=window_start and (business_count<limit_business or x.business_id=run.business_id);
    end if;
    next_time:=app_private.next_marketing_time(user_tz,coalesce(window_end,clock_timestamp()+window_interval)+interval '1 second');
    if next_time<run.expires_at then update public.automation_runs set next_attempt_at=next_time where id=run.id;
    else update public.automation_runs set state='suppressed',suppression_reason='frequency_cap' where id=run.id; end if;
    continue;
   end if;
   insert into public.contact_frequency_reservations(customer_user_id,business_id,event_key,kind,business_window_start,global_window_start)
   values(m.customer_user_id,run.business_id,event_id,v_kind,window_start,window_start);
  end if;
  select coalesce(max(attempt_number),0)+1 into attempt_no from public.delivery_attempts where event_key=event_id;
  insert into public.delivery_attempts(business_id,automation_run_id,push_device_id,event_key,attempt_number)
  select run.business_id,run.id,d.id,event_id,attempt_no from public.push_devices d
   where d.customer_user_id=m.customer_user_id and d.status='active'
    and not exists(select from public.delivery_attempts a where a.automation_run_id=run.id and a.push_device_id=d.id
     and a.state in ('provider_accepted','unknown'))
  on conflict(event_key,push_device_id,attempt_number) do nothing;
  update public.automation_runs set state='processing' where id=run.id;
  select coalesce(jsonb_agg(jsonb_build_object('attemptId',a.id,'deviceId',d.id,'installationId',d.installation_id,
   'bindingGeneration',d.binding_generation,'tokenCiphertext',d.token_ciphertext,'tokenKeyId',d.encryption_key_id,
   'tokenHash',d.token_hash) order by a.id),'[]'::jsonb) into attempts
   from public.delivery_attempts a join public.push_devices d on d.id=a.push_device_id
   where a.automation_run_id=run.id and a.attempt_number=attempt_no and a.state='pending';
  destination:=case r.kind when 'reward_available' then '/app/cards/'||m.id::text||'/rewards'
   when 'birthday' then (select '/app/offers/'||o.id::text from public.offers o where o.generated_by_run_id=run.id)
   else case when run.rule_snapshot->>'offer_id' is null then '/app/cards/'||m.id::text
    else '/app/offers/'||(run.rule_snapshot->>'offer_id') end end;
  return jsonb_build_object('runId',run.id,'membershipId',m.id,'eventKey',event_id,'title',run.rendered_title,
   'body',run.rendered_body,'imagePath',(select a.business_id::text||'/'||a.id::text||'/v1.webp'
    from public.offers o join public.media_assets a on a.business_id=o.business_id and a.id=o.image_asset_id
    where o.id=case when r.kind='birthday' then (select id from public.offers where generated_by_run_id=run.id)
     else (run.rule_snapshot->>'offer_id')::uuid end and a.validation_status='accepted' and a.visibility='public_brand'),
   'destination',destination,'expiresAt',run.expires_at,'attempts',attempts);
 end loop;
 return null;
end $$;

create function public.worker_automation_attempt_ready(p_attempt uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.delivery_attempts;run public.automation_runs;d public.push_devices;reason text;
begin
 select * into a from public.delivery_attempts where id=p_attempt for update;
 if a.id is null or a.state<>'pending' or a.automation_run_id is null then return null; end if;
 select * into run from public.automation_runs where id=a.automation_run_id;
 select * into d from public.push_devices where id=a.push_device_id;
 reason:=app_private.automation_still_eligible(run);
 if reason is null and d.status<>'active' then reason:='device_revoked'; end if;
 if reason is not null then
  update public.delivery_attempts set state='failed',error_code=reason where id=a.id;
  if not exists(select from public.delivery_attempts x where x.automation_run_id=run.id and x.state='pending') then
   update public.automation_runs set state=case when reason='birthday_push_off' or exists(select from public.delivery_attempts x
    where x.automation_run_id=run.id and x.attempted_at is not null) then 'completed' else 'suppressed' end,
    suppression_reason=reason where id=run.id;
   update public.contact_frequency_reservations set state=case when exists(select from public.delivery_attempts x
    where x.automation_run_id=run.id and x.attempted_at is not null) then 'attempted' else 'released' end
    where event_key=a.event_key and state='reserved';
  end if;
  return null;
 end if;
 return jsonb_build_object('attemptId',a.id,'tokenCiphertext',d.token_ciphertext,'tokenKeyId',d.encryption_key_id,
  'tokenHash',d.token_hash,'installationId',d.installation_id,'bindingGeneration',d.binding_generation,'expiresAt',run.expires_at);
end $$;

create function public.worker_finish_automation_attempt(p_attempt uuid,p_state text,p_provider_id text,p_error_code text)
returns void language plpgsql security definer set search_path='' as $$
declare a public.delivery_attempts;run public.automation_runs;all_done boolean;
begin
 if p_state not in ('provider_accepted','failed','unknown') or char_length(coalesce(p_error_code,''))>80
 then raise exception 'invalid_input' using errcode='22023'; end if;
 update public.delivery_attempts set state=p_state,provider_message_id=left(p_provider_id,200),
  error_code=left(p_error_code,80),attempted_at=clock_timestamp() where id=p_attempt and state='pending' returning * into a;
 if a.id is null then return; end if;
 if p_error_code='invalid_token' then update public.push_devices set status='invalid',revoked_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=a.push_device_id and status='active'; end if;
 select * into run from public.automation_runs where id=a.automation_run_id for update;
 select not exists(select from public.delivery_attempts x where x.automation_run_id=run.id and x.state='pending') into all_done;
 if not all_done then return; end if;
 if not exists(select from public.delivery_attempts x where x.automation_run_id=run.id and x.state in ('provider_accepted','unknown'))
  and exists(select from public.delivery_attempts x where x.automation_run_id=run.id and x.attempt_number=a.attempt_number
   and x.state='failed' and x.error_code='transient') and a.attempt_number<=5
  and run.expires_at>clock_timestamp()+interval '30 seconds' then
  update public.automation_runs set state='pending',next_attempt_at=clock_timestamp()+
   case a.attempt_number when 1 then interval '30 seconds' when 2 then interval '2 minutes'
    when 3 then interval '10 minutes' when 4 then interval '30 minutes' else interval '2 hours' end where id=run.id;
 else update public.automation_runs set state='completed' where id=run.id; end if;
 update public.contact_frequency_reservations set state='attempted' where event_key=a.event_key and state='reserved';
end $$;

create function public.worker_expire_pending_automation_attempts() returns integer
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 update public.delivery_attempts set state='unknown',error_code='worker_interrupted',attempted_at=clock_timestamp()
 where state='pending' and automation_run_id is not null and created_at<clock_timestamp()-interval '2 minutes';
 get diagnostics affected=row_count;
 update public.automation_runs r set state='completed' where r.state='processing'
  and not exists(select from public.delivery_attempts a where a.automation_run_id=r.id and a.state='pending');
 return affected;
end $$;

create function public.observe_notification_click(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;r public.campaign_recipients;a public.automation_runs;m public.memberships;
begin
 actor:=app_private.actor();
 select * into r from public.campaign_recipients where id=p_id;
 if r.id is not null then
  select * into m from public.memberships where id=r.membership_id and customer_user_id=actor;
  if m.id is null then raise exception 'not_found' using errcode='P0002'; end if;
  update public.campaign_recipients set observed_clicked_at=coalesce(observed_clicked_at,clock_timestamp()) where id=r.id;
  return jsonb_build_object('recorded',true);
 end if;
 select * into a from public.automation_runs where id=p_id;
 if a.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 select * into m from public.memberships where id=a.membership_id and customer_user_id=actor;
 if m.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 update public.automation_runs set observed_clicked_at=coalesce(observed_clicked_at,clock_timestamp()) where id=a.id;
 return jsonb_build_object('recorded',true);
end $$;

revoke all on function public.observe_notification_click(uuid) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.observe_notification_click(uuid) to authenticated;

do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('worker_claim_automation_delivery','worker_automation_attempt_ready',
  'worker_finish_automation_attempt','worker_expire_pending_automation_attempts') loop
  execute format('revoke all on function %s from public,anon,authenticated,loyalty_web_gateway,loyalty_worker',f);
  execute format('grant execute on function %s to loyalty_worker',f);
 end loop;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
