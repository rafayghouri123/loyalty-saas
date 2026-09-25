begin;

create table app_private.loyalty_settings (
 singleton boolean primary key default true check(singleton),
 redemption_intent_ttl_seconds integer not null default 120 check(redemption_intent_ttl_seconds between 30 and 300)
);
insert into app_private.loyalty_settings(singleton) values(true);
revoke all on app_private.loyalty_settings from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;

create or replace function public.create_redemption_intent(p_membership uuid,p_reward_version uuid,p_token_hash text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.memberships; reward public.reward_versions; balance_units bigint; new_id uuid; expiry timestamptz; limited jsonb; ttl_seconds integer;
begin
 perform app_private.actor();
 limited:=app_private.limit_action('redemption_intent',null,12); if limited is not null then return limited; end if;
 begin
 select * into m from public.memberships where id=p_membership and customer_user_id=app_private.actor() and status='active' for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 perform 1 from public.businesses where id=m.business_id and status<>'archived' for share;
 if not found then raise exception 'participation_unavailable' using errcode='42501'; end if;
 select rv.* into reward from public.reward_versions rv join public.rewards r on r.id=rv.reward_id and r.business_id=rv.business_id
 where rv.business_id=m.business_id and rv.id=p_reward_version and r.status='published' and r.published_version_id=rv.id;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 if not exists(select from public.reward_branches rb join public.branches b on b.business_id=rb.business_id and b.id=rb.branch_id
 where rb.business_id=m.business_id and rb.reward_version_id=reward.id and b.status='active') then raise exception 'not_found' using errcode='P0002'; end if;
 select units into balance_units from public.balances where business_id=m.business_id and membership_id=m.id for update;
 if balance_units<reward.unit_cost then raise exception 'insufficient_balance' using errcode='P0003'; end if;
 if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_input' using errcode='22023'; end if;
 update public.redemption_intents set canceled_at=clock_timestamp() where business_id=m.business_id and membership_id=m.id
 and reward_version_id=reward.id and consumed_at is null and canceled_at is null and expires_at>clock_timestamp();
 select redemption_intent_ttl_seconds into ttl_seconds from app_private.loyalty_settings where singleton=true;
 expiry:=clock_timestamp()+make_interval(secs=>ttl_seconds);
 insert into public.redemption_intents(business_id,membership_id,reward_version_id,token_hash,expires_at,created_by)
 values(m.business_id,m.id,reward.id,p_token_hash,expiry,app_private.actor()) returning id into new_id;
 perform app_private.audit(m.business_id,'redemption.intent_created','redemption_intent',new_id,p_correlation_id);
 return jsonb_build_object('intentId',new_id,'expiresAt',expiry,'unitCost',reward.unit_cost::text,'rewardTitle',reward.title);
 exception when others then
  return jsonb_build_object('error',jsonb_build_object('code',case SQLSTATE when 'P0002' then 'not_found' when 'P0003' then 'insufficient_balance'
   when '22023' then 'invalid_input' when '23505' then 'conflict' when '42501' then 'forbidden' else 'temporary_failure' end));
 end;
end $$;

create function public.customer_intent_status(p_intent uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare intent public.redemption_intents; redemption public.redemptions; balance_units bigint; state text; branch_name text;
begin
 perform app_private.actor();
 select i.* into intent from public.redemption_intents i join public.memberships m on m.business_id=i.business_id and m.id=i.membership_id
 where i.id=p_intent and m.customer_user_id=app_private.actor();
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 select * into redemption from public.redemptions where business_id=intent.business_id and intent_id=intent.id;
 select units into balance_units from public.balances where business_id=intent.business_id and membership_id=intent.membership_id;
 if redemption.id is not null then
  state:=redemption.status;
  select name into branch_name from public.branches where business_id=intent.business_id and id=redemption.branch_id;
 elsif intent.canceled_at is not null then state:='canceled';
 elsif intent.expires_at<=clock_timestamp() or intent.consumed_at is not null then state:='expired';
 else state:='active'; end if;
 return jsonb_build_object('intentId',intent.id,'status',state,'expiresAt',intent.expires_at,
 'fulfilledAt',redemption.fulfilled_at,'branchName',branch_name,'unitCost',coalesce(redemption.unit_cost,
 (select unit_cost from public.reward_versions where business_id=intent.business_id and id=intent.reward_version_id))::text,
 'balance',balance_units::text);
end $$;
revoke all on function public.customer_intent_status(uuid) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.customer_intent_status(uuid) to authenticated;

commit;
