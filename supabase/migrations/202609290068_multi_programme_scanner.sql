begin;

create function public.staff_programmes(p_business uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.authorize(p_business);
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'type',p.type,'status',p.status)
    order by p.is_primary desc,p.created_at,p.id)
    from public.loyalty_programmes p where p.business_id=p_business and p.status in ('published','paused')),'[]'::jsonb);
end $$;

CREATE OR REPLACE FUNCTION public.resolve_scanner_for_programme(p_business uuid, p_branch uuid, p_kind text, p_raw text, p_context_hash text, p_programme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare staff public.business_users;m public.memberships;redemption public.redemption_intents;
 offer_intent public.offer_claim_intents;claim public.offer_claims;benefit public.offers;
 code public.scanner_codes;expiry timestamptz;limited jsonb;context_id uuid;
begin
 staff:=app_private.authorize(p_business,p_branch);
 if staff.role='owner' then perform app_private.actor(true); end if;
 limited:=app_private.limit_action('scanner_lookup',p_business,30);if limited is not null then return limited;end if;
 begin
 if p_context_hash !~ '^[a-f0-9]{64}$' or char_length(p_raw)>512 then raise exception 'invalid_input' using errcode='22023'; end if;
 if p_kind='earningHandle' and p_raw ~ '^LOYALTY:EARN:v1:[A-Za-z0-9_-]{43}$' then
  select member_row.* into m from public.membership_handles h join public.memberships member_row
   on member_row.business_id=h.business_id and member_row.id=h.membership_id
   where h.business_id=p_business and h.handle_hash=app_private.sha256(p_raw) and h.status='active' and member_row.status='active';
 elsif p_kind='redemptionIntent' and p_raw ~ '^LOYALTY:REDEEM:v1:[A-Za-z0-9_-]{43}$' then
  select * into redemption from public.redemption_intents where business_id=p_business and token_hash=app_private.sha256(p_raw) for update;
  if redemption.id is not null and (redemption.consumed_at is not null or redemption.canceled_at is not null
   or redemption.expires_at<=clock_timestamp()) then raise exception 'expired' using errcode='P0001'; end if;
  if redemption.id is not null then select * into m from public.memberships where business_id=p_business
   and id=redemption.membership_id and status='active'; end if;
 elsif p_kind='offerIntent' and p_raw ~ '^LOYALTY:OFFER:v1:[A-Za-z0-9_-]{43}$' then
  select * into offer_intent from public.offer_claim_intents where business_id=p_business
   and token_hash=app_private.sha256(p_raw) for update;
  if offer_intent.id is not null and (offer_intent.consumed_at is not null or offer_intent.canceled_at is not null
   or offer_intent.expires_at<=clock_timestamp()) then raise exception 'expired' using errcode='P0001'; end if;
  if offer_intent.id is not null then select * into m from public.memberships where business_id=p_business
   and id=offer_intent.membership_id and status='active'; end if;
 elsif p_kind='typedCode' and p_raw ~ '^[A-HJ-NP-Z2-9]{8}$' then
  select * into code from public.scanner_codes where business_id=p_business and code_hash=app_private.sha256(p_raw) for update;
  if code.id is not null and (code.consumed_at is not null or code.expires_at<=clock_timestamp()) then raise exception 'expired' using errcode='P0001'; end if;
  if code.id is not null then
   if code.purpose='redemption_lookup' then
    select * into redemption from public.redemption_intents where business_id=p_business and id=code.redemption_intent_id
     and consumed_at is null and canceled_at is null and expires_at>clock_timestamp();
    if redemption.id is null then raise exception 'expired' using errcode='P0001'; end if;
   elsif code.purpose='offer_lookup' then
    select * into offer_intent from public.offer_claim_intents where business_id=p_business and id=code.offer_claim_intent_id
     and consumed_at is null and canceled_at is null and expires_at>clock_timestamp();
    if offer_intent.id is null then raise exception 'expired' using errcode='P0001'; end if;
   end if;
   select * into m from public.memberships where business_id=p_business and id=code.membership_id and status='active';
   update public.scanner_codes set consumed_at=clock_timestamp() where id=code.id;
  end if;
 else raise exception 'invalid_input' using errcode='22023'; end if;
 if m.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 if m.programme_id<>p_programme then raise exception 'programme_card_mismatch' using errcode='23514'; end if;
 if offer_intent.id is not null then
  select * into claim from public.offer_claims where business_id=p_business and id=offer_intent.offer_claim_id
   and membership_id=m.id and status='claimed';
  if claim.id is null then raise exception 'expired' using errcode='P0001'; end if;
  select * into benefit from public.offers where id=claim.offer_id and business_id=p_business
   and kind<>'informational' and status in ('published','paused') and starts_at<=clock_timestamp()
   and expires_at>clock_timestamp();
  if benefit.id is null or not exists(select from public.offer_branches where offer_id=benefit.id and branch_id=p_branch)
  then raise exception 'not_found' using errcode='P0002'; end if;
 end if;
 expiry:=least(clock_timestamp()+interval '5 minutes',coalesce(redemption.expires_at,'infinity'::timestamptz),
  coalesce(offer_intent.expires_at,'infinity'::timestamptz));
 insert into app_private.checkout_contexts(business_id,branch_id,membership_id,staff_user_id,session_id,token_hash,
  kind,redemption_intent_id,offer_claim_intent_id,expires_at)
 values(p_business,p_branch,m.id,staff.user_id,(auth.jwt()->>'session_id')::uuid,p_context_hash,
  case when redemption.id is null then 'earning' else 'redemption' end,redemption.id,offer_intent.id,expiry) returning id into context_id;
 return jsonb_build_object('contextId',context_id,'kind',case when redemption.id is not null then 'redemption'
  when offer_intent.id is not null then 'offer' else 'earning' end,
  'memberName',m.display_name,'businessId',p_business,'branchId',p_branch,
  'programmeId',m.programme_id,'programmeName',(select name from public.loyalty_programmes where id=m.programme_id),
  'programmeType',(select type from public.loyalty_programmes where id=m.programme_id),
  'balance',(select units::text from public.balances where membership_id=m.id),
  'rewardTitle',case when redemption.id is not null then (select title from public.reward_versions where id=redemption.reward_version_id) end,
  'rewardUnitCost',case when redemption.id is not null then (select unit_cost::text from public.reward_versions where id=redemption.reward_version_id) end,
  'offerTitle',benefit.title,'offerKind',benefit.kind,'offerMinimumSpendPaisa',benefit.minimum_spend_paisa::text,
  'expiresAt',expiry);
 exception when others then
  return jsonb_build_object('error',jsonb_build_object('code',case SQLSTATE when 'P0002' then 'not_found' when 'P0001' then 'expired'
   when '22023' then 'invalid_input' when '23514' then 'conflict' when '23505' then 'conflict' else 'temporary_failure' end));
 end;
end $function$
;

revoke all on function public.staff_programmes(uuid),public.resolve_scanner_for_programme(uuid,uuid,text,text,text,uuid) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.staff_programmes(uuid),public.resolve_scanner_for_programme(uuid,uuid,text,text,text,uuid) to authenticated;
commit;
