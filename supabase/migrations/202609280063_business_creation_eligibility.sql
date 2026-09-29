begin;

-- Match the existing bootstrap guard without exposing private support grants.
create function public.can_bootstrap_business() returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 actor:=app_private.actor();
 return not exists(select from public.businesses b where b.created_by=actor)
   or exists(select from app_private.business_provision_grants g
     where g.owner_id=actor and g.consumed_at is null and g.expires_at>clock_timestamp());
end $$;

revoke all on function public.can_bootstrap_business() from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.can_bootstrap_business() to authenticated;

commit;
