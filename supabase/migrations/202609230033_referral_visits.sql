begin;

create table public.referral_visit_events (
 id uuid primary key default gen_random_uuid(), business_id uuid not null,
 referral_code_id uuid not null, occurred_at timestamptz not null default clock_timestamp(),
 foreign key(business_id,referral_code_id) references public.referral_codes(business_id,id)
);
create index referral_visits_business_time on public.referral_visit_events(business_id,occurred_at desc);
create index referral_visits_code_time on public.referral_visit_events(referral_code_id,occurred_at desc);
alter table public.referral_visit_events enable row level security;
revoke all on public.referral_visit_events from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;

create function public.gateway_record_referral_visit(p_code text) returns boolean
 language plpgsql security definer set search_path='' as $$
declare destination jsonb; matched_code public.referral_codes;
begin
 destination:=public.resolve_referral(p_code);
 if destination is null then return false; end if;
 select * into matched_code from public.referral_codes r where r.code=p_code and r.business_id=(destination->>'businessId')::uuid;
 if matched_code.id is null then return false; end if;
 insert into public.referral_visit_events(business_id,referral_code_id) values(matched_code.business_id,matched_code.id);
 return true;
end $$;
revoke all on function public.gateway_record_referral_visit(text) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.gateway_record_referral_visit(text) to loyalty_web_gateway;

create function public.worker_purge_referral_visits() returns integer
 language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
 delete from public.referral_visit_events where occurred_at<clock_timestamp()-interval '90 days';
 get diagnostics removed=row_count;
 return removed;
end $$;
revoke all on function public.worker_purge_referral_visits() from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.worker_purge_referral_visits() to loyalty_worker;

commit;
