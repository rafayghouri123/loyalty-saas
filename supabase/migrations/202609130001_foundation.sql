-- Phase 0 foundation. Tables not implemented here remain explicit checklist work.
begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
revoke create on schema public from public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

do $$ begin
  if not exists (select from pg_roles where rolname = 'loyalty_worker') then
    create role loyalty_worker nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;
-- Managed Supabase's operator is not a superuser. Explicit SET membership is
-- required to assign the queue schema to the newly created worker role.
grant loyalty_worker to current_user with set true;
create schema if not exists pgboss authorization loyalty_worker;
grant usage on schema public to loyalty_worker;

create table public.profiles (
  user_id uuid primary key,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null check (display_name = btrim(display_name) and char_length(display_name) between 1 and 80),
  preferred_timezone text not null default 'Asia/Karachi',
  birthday_month integer,
  birthday_day integer,
  birthday_changed_at timestamptz,
  deletion_requested_at timestamptz,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1 check (row_version > 0),
  constraint valid_birthday check (
    (birthday_month is null and birthday_day is null) or
    (birthday_month is not null and birthday_day is not null and birthday_month between 1 and 12
      and birthday_day between 1 and case when birthday_month=2 then 29 when birthday_month in (4,6,9,11) then 30 else 31 end)
  )
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'
    and slug not in ('app','admin','api','auth','dashboard','staff','workspace','privacy','terms','join','invite','support','www')),
  display_name text not null check (display_name = btrim(display_name) and char_length(display_name) between 2 and 80),
  description text check (char_length(description) <= 500),
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  timezone text not null default 'Asia/Karachi',
  currency text not null default 'PKR' check (currency='PKR'),
  logo_asset_id uuid,
  cover_asset_id uuid,
  accent_hex text not null default '#166534' check (accent_hex ~ '^#[0-9A-Fa-f]{6}$'),
  public_contact_phone text,
  support_email text,
  menu_url text check (menu_url ~ '^https://'),
  review_url text check (review_url ~ '^https://'),
  published_at timestamptz,
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1 check (row_version > 0)
);
create index businesses_created_by_idx on public.businesses(created_by);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  name text not null check (name = btrim(name) and char_length(name) between 2 and 80),
  address text not null check (address = btrim(address) and char_length(address) between 5 and 300),
  city text not null check (city = btrim(city) and char_length(city) between 2 and 80),
  area text check (char_length(area)<=80),
  maps_url text check (maps_url ~ '^https://'),
  phone text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1 check (row_version > 0),
  unique(business_id,id)
);

create table public.business_users (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  user_id uuid not null references public.profiles(user_id),
  staff_display_name text not null check (char_length(btrim(staff_display_name)) between 1 and 80),
  staff_email text not null check (char_length(staff_email) between 3 and 254),
  role text not null check (role in ('owner','manager','cashier')),
  status text not null default 'active' check (status in ('active','revoked')),
  can_manage_campaigns boolean not null default false,
  can_contact_customers boolean not null default false,
  can_reverse_transactions boolean not null default false,
  can_export_reports boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1 check (row_version > 0),
  unique(business_id,id), unique(business_id,user_id),
  check (role<>'cashier' or not (can_manage_campaigns or can_contact_customers or can_reverse_transactions or can_export_reports))
);
create unique index one_active_owner on public.business_users(business_id) where role='owner' and status='active';
create index business_users_user_idx on public.business_users(user_id,business_id);

create table public.branch_assignments (
  business_id uuid not null references public.businesses(id),
  business_user_id uuid not null,
  branch_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(business_id,business_user_id,branch_id),
  foreign key(business_id,business_user_id) references public.business_users(business_id,id),
  foreign key(business_id,branch_id) references public.branches(business_id,id)
);
create index branch_assignments_branch_idx on public.branch_assignments(business_id,branch_id);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id),
  actor_user_id uuid references public.profiles(user_id),
  action text not null,
  target_type text not null,
  target_id uuid,
  reason text,
  safe_changes jsonb not null,
  correlation_id text not null,
  support_access_grant_id uuid,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index audit_business_time_idx on public.audit_events(business_id,occurred_at,id);
create index audit_actor_idx on public.audit_events(actor_user_id,occurred_at);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id),
  event_type text not null,
  event_key text not null,
  schema_version integer not null check (schema_version > 0),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  state text not null default 'pending' check (state in ('pending','dispatched','failed')),
  dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique(event_type,event_key)
);
create index outbox_pending_idx on public.outbox_events(created_at,id) where state='pending';

create table public.job_effect_receipts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id),
  handler_name text not null,
  event_key text not null,
  completed_at timestamptz not null,
  result_reference uuid,
  created_at timestamptz not null default now(),
  unique(handler_name,event_key)
);

create table public.operational_checks (
  name text primary key check (name in ('worker_heartbeat','db_readiness','backup','restore_rehearsal','ledger_reconciliation')),
  checked_at timestamptz not null,
  status text not null check (status in ('ok','degraded','failed','unknown')),
  safe_details jsonb not null
);

