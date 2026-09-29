begin;

-- A type lock belongs to the card's programme, not every programme at the cafe.
create or replace function app_private.programme_mode() returns trigger
language plpgsql set search_path='' as $$
declare current_mode text;
begin
  select type into current_mode from public.loyalty_programmes
    where business_id=new.business_id and id=new.programme_id;
  if current_mode is null or ((current_mode='stamps')<>(new.stamps_per_purchase is not null)
    and (new.status<>'draft' or exists(select from public.ledger_entries e
      join public.memberships m on m.id=e.membership_id and m.business_id=e.business_id
      where e.business_id=new.business_id and m.programme_id=new.programme_id))) then
    raise exception 'programme_mode' using errcode='23514';
  end if;
  return new;
end $$;

revoke all on function app_private.programme_mode() from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
