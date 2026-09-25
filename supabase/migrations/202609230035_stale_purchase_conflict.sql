begin;

-- A stale preview is an application conflict, not a serialization retry signal.
create or replace function public.record_purchase(p_context_hash text,p_input jsonb,p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c app_private.checkout_contexts; effect jsonb; replay jsonb; bal public.balances; inviter_bal public.balances;
 purchase_id uuid; units bigint; bonus integer; inviter_units integer; friend_units integer; result jsonb; key text;
 staff public.business_users; claim public.referral_claims; b public.businesses; local_day date; local_month date;
begin
 perform app_private.strict_keys(p_input,array['recordedBillPaisa','eligibleSpendPaisa','qualifyingPurchaseConfirmed','receiptReference','correctsPurchaseId','expectedEffectHash','idempotencyKey']);
 key:=p_input->>'idempotencyKey';
 select business_id into c.business_id from app_private.checkout_contexts where token_hash=p_context_hash;
 if c.business_id is null then raise exception 'expired' using errcode='P0001'; end if;
 replay:=app_private.value_request(c.business_id,'record_purchase',key,p_input||jsonb_build_object('checkoutContext',p_context_hash));
 if replay is not null then
  perform app_private.authorize(c.business_id,(select branch_id from app_private.checkout_contexts where token_hash=p_context_hash));
  return replay||jsonb_build_object('replayed',true);
 end if;
 effect:=app_private.purchase_effect(p_context_hash,(p_input->>'recordedBillPaisa')::bigint,(p_input->>'eligibleSpendPaisa')::bigint,
  (p_input->>'qualifyingPurchaseConfirmed')::boolean,p_input->>'receiptReference',(p_input->>'correctsPurchaseId')::uuid);
 if effect->>'expectedEffectHash' is distinct from p_input->>'expectedEffectHash' then raise exception 'stale_effect' using errcode='23P01'; end if;
 c:=app_private.checkout(p_context_hash,'earning');
 staff:=app_private.authorize(c.business_id,c.branch_id);
 if staff.role='owner' then perform app_private.actor(true); end if;
 units:=(effect->>'baseUnits')::bigint; bonus:=(effect->>'promotionBonusUnits')::integer;
 friend_units:=(effect->>'referralBonusUnits')::integer; inviter_units:=(effect->>'inviterBonusUnits')::integer;
 select * into b from public.businesses where id=c.business_id;
 local_day:=((effect->>'evaluatedAt')::timestamptz at time zone b.timezone)::date;
 local_month:=date_trunc('month',(effect->>'evaluatedAt')::timestamptz at time zone b.timezone)::date;
 insert into public.purchases(business_id,branch_id,membership_id,programme_version_id,recorded_bill_paisa,eligible_spend_paisa,
 base_units,promotion_bonus_units,promotion_version_id,receipt_reference,qualifying_purchase_confirmed,qualifies_for_loyalty,
 staff_user_id,idempotency_key,request_hash,corrects_purchase_id,occurred_at)
 values(c.business_id,c.branch_id,c.membership_id,(effect->>'programmeVersionId')::uuid,
 (p_input->>'recordedBillPaisa')::bigint,(p_input->>'eligibleSpendPaisa')::bigint,units,bonus,(effect->>'promotionVersionId')::uuid,
 nullif(btrim(p_input->>'receiptReference'),''),(p_input->>'qualifyingPurchaseConfirmed')::boolean,
 (effect->>'qualifiesForLoyalty')::boolean,c.staff_user_id,key,
 app_private.sha256(((p_input||jsonb_build_object('checkoutContext',p_context_hash))-'idempotencyKey')::text),
 (p_input->>'correctsPurchaseId')::uuid,(effect->>'evaluatedAt')::timestamptz) returning id into purchase_id;
 if units>0 then insert into public.ledger_entries(business_id,membership_id,entry_kind,units,purchase_id,actor_user_id,occurred_at)
 values(c.business_id,c.membership_id,'purchase_base',units,purchase_id,c.staff_user_id,(effect->>'evaluatedAt')::timestamptz); end if;
 if bonus>0 then
  insert into public.ledger_entries(business_id,membership_id,entry_kind,units,purchase_id,actor_user_id,occurred_at)
  values(c.business_id,c.membership_id,'promotion_bonus',bonus,purchase_id,c.staff_user_id,(effect->>'evaluatedAt')::timestamptz);
  insert into public.promotion_usage(business_id,promotion_version_id,promotion_id,membership_id,purchase_id,local_date,bonus_units)
  select c.business_id,v.id,v.promotion_id,c.membership_id,purchase_id,local_day,bonus from public.promotion_versions v where v.id=(effect->>'promotionVersionId')::uuid;
 end if;
 if friend_units>0 then
  select * into claim from public.referral_claims where id=(effect->>'referralClaimId')::uuid for update;
  if claim.status<>'pending' then raise exception 'claim_changed' using errcode='40001'; end if;
  update public.referral_claims set status='qualified',qualifying_purchase_id=purchase_id,qualified_at=(effect->>'evaluatedAt')::timestamptz,
   inviter_awarded_units=inviter_units,friend_awarded_units=friend_units,
   inviter_suppression=case effect->>'referralReason' when 'monthly_cap' then 'monthly_cap'
    when 'member_unavailable' then 'member_unavailable' else 'none' end where id=claim.id;
  -- Both balances were locked in UUID order by purchase_effect.
  if inviter_units>0 then
   insert into public.ledger_entries(business_id,membership_id,entry_kind,units,purchase_id,referral_claim_id,actor_user_id,occurred_at)
   values(c.business_id,claim.referrer_membership_id,'referral_bonus',inviter_units,purchase_id,claim.id,c.staff_user_id,(effect->>'evaluatedAt')::timestamptz);
   insert into public.referral_cap_usage(business_id,referrer_membership_id,claim_id,local_month)
   values(c.business_id,claim.referrer_membership_id,claim.id,local_month);
  end if;
  insert into public.ledger_entries(business_id,membership_id,entry_kind,units,purchase_id,referral_claim_id,actor_user_id,occurred_at)
  values(c.business_id,c.membership_id,'referral_bonus',friend_units,purchase_id,claim.id,c.staff_user_id,(effect->>'evaluatedAt')::timestamptz);
 end if;
 if (effect->>'qualifiesForLoyalty')::boolean then
  update public.memberships set last_qualifying_purchase_at=(effect->>'evaluatedAt')::timestamptz,
   updated_at=clock_timestamp(),row_version=row_version+1 where id=c.membership_id;
 end if;
 update app_private.checkout_contexts set consumed_at=clock_timestamp() where id=c.id and consumed_at is null and expires_at>clock_timestamp();
 if not found then raise exception 'expired' using errcode='P0001'; end if;
 select * into bal from public.balances where membership_id=c.membership_id;
 result:=jsonb_build_object('purchaseId',purchase_id,'receiptReference',p_input->>'receiptReference','baseUnits',units::text,
 'promotionBonusUnits',bonus::text,'promotionVersionId',effect->'promotionVersionId','promotionReason',effect->'promotionReason',
 'referralBonusUnits',friend_units::text,'inviterBonusUnits',inviter_units::text,'referralReason',effect->'referralReason',
 'qualifiesForLoyalty',effect->'qualifiesForLoyalty','programmeVersionId',effect->'programmeVersionId',
 'balanceAfterAtCommit',bal.units::text,'ledgerVersion',bal.ledger_version::text,'replayed',false);
 perform app_private.audit(c.business_id,'purchase.committed','purchase',purchase_id,p_correlation_id);
 return app_private.value_finish(c.business_id,'record_purchase',key,result,purchase_id);
end $$;

commit;
