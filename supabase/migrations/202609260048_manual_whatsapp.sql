begin;
create function app_private.manual_trim(p_text text) returns text language sql immutable set search_path='' as $$
 select btrim(p_text,E' \t\n\r\f\v'||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))
$$;
-- No sending integration. Every contact handoff is an explicit authenticated RPC.
create function app_private.valid_whatsapp_template(p_body text) returns boolean
language sql immutable set search_path='' as $$
 select p_body is not null and p_body=app_private.manual_trim(p_body) and char_length(p_body) between 10 and 1000
 and regexp_replace(p_body,'\{\{(first_name|business_name|reward_name|public_offer_url)\}\}','','g') !~ '[{}]|<%|%>|\$\{'
$$;
create table app_private.whatsapp_origin (
 singleton boolean primary key default true check(singleton),
 origin text not null check(origin ~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?$' or origin ~ '^http://(localhost|127\.0\.0\.1):[0-9]+$')
);
create table public.whatsapp_templates (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,
 name text not null check(name=app_private.manual_trim(name) and char_length(name) between 2 and 80),
 body text not null check(app_private.valid_whatsapp_template(body)),version integer not null default 1 check(version>0),
 active boolean not null default true,created_by uuid not null references public.profiles(user_id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),row_version integer not null default 1 check(row_version>0),
 unique(business_id,id)
);
create table public.followup_batches (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,
 name text not null check(name=app_private.manual_trim(name) and char_length(name) between 2 and 100),template_id uuid not null,template_version integer not null check(template_version>0),
 template_body text,offer_id uuid,audience text not null check(audience in ('selected_members','inactive','reward_ready')),
 inactive_days integer check(inactive_days between 7 and 365),target_reward_version_id uuid,
 created_by uuid not null references public.profiles(user_id),created_at timestamptz not null default now(),
 idempotency_key uuid not null,request_hash text not null,preview_snapshot jsonb not null,
 unique(business_id,id),unique(business_id,idempotency_key),
 foreign key(business_id,template_id) references public.whatsapp_templates(business_id,id),
 foreign key(business_id,offer_id) references public.offers(business_id,id),
 foreign key(business_id,target_reward_version_id) references public.reward_versions(business_id,id),
 check((audience='inactive')=(inactive_days is not null)),check(audience<>'reward_ready' or target_reward_version_id is not null)
);
create table public.followup_tasks (
 id uuid primary key default gen_random_uuid(),business_id uuid not null,batch_id uuid not null,membership_id uuid not null,
 assigned_business_user_id uuid,state text not null default 'pending' check(state in ('pending','assigned','opened','staff_marked_sent','skipped','opted_out')),
 rendered_body text,opened_at timestamptz,marked_sent_at timestamptz,marked_sent_by uuid references public.profiles(user_id),skip_reason text check(char_length(skip_reason)<=500),
 last_contact_checked_at timestamptz,contact_version_at_creation integer not null check(contact_version_at_creation>0),
 lease_owner_business_user_id uuid,lease_expires_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),row_version integer not null default 1 check(row_version>0),
 unique(business_id,id),unique(batch_id,membership_id),
 foreign key(business_id,batch_id) references public.followup_batches(business_id,id),
 foreign key(business_id,membership_id) references public.memberships(business_id,id),
 foreign key(business_id,assigned_business_user_id) references public.business_users(business_id,id),
 foreign key(business_id,lease_owner_business_user_id) references public.business_users(business_id,id),
 check(rendered_body is null or char_length(rendered_body) between 10 and 1000),
 check((lease_owner_business_user_id is null)=(lease_expires_at is null)),
 check((state='staff_marked_sent')=(marked_sent_at is not null and marked_sent_by is not null)),
 check(state<>'opened' or opened_at is not null)
);
create table public.followup_events (
 id uuid primary key default gen_random_uuid(),business_id uuid not null,task_id uuid not null,
 action text not null check(action in ('assigned','opened','marked_sent','skipped','opted_out','reassigned')),
 actor_user_id uuid not null references public.profiles(user_id),occurred_at timestamptz not null default now(),note text check(char_length(note)<=500),
 foreign key(business_id,task_id) references public.followup_tasks(business_id,id)
);
create trigger followup_event_immutable before update or delete on public.followup_events for each row execute function app_private.immutable_event();
create index followup_list on public.followup_tasks(business_id,created_at desc,id desc);
create index followup_member_contact on public.followup_tasks(business_id,membership_id,opened_at desc) where opened_at is not null;
create index followup_unsent on public.followup_tasks(business_id,membership_id,id) where state in ('pending','assigned','opened');
create index followup_history on public.followup_events(business_id,task_id,occurred_at desc,id desc);
create index followup_batch_list on public.followup_batches(business_id,created_at desc,id desc);
create function app_private.contact_staff(p_business uuid,p_mutation boolean default false) returns public.business_users
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;
begin
 staff:=app_private.authorize(p_business);
 if staff.role='owner' then if p_mutation then perform app_private.actor(true); end if;
 elsif staff.role<>'manager' or not staff.can_contact_customers then raise exception 'forbidden' using errcode='42501'; end if;
 -- Keep branch assignments locked while the operation reads contacts/writes tasks.
 perform 1 from public.branch_assignments where business_id=p_business and business_user_id=staff.id order by branch_id for share;
 return staff;
