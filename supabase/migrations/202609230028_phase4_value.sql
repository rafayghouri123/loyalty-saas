begin;

create function app_private.promotion_window(p_starts_on date,p_ends_on date,p_weekdays integer[],
 p_starts_at time,p_ends_at time,p_timezone text,p_at timestamptz) returns boolean
 language sql stable set search_path='' as $$
 select (p_at at time zone p_timezone)::date between p_starts_on and p_ends_on
  and extract(isodow from p_at at time zone p_timezone)::integer=any(p_weekdays)
  and (p_at at time zone p_timezone)::time>=p_starts_at
  and (p_at at time zone p_timezone)::time<p_ends_at
$$;

-- Value lock order: idempotency reservation; business/permissions; affected membership
-- rows ordered by UUID; balance rows ordered by UUID; claim/context/source/usage.
create or replace function app_private.purchase_effect(p_context_hash text,p_bill bigint,p_eligible bigint,p_confirmed boolean,p_receipt text,p_corrects uuid)
returns jsonb language plpgsql set search_path='' as $$
declare c app_private.checkout_contexts; b public.businesses; prog public.loyalty_programmes; v public.programme_versions;
 bal public.balances; inviter_balance public.balances; calc jsonb; base_units bigint; bonus bigint:=0;
 at_time timestamptz; v_local_date date; promo public.promotion_versions; promo_id uuid;
 promo_count integer:=0; promo_used bigint:=0; promo_reason text:='no_matching_slot';
 claim public.referral_claims; rule public.referral_rule_versions; referrer public.memberships;
 inviter_units integer:=0; friend_units integer:=0; referral_reason text:='no_claim'; inviter_month date; inviter_used bigint:=0;
 locked_id uuid; effect_hash text;
