begin;
do $$ declare constraint_name text; begin
 select conname into constraint_name from pg_constraint where conrelid='public.purchases'::regclass and contype='c'
  and pg_get_constraintdef(oid) like '%offer_eligible_before_discount_paisa%';
 if constraint_name is null then raise exception 'purchase_offer_constraint_missing'; end if;
 execute format('alter table public.purchases drop constraint %I',constraint_name);
end $$;
alter table public.purchases add constraint purchase_offer_effect_shape check(
 (primary_offer_claim_id is null and offer_eligible_before_discount_paisa is null and applied_discount_paisa is null)
 or (primary_offer_claim_id is not null and applied_discount_paisa is not null and applied_discount_paisa>=0));

create function app_private.purchase_effect_with_offer(p_context_hash text,p_bill bigint,p_eligible bigint,p_confirmed boolean,
 p_receipt text,p_corrects uuid,p_before bigint) returns jsonb language plpgsql set search_path='' as $$
declare effect jsonb;c app_private.checkout_contexts;i public.offer_claim_intents;claim public.offer_claims;
 benefit public.offers;discount bigint:=0;hash text;
begin
 effect:=app_private.purchase_effect(p_context_hash,p_bill,p_eligible,p_confirmed,p_receipt,p_corrects);
 select * into c from app_private.checkout_contexts where token_hash=p_context_hash;
 if c.offer_claim_intent_id is null then
  if p_before is not null then raise exception 'invalid_input' using errcode='22023'; end if;
  return effect;
 end if;
 select * into i from public.offer_claim_intents where id=c.offer_claim_intent_id for update;
 select * into claim from public.offer_claims where id=i.offer_claim_id for update;
 select * into benefit from public.offers where id=claim.offer_id for share;
 if i.id is null or claim.id is null or benefit.id is null or i.consumed_at is not null or i.canceled_at is not null or i.expires_at<=clock_timestamp()
  or claim.status<>'claimed' or claim.membership_id<>c.membership_id or claim.business_id<>c.business_id
  or benefit.business_id<>c.business_id or benefit.kind='informational' or benefit.status not in ('published','paused')
  or benefit.starts_at>clock_timestamp() or benefit.expires_at<=clock_timestamp()
  or not exists(select from public.offer_branches where offer_id=benefit.id and branch_id=c.branch_id)
 then raise exception 'offer_unavailable' using errcode='P0001'; end if;
 if benefit.kind='discount' then
  if p_before is null or p_before<benefit.minimum_spend_paisa or p_before>100000000 then
   raise exception 'invalid_offer_spend' using errcode='22023'; end if;
  discount:=floor(p_before::numeric*benefit.discount_percent/100)::bigint;
  if benefit.max_discount_paisa is not null then discount:=least(discount,benefit.max_discount_paisa); end if;
  if p_eligible<>p_before-discount then raise exception 'discount_mismatch' using errcode='22023'; end if;
 else
  if p_before is not null or p_eligible<benefit.minimum_spend_paisa then raise exception 'invalid_offer_spend' using errcode='22023'; end if;
 end if;
 hash:=app_private.sha256(concat_ws(':',effect->>'expectedEffectHash',claim.id,i.id,benefit.row_version,
  coalesce(p_before::text,''),discount));
 return effect||jsonb_build_object('offerClaimId',claim.id,'offerTitle',benefit.title,'offerKind',benefit.kind,
  'offerEligibleBeforeDiscountPaisa',p_before::text,'appliedDiscountPaisa',discount::text,
  'offerBenefitDescription',case when benefit.kind='treat' then benefit.description end,'expectedEffectHash',hash);
end $$;

