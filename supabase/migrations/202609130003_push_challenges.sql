-- Receipt-proven device ownership. Candidate challenges never overwrite active bindings.
begin;
create table app_private.push_installations (
  id uuid primary key,
  secret_hash text not null check(secret_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references public.profiles(user_id),
  installation_id uuid not null references app_private.push_installations(id),
  binding_generation uuid not null default gen_random_uuid(),
  token_ciphertext text not null check(char_length(token_ciphertext) between 40 and 8192),
  encryption_key_id text not null check(encryption_key_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check(status in ('pending','active','revoked','invalid')),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  browser_label text check(char_length(browser_label) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1 check(row_version>0)
);
create unique index push_active_installation_idx on public.push_devices(installation_id) where status='active';
create index push_device_customer_idx on public.push_devices(customer_user_id,status);
create table public.push_registration_challenges (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references public.profiles(user_id),
  auth_session_id uuid not null,
  installation_id uuid not null references app_private.push_installations(id),
  push_device_id uuid not null references public.push_devices(id),
  nonce_hash text not null check(nonce_hash ~ '^[a-f0-9]{64}$'),
  nonce_ciphertext text not null check(char_length(nonce_ciphertext) between 40 and 1024),
  encryption_key_id text not null check(encryption_key_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
  binding_generation uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default(now()+interval '5 minutes'),
  consumed_at timestamptz,
  canceled_at timestamptz,
  dispatch_state text not null default 'pending' check(dispatch_state in ('pending','sending','provider_accepted','failed','unknown')),
  created_at timestamptz not null default now(),
  check(expires_at=created_at+interval '5 minutes'),
  check(not(consumed_at is not null and canceled_at is not null))
);
create unique index push_open_challenge_idx on public.push_registration_challenges(installation_id,auth_session_id)
  where consumed_at is null and canceled_at is null;
create index push_challenge_device_idx on public.push_registration_challenges(push_device_id);
create index push_challenge_expiry_idx on public.push_registration_challenges(expires_at) where consumed_at is null and canceled_at is null;
alter table public.push_devices enable row level security;
alter table public.push_registration_challenges enable row level security;
revoke all on app_private.push_installations,public.push_devices,public.push_registration_challenges
  from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;

create function app_private.require_push_session(p_user uuid,p_session uuid) returns void
language plpgsql set search_path='' as $$
begin
  perform 1 from auth.users u join auth.sessions s on s.user_id=u.id
    join public.profiles p on p.auth_user_id=u.id
    where u.id=p_user and s.id=p_session and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
      and u.deleted_at is null and p.deletion_requested_at is null and p.anonymized_at is null
      and (s.not_after is null or s.not_after>clock_timestamp()) for share of u,s,p;
  if not found then raise exception 'unauthenticated' using errcode='42501'; end if;
end $$;

create function public.gateway_request_push_challenge(
  p_user uuid,p_session uuid,p_installation uuid,p_installation_secret_hash text,
  p_token_hash text,p_token_ciphertext text,p_key_id text,p_nonce_hash text,p_nonce_ciphertext text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare device_id uuid; challenge public.push_registration_challenges; retry integer;
begin
  perform app_private.require_push_session(p_user,p_session);
  retry := app_private.consume_actor_rate('intent_challenge',null,p_user);
  if retry>0 then return jsonb_build_object('error',jsonb_build_object('code','rate_limited','retryAfterSeconds',retry)); end if;
  if p_installation is null or p_installation_secret_hash is null or p_installation_secret_hash !~ '^[a-f0-9]{64}$'
    or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_input' using errcode='22023'; end if;
  -- Registration is infrequent; serialize binding changes to avoid cross-installation rebind deadlocks.
  -- No network/provider work occurs while holding this transaction lock.
  perform pg_advisory_xact_lock(hashtextextended('push-binding:v1',0));
  insert into app_private.push_installations(id,secret_hash) values(p_installation,p_installation_secret_hash) on conflict do nothing;
  perform 1 from app_private.push_installations where id=p_installation and secret_hash=p_installation_secret_hash;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('push-token:'||p_token_hash,0));
  insert into public.push_devices(customer_user_id,installation_id,token_hash,token_ciphertext,encryption_key_id)
    values(p_user,p_installation,p_token_hash,p_token_ciphertext,p_key_id) on conflict(token_hash) do nothing;
  select id into strict device_id from public.push_devices where token_hash=p_token_hash for update;
  update public.push_registration_challenges set canceled_at=clock_timestamp()
    where installation_id=p_installation and auth_session_id=p_session and consumed_at is null and canceled_at is null;
  insert into public.push_registration_challenges(customer_user_id,auth_session_id,installation_id,push_device_id,nonce_hash,nonce_ciphertext,encryption_key_id)
    values(p_user,p_session,p_installation,device_id,p_nonce_hash,p_nonce_ciphertext,p_key_id) returning * into challenge;
  insert into public.outbox_events(event_type,event_key,schema_version,payload)
    values('push.registration_challenge',challenge.id::text,1,jsonb_build_object('challengeId',challenge.id));
  -- Never expose the nonce, hash, ciphertext, device ID, existing owner, or provider token.
  return jsonb_build_object('challengeId',challenge.id,'installationId',p_installation,'expiresAt',challenge.expires_at);
end $$;

create function public.acknowledge_push_challenge(p_challenge_id uuid,p_installation_id uuid,p_nonce text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; session_id uuid; candidate public.push_registration_challenges; token text; retry integer;
begin
  actor := auth.uid();
  session_id := nullif(auth.jwt()->>'session_id','')::uuid;
  perform app_private.require_push_session(actor,session_id);
  retry := app_private.consume_actor_rate('push_ack');
  if retry>0 then return jsonb_build_object('error',jsonb_build_object('code','rate_limited','retryAfterSeconds',retry)); end if;
  if p_nonce is null or char_length(p_nonce)<>43 or p_nonce !~ '^[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('error',jsonb_build_object('code','invalid_input'));
  end if;
  select c.* into candidate from public.push_registration_challenges c where c.id=p_challenge_id
    and c.customer_user_id=actor and c.auth_session_id=session_id and c.installation_id=p_installation_id;
  if not found then return jsonb_build_object('error',jsonb_build_object('code','not_found')); end if;
  perform pg_advisory_xact_lock(hashtextextended('push-binding:v1',0));
  select token_hash into strict token from public.push_devices where id=candidate.push_device_id;
  perform pg_advisory_xact_lock(hashtextextended('push-token:'||token,0));
  perform 1 from public.push_devices where id=candidate.push_device_id for update;
  select * into strict candidate from public.push_registration_challenges where id=p_challenge_id for update;
  if candidate.canceled_at is not null or candidate.expires_at<=clock_timestamp() then
    return jsonb_build_object('error',jsonb_build_object('code','expired'));
  end if;
  if candidate.nonce_hash<>encode(extensions.digest(p_nonce,'sha256'),'hex') then
    return jsonb_build_object('error',jsonb_build_object('code','not_found'));
  end if;
  if candidate.consumed_at is not null then
    if not exists(select from public.push_devices where id=candidate.push_device_id and status='active'
      and customer_user_id=actor and installation_id=p_installation_id and binding_generation=candidate.binding_generation) then
      return jsonb_build_object('error',jsonb_build_object('code','expired'));
    end if;
  else
    update public.push_devices set status='revoked',revoked_at=clock_timestamp(),binding_generation=gen_random_uuid(),
      updated_at=clock_timestamp(),row_version=row_version+1
      where installation_id=p_installation_id and status='active' and id<>candidate.push_device_id;
    update public.push_devices set customer_user_id=actor,installation_id=p_installation_id,binding_generation=candidate.binding_generation,
      status='active',revoked_at=null,last_seen_at=clock_timestamp(),updated_at=clock_timestamp(),row_version=row_version+1 where id=candidate.push_device_id;
    update public.push_registration_challenges set consumed_at=clock_timestamp() where id=p_challenge_id;
    -- Older candidates for this token can no longer reclaim the binding with an old receipt.
    update public.push_registration_challenges set canceled_at=clock_timestamp()
      where push_device_id=candidate.push_device_id and id<>p_challenge_id and created_at<=candidate.created_at
        and consumed_at is null and canceled_at is null;
  end if;
  return jsonb_build_object('installationId',p_installation_id,'bindingGeneration',candidate.binding_generation,'status','active');
end $$;

create function public.revoke_push_installation(p_installation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; session_id uuid;
begin
  actor := auth.uid(); session_id := nullif(auth.jwt()->>'session_id','')::uuid;
  perform app_private.require_push_session(actor,session_id);
  perform pg_advisory_xact_lock(hashtextextended('push-binding:v1',0));
  update public.push_devices set status='revoked',revoked_at=clock_timestamp(),binding_generation=gen_random_uuid(),
    updated_at=clock_timestamp(),row_version=row_version+1 where installation_id=p_installation_id and customer_user_id=actor and status in ('pending','active');
  update public.push_registration_challenges set canceled_at=clock_timestamp()
    where installation_id=p_installation_id and customer_user_id=actor and consumed_at is null and canceled_at is null;
  return jsonb_build_object('status','revoked');
end $$;

-- One short, data-only registration send. An ambiguous attempt is not blindly resent.
create function public.worker_claim_push_challenge(p_outbox_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare event public.outbox_events; candidate public.push_registration_challenges; device public.push_devices;
begin
  select * into strict event from public.outbox_events where id=p_outbox_id;
  if event.event_type<>'push.registration_challenge' or event.schema_version<>1 or event.business_id is not null
    or event.payload<>jsonb_build_object('challengeId',event.event_key::uuid) then raise exception 'invalid_event' using errcode='22023'; end if;
  select * into strict candidate from public.push_registration_challenges where id=event.event_key::uuid for update;
  if candidate.consumed_at is not null or candidate.canceled_at is not null or candidate.expires_at<=clock_timestamp()
    or candidate.dispatch_state<>'pending' then return null; end if;
  perform app_private.require_push_session(candidate.customer_user_id,candidate.auth_session_id);
  select * into strict device from public.push_devices where id=candidate.push_device_id;
  update public.push_registration_challenges set dispatch_state='sending' where id=candidate.id;
  return jsonb_build_object('challengeId',candidate.id,'installationId',candidate.installation_id,'expiresAt',candidate.expires_at,
    'nonceCiphertext',candidate.nonce_ciphertext,'nonceKeyId',candidate.encryption_key_id,'nonceHash',candidate.nonce_hash,
    'tokenCiphertext',device.token_ciphertext,'tokenKeyId',device.encryption_key_id,'tokenHash',device.token_hash);
end $$;
create function public.worker_finish_push_challenge(p_challenge_id uuid,p_state text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_state is null or p_state not in ('provider_accepted','failed','unknown') then raise exception 'invalid_input' using errcode='22023'; end if;
  update public.push_registration_challenges set dispatch_state=p_state where id=p_challenge_id and dispatch_state='sending';
end $$;
create function public.worker_expire_push_challenges() returns integer
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('push-binding:v1',0));
  update public.push_registration_challenges set canceled_at=clock_timestamp(),
    dispatch_state=case when dispatch_state='sending' then 'unknown' else dispatch_state end
    where id in(select id from public.push_registration_challenges where expires_at<=clock_timestamp()
      and consumed_at is null and canceled_at is null order by expires_at limit 5000 for update skip locked);
  get diagnostics affected=row_count;
  update public.push_devices d set status='revoked',revoked_at=clock_timestamp(),updated_at=clock_timestamp(),row_version=row_version+1
    where d.status='pending' and d.created_at<=clock_timestamp()-interval '5 minutes'
      and not exists(select from public.push_registration_challenges c where c.push_device_id=d.id and c.canceled_at is null and c.consumed_at is null and c.expires_at>clock_timestamp());
  return affected;
end $$;

revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
revoke all on function public.gateway_request_push_challenge(uuid,uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated,loyalty_worker;
grant execute on function public.gateway_request_push_challenge(uuid,uuid,uuid,text,text,text,text,text,text) to loyalty_web_gateway;
revoke all on function public.acknowledge_push_challenge(uuid,uuid,text),public.revoke_push_installation(uuid) from public,anon,authenticated,loyalty_web_gateway,loyalty_worker;
grant execute on function public.acknowledge_push_challenge(uuid,uuid,text),public.revoke_push_installation(uuid) to authenticated;
revoke all on function public.worker_claim_push_challenge(uuid),public.worker_finish_push_challenge(uuid,text),public.worker_expire_push_challenges() from public,anon,authenticated,loyalty_web_gateway;
grant execute on function public.worker_claim_push_challenge(uuid),public.worker_finish_push_challenge(uuid,text),public.worker_expire_push_challenges() to loyalty_worker;
commit;