begin
 if p_bill is null or p_eligible is null or p_bill<0 or p_bill>100000000 or p_eligible<0 or p_eligible>p_bill
 or char_length(coalesce(p_receipt,''))>80 then raise exception 'invalid_input' using errcode='22023'; end if;
 c:=app_private.checkout(p_context_hash,'earning');
 perform app_private.authorize(c.business_id,c.branch_id);
 select * into b from public.businesses where id=c.business_id for share;
 select * into prog from public.loyalty_programmes where business_id=c.business_id for share;
 if b.status<>'active' or prog.status<>'published' or not app_private.entitled(c.business_id) then raise exception 'participation_unavailable' using errcode='42501'; end if;
 select * into claim from public.referral_claims where business_id=c.business_id and referred_membership_id=c.membership_id;
 -- Lock both possible value recipients before a claim or balance lock. A changed claim
 -- relationship is rejected and retried by the caller rather than widening this lock set.
 for locked_id in select id from public.memberships where business_id=c.business_id
  and id in (c.membership_id,claim.referrer_membership_id) order by id loop
  perform 1 from public.memberships where business_id=c.business_id and id=locked_id for update;
 end loop;
 if not exists(select from public.memberships where business_id=c.business_id and id=c.membership_id and status='active') then
 raise exception 'member_unavailable' using errcode='42501'; end if;
 for locked_id in select membership_id from public.balances where business_id=c.business_id
  and membership_id in (c.membership_id,claim.referrer_membership_id) order by membership_id loop
  perform 1 from public.balances where business_id=c.business_id and membership_id=locked_id for update;
 end loop;
 select * into bal from public.balances where business_id=c.business_id and membership_id=c.membership_id;
 if bal.membership_id is null then raise exception 'balance_missing' using errcode='P0002'; end if;
 if claim.id is not null then
  select * into claim from public.referral_claims where id=claim.id for update;
  if claim.referred_membership_id<>c.membership_id or claim.business_id<>c.business_id then raise exception 'claim_changed' using errcode='40001'; end if;
  select * into inviter_balance from public.balances where business_id=c.business_id and membership_id=claim.referrer_membership_id;
  select * into referrer from public.memberships where id=claim.referrer_membership_id;
  select * into rule from public.referral_rule_versions where id=claim.rule_version_id;
 end if;
 if p_corrects is not null and not exists(select from public.purchases where business_id=c.business_id and id=p_corrects and membership_id=c.membership_id
  and branch_id=c.branch_id and status='reversed' and not exists(select from public.purchases x where x.business_id=c.business_id
  and x.corrects_purchase_id=p_corrects and x.status='committed')) then raise exception 'invalid_correction' using errcode='23514'; end if;
 -- This is the one clock capture after all affected value locks.
 at_time:=clock_timestamp();
 select * into v from public.programme_versions where business_id=c.business_id and programme_id=prog.id
  and status='published' and effective_at<=at_time order by effective_at desc,id desc limit 1;
 if v.id is null then raise exception 'rules_unavailable' using errcode='P0002'; end if;
 calc:=app_private.calculate_base_earning(prog.type,v.minimum_spend_paisa,v.stamps_per_purchase,v.spend_step_paisa,v.units_per_step,
  v.max_base_units_per_purchase,p_bill,p_eligible,p_confirmed);
 base_units:=(calc->>'baseUnits')::bigint;
 v_local_date:=(at_time at time zone b.timezone)::date;
 if (calc->>'qualifiesForLoyalty')::boolean and base_units>0 then
  select count(*),(array_agg(s.id))[1],coalesce(sum(least(base_units,s.max_bonus_units_per_purchase)),0)
   into promo_count,promo_id,promo_used
  from (select pv.* from public.earning_promotions ep join public.promotion_versions pv
   on pv.business_id=ep.business_id and pv.promotion_id=ep.id and pv.status='published'
   where ep.business_id=c.business_id and ep.status='enabled' and pv.effective_at<=at_time
   and pv.id=(select pv2.id from public.promotion_versions pv2 where pv2.business_id=ep.business_id
    and pv2.promotion_id=ep.id and pv2.status='published' and pv2.effective_at<=at_time
    order by pv2.effective_at desc,pv2.id desc limit 1)
   and app_private.promotion_window(pv.starts_on,pv.ends_on,pv.weekdays,pv.starts_at,pv.ends_at,pv.timezone,at_time)
   and p_eligible>=pv.minimum_spend_paisa
   and exists(select from public.promotion_branches pb where pb.business_id=c.business_id and pb.promotion_version_id=pv.id and pb.branch_id=c.branch_id)) s;
  if promo_count>1 then raise exception 'promotion_overlap' using errcode='40001'; end if;
  if promo_count=1 then
   select * into promo from public.promotion_versions where id=promo_id;
   if promo.member_daily_cap is not null and (select count(*) from public.promotion_usage u where u.business_id=c.business_id
    and u.promotion_id=promo.promotion_id and u.membership_id=c.membership_id and u.local_date=v_local_date and u.reversed_at is null)>=promo.member_daily_cap then
    promo_reason:='daily_cap'; promo_id:=null;
   else bonus:=promo_used; promo_reason:=case when bonus<base_units then 'bonus_capped' else 'applied' end; end if;
  end if;
 end if;
 if claim.id is not null then
  if claim.status='pending' and claim.qualifies_until<=at_time then referral_reason:='expired';
  elsif claim.status<>'pending' then referral_reason:=claim.status;
  elsif (calc->>'qualifiesForLoyalty')::boolean and p_eligible>=rule.minimum_spend_paisa and at_time>=claim.enrolled_at then
   friend_units:=rule.friend_bonus_units; referral_reason:='applied';
   inviter_month:=date_trunc('month',at_time at time zone b.timezone)::date;
   if referrer.status<>'active' then referral_reason:='inviter_unavailable';
   elsif (select count(*) from public.referral_cap_usage u where u.business_id=c.business_id
    and u.referrer_membership_id=claim.referrer_membership_id and u.local_month=inviter_month and u.reversed_at is null)>=rule.monthly_inviter_cap then
    referral_reason:='monthly_cap';
   else inviter_units:=rule.inviter_bonus_units; end if;
  else referral_reason:='below_qualification_threshold'; end if;
 end if;
 effect_hash:=app_private.sha256(concat_ws(':',c.id,v.id,p_bill,p_eligible,p_confirmed,coalesce(p_receipt,''),coalesce(p_corrects::text,''),
  bal.ledger_version,base_units,coalesce(promo_id::text,''),bonus,promo_reason,coalesce(claim.id::text,''),
  coalesce(rule.id::text,''),friend_units,inviter_units,referral_reason,coalesce(inviter_balance.ledger_version::text,'')));
 return jsonb_build_object('businessId',c.business_id,'branchId',c.branch_id,'membershipId',c.membership_id,'programmeVersionId',v.id,
 'programmeType',prog.type,'recordedBillPaisa',p_bill::text,'eligibleSpendPaisa',p_eligible::text,'baseUnits',base_units::text,
 'promotionBonusUnits',bonus::text,'promotionVersionId',promo_id,'promotionReason',promo_reason,
 'referralBonusUnits',friend_units::text,'inviterBonusUnits',inviter_units::text,'referralClaimId',case when friend_units>0 then claim.id else null end,
 'referralReason',referral_reason,'qualifiesForLoyalty',calc->'qualifiesForLoyalty','capReduced',calc->'capReduced',
 'balance',bal.units::text,'ledgerVersion',bal.ledger_version::text,'evaluatedAt',at_time,
 'expectedEffectHash',effect_hash);