create or replace function public.preview_purchase(p_context_hash text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.strict_keys(p_input,array['recordedBillPaisa','eligibleSpendPaisa','qualifyingPurchaseConfirmed',
  'receiptReference','correctsPurchaseId','offerEligibleBeforeDiscountPaisa']);
 return app_private.purchase_effect_with_offer(p_context_hash,(p_input->>'recordedBillPaisa')::bigint,
  (p_input->>'eligibleSpendPaisa')::bigint,(p_input->>'qualifyingPurchaseConfirmed')::boolean,
  p_input->>'receiptReference',(p_input->>'correctsPurchaseId')::uuid,
  (p_input->>'offerEligibleBeforeDiscountPaisa')::bigint);
end $$;

create or replace function public.record_purchase(p_context_hash text,p_input jsonb,p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c app_private.checkout_contexts;effect jsonb;replay jsonb;bal public.balances;
 v_purchase_id uuid;units bigint;bonus integer;inviter_units integer;friend_units integer;result jsonb;key text;
 staff public.business_users;claim public.referral_claims;offer_claim public.offer_claims;b public.businesses;
 local_day date;local_month date;
begin
 perform app_private.strict_keys(p_input,array['recordedBillPaisa','eligibleSpendPaisa','qualifyingPurchaseConfirmed',
  'receiptReference','correctsPurchaseId','expectedEffectHash','idempotencyKey','offerEligibleBeforeDiscountPaisa']);
 key:=p_input->>'idempotencyKey';
 select business_id into c.business_id from app_private.checkout_contexts where token_hash=p_context_hash;
 if c.business_id is null then raise exception 'expired' using errcode='P0001'; end if;
 replay:=app_private.value_request(c.business_id,'record_purchase',key,p_input||jsonb_build_object('checkoutContext',p_context_hash));
 if replay is not null then
  perform app_private.authorize(c.business_id,(select branch_id from app_private.checkout_contexts where token_hash=p_context_hash));
  return replay||jsonb_build_object('replayed',true);
 end if;
 effect:=app_private.purchase_effect_with_offer(p_context_hash,(p_input->>'recordedBillPaisa')::bigint,
  (p_input->>'eligibleSpendPaisa')::bigint,(p_input->>'qualifyingPurchaseConfirmed')::boolean,
  p_input->>'receiptReference',(p_input->>'correctsPurchaseId')::uuid,
  (p_input->>'offerEligibleBeforeDiscountPaisa')::bigint);
 if effect->>'expectedEffectHash' is distinct from p_input->>'expectedEffectHash' then
  raise exception 'stale_effect' using errcode='23P01'; end if;
 c:=app_private.checkout(p_context_hash,'earning');
 staff:=app_private.authorize(c.business_id,c.branch_id);
 if staff.role='owner' then perform app_private.actor(true); end if;
 units:=(effect->>'baseUnits')::bigint;bonus:=(effect->>'promotionBonusUnits')::integer;
 friend_units:=(effect->>'referralBonusUnits')::integer;inviter_units:=(effect->>'inviterBonusUnits')::integer;
 select * into b from public.businesses where id=c.business_id;
 local_day:=((effect->>'evaluatedAt')::timestamptz at time zone b.timezone)::date;
 local_month:=date_trunc('month',(effect->>'evaluatedAt')::timestamptz at time zone b.timezone)::date;
 insert into public.purchases(business_id,branch_id,membership_id,programme_version_id,recorded_bill_paisa,eligible_spend_paisa,
  base_units,promotion_bonus_units,promotion_version_id,receipt_reference,qualifying_purchase_confirmed,qualifies_for_loyalty,
  staff_user_id,idempotency_key,request_hash,corrects_purchase_id,occurred_at,
  offer_eligible_before_discount_paisa,applied_discount_paisa,primary_offer_claim_id)
 values(c.business_id,c.branch_id,c.membership_id,(effect->>'programmeVersionId')::uuid,
  (p_input->>'recordedBillPaisa')::bigint,(p_input->>'eligibleSpendPaisa')::bigint,units,bonus,
  (effect->>'promotionVersionId')::uuid,nullif(btrim(p_input->>'receiptReference'),''),
  (p_input->>'qualifyingPurchaseConfirmed')::boolean,(effect->>'qualifiesForLoyalty')::boolean,c.staff_user_id,key,
  app_private.sha256(((p_input||jsonb_build_object('checkoutContext',p_context_hash))-'idempotencyKey')::text),
  (p_input->>'correctsPurchaseId')::uuid,(effect->>'evaluatedAt')::timestamptz,
  (effect->>'offerEligibleBeforeDiscountPaisa')::bigint,
  case when effect->>'offerClaimId' is not null then (effect->>'appliedDiscountPaisa')::bigint end,
  (effect->>'offerClaimId')::uuid) returning id into v_purchase_id;
 if units>0 then insert into public.ledger_entries(business_id,membership_id,entry_kind,units,purchase_id,actor_user_id,occurred_at)
  values(c.business_id,c.membership_id,'purchase_base',units,v_purchase_id,c.staff_user_id,(effect->>'evaluatedAt')::timestamptz);end if;
 if bonus>0 then
  insert into public.ledger_entries(business_id,membership_id,entry_kind,units,purchase_id,actor_user_id,occurred_at)
   values(c.business_id,c.membership_id,'promotion_bonus',bonus,v_purchase_id,c.staff_user_id,(effect->>'evaluatedAt')::timestamptz);
  insert into public.promotion_usage(business_id,promotion_version_id,promotion_id,membership_id,purchase_id,local_date,bonus_units)
   select c.business_id,v.id,v.promotion_id,c.membership_id,v_purchase_id,local_day,bonus
   from public.promotion_versions v where v.id=(effect->>'promotionVersionId')::uuid;
 end if;
 if friend_units>0 then
  select * into claim from public.referral_claims where id=(effect->>'referralClaimId')::uuid for update;
  if claim.status<>'pending' then raise exception 'claim_changed' using errcode='40001'; end if;
  update public.referral_claims set status='qualified',qualifying_purchase_id=v_purchase_id,
   qualified_at=(effect->>'evaluatedAt')::timestamptz,inviter_awarded_units=inviter_units,friend_awarded_units=friend_units,
   inviter_suppression=case effect->>'referralReason' when 'monthly_cap' then 'monthly_cap'
    when 'member_unavailable' then 'member_unavailable' else 'none' end where id=claim.id;
  if inviter_units>0 then
   insert into public.ledger_entries(business_id,membership_id,entry_kind,units,purchase_id,referral_claim_id,actor_user_id,occurred_at)
    values(c.business_id,claim.referrer_membership_id,'referral_bonus',inviter_units,v_purchase_id,claim.id,c.staff_user_id,(effect->>'evaluatedAt')::timestamptz);
   insert into public.referral_cap_usage(business_id,referrer_membership_id,claim_id,local_month)
    values(c.business_id,claim.referrer_membership_id,claim.id,local_month);
  end if;
  insert into public.ledger_entries(business_id,membership_id,entry_kind,units,purchase_id,referral_claim_id,actor_user_id,occurred_at)
   values(c.business_id,c.membership_id,'referral_bonus',friend_units,v_purchase_id,claim.id,c.staff_user_id,(effect->>'evaluatedAt')::timestamptz);
 end if;
 if effect->>'offerClaimId' is not null then
  select * into offer_claim from public.offer_claims where id=(effect->>'offerClaimId')::uuid for update;
  if offer_claim.status<>'claimed' or offer_claim.membership_id<>c.membership_id then
   raise exception 'offer_changed' using errcode='23P01'; end if;
  update public.offer_claims set status='fulfilled',fulfilled_at=(effect->>'evaluatedAt')::timestamptz,
   fulfilled_by=c.staff_user_id,branch_id=c.branch_id,purchase_id=v_purchase_id,
   applied_discount_paisa=(effect->>'appliedDiscountPaisa')::bigint,
   benefit_description=coalesce(effect->>'offerBenefitDescription',benefit_description)
   where id=offer_claim.id;
  update public.offer_claim_intents set consumed_at=clock_timestamp() where id=c.offer_claim_intent_id
   and consumed_at is null and canceled_at is null and expires_at>clock_timestamp();
  if not found then raise exception 'expired' using errcode='P0001'; end if;
 end if;
 if (effect->>'qualifiesForLoyalty')::boolean then
  update public.memberships set last_qualifying_purchase_at=(effect->>'evaluatedAt')::timestamptz,
   updated_at=clock_timestamp(),row_version=row_version+1 where id=c.membership_id;
 end if;
 update app_private.checkout_contexts set consumed_at=clock_timestamp() where id=c.id and consumed_at is null and expires_at>clock_timestamp();
 if not found then raise exception 'expired' using errcode='P0001'; end if;
 select * into bal from public.balances where membership_id=c.membership_id;
 result:=jsonb_build_object('purchaseId',v_purchase_id,'receiptReference',p_input->>'receiptReference','baseUnits',units::text,
  'promotionBonusUnits',bonus::text,'promotionVersionId',effect->'promotionVersionId','promotionReason',effect->'promotionReason',
  'referralBonusUnits',friend_units::text,'inviterBonusUnits',inviter_units::text,'referralReason',effect->'referralReason',
  'qualifiesForLoyalty',effect->'qualifiesForLoyalty','programmeVersionId',effect->'programmeVersionId',
  'offerClaimId',effect->'offerClaimId','appliedDiscountPaisa',effect->'appliedDiscountPaisa',
  'balanceAfterAtCommit',bal.units::text,'ledgerVersion',bal.ledger_version::text,'replayed',false);
 perform app_private.audit(c.business_id,'purchase.committed','purchase',v_purchase_id,p_correlation_id);
 return app_private.value_finish(c.business_id,'record_purchase',key,result,v_purchase_id);
end $$;

commit;