create function app_private.valid_timezone() returns trigger language plpgsql set search_path='' as $$
declare tz text;
begin
  tz := to_jsonb(new)->>(case when tg_table_name='profiles' then 'preferred_timezone' else 'timezone' end);
  if not exists(select from pg_catalog.pg_timezone_names where name=tz) then
    raise exception 'invalid_input' using errcode='22023';
  end if;
  return new;
end $$;
create trigger profile_timezone before insert or update on public.profiles for each row execute function app_private.valid_timezone();
create trigger business_timezone before insert or update on public.businesses for each row execute function app_private.valid_timezone();

create function app_private.immutable_event() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'immutable_event' using errcode='42501'; end $$;
create trigger audit_immutable before update or delete on public.audit_events for each row execute function app_private.immutable_event();
create trigger job_receipt_immutable before update or delete on public.job_effect_receipts for each row execute function app_private.immutable_event();

-- Do not authorize via metadata. auth.users is accessed only inside this narrow definer.
create function public.complete_profile(p_display_name text, p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; inserted_user uuid; result public.profiles;
begin
  actor := auth.uid();
  if actor is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  perform 1 from auth.users where id=actor and not coalesce(is_anonymous,false)
    and email_confirmed_at is not null and deleted_at is null for share;
  if not found then raise exception 'unauthenticated' using errcode='42501'; end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 80 or p_correlation_id is null then
    raise exception 'invalid_input' using errcode='22023';
  end if;
  insert into public.profiles(user_id,auth_user_id,display_name)
    values(actor,actor,btrim(p_display_name)) on conflict(auth_user_id) do nothing returning user_id into inserted_user;
  select * into strict result from public.profiles where auth_user_id=actor;
  if inserted_user is not null then
    insert into public.audit_events(actor_user_id,action,target_type,target_id,safe_changes,correlation_id,occurred_at)
      values(actor,'profile.created','profile',actor,'{}',p_correlation_id::text,clock_timestamp());
    insert into public.outbox_events(event_type,event_key,schema_version,payload)
      values('profile.created',actor::text,1,jsonb_build_object('userId',actor));
  end if;
  return jsonb_build_object('userId',result.user_id,'displayName',result.display_name,'created',inserted_user is not null);
end $$;

create function public.database_readiness() returns boolean language sql stable set search_path='' as $$ select true $$;

-- Worker passes event identity only; the authoritative outbox determines scope/payload.
create function public.worker_pending_outbox() returns table(id uuid,event_type text,event_key text)
language sql security definer set search_path='' as $$
  select o.id,o.event_type,o.event_key from public.outbox_events o
    where o.state='pending' order by o.created_at,o.id limit 100
$$;
create function public.worker_mark_dispatched(p_id uuid) returns void
language sql security definer set search_path='' as $$
  update public.outbox_events set state='dispatched',dispatched_at=clock_timestamp(),updated_at=clock_timestamp(),row_version=row_version+1
    where id=p_id and state='pending'
$$;

-- Integration probe is real durable consumption, not a customer notification.
create function public.worker_observe_profile(p_outbox_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare event public.outbox_events; affected integer;
begin
  select * into strict event from public.outbox_events where id=p_outbox_id for update;
  if event.event_type<>'profile.created' or event.schema_version<>1 or event.business_id is not null
    or event.payload <> jsonb_build_object('userId',event.event_key::uuid) then
    raise exception 'invalid_event' using errcode='22023';
  end if;
  perform 1 from public.profiles where user_id=event.event_key::uuid;
  if not found then raise exception 'invalid_event' using errcode='22023'; end if;
  insert into public.job_effect_receipts(handler_name,event_key,completed_at,result_reference)
    values('profile.created',event.event_key,clock_timestamp(),event.event_key::uuid) on conflict do nothing;
  get diagnostics affected=row_count;
  return affected=1;
end $$;

create function public.worker_heartbeat() returns void language sql security definer set search_path='' as $$
  insert into public.operational_checks(name,checked_at,status,safe_details)
    values('worker_heartbeat',clock_timestamp(),'ok','{}')
  on conflict(name) do update set checked_at=excluded.checked_at,status=excluded.status,safe_details=excluded.safe_details
$$;

do $$ declare item text; begin
  foreach item in array array['profiles','businesses','branches','business_users','branch_assignments','audit_events','outbox_events','job_effect_receipts','operational_checks'] loop
    execute format('alter table public.%I enable row level security',item);
    execute format('revoke all on public.%I from public, anon, authenticated, loyalty_worker',item);
  end loop;
end $$;
create policy own_profile_select on public.profiles for select to authenticated using (auth_user_id=auth.uid());
grant select on public.profiles to authenticated;

revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker;
revoke all on function public.complete_profile(text,uuid) from public,anon,authenticated;
grant execute on function public.complete_profile(text,uuid) to authenticated;
revoke all on function public.database_readiness() from public;
grant execute on function public.database_readiness() to anon,authenticated;
revoke all on function public.worker_pending_outbox(),public.worker_mark_dispatched(uuid),public.worker_observe_profile(uuid),public.worker_heartbeat()
  from public,anon,authenticated;
grant execute on function public.worker_pending_outbox(),public.worker_mark_dispatched(uuid),public.worker_observe_profile(uuid),public.worker_heartbeat()
  to loyalty_worker;
commit;