end $$;

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
 if effect->>'expectedEffectHash' is distinct from p_input->>'expectedEffectHash' then raise exception 'stale_effect' using errcode='40001'; end if;
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
    when 'inviter_unavailable' then 'member_unavailable' else 'none' end where id=claim.id;
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

create or replace function public.reverse_purchase(p_business uuid,p_purchase uuid,p_reason text,p_expected_version bigint,p_key text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare replay jsonb; source public.purchases; staff public.business_users; bal public.balances; reversal_id uuid;
 item public.ledger_entries; result jsonb; entry_ids uuid[]:='{}'; claim public.referral_claims; locked_id uuid;
begin
 replay:=app_private.value_request(p_business,'reverse_purchase',p_key,jsonb_build_object('purchaseId',p_purchase,'reason',p_reason,'expectedLedgerVersion',p_expected_version));
 if replay is not null then
  perform app_private.can_reverse(p_business,(select branch_id from public.purchases where business_id=p_business and id=p_purchase));
  return replay||jsonb_build_object('replayed',true);
 end if;
 select * into source from public.purchases where business_id=p_business and id=p_purchase;
 if source.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 staff:=app_private.can_reverse(p_business,source.branch_id);
 if source.status<>'committed' or char_length(btrim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'conflict' using errcode='40001'; end if;
 select * into claim from public.referral_claims where business_id=p_business and qualifying_purchase_id=p_purchase;
 for locked_id in select id from public.memberships where business_id=p_business
  and id in (source.membership_id,claim.referrer_membership_id) order by id loop
  perform 1 from public.memberships where business_id=p_business and id=locked_id for update;
 end loop;
 for locked_id in select membership_id from public.balances where business_id=p_business
  and membership_id in (source.membership_id,claim.referrer_membership_id) order by membership_id loop
  perform 1 from public.balances where business_id=p_business and membership_id=locked_id for update;
 end loop;
 select * into bal from public.balances where business_id=p_business and membership_id=source.membership_id;
 if bal.ledger_version<>p_expected_version then raise exception 'stale_effect' using errcode='40001'; end if;
 select * into source from public.purchases where business_id=p_business and id=p_purchase for update;
 if source.status<>'committed' then raise exception 'conflict' using errcode='40001'; end if;
 if claim.id is not null then select * into claim from public.referral_claims where id=claim.id for update; end if;
 insert into public.purchase_reversals(business_id,purchase_id,reason,actor_user_id,idempotency_key)
 values(p_business,p_purchase,btrim(p_reason),staff.user_id,p_key) returning id into reversal_id;
 for item in select * from public.ledger_entries where business_id=p_business and purchase_id=p_purchase
  and entry_kind in ('purchase_base','promotion_bonus','referral_bonus') order by membership_id,id loop
  insert into public.ledger_entries(business_id,membership_id,entry_kind,units,purchase_id,redemption_id,referral_claim_id,
   reverses_entry_id,purchase_reversal_id,actor_user_id)
  values(p_business,item.membership_id,'reversal',-item.units,item.purchase_id,item.redemption_id,item.referral_claim_id,item.id,reversal_id,staff.user_id);
  entry_ids:=array_append(entry_ids,item.id);
 end loop;
 update public.purchases set status='reversed' where id=p_purchase;
 update public.promotion_usage set reversed_at=clock_timestamp() where business_id=p_business and purchase_id=p_purchase and reversed_at is null;
 if claim.id is not null then
  update public.referral_claims set status='reversed',reversed_at=clock_timestamp() where id=claim.id and status='qualified';
  update public.referral_cap_usage set reversed_at=clock_timestamp() where business_id=p_business and claim_id=claim.id and reversed_at is null;
 end if;
 update public.memberships set last_qualifying_purchase_at=(select max(occurred_at) from public.purchases
  where business_id=p_business and membership_id=source.membership_id and status='committed' and qualifies_for_loyalty),
  updated_at=clock_timestamp(),row_version=row_version+1 where id=source.membership_id;
 select * into bal from public.balances where membership_id=source.membership_id;
 result:=jsonb_build_object('reversalId',reversal_id,'purchaseId',p_purchase,'reversedEntryIds',to_jsonb(entry_ids),
  'balanceAfterAtCommit',bal.units::text,'ledgerVersion',bal.ledger_version::text,'replayed',false);
 perform app_private.audit(p_business,'purchase.reversed','purchase',p_purchase,p_correlation_id,jsonb_build_object('reason',btrim(p_reason)));
 return app_private.value_finish(p_business,'reverse_purchase',p_key,result,reversal_id);
end $$;

revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
