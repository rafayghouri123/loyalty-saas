begin;

create function app_private.next_marketing_time(p_tz text,p_at timestamptz) returns timestamptz
language plpgsql stable set search_path='' as $$
declare local_time timestamp;hour integer;next_local timestamp;
begin
 local_time:=p_at at time zone p_tz;
 hour:=extract(hour from local_time);
 if hour>=21 then next_local:=date_trunc('day',local_time)+interval '1 day 9 hours';
 elsif hour<9 then next_local:=date_trunc('day',local_time)+interval '9 hours';
 else return p_at; end if;
 return next_local at time zone p_tz;
end $$;

create function app_private.campaign_still_eligible(p_recipient public.campaign_recipients) returns text
language plpgsql volatile set search_path='' as $$
declare c public.campaigns;v public.campaign_versions;m public.memberships;
begin
 select * into c from public.campaigns where id=p_recipient.campaign_id;
 select * into v from public.campaign_versions where id=p_recipient.campaign_version_id;
 select * into m from public.memberships where id=p_recipient.membership_id;
 if c.status<>'processing' then return 'campaign_stopped'; end if;
 if v.expires_at<=clock_timestamp() then return 'expired'; end if;
 if m.status<>'active' or m.customer_user_id is null then return 'member_inactive'; end if;
 if not exists(select from public.businesses b where b.id=c.business_id and b.status='active')
  or not app_private.entitled(c.business_id) then return 'business_inactive'; end if;
 if not exists(select from public.business_users u where u.business_id=c.business_id and u.user_id=c.created_by
  and u.status='active' and (u.role='owner' or (u.role='manager' and u.can_manage_campaigns))) then return 'creator_revoked'; end if;
 if not exists(select from public.consent_preferences cp where cp.business_id=m.business_id and cp.membership_id=m.id
  and cp.channel='push' and cp.purpose='marketing' and cp.allowed) then return 'consent_withdrawn'; end if;
 if v.offer_id is not null and not exists(select from public.offers o where o.id=v.offer_id and o.status='published'
  and o.starts_at<=clock_timestamp() and o.expires_at>clock_timestamp() and not o.is_automation_template)
 then return 'offer_unavailable'; end if;
 if not app_private.campaign_audience(v.id,m.id) then return 'audience_changed'; end if;
 return null;
end $$;

create function public.worker_claim_campaign_delivery() returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.campaign_recipients;c public.campaigns;v public.campaign_versions;m public.memberships;
 user_tz text;reason text;v_event_key text;next_time timestamptz;window_end timestamptz;
 business_count integer;global_count integer;attempt_no integer;attempts jsonb;reservation public.contact_frequency_reservations;
