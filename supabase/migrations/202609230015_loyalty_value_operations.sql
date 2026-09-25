begin;

create function public.record_purchase(p_context_hash text,p_input jsonb,p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c app_private.checkout_contexts; effect jsonb; replay jsonb; bal public.balances; purchase_id uuid; units bigint; result jsonb; key text; staff public.business_users;
begin
 perform app_private.strict_keys(p_input,array['recordedBillPaisa','eligibleSpendPaisa','qualifyingPurchaseConfirmed','receiptReference','correctsPurchaseId','expectedEffectHash','idempotencyKey']);
 key:=p_input->>'idempotencyKey';
 -- The context hash is part of the reserved request identity even after consumption.
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
 units:=(effect->>'baseUnits')::bigint;
 insert into public.purchases(business_id,branch_id,membership_id,programme_version_id,recorded_bill_paisa,eligible_spend_paisa,
 base_units,receipt_reference,qualifying_purchase_confirmed,qualifies_for_loyalty,staff_user_id,idempotency_key,request_hash,corrects_purchase_id)
 values(c.business_id,c.branch_id,c.membership_id,(effect->>'programmeVersionId')::uuid,
 (p_input->>'recordedBillPaisa')::bigint,(p_input->>'eligibleSpendPaisa')::bigint,units,
 nullif(btrim(p_input->>'receiptReference'),''),(p_input->>'qualifyingPurchaseConfirmed')::boolean,
 (effect->>'qualifiesForLoyalty')::boolean,c.staff_user_id,key,app_private.sha256(((p_input||jsonb_build_object('checkoutContext',p_context_hash))-'idempotencyKey')::text),
 (p_input->>'correctsPurchaseId')::uuid) returning id into purchase_id;
 if units>0 then
 insert into public.ledger_entries(business_id,membership_id,entry_kind,units,purchase_id,actor_user_id)
 values(c.business_id,c.membership_id,'purchase_base',units,purchase_id,c.staff_user_id);
 end if;
 if (effect->>'qualifiesForLoyalty')::boolean then
 update public.memberships set last_qualifying_purchase_at=clock_timestamp(),updated_at=clock_timestamp(),row_version=row_version+1 where id=c.membership_id;
 end if;
 update app_private.checkout_contexts set consumed_at=clock_timestamp() where id=c.id and consumed_at is null and expires_at>clock_timestamp();
 if not found then raise exception 'expired' using errcode='P0001'; end if;
 select * into bal from public.balances where membership_id=c.membership_id;
 result:=jsonb_build_object('purchaseId',purchase_id,'receiptReference',p_input->>'receiptReference','baseUnits',units::text,
 'promotionBonusUnits','0','referralBonusUnits','0','qualifiesForLoyalty',effect->'qualifiesForLoyalty',
 'programmeVersionId',effect->'programmeVersionId','balanceAfterAtCommit',bal.units::text,'ledgerVersion',bal.ledger_version::text,'replayed',false);
 perform app_private.audit(c.business_id,'purchase.committed','purchase',purchase_id,p_correlation_id);
 return app_private.value_finish(c.business_id,'record_purchase',key,result,purchase_id);
end $$;
create function public.create_redemption_intent(p_membership uuid,p_reward_version uuid,p_token_hash text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.memberships; reward public.reward_versions; balance_units bigint; new_id uuid; expiry timestamptz; limited jsonb;
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
 expiry:=clock_timestamp()+interval '120 seconds';
 insert into public.redemption_intents(business_id,membership_id,reward_version_id,token_hash,expires_at,created_by)
 values(m.business_id,m.id,reward.id,p_token_hash,expiry,app_private.actor()) returning id into new_id;
 perform app_private.audit(m.business_id,'redemption.intent_created','redemption_intent',new_id,p_correlation_id);
 return jsonb_build_object('intentId',new_id,'expiresAt',expiry,'unitCost',reward.unit_cost::text,'rewardTitle',reward.title);
 exception when others then
  return jsonb_build_object('error',jsonb_build_object('code',case SQLSTATE when 'P0002' then 'not_found' when 'P0003' then 'insufficient_balance'
   when '22023' then 'invalid_input' when '23505' then 'conflict' when '42501' then 'forbidden' else 'temporary_failure' end));
 end;
end $$;
create function public.cancel_redemption_intent(p_intent uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare intent public.redemption_intents;
begin
 select i.* into intent from public.redemption_intents i join public.memberships m on m.business_id=i.business_id and m.id=i.membership_id
 where i.id=p_intent and m.customer_user_id=app_private.actor() for update of i;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 if intent.consumed_at is not null then raise exception 'conflict' using errcode='40001'; end if;
 update public.redemption_intents set canceled_at=coalesce(canceled_at,clock_timestamp()) where id=p_intent;
 return jsonb_build_object('intentId',p_intent,'canceled',true);
end $$;
create function public.preview_redemption(p_context_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c app_private.checkout_contexts; intent public.redemption_intents; reward public.reward_versions; balance_units bigint; effect_hash text;
begin
 c:=app_private.checkout(p_context_hash,'redemption');
 perform app_private.authorize(c.business_id,c.branch_id);
 select * into intent from public.redemption_intents where business_id=c.business_id and id=c.redemption_intent_id;
 if intent.consumed_at is not null or intent.canceled_at is not null or intent.expires_at<=clock_timestamp() then raise exception 'expired' using errcode='P0001'; end if;
 select * into reward from public.reward_versions where business_id=c.business_id and id=intent.reward_version_id;
 if not exists(select from public.reward_branches where business_id=c.business_id and reward_version_id=reward.id and branch_id=c.branch_id) then raise exception 'not_found' using errcode='P0002'; end if;
 perform 1 from public.memberships where business_id=c.business_id and id=c.membership_id and status='active' for update;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 select units into balance_units from public.balances where business_id=c.business_id and membership_id=c.membership_id for update;
 select * into intent from public.redemption_intents where business_id=c.business_id and id=c.redemption_intent_id for update;
 if intent.consumed_at is not null or intent.canceled_at is not null or intent.expires_at<=clock_timestamp() then raise exception 'expired' using errcode='P0001'; end if;
 if balance_units<reward.unit_cost then raise exception 'insufficient_balance' using errcode='P0003'; end if;
 effect_hash:=app_private.sha256(concat_ws(':',c.id,intent.id,reward.id,c.branch_id,balance_units));
 return jsonb_build_object('intentId',intent.id,'rewardTitle',reward.title,'unitCost',reward.unit_cost::text,
 'balance',balance_units::text,'balanceAfter',(balance_units-reward.unit_cost)::text,'expiresAt',intent.expires_at,'expectedEffectHash',effect_hash);
end $$;
create function public.finalize_redemption(p_context_hash text,p_expected_hash text,p_key text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c app_private.checkout_contexts; replay jsonb; effect jsonb; intent public.redemption_intents; reward public.reward_versions; redemption_id uuid; bal public.balances; result jsonb; staff public.business_users;
begin
 select business_id into c.business_id from app_private.checkout_contexts where token_hash=p_context_hash;
 if c.business_id is null then raise exception 'expired' using errcode='P0001'; end if;
 replay:=app_private.value_request(c.business_id,'finalize_redemption',p_key,jsonb_build_object('context',p_context_hash,'effect',p_expected_hash));
 if replay is not null then
  perform app_private.authorize(c.business_id,(select branch_id from app_private.checkout_contexts where token_hash=p_context_hash));
  return replay||jsonb_build_object('replayed',true);
 end if;
 effect:=public.preview_redemption(p_context_hash);
 if effect->>'expectedEffectHash' is distinct from p_expected_hash then raise exception 'stale_effect' using errcode='40001'; end if;
 c:=app_private.checkout(p_context_hash,'redemption');
 staff:=app_private.authorize(c.business_id,c.branch_id);
 if staff.role='owner' then perform app_private.actor(true); end if;
 select * into intent from public.redemption_intents where id=c.redemption_intent_id for update;
 select * into reward from public.reward_versions where id=intent.reward_version_id;
 insert into public.redemptions(business_id,membership_id,reward_version_id,intent_id,branch_id,unit_cost,estimated_cost_paisa,fulfilled_by,idempotency_key)
 values(c.business_id,c.membership_id,reward.id,intent.id,c.branch_id,reward.unit_cost,reward.estimated_cost_paisa,c.staff_user_id,p_key)
 returning id into redemption_id;
 insert into public.ledger_entries(business_id,membership_id,entry_kind,units,redemption_id,actor_user_id)
 values(c.business_id,c.membership_id,'redemption',-reward.unit_cost,redemption_id,c.staff_user_id);
 update public.redemption_intents set consumed_at=clock_timestamp() where id=intent.id;
 update app_private.checkout_contexts set consumed_at=clock_timestamp() where id=c.id and consumed_at is null and expires_at>clock_timestamp();
 if not found then raise exception 'expired' using errcode='P0001'; end if;
 select * into bal from public.balances where membership_id=c.membership_id;
 result:=jsonb_build_object('redemptionId',redemption_id,'status','fulfilled','unitCost',reward.unit_cost::text,
 'balanceAfterAtCommit',bal.units::text,'ledgerVersion',bal.ledger_version::text,'replayed',false);
 perform app_private.audit(c.business_id,'redemption.fulfilled','redemption',redemption_id,p_correlation_id);
 return app_private.value_finish(c.business_id,'finalize_redemption',p_key,result,redemption_id);
end $$;

commit;
