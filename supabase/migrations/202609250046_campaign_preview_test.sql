begin;

create function public.preview_campaign_audience(p_business uuid,p_campaign uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.campaigns;v public.campaign_versions;
begin
 perform app_private.communication_staff(p_business);
 select * into c from public.campaigns where business_id=p_business and id=p_campaign;
 if c.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 select * into v from public.campaign_versions where id=c.current_version_id;
 return (select jsonb_build_object(
  'estimatedAt',clock_timestamp(),'eligibleMembers',count(*) filter(where eligible),
  'subscribedDevices',coalesce(sum(device_count) filter(where eligible),0),
  'excludedNoConsent',count(*) filter(where not consented),
  'excludedAudienceOrBranch',count(*) filter(where consented and not eligible),
  'eligibleWithoutDevice',count(*) filter(where eligible and device_count=0),
  'cappedNow',count(*) filter(where eligible and capped),
  'quietHoursNow',count(*) filter(where eligible and quiet_now))
  from (select m.id,
   exists(select from public.consent_preferences cp where cp.business_id=p_business and cp.membership_id=m.id
    and cp.channel='push' and cp.purpose='marketing' and cp.allowed) as consented,
   app_private.campaign_audience(v.id,m.id) as eligible,
   (select count(*) from public.push_devices d where d.customer_user_id=m.customer_user_id and d.status='active') as device_count,
   (select count(*) from public.contact_frequency_reservations f where f.customer_user_id=m.customer_user_id
    and f.business_id=p_business and f.kind='marketing' and f.state<>'released'
    and f.reserved_at>clock_timestamp()-interval '7 days')>=2
    or (select count(*) from public.contact_frequency_reservations f where f.customer_user_id=m.customer_user_id
    and f.kind='marketing' and f.state<>'released' and f.reserved_at>clock_timestamp()-interval '7 days')>=5 as capped,
   app_private.next_marketing_time(p.preferred_timezone,clock_timestamp())>clock_timestamp() as quiet_now
   from public.memberships m join public.profiles p on p.user_id=m.customer_user_id
   where m.business_id=p_business and m.status='active') audience);
end $$;

create table public.campaign_test_requests (
 id uuid primary key default gen_random_uuid(), business_id uuid not null,
 campaign_id uuid not null,campaign_version_id uuid not null,
 business_user_id uuid not null,push_device_id uuid not null,
 status text not null default 'pending' check(status in ('pending','processing','provider_accepted','failed','unknown','suppressed')),
 created_at timestamptz not null default now(),expires_at timestamptz not null,
 attempted_at timestamptz,provider_message_id text,error_code text,
 unique(business_id,id),
 foreign key(business_id,campaign_id,campaign_version_id) references public.campaign_versions(business_id,campaign_id,id),
 foreign key(business_id,business_user_id) references public.business_users(business_id,id),
 foreign key(push_device_id) references public.push_devices(id)
);
create index campaign_test_recent on public.campaign_test_requests(business_id,business_user_id,created_at desc);
alter table public.campaign_test_requests enable row level security;
revoke all on public.campaign_test_requests from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;

create function public.campaign_test_devices(p_business uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;
begin
 staff:=app_private.communication_staff(p_business);
 return jsonb_build_object('devices',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,
  'browserLabel',d.browser_label,'createdAt',d.created_at,'lastSeenAt',d.last_seen_at)
  order by d.created_at desc),'[]'::jsonb)
  from public.push_test_registrations r join public.push_devices d on d.id=r.push_device_id
  where r.business_id=p_business and r.business_user_id=staff.id and r.active and d.status='active'
   and d.customer_user_id=staff.user_id),
  'recentTests',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'campaignId',t.campaign_id,
   'status',t.status,'createdAt',t.created_at,'attemptedAt',t.attempted_at,'errorCode',t.error_code)
   order by t.created_at desc),'[]'::jsonb)
   from (select * from public.campaign_test_requests where business_id=p_business
    and business_user_id=staff.id order by created_at desc limit 20) t));
end $$;