begin
 for r in select cr.* from public.campaign_recipients cr join public.campaigns c0 on c0.id=cr.campaign_id
  where cr.status='pending' and cr.next_attempt_at<=clock_timestamp() and c0.status='processing'
  order by cr.next_attempt_at,cr.id limit 20 for update of cr skip locked loop
  select * into c from public.campaigns where id=r.campaign_id for share;
  select * into v from public.campaign_versions where id=r.campaign_version_id;
  select * into m from public.memberships where id=r.membership_id for share;
  reason:=app_private.campaign_still_eligible(r);
  if reason is not null then
   update public.campaign_recipients set status='suppressed',suppression_reason=reason where id=r.id;
   continue;
  end if;
  v_event_key:='campaign:'||c.id::text||':'||m.id::text;
  select preferred_timezone into user_tz from public.profiles where user_id=m.customer_user_id;
  if user_tz is null then user_tz:='Asia/Karachi'; end if;
  next_time:=app_private.next_marketing_time(user_tz,clock_timestamp());
  if next_time>clock_timestamp() then
   if next_time<v.expires_at then update public.campaign_recipients set next_attempt_at=next_time where id=r.id;
   else update public.campaign_recipients set status='suppressed',suppression_reason='quiet_hours_expired' where id=r.id; end if;
   continue;
  end if;
  if not exists(select from public.push_devices d where d.customer_user_id=m.customer_user_id and d.status='active'
   and not exists(select from public.delivery_attempts a where a.campaign_recipient_id=r.id and a.push_device_id=d.id
    and a.state in ('provider_accepted','unknown'))) then
   update public.campaign_recipients set status='suppressed',suppression_reason='no_active_device' where id=r.id;
   continue;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('push-frequency:'||m.customer_user_id::text,0));
  select * into reservation from public.contact_frequency_reservations
   where customer_user_id=m.customer_user_id and business_id=c.business_id and event_key=v_event_key for update;
  if reservation.id is null then
   select count(*) into business_count from public.contact_frequency_reservations x
    where x.customer_user_id=m.customer_user_id and x.business_id=c.business_id and x.kind='marketing'
    and x.state<>'released' and x.reserved_at>clock_timestamp()-interval '7 days';
   select count(*) into global_count from public.contact_frequency_reservations x
    where x.customer_user_id=m.customer_user_id and x.kind='marketing'
    and x.state<>'released' and x.reserved_at>clock_timestamp()-interval '7 days';
   if business_count>=2 or global_count>=5 then
    select min(x.reserved_at)+interval '7 days' into window_end from public.contact_frequency_reservations x
     where x.customer_user_id=m.customer_user_id and x.kind='marketing' and x.state<>'released'
     and x.reserved_at>clock_timestamp()-interval '7 days' and (business_count<2 or x.business_id=c.business_id);
    next_time:=app_private.next_marketing_time(user_tz,coalesce(window_end,clock_timestamp()+interval '7 days')+interval '1 second');
    if next_time<v.expires_at then update public.campaign_recipients set next_attempt_at=next_time where id=r.id;
    else update public.campaign_recipients set status='suppressed',suppression_reason='frequency_cap' where id=r.id; end if;
    continue;
   end if;
   insert into public.contact_frequency_reservations(customer_user_id,business_id,event_key,kind,business_window_start,global_window_start)
   values(m.customer_user_id,c.business_id,v_event_key,'marketing',clock_timestamp()-interval '7 days',clock_timestamp()-interval '7 days');
  end if;
  select coalesce(max(attempt_number),0)+1 into attempt_no from public.delivery_attempts where event_key=v_event_key;
  insert into public.delivery_attempts(business_id,campaign_recipient_id,push_device_id,event_key,attempt_number)
  select c.business_id,r.id,d.id,v_event_key,attempt_no from public.push_devices d
   where d.customer_user_id=m.customer_user_id and d.status='active'
    and not exists(select from public.delivery_attempts a where a.campaign_recipient_id=r.id and a.push_device_id=d.id
     and a.state in ('provider_accepted','unknown'))
  on conflict(event_key,push_device_id,attempt_number) do nothing;
  update public.campaign_recipients set status='processing' where id=r.id;
  select coalesce(jsonb_agg(jsonb_build_object('attemptId',a.id,'deviceId',d.id,'installationId',d.installation_id,
   'bindingGeneration',d.binding_generation,'tokenCiphertext',d.token_ciphertext,'tokenKeyId',d.encryption_key_id,'tokenHash',d.token_hash)
   order by a.id),'[]'::jsonb) into attempts from public.delivery_attempts a join public.push_devices d on d.id=a.push_device_id
   where a.campaign_recipient_id=r.id and a.attempt_number=attempt_no and a.state='pending';
  return jsonb_build_object('campaignId',c.id,'recipientId',r.id,'membershipId',m.id,'eventKey',v_event_key,
   'title',v.title,'body',v.body,'imagePath',(select a.business_id::text||'/'||a.id::text||'/v1.webp'
    from public.media_assets a where a.business_id=v.business_id and a.id=v.image_asset_id
     and a.validation_status='accepted' and a.visibility='public_brand'),
   'destination',case when v.destination='offer' then '/app/offers/'||v.offer_id::text else '/app/cards/'||m.id::text end,
   'expiresAt',v.expires_at,'attempts',attempts);
 end loop;
 return null;
end $$;

