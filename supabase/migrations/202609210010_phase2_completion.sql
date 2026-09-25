begin;
alter table public.businesses add column timezone_locked_at timestamptz;
create function app_private.business_timezone_lock() returns trigger language plpgsql set search_path='' as $$
begin
 if old.timezone_locked_at is not null and (new.timezone<>old.timezone or new.timezone_locked_at is distinct from old.timezone_locked_at) then
 raise exception 'timezone_locked' using errcode='23514'; end if;
 return new;
end $$;
create trigger business_timezone_lock before update on public.businesses for each row execute function app_private.business_timezone_lock();
-- Subsequent financial/scheduling migrations attach this BEFORE INSERT trigger
-- to their source tables, in the same transaction that introduces those tables.
create function app_private.lock_business_timezone() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.businesses set timezone_locked_at=coalesce(timezone_locked_at,clock_timestamp()) where id=new.business_id;
 return new;
end $$;

create table app_private.business_provision_grants (
 id uuid primary key default extensions.gen_random_uuid(),
 owner_id uuid not null references public.profiles(user_id),
 granted_by uuid not null references public.profiles(user_id),
 reason text not null check(char_length(btrim(reason)) between 10 and 500),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 consumed_at timestamptz,
 check(expires_at>created_at),check(consumed_at is null or consumed_at>=created_at)
);
create index business_provision_owner on app_private.business_provision_grants(owner_id) where consumed_at is null;
revoke all on app_private.business_provision_grants from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
create function public.operator_authorize_business(p_owner_id uuid,p_reason text,p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; grant_id uuid;
begin
 actor:=app_private.admin(true);
 perform 1 from public.profiles p join auth.users u on u.id=p.auth_user_id where p.user_id=p_owner_id and p.anonymized_at is null
 and u.deleted_at is null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false);
 if not found then raise exception 'invalid_owner' using errcode='22023'; end if;
 insert into app_private.business_provision_grants(owner_id,granted_by,reason) values(p_owner_id,actor,btrim(p_reason)) returning id into grant_id;
 insert into public.audit_events(actor_user_id,action,target_type,target_id,reason,safe_changes,correlation_id,occurred_at)
 values(actor,'business.provision_authorized','profile',p_owner_id,btrim(p_reason),jsonb_build_object('grantId',grant_id),p_correlation_id::text,clock_timestamp());
 return jsonb_build_object('grantId',grant_id);
end $$;
revoke all on function public.operator_authorize_business(uuid,text,uuid) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.operator_authorize_business(uuid,text,uuid) to authenticated;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