end $$;
create function app_private.contact_member_scope(p_staff public.business_users,p_member public.memberships) returns boolean
language sql stable set search_path='' as $$
 select p_staff.business_id=p_member.business_id and (p_staff.role='owner' or exists(
 select from public.branch_assignments a join public.branches b on b.business_id=a.business_id and b.id=a.branch_id and b.status='active'
 where a.business_id=p_staff.business_id and a.business_user_id=p_staff.id and
 (a.branch_id=p_member.joined_branch_id or exists(select from public.purchases p where p.business_id=p_member.business_id
 and p.membership_id=p_member.id and p.branch_id=a.branch_id and p.status='committed' and p.qualifies_for_loyalty))))
$$;
create function app_private.followup_assignee(p_business uuid,p_assignee uuid,p_member public.memberships default null) returns void
language plpgsql set search_path='' as $$
declare staff public.business_users;
begin
 if p_assignee is null then return; end if;
 select * into staff from public.business_users where business_id=p_business and id=p_assignee and status='active' for share;
 if staff.id is null or not(staff.role='owner' or (staff.role='manager' and staff.can_contact_customers))
 or (p_member.id is not null and not app_private.contact_member_scope(staff,p_member)) then raise exception 'invalid_assignee' using errcode='42501'; end if;
 perform 1 from public.branch_assignments where business_id=p_business and business_user_id=staff.id order by branch_id for share;
end $$;
create function app_private.manual_marketing_active(p_business uuid) returns boolean language sql stable set search_path='' as $$
 select app_private.entitled(p_business) and exists(select from public.businesses where id=p_business and status='active')
 and exists(select from public.loyalty_programmes where business_id=p_business and status='published')
$$;
create function app_private.render_manual_template(p_body text,p_first_name text,p_business_name text,p_reward_name text,p_offer_url text) returns text
language plpgsql immutable set search_path='' as $$
declare tail text:=p_body;parts text[];result text:='';replacement text;
begin
 loop
 parts:=regexp_match(tail,'^(.*?)\{\{(first_name|business_name|reward_name|public_offer_url)\}\}(.*)$','s');
 if parts is null then return result||tail; end if;
 replacement:=case parts[2] when 'first_name' then p_first_name when 'business_name' then p_business_name when 'reward_name' then p_reward_name else p_offer_url end;
 if replacement is null then return null; end if;
 result:=result||parts[1]||replacement;tail:=parts[3];
 end loop;