create function public.worker_campaign_attempt_ready(p_attempt uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.delivery_attempts;r public.campaign_recipients;d public.push_devices;reason text;v public.campaign_versions;
begin
 select * into a from public.delivery_attempts where id=p_attempt for update;
 if a.id is null or a.state<>'pending' or a.campaign_recipient_id is null then return null; end if;
 select * into r from public.campaign_recipients where id=a.campaign_recipient_id;
 select * into d from public.push_devices where id=a.push_device_id;
 select * into v from public.campaign_versions where id=r.campaign_version_id;
 reason:=app_private.campaign_still_eligible(r);
 if reason is null and d.status<>'active' then reason:='device_revoked'; end if;
 if reason is not null then
  update public.delivery_attempts set state='failed',error_code=reason where id=a.id;
  if not exists(select from public.delivery_attempts x where x.campaign_recipient_id=r.id and x.state='pending') then
   update public.campaign_recipients set status=case when exists(select from public.delivery_attempts x
    where x.campaign_recipient_id=r.id and x.attempted_at is not null) then 'attempted' else 'suppressed' end,
    suppression_reason=reason where id=r.id;
   if not exists(select from public.delivery_attempts x where x.campaign_recipient_id=r.id and x.attempted_at is not null) then
    update public.contact_frequency_reservations set state='released' where event_key=a.event_key and state='reserved';
   end if;
  end if;
  return null;
 end if;
 return jsonb_build_object('attemptId',a.id,'tokenCiphertext',d.token_ciphertext,'tokenKeyId',d.encryption_key_id,'tokenHash',d.token_hash,
  'installationId',d.installation_id,'bindingGeneration',d.binding_generation,
  'expiresAt',v.expires_at);
end $$;

create function public.worker_finish_campaign_attempt(p_attempt uuid,p_state text,p_provider_id text,p_error_code text)
returns void language plpgsql security definer set search_path='' as $$
declare a public.delivery_attempts;r public.campaign_recipients;v public.campaign_versions;all_done boolean;attempted boolean;
begin
 if p_state not in ('provider_accepted','failed','unknown') or char_length(coalesce(p_error_code,''))>80
 then raise exception 'invalid_input' using errcode='22023'; end if;
 update public.delivery_attempts set state=p_state,provider_message_id=left(p_provider_id,200),
  error_code=left(p_error_code,80),attempted_at=clock_timestamp()
  where id=p_attempt and state='pending' returning * into a;
 if a.id is null then return; end if;
 if p_error_code='invalid_token' then
  update public.push_devices set status='invalid',revoked_at=clock_timestamp(),updated_at=clock_timestamp()
   where id=a.push_device_id and status='active';
 end if;
 select * into r from public.campaign_recipients where id=a.campaign_recipient_id for update;
 select * into v from public.campaign_versions where id=r.campaign_version_id;
 select not exists(select from public.delivery_attempts x where x.campaign_recipient_id=r.id and x.state='pending') into all_done;
 if not all_done then return; end if;
 select exists(select from public.delivery_attempts x where x.campaign_recipient_id=r.id and x.attempted_at is not null) into attempted;
 if not exists(select from public.delivery_attempts x where x.campaign_recipient_id=r.id and x.state in ('provider_accepted','unknown'))
  and exists(select from public.delivery_attempts x where x.campaign_recipient_id=r.id and x.attempt_number=a.attempt_number
   and x.state='failed' and x.error_code='transient') and a.attempt_number<=5
  and v.expires_at>clock_timestamp()+interval '30 seconds' then
  update public.campaign_recipients set status='pending',next_attempt_at=clock_timestamp()+
   case a.attempt_number when 1 then interval '30 seconds' when 2 then interval '2 minutes'
    when 3 then interval '10 minutes' when 4 then interval '30 minutes' else interval '2 hours' end where id=r.id;
 else
  update public.campaign_recipients set status=case when attempted then 'attempted' else 'suppressed' end,
   suppression_reason=case when attempted then null else coalesce(p_error_code,'no_attempt') end where id=r.id;
 end if;
 if attempted then update public.contact_frequency_reservations set state='attempted'
  where business_id=r.business_id and event_key=a.event_key and state='reserved'; end if;
end $$;

create function public.worker_finish_campaigns() returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 update public.campaign_recipients r set status='suppressed',suppression_reason='expired'
 from public.campaign_versions v where v.id=r.campaign_version_id and v.expires_at<=clock_timestamp() and r.status='pending';
 update public.campaigns c set status=case when exists(select from public.campaign_recipients r
  where r.campaign_id=c.id and r.status='failed') or exists(select from public.delivery_attempts a
  join public.campaign_recipients r on r.id=a.campaign_recipient_id where r.campaign_id=c.id and a.state in ('failed','unknown'))
  then 'completed_with_errors' else 'completed' end,completed_at=clock_timestamp()
 where c.status='processing' and not exists(select from public.campaign_recipients r where r.campaign_id=c.id and r.status in ('pending','processing'));
 get diagnostics affected=row_count;
 return affected;
end $$;

create function public.worker_expire_pending_campaign_attempts() returns integer
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 update public.delivery_attempts set state='unknown',error_code='worker_interrupted',attempted_at=clock_timestamp()
 where state='pending' and created_at<clock_timestamp()-interval '2 minutes';
 get diagnostics affected=row_count;
 update public.campaign_recipients r set status=case when exists(select from public.delivery_attempts a
  where a.campaign_recipient_id=r.id and a.attempted_at is not null) then 'attempted' else 'suppressed' end,
  suppression_reason=case when exists(select from public.delivery_attempts a
   where a.campaign_recipient_id=r.id and a.attempted_at is not null) then null else 'no_attempt' end
  where r.status='processing' and not exists(select from public.delivery_attempts a
   where a.campaign_recipient_id=r.id and a.state='pending');
 update public.contact_frequency_reservations f set state='released' where f.state='reserved' and f.event_key like 'campaign:%'
  and exists(select from public.campaign_recipients r where f.event_key='campaign:'||r.campaign_id::text||':'||r.membership_id::text
   and r.status='suppressed' and not exists(select from public.delivery_attempts a where a.campaign_recipient_id=r.id and a.attempted_at is not null));
 return affected;
end $$;

create function public.observe_campaign_click(p_recipient uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.campaign_recipients;m public.memberships;
begin
 perform app_private.actor();
 select * into r from public.campaign_recipients where id=p_recipient;
 if r.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 select * into m from public.memberships where id=r.membership_id and customer_user_id=app_private.actor();
 if m.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 update public.campaign_recipients set observed_clicked_at=coalesce(observed_clicked_at,clock_timestamp()) where id=r.id;
 return jsonb_build_object('recorded',true);
end $$;

revoke all on function public.observe_campaign_click(uuid) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.observe_campaign_click(uuid) to authenticated;
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('worker_claim_campaign_delivery','worker_campaign_attempt_ready','worker_finish_campaign_attempt',
  'worker_finish_campaigns','worker_expire_pending_campaign_attempts') loop
  execute format('revoke all on function %s from public,anon,authenticated,loyalty_web_gateway,loyalty_worker',f);
  execute format('grant execute on function %s to loyalty_worker',f);
 end loop;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
