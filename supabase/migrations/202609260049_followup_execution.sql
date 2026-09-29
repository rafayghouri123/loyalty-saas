begin;
create function public.whatsapp_members(p_business uuid,p_query text default '',p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;
begin
 staff:=app_private.contact_staff(p_business);
 if p_query is null or char_length(p_query)>80 or p_offset is null or p_offset not between 0 and 100000 then raise exception 'invalid_input' using errcode='22023'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.display_name,'status',m.status) order by m.display_name,m.id)
 from (select m.* from public.memberships m where m.business_id=p_business and m.status='active'
 and app_private.contact_member_scope(staff,m) and position(lower(p_query) in lower(m.display_name))>0 order by m.display_name,m.id limit 25 offset p_offset)m),'[]'::jsonb);
end $$;
create function public.whatsapp_configuration(p_business uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;
begin
 staff:=app_private.contact_staff(p_business);
 return jsonb_build_object('businessName',(select display_name from public.businesses where id=p_business),'staffId',staff.id,'role',staff.role,
 'marketingAvailable',app_private.manual_marketing_active(p_business),
 'templates',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'body',t.body,'version',t.version,'active',t.active,'rowVersion',t.row_version) order by t.name,t.id),'[]'::jsonb)
 from (select * from public.whatsapp_templates where business_id=p_business order by name,id limit 100)t),
 'assignees',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.staff_display_name,'role',u.role) order by u.staff_display_name,u.id),'[]'::jsonb)
 from public.business_users u where u.business_id=p_business and u.status='active' and (u.role='owner' or (u.role='manager' and u.can_contact_customers))),
 'rewards',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'title',v.title) order by v.title,v.id),'[]'::jsonb)
 from public.rewards r join public.reward_versions v on v.id=r.published_version_id where r.business_id=p_business and r.status='published'
 and (staff.role='owner' or exists(select from public.reward_branches rb join public.branch_assignments a on a.branch_id=rb.branch_id and a.business_id=rb.business_id
 where rb.reward_version_id=v.id and a.business_user_id=staff.id))),
 'offers',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'title',o.title) order by o.title,o.id),'[]'::jsonb)
 from public.offers o where o.business_id=p_business and o.status='published' and not o.is_automation_template and o.audience='all_members' and o.expires_at>clock_timestamp()
 and (staff.role='owner' or exists(select from public.offer_branches ob join public.branch_assignments a on a.branch_id=ob.branch_id and a.business_id=ob.business_id where ob.offer_id=o.id and a.business_user_id=staff.id))),
 'batches',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.created_at desc,b.id desc),'[]'::jsonb)
 from (select b.* from public.followup_batches b where b.business_id=p_business and (b.created_by=staff.user_id or exists(select from public.followup_tasks t
 join public.memberships m on m.id=t.membership_id where t.batch_id=b.id and app_private.contact_member_scope(staff,m))) order by b.created_at desc,b.id desc limit 100)b),
 'members',public.whatsapp_members(p_business));
end $$;
create function public.whatsapp_tasks(p_business uuid,p_filters jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;v_state text;batch uuid;assignee uuid;starts date;ends date;off integer;tz text;
begin
 staff:=app_private.contact_staff(p_business);
 perform app_private.strict_keys(p_filters,array['batchId','state','assigneeId','startDate','endDate','offset']);
 v_state:=p_filters->>'state';batch:=(p_filters->>'batchId')::uuid;assignee:=(p_filters->>'assigneeId')::uuid;
 starts:=(p_filters->>'startDate')::date;ends:=(p_filters->>'endDate')::date;off:=coalesce((p_filters->>'offset')::integer,0);
 if off not between 0 and 100000 or (v_state is not null and v_state not in ('pending','assigned','opened','staff_marked_sent','skipped','opted_out'))
 or (starts is null)<>(ends is null) or (starts is not null and (ends<starts or ends-starts>89)) then raise exception 'invalid_input' using errcode='22023'; end if;
 select timezone into tz from public.businesses where id=p_business;
 return jsonb_build_object('tasks',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',m.display_name,'batchName',b.name,
 'state',t.state,'assignedName',u.staff_display_name,'assignedId',t.assigned_business_user_id,'createdAt',t.created_at,'openedAt',t.opened_at,'markedSentAt',t.marked_sent_at,
 'lastContactAt',(select max(greatest(ft.opened_at,ft.marked_sent_at,ft.last_contact_checked_at)) from public.followup_tasks ft where ft.business_id=p_business and ft.membership_id=t.membership_id)) order by t.created_at desc,t.id desc),'[]'::jsonb)
 from (select t.* from public.followup_tasks t join public.memberships m on m.id=t.membership_id where t.business_id=p_business and app_private.contact_member_scope(staff,m)
 and (v_state is null or t.state=v_state) and (batch is null or t.batch_id=batch) and (assignee is null or t.assigned_business_user_id=assignee)
 and (starts is null or t.created_at>=starts::timestamp at time zone tz and t.created_at<(ends+1)::timestamp at time zone tz)
 order by t.created_at desc,t.id desc limit 25 offset off)t join public.memberships m on m.id=t.membership_id join public.followup_batches b on b.id=t.batch_id
 left join public.business_users u on u.id=t.assigned_business_user_id),
 'counts',(select jsonb_build_object('opened',count(*) filter(where t.opened_at is not null),'staffMarkedSent',count(*) filter(where t.marked_sent_at is not null))
 from public.followup_tasks t join public.memberships m on m.id=t.membership_id where t.business_id=p_business and app_private.contact_member_scope(staff,m)
 and (batch is null or t.batch_id=batch) and (v_state is null or t.state=v_state) and (assignee is null or t.assigned_business_user_id=assignee)
 and (starts is null or t.created_at>=starts::timestamp at time zone tz and t.created_at<(ends+1)::timestamp at time zone tz)),
 'offset',off,'dataAsOf',clock_timestamp());