end $$;
create function public.save_whatsapp_template(p_business uuid,p_input jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;t public.whatsapp_templates;
begin
 staff:=app_private.contact_staff(p_business,true);
 perform app_private.strict_keys(p_input,array['templateId','rowVersion','name','body','active']);
 if char_length(app_private.manual_trim(coalesce(p_input->>'name',''))) not between 2 and 80 or not app_private.valid_whatsapp_template(app_private.manual_trim(p_input->>'body'))
 or jsonb_typeof(p_input->'active') is distinct from 'boolean' then raise exception 'invalid_template' using errcode='22023'; end if;
 if p_input->>'templateId' is null then
 insert into public.whatsapp_templates(business_id,name,body,active,created_by) values(p_business,app_private.manual_trim(p_input->>'name'),app_private.manual_trim(p_input->>'body'),(p_input->>'active')::boolean,staff.user_id) returning * into t;
 else
 select * into t from public.whatsapp_templates where business_id=p_business and id=(p_input->>'templateId')::uuid for update;
 if t.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 if t.row_version is distinct from (p_input->>'rowVersion')::integer then raise exception 'stale' using errcode='23505'; end if;
 update public.whatsapp_templates set name=app_private.manual_trim(p_input->>'name'),body=app_private.manual_trim(p_input->>'body'),active=(p_input->>'active')::boolean,
 version=version+1,row_version=row_version+1,updated_at=clock_timestamp() where id=t.id returning * into t;
 end if;
 perform app_private.audit(p_business,'whatsapp.template_saved','whatsapp_template',t.id,p_correlation,jsonb_build_object('version',t.version));
 return jsonb_build_object('templateId',t.id,'version',t.version,'rowVersion',t.row_version);
end $$;

-- Preview contains names/text and exclusions but never phone numbers or prefilled links.
create function app_private.followup_preview(p_business uuid,p_input jsonb,p_staff public.business_users) returns jsonb
language plpgsql set search_path='' as $$
declare t public.whatsapp_templates;reward public.reward_versions;o public.offers;member public.memberships;c public.membership_contacts;
 mids uuid[];chosen uuid[];mid uuid;reason text;rendered text;first_name text;business_name text;offer_url text;
 rows jsonb:='[]';eligible integer:=0;excluded integer:=0;recent timestamptz;assignee uuid;
begin
 perform app_private.strict_keys(p_input,array['name','templateId','templateVersion','audience','memberIds','inactiveDays','targetRewardVersionId','offerId','assignedBusinessUserId']);
 if not app_private.manual_marketing_active(p_business) then raise exception 'marketing_unavailable' using errcode='42501'; end if;
 select * into t from public.whatsapp_templates where business_id=p_business and id=(p_input->>'templateId')::uuid for share;
 if t.id is null or not t.active then raise exception 'template_unavailable' using errcode='P0002'; end if;
 if t.version is distinct from (p_input->>'templateVersion')::integer then raise exception 'template_changed' using errcode='23505'; end if;
 chosen:=array(select jsonb_array_elements_text(p_input->'memberIds')::uuid);
 assignee:=(p_input->>'assignedBusinessUserId')::uuid;perform app_private.followup_assignee(p_business,assignee);
 if char_length(app_private.manual_trim(coalesce(p_input->>'name',''))) not between 2 and 100
 or coalesce(p_input->>'audience','') not in ('selected_members','inactive','reward_ready')
 or cardinality(chosen)>100 or cardinality(chosen)<>cardinality(array(select distinct unnest(chosen)))
 or ((p_input->>'audience'='selected_members')<>(cardinality(chosen)>0))
 or ((p_input->>'audience'='inactive')<>(p_input->>'inactiveDays' is not null))
 or (p_input->>'inactiveDays' is not null and (p_input->>'inactiveDays')::integer not between 7 and 365)
 then raise exception 'invalid_input' using errcode='22023'; end if;
 if position('{{reward_name}}' in t.body)>0 or p_input->>'audience'='reward_ready' or p_input->>'targetRewardVersionId' is not null then
 select v.* into reward from public.rewards r join public.reward_versions v on v.id=r.published_version_id
 where r.business_id=p_business and r.status='published' and v.id=(p_input->>'targetRewardVersionId')::uuid;
 if reward.id is null then raise exception 'target_reward_required' using errcode='22023'; end if;
 end if;
 if position('{{public_offer_url}}' in t.body)>0 or p_input->>'offerId' is not null then
 select * into o from public.offers where business_id=p_business and id=(p_input->>'offerId')::uuid
 and status='published' and audience='all_members' and not is_automation_template and expires_at>clock_timestamp() for share;
 if o.id is null then raise exception 'public_offer_required' using errcode='22023'; end if;
 if position('{{public_offer_url}}' in t.body)>0 then
 select origin||'/app/offers/'||o.id::text into offer_url from app_private.whatsapp_origin where singleton;
 if offer_url is null then raise exception 'canonical_origin_unconfigured' using errcode='22023'; end if;
 end if;
 end if;
 select display_name into business_name from public.businesses where id=p_business;
 if cardinality(chosen)>0 then
 foreach mid in array chosen loop
 select * into member from public.memberships where business_id=p_business and id=mid;
 if member.id is null or not app_private.contact_member_scope(p_staff,member) then raise exception 'not_found' using errcode='P0002'; end if;
 end loop;mids:=chosen;
 else
 mids:=array(select m.id from public.memberships m where m.business_id=p_business and m.status='active'
 and app_private.contact_member_scope(p_staff,m) and (
 (p_input->>'audience'='inactive' and exists(select from public.purchases p where p.business_id=p_business and p.membership_id=m.id
 and p.status='committed' and p.qualifies_for_loyalty) and
 (select max(p.occurred_at) from public.purchases p where p.business_id=p_business and p.membership_id=m.id and p.status='committed'
 and p.qualifies_for_loyalty)<=clock_timestamp()-make_interval(days=>(p_input->>'inactiveDays')::integer))
 or (p_input->>'audience'='reward_ready' and exists(select from public.balances b where b.membership_id=m.id and b.units>=reward.unit_cost))) order by m.id limit 101);
 if cardinality(mids)>100 then raise exception 'narrow_audience_max_100' using errcode='22023'; end if;
 end if;
 foreach mid in array mids loop
 select * into member from public.memberships where id=mid;select * into c from public.membership_contacts where membership_id=mid;
 reason:=null;rendered:=null;recent:=null;
 if member.status<>'active' then reason:='member_unavailable';
 elsif not exists(select from public.consent_preferences where membership_id=mid and channel='whatsapp' and purpose='marketing' and allowed) then reason:='no_whatsapp_consent';
 elsif c.phone_e164 is null or c.phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then reason:='phone_unavailable';
 elsif assignee is not null and not app_private.contact_member_scope((select u from public.business_users u where id=assignee),member) then reason:='assignee_branch_scope';
 elsif reward.id is not null and not exists(select from public.reward_branches rb where rb.reward_version_id=reward.id
 and (rb.branch_id=member.joined_branch_id or exists(select from public.purchases p where p.business_id=p_business and p.membership_id=mid
 and p.branch_id=rb.branch_id and p.status='committed' and p.qualifies_for_loyalty))) then reason:='reward_branch_unavailable';
 elsif o.id is not null and not exists(select from public.offer_branches ob where ob.offer_id=o.id
 and (ob.branch_id=member.joined_branch_id or exists(select from public.purchases p where p.business_id=p_business and p.membership_id=mid
 and p.branch_id=ob.branch_id and p.status='committed' and p.qualifies_for_loyalty))) then reason:='offer_branch_unavailable';
 end if;
 if reason is null then
 first_name:=split_part(regexp_replace(app_private.manual_trim(member.display_name),'[[:space:]]+',' ','g'),' ',1);
 if position('{{first_name}}' in t.body)>0 and coalesce(first_name,'')='' then reason:='missing_first_name'; else
 -- One regex pass: literal values containing placeholder-looking text are never evaluated again.
 rendered:=app_private.render_manual_template(t.body,first_name,business_name,reward.title,offer_url);
 rendered:=app_private.manual_trim(rendered);
 if char_length(rendered) not between 10 and 1000 then reason:='rendered_length_out_of_bounds';rendered:=null; end if;
 end if;
 end if;
 select max(greatest(ft.opened_at,ft.marked_sent_at,ft.last_contact_checked_at)) into recent from public.followup_tasks ft where ft.business_id=p_business and ft.membership_id=mid;
 if reason is null then eligible:=eligible+1; else excluded:=excluded+1; end if;
 rows:=rows||jsonb_build_array(jsonb_build_object('membershipId',mid,'name',member.display_name,'exclusion',reason,'body',rendered,
 'contactVersion',c.row_version,'lastContactAt',recent,'recentContactWarning',coalesce(recent>clock_timestamp()-interval '24 hours',false)));
 end loop;
 return jsonb_build_object('eligible',eligible,'excluded',excluded,'members',rows,'templateVersion',t.version);
end $$;
create function public.preview_followup_batch(p_business uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;limited jsonb;
begin
 staff:=app_private.contact_staff(p_business);limited:=app_private.limit_action('followup_preview',p_business,30);
 if limited is not null then return limited; end if;
 return app_private.followup_preview(p_business,p_input,staff);
end $$;
create function public.create_followup_batch(p_business uuid,p_input jsonb,p_key uuid,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;b public.followup_batches;preview jsonb;item jsonb;member public.memberships;t public.whatsapp_templates;
 task_id uuid;request_hash text;limited jsonb;candidate_ids uuid[];
begin
 staff:=app_private.contact_staff(p_business,true);
 request_hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');
 -- Serialize retry keys before member locks; completed replay rechecks current permissions/scope.
 perform pg_advisory_xact_lock(hashtextextended('followup:'||p_business::text||':'||p_key::text,0));
 select * into b from public.followup_batches where business_id=p_business and idempotency_key=p_key;
 if b.id is not null then
 if b.request_hash<>request_hash or b.created_by<>staff.user_id then raise exception 'conflict' using errcode='23505'; end if;
 if exists(select from public.followup_tasks ft join public.memberships m on m.id=ft.membership_id where ft.batch_id=b.id and not app_private.contact_member_scope(staff,m)) then raise exception 'forbidden' using errcode='42501'; end if;
 return jsonb_build_object('batchId',b.id,'createdTasks',(select count(*) from public.followup_tasks where batch_id=b.id),'replayed',true);
 end if;
 limited:=app_private.limit_action('followup_create',p_business,10);if limited is not null then return limited; end if;
 preview:=app_private.followup_preview(p_business,p_input,staff);
 candidate_ids:=array(select (value->>'membershipId')::uuid from jsonb_array_elements(preview->'members') order by (value->>'membershipId')::uuid);
 -- Lock only the bounded candidate set, in UUID order, then recheck eligibility.
 perform 1 from public.memberships where business_id=p_business and id=any(candidate_ids) order by id for update;
 preview:=app_private.followup_preview(p_business,p_input,staff);
 if candidate_ids is distinct from array(select (value->>'membershipId')::uuid from jsonb_array_elements(preview->'members') order by (value->>'membershipId')::uuid)
 then raise exception 'audience_changed_preview_again' using errcode='23505'; end if;
 select * into t from public.whatsapp_templates where id=(p_input->>'templateId')::uuid;
 insert into public.followup_batches(business_id,name,template_id,template_version,template_body,offer_id,audience,inactive_days,target_reward_version_id,created_by,idempotency_key,request_hash,preview_snapshot)
 values(p_business,app_private.manual_trim(p_input->>'name'),t.id,t.version,t.body,(p_input->>'offerId')::uuid,p_input->>'audience',(p_input->>'inactiveDays')::integer,
 (p_input->>'targetRewardVersionId')::uuid,staff.user_id,p_key,request_hash,
 -- Keep exclusion facts/counts; rendered messages live only in the tasks, under the 90-day policy.
 jsonb_build_object('eligible',preview->'eligible','excluded',preview->'excluded')) returning * into b;
 for item in select value from jsonb_array_elements(preview->'members') where value->>'exclusion' is null loop
 select * into member from public.memberships where id=(item->>'membershipId')::uuid;
 perform app_private.followup_assignee(p_business,(p_input->>'assignedBusinessUserId')::uuid,member);
 insert into public.followup_tasks(business_id,batch_id,membership_id,assigned_business_user_id,state,rendered_body,contact_version_at_creation)
 values(p_business,b.id,member.id,(p_input->>'assignedBusinessUserId')::uuid,case when p_input->>'assignedBusinessUserId' is null then 'pending' else 'assigned' end,
 item->>'body',(item->>'contactVersion')::integer) returning id into task_id;
 if p_input->>'assignedBusinessUserId' is not null then insert into public.followup_events(business_id,task_id,action,actor_user_id) values(p_business,task_id,'assigned',staff.user_id); end if;
 end loop;
 perform app_private.audit(p_business,'whatsapp.tasks_created','followup_batch',b.id,p_correlation,jsonb_build_object('tasks',preview->'eligible','excluded',preview->'excluded'));
 return jsonb_build_object('batchId',b.id,'createdTasks',preview->'eligible','excluded',preview->'excluded','replayed',false);
end $$;

-- Customer preference changes suppress unsent tasks immediately. No staff event is
-- fabricated for a customer action; the existing consent_events record is authoritative.
create function app_private.suppress_whatsapp_tasks() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.channel='whatsapp' and new.purpose='marketing' and not new.allowed then
 update public.followup_tasks set state='opted_out',lease_owner_business_user_id=null,lease_expires_at=null,
 row_version=row_version+1,updated_at=clock_timestamp() where business_id=new.business_id and membership_id=new.membership_id and state in ('pending','assigned','opened');
 end if;return new;
end $$;
create trigger whatsapp_consent_suppression after insert or update on public.consent_preferences for each row execute function app_private.suppress_whatsapp_tasks();

do $$ declare t text; begin
 foreach t in array array['whatsapp_templates','followup_batches','followup_tasks','followup_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',t);
 end loop;
end $$;
alter table app_private.whatsapp_origin enable row level security;
revoke all on app_private.whatsapp_origin from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
revoke all on function public.save_whatsapp_template(uuid,jsonb,uuid),public.preview_followup_batch(uuid,jsonb),public.create_followup_batch(uuid,jsonb,uuid,uuid) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.save_whatsapp_template(uuid,jsonb,uuid),public.preview_followup_batch(uuid,jsonb),public.create_followup_batch(uuid,jsonb,uuid,uuid) to authenticated;
commit;
