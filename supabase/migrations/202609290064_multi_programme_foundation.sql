begin;

-- Keep the existing programme as the primary card while permitting additional
-- independent programmes for the same cafe.
alter table public.loyalty_programmes add column is_primary boolean not null default true;
alter table public.loyalty_programmes drop constraint loyalty_programmes_business_id_key;
create unique index one_primary_programme_per_business on public.loyalty_programmes(business_id) where is_primary;

alter table public.memberships add column programme_id uuid;
update public.memberships m set programme_id=p.id
  from public.loyalty_programmes p where p.business_id=m.business_id and p.is_primary;
do $$ begin
  if exists(select from public.memberships where programme_id is null) then
    raise exception 'existing_membership_without_programme';
  end if;
end $$;
alter table public.memberships alter column programme_id set not null;
alter table public.memberships add constraint membership_programme_business_fkey
  foreign key(business_id,programme_id) references public.loyalty_programmes(business_id,id);
alter table public.memberships drop constraint memberships_business_id_customer_user_id_key;
alter table public.memberships add constraint one_card_per_customer_programme
  unique(business_id,programme_id,customer_user_id);

create function app_private.default_membership_programme() returns trigger language plpgsql set search_path='' as $$
begin
  if new.programme_id is null then
    select p.id into new.programme_id from public.loyalty_programmes p
      where p.business_id=new.business_id and p.is_primary;
  end if;
  if new.programme_id is null then raise exception 'programme_required' using errcode='23514'; end if;
  return new;
end $$;
create trigger default_membership_programme before insert on public.memberships
  for each row execute function app_private.default_membership_programme();

create function app_private.exact_programme_membership() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_table_name='purchases' or tg_table_name='enrollment_acceptances' then
    if not exists(select from public.memberships m join public.programme_versions v
      on v.business_id=m.business_id and v.programme_id=m.programme_id
      where m.business_id=new.business_id and m.id=new.membership_id and v.id=new.programme_version_id) then
      raise exception 'programme_card_mismatch' using errcode='23514';
    end if;
  else
    if not exists(select from public.memberships m join public.reward_versions v
      on v.business_id=m.business_id and v.id=new.reward_version_id
      join public.rewards r on r.business_id=v.business_id and r.id=v.reward_id and r.programme_id=m.programme_id
      where m.business_id=new.business_id and m.id=new.membership_id) then
      raise exception 'programme_card_mismatch' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger purchase_programme_card before insert or update of membership_id,programme_version_id on public.purchases
  for each row execute function app_private.exact_programme_membership();
create trigger enrollment_programme_card before insert or update of membership_id,programme_version_id on public.enrollment_acceptances
  for each row execute function app_private.exact_programme_membership();
create trigger intent_programme_card before insert or update of membership_id,reward_version_id on public.redemption_intents
  for each row execute function app_private.exact_programme_membership();
create trigger redemption_programme_card before insert or update of membership_id,reward_version_id on public.redemptions
  for each row execute function app_private.exact_programme_membership();

revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
