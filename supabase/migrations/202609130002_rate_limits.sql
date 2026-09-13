-- Shared limiter. Only a dedicated web role can supply ingress/email HMACs.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$ begin
  if not exists(select from pg_roles where rolname='loyalty_web_gateway') then
    create role loyalty_web_gateway nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;
grant usage on schema public to loyalty_web_gateway;

create table public.rate_limit_buckets (
  subject_hash text not null check(subject_hash ~ '^[a-f0-9]{64}$'),
  operation text not null check(char_length(operation) between 1 and 80),
  window_start timestamptz not null,
  window_seconds integer not null check(window_seconds between 1 and 3600),
  count integer not null check(count between 1 and 1000000000),
  expires_at timestamptz not null,
  primary key(subject_hash,operation,window_start),
  check(expires_at=window_start+make_interval(secs=>window_seconds))
);
create index rate_limit_expiry_idx on public.rate_limit_buckets(expires_at);
alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;

-- User subjects are made inside the database; never accept a caller-chosen user/hash.
create table app_private.rate_limit_key (
  singleton boolean primary key default true check(singleton),
  secret bytea not null check(octet_length(secret)=32)
);
insert into app_private.rate_limit_key(secret) values(extensions.gen_random_bytes(32));
revoke all on app_private.rate_limit_key from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;

create function app_private.consume_fixed_rate(
  p_subject text,p_operation text,p_seconds integer,p_limit integer,p_now timestamptz
) returns integer language plpgsql set search_path='' as $$
declare starts timestamptz; ends timestamptz; used integer;
begin
  if p_subject is null or p_subject !~ '^[a-f0-9]{64}$' or p_operation is null
    or p_seconds is null or p_seconds not between 1 and 3600 or p_limit is null or p_limit not between 1 and 999999999
    or p_now is null then raise exception 'invalid_input' using errcode='22023'; end if;
  starts := to_timestamp(floor(extract(epoch from p_now)/p_seconds)*p_seconds);
  ends := starts+make_interval(secs=>p_seconds);
  insert into public.rate_limit_buckets(subject_hash,operation,window_start,window_seconds,count,expires_at)
    values(p_subject,p_operation,starts,p_seconds,1,ends)
  on conflict(subject_hash,operation,window_start) do update
    set count=least(public.rate_limit_buckets.count+1,p_limit+1)
  returning count into used;
  return case when used>p_limit then greatest(1,ceil(extract(epoch from ends-p_now))::integer) else 0 end;
end $$;

-- Callers must RETURN a denied result, not raise: raising would roll back the counted attempt.
-- Business authorization belongs to each calling domain function and precedes this helper.
create function app_private.consume_actor_rate(p_operation text,p_business_id uuid default null,p_actor uuid default auth.uid())
returns integer language plpgsql set search_path='' as $$
declare actor uuid; subject text; seconds integer; maximum integer;
begin
  actor := p_actor;
  if actor is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  perform 1 from auth.users where id=actor and email_confirmed_at is not null
    and not coalesce(is_anonymous,false) and deleted_at is null for share;
  if not found then raise exception 'unauthenticated' using errcode='42501'; end if;
  select v.seconds,v.maximum into seconds,maximum from (values
    ('profile_write',60,10,false),('intent_challenge',60,10,false),('push_ack',60,30,false),
    ('staff_lookup',60,60,true),('failed_typed_code',300,5,false),
    ('purchase_redemption',60,60,true),('report_read',60,30,true),
    ('export',3600,3,false),('campaign_test',3600,5,false),('manual_task_open',3600,30,true)
  ) as v(operation,seconds,maximum,business_scoped)
  where v.operation=p_operation and v.business_scoped=(p_business_id is not null);
  if not found then raise exception 'invalid_input' using errcode='22023'; end if;
  select encode(extensions.hmac(convert_to('loyalty-rate:v1:actor:'||actor::text||':'||coalesce(p_business_id::text,''),'UTF8'),secret,'sha256'),'hex')
    into strict subject from app_private.rate_limit_key where singleton;
  return app_private.consume_fixed_rate(subject,p_operation,seconds,maximum,clock_timestamp());
end $$;

create function public.gateway_limit_magic_link(p_email_subject text,p_ip_subject text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare stamp timestamptz; retry integer; until_at timestamptz;
begin
  if p_email_subject is null or p_email_subject !~ '^[a-f0-9]{64}$'
    or p_ip_subject is null or p_ip_subject !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_input' using errcode='22023';
  end if;
  -- Serialize the sliding resend cooldown as well as the fixed hourly buckets.
  perform pg_advisory_xact_lock(hashtextextended('magic-link:'||p_email_subject,0));
  stamp := clock_timestamp();
  retry := greatest(
    app_private.consume_fixed_rate(p_email_subject,'magic_link_email',3600,5,stamp),
    app_private.consume_fixed_rate(p_ip_subject,'magic_link_ip',3600,30,stamp)
  );
  select max(expires_at) into until_at from public.rate_limit_buckets
    where subject_hash=p_email_subject and operation='magic_link_cooldown' and expires_at>stamp;
  retry := greatest(retry,coalesce(ceil(extract(epoch from until_at-stamp))::integer,0));
  if retry=0 then
    insert into public.rate_limit_buckets values(p_email_subject,'magic_link_cooldown',stamp,60,1,stamp+interval '60 seconds');
  end if;
  return jsonb_build_object('allowed',retry=0,'retryAfterSeconds',retry);
end $$;
revoke all on function public.gateway_limit_magic_link(text,text) from public,anon,authenticated,loyalty_worker;
grant execute on function public.gateway_limit_magic_link(text,text) to loyalty_web_gateway;

create function public.worker_purge_rate_limits() returns integer
language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
  delete from public.rate_limit_buckets where (subject_hash,operation,window_start) in (
    select subject_hash,operation,window_start from public.rate_limit_buckets
    where expires_at<=clock_timestamp() order by expires_at limit 5000 for update skip locked
  );
  get diagnostics removed=row_count;
  return removed;
end $$;
revoke all on function public.worker_purge_rate_limits() from public,anon,authenticated,loyalty_web_gateway;
grant execute on function public.worker_purge_rate_limits() to loyalty_worker;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;

-- Preserve the existing idempotent profile operation; enforce the gate on direct RPC too.
alter function public.complete_profile(text,uuid) rename to complete_profile_unlimited;
alter function public.complete_profile_unlimited(text,uuid) set schema app_private;
revoke all on function app_private.complete_profile_unlimited(text,uuid) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
create function public.complete_profile(p_display_name text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare retry integer;
begin
  retry := app_private.consume_actor_rate('profile_write');
  if retry>0 then return jsonb_build_object('error',jsonb_build_object('code','rate_limited','retryAfterSeconds',retry)); end if;
  return app_private.complete_profile_unlimited(p_display_name,p_correlation_id);
end $$;
revoke all on function public.complete_profile(text,uuid) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.complete_profile(text,uuid) to authenticated;
commit;