end $$;
create function public.whatsapp_task_detail(p_business uuid,p_task uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;t public.followup_tasks;m public.memberships;c public.membership_contacts;consent boolean;stale boolean;
begin
 staff:=app_private.contact_staff(p_business);
 select * into t from public.followup_tasks where business_id=p_business and id=p_task;
 select * into m from public.memberships where id=t.membership_id;
 if t.id is null or not app_private.contact_member_scope(staff,m) then raise exception 'not_found' using errcode='P0002'; end if;
 select * into c from public.membership_contacts where membership_id=m.id;
 consent:=exists(select from public.consent_preferences where membership_id=m.id and channel='whatsapp' and purpose='marketing' and allowed);
 stale:=c.row_version is distinct from t.contact_version_at_creation;
 return jsonb_build_object('id',t.id,'name',m.display_name,'membershipId',m.id,'batchName',(select name from public.followup_batches where id=t.batch_id),
 'state',t.state,'rowVersion',t.row_version,'body',t.rendered_body,'contactStale',stale,'consent',consent,'memberActive',m.status='active',
 'phone',c.phone_e164,'phoneStatus',c.phone_status,'phoneConfirmedAt',c.phone_confirmed_at,
 'contactVersion',c.row_version,'assignedId',t.assigned_business_user_id,'staffId',staff.id,
 'leaseOwnerId',t.lease_owner_business_user_id,'leaseExpiresAt',t.lease_expires_at,'openedAt',t.opened_at,'markedSentAt',t.marked_sent_at,
 'marketingAvailable',app_private.manual_marketing_active(p_business),
 'history',(select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'occurredAt',e.occurred_at,'taskId',e.task_id,'note',e.note,
 'actorName',(select staff_display_name from public.business_users u where u.business_id=p_business and u.user_id=e.actor_user_id)) order by e.occurred_at desc,e.id desc),'[]'::jsonb)
 from (select e.* from public.followup_events e join public.followup_tasks ft on ft.id=e.task_id where e.business_id=p_business and ft.membership_id=m.id
 order by e.occurred_at desc,e.id desc limit 20)e));
end $$;
create function app_private.urlencode(p_value text) returns text language plpgsql immutable set search_path='' as $$
declare bytes bytea;result text:='';b integer;i integer;
begin
 bytes:=convert_to(p_value,'UTF8');
 for i in 0..octet_length(bytes)-1 loop b:=get_byte(bytes,i);
 result:=result||case when b between 65 and 90 or b between 97 and 122 or b between 48 and 57 or b in (45,46,95,126)
 then chr(b) else '%'||upper(lpad(to_hex(b),2,'0')) end;end loop;return result;