create function public.set_campaign_test_device(p_business uuid,p_installation uuid,p_generation uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare staff public.business_users;d public.push_devices;
begin
 staff:=app_private.communication_staff(p_business);
 select * into d from public.push_devices where installation_id=p_installation and binding_generation=p_generation
  and customer_user_id=staff.user_id and status='active' for share;
 if d.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 if p_enabled then
  insert into public.push_test_registrations(business_id,business_user_id,push_device_id,active)
   values(p_business,staff.id,d.id,true)
   on conflict(business_id,business_user_id,push_device_id) do update set active=true;
 else
  update public.push_test_registrations set active=false where business_id=p_business
   and business_user_id=staff.id and push_device_id=d.id;
 end if;
 return jsonb_build_object('deviceId',d.id,'registered',p_enabled);
end $$;

create function public.request_campaign_test(p_business uuid,p_campaign uuid,p_device uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;c public.campaigns;v public.campaign_versions;new_id uuid;
begin
 staff:=app_private.communication_staff(p_business);
 select * into c from public.campaigns where business_id=p_business and id=p_campaign and status in ('draft','scheduled') for share;
 if c.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 select * into v from public.campaign_versions where id=c.current_version_id;
 if v.expires_at<=clock_timestamp() or not exists(select from public.push_test_registrations r
  join public.push_devices d on d.id=r.push_device_id where r.business_id=p_business and r.business_user_id=staff.id
   and r.push_device_id=p_device and r.active and d.status='active' and d.customer_user_id=staff.user_id)
 then raise exception 'not_found' using errcode='P0002'; end if;
 perform pg_advisory_xact_lock(hashtextextended('campaign-test:'||staff.id::text,0));
 if (select count(*) from public.campaign_test_requests where business_id=p_business and business_user_id=staff.id
  and created_at>clock_timestamp()-interval '1 hour')>=5 then raise exception 'rate_limited' using errcode='22023'; end if;
 insert into public.campaign_test_requests(business_id,campaign_id,campaign_version_id,business_user_id,push_device_id,expires_at)
 values(p_business,c.id,v.id,staff.id,p_device,least(v.expires_at,clock_timestamp()+interval '5 minutes')) returning id into new_id;
 insert into public.outbox_events(business_id,event_type,event_key,schema_version,payload)
 values(p_business,'campaign.test_requested',new_id::text,1,jsonb_build_object('requestId',new_id))
 on conflict(event_type,event_key) do nothing;
 return jsonb_build_object('requestId',new_id,'status','pending');
end $$;

create function app_private.campaign_test_ready(p_request public.campaign_test_requests) returns boolean
language sql stable set search_path='' as $$
 select p_request.expires_at>clock_timestamp()
  and exists(select from public.business_users u where u.business_id=p_request.business_id
   and u.id=p_request.business_user_id and u.status='active'
   and (u.role='owner' or u.role='manager' and u.can_manage_campaigns))
  and exists(select from public.campaigns c where c.id=p_request.campaign_id
   and c.current_version_id=p_request.campaign_version_id and c.status in ('draft','scheduled'))
  and exists(select from public.push_test_registrations r join public.push_devices d on d.id=r.push_device_id
   join public.business_users u on u.id=r.business_user_id
   where r.business_id=p_request.business_id and r.business_user_id=p_request.business_user_id
    and r.push_device_id=p_request.push_device_id and r.active and d.status='active'
    and d.customer_user_id=u.user_id)
$$;

create function public.worker_claim_campaign_test(p_outbox uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare event public.outbox_events;t public.campaign_test_requests;v public.campaign_versions;d public.push_devices;
begin
 select * into event from public.outbox_events where id=p_outbox;
 if event.id is null or event.event_type<>'campaign.test_requested' or event.schema_version<>1
  or event.event_key is distinct from event.payload->>'requestId' then raise exception 'invalid_event' using errcode='22023'; end if;
 select * into t from public.campaign_test_requests where id=(event.payload->>'requestId')::uuid for update;
 if t.id is null or t.business_id<>event.business_id or t.status<>'pending' then return null; end if;
 if not app_private.campaign_test_ready(t) then
  update public.campaign_test_requests set status='suppressed',error_code='no_longer_eligible' where id=t.id;
  return null;
 end if;
 select * into v from public.campaign_versions where id=t.campaign_version_id;
 select * into d from public.push_devices where id=t.push_device_id;
 update public.campaign_test_requests set status='processing' where id=t.id;
 return jsonb_build_object('requestId',t.id,'title',v.title,'body',v.body,
  'imagePath',(select a.business_id::text||'/'||a.id::text||'/v1.webp' from public.media_assets a
   where a.business_id=v.business_id and a.id=v.image_asset_id
    and a.validation_status='accepted' and a.visibility='public_brand'),
  'destination','/app/notifications','eventKey','campaign-test:'||t.id::text,
  'expiresAt',t.expires_at,'installationId',d.installation_id,
  'bindingGeneration',d.binding_generation,'tokenCiphertext',d.token_ciphertext,
  'tokenKeyId',d.encryption_key_id,'tokenHash',d.token_hash);
end $$;

create function public.worker_campaign_test_ready(p_request uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare t public.campaign_test_requests;
begin
 select * into t from public.campaign_test_requests where id=p_request for update;
 if t.id is null or t.status<>'processing' then return false; end if;
 if not app_private.campaign_test_ready(t) then
  update public.campaign_test_requests set status='suppressed',error_code='no_longer_eligible' where id=t.id;
  return false;
 end if;
 return true;
end $$;

create function public.worker_finish_campaign_test(p_request uuid,p_state text,p_message text,p_error text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_state not in ('provider_accepted','failed','unknown') then raise exception 'invalid_input' using errcode='22023'; end if;
 update public.campaign_test_requests set status=p_state,attempted_at=clock_timestamp(),
  provider_message_id=left(p_message,300),error_code=left(p_error,80)
 where id=p_request and status='processing';
 return found;
end $$;

do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('preview_campaign_audience','campaign_test_devices',
   'set_campaign_test_device','request_campaign_test') loop
  execute format('revoke all on function %s from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('worker_claim_campaign_test','worker_campaign_test_ready',
   'worker_finish_campaign_test') loop
  execute format('revoke all on function %s from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',f);
  execute format('grant execute on function %s to loyalty_worker',f);
 end loop;
end $$;
commit;