end $$;
create function public.open_whatsapp_task(p_business uuid,p_task uuid,p_row_version integer,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;t public.followup_tasks;m public.memberships;c public.membership_contacts;retry integer;stamp timestamptz;recent timestamptz;
begin
 staff:=app_private.contact_staff(p_business,true);
 retry:=app_private.consume_actor_rate('manual_task_open',p_business,staff.user_id);
 if retry>0 then return jsonb_build_object('error',jsonb_build_object('code','rate_limited','retryAfterSeconds',retry)); end if;
 begin
 select m0.* into m from public.memberships m0 join public.followup_tasks ft on ft.membership_id=m0.id where ft.business_id=p_business and ft.id=p_task for update of m0;
 if m.id is null or not app_private.contact_member_scope(staff,m) then raise exception 'not_found' using errcode='P0002'; end if;
 select * into c from public.membership_contacts where membership_id=m.id for share;
 select * into t from public.followup_tasks where business_id=p_business and id=p_task for update;
 stamp:=clock_timestamp();
 if t.row_version is distinct from p_row_version then raise exception 'This task changed. Refresh before opening it.' using errcode='23505'; end if;
 if not app_private.manual_marketing_active(p_business) then raise exception 'Marketing is currently unavailable for this cafe.' using errcode='42501'; end if;
 if m.status<>'active' or not exists(select from public.consent_preferences where membership_id=m.id and channel='whatsapp' and purpose='marketing' and allowed) then raise exception 'WhatsApp consent is no longer available.' using errcode='42501'; end if;
 if t.state not in ('pending','assigned','opened') then raise exception 'This task is already closed.' using errcode='23505'; end if;
 if c.row_version is distinct from t.contact_version_at_creation then raise exception 'The contact changed. Skip this task and create a fresh one.' using errcode='23505'; end if;
 if c.phone_e164 is null or c.phone_e164 !~ '^\+[1-9][0-9]{7,14}$' or t.rendered_body is null or char_length(t.rendered_body) not between 10 and 1000 then raise exception 'The contact or saved message is unavailable.' using errcode='22023'; end if;
 if t.assigned_business_user_id is not null and t.assigned_business_user_id<>staff.id then raise exception 'This task is assigned to another staff member.' using errcode='42501'; end if;
 if t.lease_expires_at>stamp and t.lease_owner_business_user_id<>staff.id then raise exception 'Another staff member has this task open.' using errcode='23505'; end if;
 -- Membership lock serializes the rolling 24-hour gate across distinct tasks/staff.
 select max(greatest(opened_at,marked_sent_at,last_contact_checked_at)) into recent from public.followup_tasks where business_id=p_business and membership_id=m.id and id<>t.id;
 if recent>stamp-interval '24 hours' then
 return jsonb_build_object('error',jsonb_build_object('code','rate_limited','message','Another task contacted this member in the last 24 hours.',
 'retryAfterSeconds',greatest(1,ceil(extract(epoch from recent+interval '24 hours'-stamp))::integer)));
 end if;
 update public.followup_tasks set state='opened',assigned_business_user_id=staff.id,opened_at=coalesce(opened_at,stamp),last_contact_checked_at=stamp,
 lease_owner_business_user_id=staff.id,lease_expires_at=stamp+interval '5 minutes',row_version=row_version+1,updated_at=stamp where id=t.id returning * into t;
 insert into public.followup_events(business_id,task_id,action,actor_user_id,occurred_at) values(p_business,t.id,'opened',staff.user_id,stamp);
 perform app_private.audit(p_business,'whatsapp.opened','followup_task',t.id,p_correlation);
 return jsonb_build_object('taskId',t.id,'state','opened','rowVersion',t.row_version,'leaseExpiresAt',t.lease_expires_at,
 'phone',c.phone_e164,'body',t.rendered_body,'url','https://wa.me/'||substr(c.phone_e164,2)||'?text='||app_private.urlencode(t.rendered_body));
 exception
 when sqlstate '23505' then return jsonb_build_object('error',jsonb_build_object('code','conflict','message',sqlerrm));
 when sqlstate '42501' then return jsonb_build_object('error',jsonb_build_object('code','forbidden','message',sqlerrm));
 when sqlstate '22023' then return jsonb_build_object('error',jsonb_build_object('code','invalid_input','message',sqlerrm));
 when sqlstate 'P0002' then return jsonb_build_object('error',jsonb_build_object('code','not_found','message','This task is unavailable.'));
 end;
end $$;
create function public.act_on_followup_task(p_business uuid,p_task uuid,p_input jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;t public.followup_tasks;m public.memberships;c public.membership_contacts;action text;note text;stamp timestamptz;d uuid;limited jsonb;
begin
 staff:=app_private.contact_staff(p_business,true);
 perform app_private.strict_keys(p_input,array['rowVersion','action','attestsSent','note','assignedBusinessUserId']);
 action:=p_input->>'action';note:=app_private.manual_trim(coalesce(p_input->>'note',''));
 if coalesce(action,'') not in ('mark_sent','skip','opt_out','reassign') or char_length(note)>500
 or (action='mark_sent' and coalesce((p_input->>'attestsSent')::boolean,false)=false)
 or (action='opt_out' and char_length(note)<2) then raise exception 'invalid_input' using errcode='22023'; end if;
 limited:=app_private.limit_action('followup_action',p_business,30);if limited is not null then return limited; end if;
 select m0.* into m from public.memberships m0 join public.followup_tasks ft on ft.membership_id=m0.id where ft.business_id=p_business and ft.id=p_task for update of m0;
 if m.id is null or not app_private.contact_member_scope(staff,m) then raise exception 'not_found' using errcode='P0002'; end if;
 select * into c from public.membership_contacts where membership_id=m.id for share;
 select * into t from public.followup_tasks where business_id=p_business and id=p_task for update;stamp:=clock_timestamp();
 if t.row_version is distinct from (p_input->>'rowVersion')::integer then raise exception 'stale_task' using errcode='23505'; end if;
 -- An opt-out must be recordable even while another staff member has the lease.
 if action='opt_out' then
 d:=app_private.policy('whatsapp_marketing');if d is null then raise exception 'policy_unavailable' using errcode='22023'; end if;
 perform app_private.record_consent(m,'whatsapp','marketing',false,d,'staff_recorded_optout');
 insert into public.followup_events(business_id,task_id,action,actor_user_id,note,occurred_at) values(p_business,t.id,'opted_out',staff.user_id,note,stamp);
 else
 if t.state not in ('pending','assigned','opened') then raise exception 'task_closed' using errcode='23505'; end if;
 if t.lease_expires_at>stamp and t.lease_owner_business_user_id<>staff.id then raise exception 'lease_held_by_other_staff' using errcode='23505'; end if;
 if action='reassign' then
 perform app_private.followup_assignee(p_business,(p_input->>'assignedBusinessUserId')::uuid,m);
 update public.followup_tasks set assigned_business_user_id=(p_input->>'assignedBusinessUserId')::uuid,state=case when p_input->>'assignedBusinessUserId' is null then 'pending' else 'assigned' end,
 lease_owner_business_user_id=null,lease_expires_at=null,row_version=row_version+1,updated_at=stamp where id=t.id;
 else
 if t.assigned_business_user_id is not null and t.assigned_business_user_id<>staff.id then raise exception 'task_assigned_to_other_staff' using errcode='42501'; end if;
 if action='mark_sent' then
 if not app_private.manual_marketing_active(p_business) or m.status<>'active' or not exists(select from public.consent_preferences where membership_id=m.id and channel='whatsapp' and purpose='marketing' and allowed)
 then raise exception 'consent_or_marketing_unavailable' using errcode='42501'; end if;
 if c.row_version is distinct from t.contact_version_at_creation or c.phone_e164 is null or t.rendered_body is null
 then raise exception 'contact_changed_recreate_task' using errcode='23505'; end if;
 update public.followup_tasks set state='staff_marked_sent',assigned_business_user_id=staff.id,marked_sent_at=stamp,marked_sent_by=staff.user_id,
 lease_owner_business_user_id=null,lease_expires_at=null,row_version=row_version+1,updated_at=stamp where id=t.id;
 else
 update public.followup_tasks set state='skipped',skip_reason=nullif(note,''),lease_owner_business_user_id=null,lease_expires_at=null,row_version=row_version+1,updated_at=stamp where id=t.id;
 end if;
 end if;
 insert into public.followup_events(business_id,task_id,action,actor_user_id,note,occurred_at)
 values(p_business,t.id,case action when 'mark_sent' then 'marked_sent' when 'skip' then 'skipped' else 'reassigned' end,staff.user_id,nullif(note,''),stamp);
 end if;
 perform app_private.audit(p_business,'whatsapp.'||action,'followup_task',t.id,p_correlation);
 return public.whatsapp_task_detail(p_business,t.id);
end $$;
create function public.whatsapp_member_contact(p_business uuid,p_membership uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;m public.memberships;c public.membership_contacts;
begin
 staff:=app_private.contact_staff(p_business);select * into m from public.memberships where business_id=p_business and id=p_membership;
 if m.id is null or not app_private.contact_member_scope(staff,m) then raise exception 'not_found' using errcode='P0002'; end if;
 select * into c from public.membership_contacts where membership_id=m.id;
 return jsonb_build_object('phone',c.phone_e164,'phoneStatus',c.phone_status,'sharedEmail',c.shared_email,'rowVersion',c.row_version,
 'phoneConfirmedAt',c.phone_confirmed_at,'whatsappConsent',exists(select from public.consent_preferences where membership_id=m.id and channel='whatsapp' and purpose='marketing' and allowed),
 'history',(select coalesce(jsonb_agg(jsonb_build_object('taskId',t.id,'state',t.state,'openedAt',t.opened_at,'markedSentAt',t.marked_sent_at) order by t.created_at desc,t.id desc),'[]'::jsonb)
 from (select * from public.followup_tasks where business_id=p_business and membership_id=m.id order by created_at desc,id desc limit 20)t));
end $$;
create function public.act_on_member_contact(p_business uuid,p_membership uuid,p_input jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;m public.memberships;c public.membership_contacts;d uuid;
begin
 staff:=app_private.contact_staff(p_business,true);perform app_private.strict_keys(p_input,array['action','rowVersion','note','attested']);
 if coalesce(p_input->>'action','') not in ('opt_out','confirm_number') or char_length(app_private.manual_trim(coalesce(p_input->>'note',''))) not between 2 and 500
 or coalesce((p_input->>'attested')::boolean,false)=false then raise exception 'attestation_required' using errcode='22023'; end if;
 select * into m from public.memberships where business_id=p_business and id=p_membership for update;
 if m.id is null or not app_private.contact_member_scope(staff,m) then raise exception 'not_found' using errcode='P0002'; end if;
 select * into c from public.membership_contacts where membership_id=m.id for update;
 if c.row_version is distinct from (p_input->>'rowVersion')::integer then raise exception 'stale_contact' using errcode='23505'; end if;
 if p_input->>'action'='opt_out' then
 d:=app_private.policy('whatsapp_marketing');if d is null then raise exception 'policy_unavailable' using errcode='22023'; end if;
 perform app_private.record_consent(m,'whatsapp','marketing',false,d,'staff_recorded_optout');
 else
 if c.phone_e164 is null or m.status<>'active' then raise exception 'phone_unavailable' using errcode='22023'; end if;
 -- Verification does not change the target number/contact version or consent.
 update public.membership_contacts set phone_status='staff_confirmed',phone_confirmed_at=clock_timestamp(),phone_confirmed_by=staff.user_id,updated_at=clock_timestamp() where membership_id=m.id;
 end if;
 perform app_private.audit(p_business,'whatsapp.contact_'||(p_input->>'action'),'membership',m.id,p_correlation);
 return public.whatsapp_member_contact(p_business,m.id);
end $$;

-- Minimal manual content retention: 90 days. Purge never invokes WhatsApp.
create function app_private.manual_event_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and old.occurred_at<clock_timestamp()-interval '90 days' and new.note is null
 and (to_jsonb(old)-'note')=(to_jsonb(new)-'note') then return new; end if;
 raise exception 'immutable_event' using errcode='42501';
end $$;
drop trigger followup_event_immutable on public.followup_events;
create trigger followup_event_immutable before update or delete on public.followup_events for each row execute function app_private.manual_event_immutable();
create function public.worker_purge_manual_messages() returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 with targets as (select id from public.followup_tasks where created_at<clock_timestamp()-interval '90 days' and rendered_body is not null order by id limit 100)
 update public.followup_tasks t set rendered_body=null,skip_reason=null,row_version=row_version+1,updated_at=clock_timestamp(),
 state=case when state in ('pending','assigned','opened') then 'skipped' else state end,lease_owner_business_user_id=null,lease_expires_at=null
 from targets where t.id=targets.id;get diagnostics n=row_count;
 with targets as (select id from public.followup_batches where created_at<clock_timestamp()-interval '90 days' and template_body is not null order by id limit 100)
 update public.followup_batches b set template_body=null from targets where b.id=targets.id;
 with targets as (select id from public.followup_events where occurred_at<clock_timestamp()-interval '90 days' and note is not null order by id limit 100)
 update public.followup_events e set note=null from targets where e.id=targets.id;
 return n;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
do $$ declare f record; begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
 ('whatsapp_members','whatsapp_configuration','whatsapp_tasks','whatsapp_task_detail','open_whatsapp_task','act_on_followup_task','whatsapp_member_contact','act_on_member_contact') loop
 execute format('revoke all on function %s from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);end loop;
end $$;
revoke all on function public.worker_purge_manual_messages() from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.worker_purge_manual_messages() to loyalty_worker;
commit;
