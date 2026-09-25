begin;
alter table app_private.value_requests drop constraint value_requests_operation_check;
alter table app_private.value_requests add constraint value_requests_operation_check
 check(operation in ('record_purchase','finalize_redemption','reverse_purchase','reverse_redemption','adjust_units','fulfill_offer'));

create function public.preview_offer_fulfillment(p_context_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c app_private.checkout_contexts;i public.offer_claim_intents;claim public.offer_claims;
 benefit public.offers;bal public.balances;hash text;
begin
 c:=app_private.checkout(p_context_hash,'earning');
 perform app_private.authorize(c.business_id,c.branch_id);
 if c.offer_claim_intent_id is null then raise exception 'invalid_input' using errcode='22023'; end if;
 select * into i from public.offer_claim_intents where id=c.offer_claim_intent_id;
 select * into claim from public.offer_claims where id=i.offer_claim_id;
 select * into benefit from public.offers where id=claim.offer_id;
 if i.id is null or claim.id is null or benefit.id is null or i.consumed_at is not null or i.canceled_at is not null
  or i.expires_at<=clock_timestamp() or claim.status<>'claimed' or claim.membership_id<>c.membership_id
  or claim.business_id<>c.business_id or benefit.business_id<>c.business_id
  or benefit.kind<>'treat' or benefit.minimum_spend_paisa<>0
  or benefit.status not in ('published','paused') or benefit.starts_at>clock_timestamp()
  or benefit.expires_at<=clock_timestamp()
  or not exists(select from public.offer_branches where offer_id=benefit.id and branch_id=c.branch_id)
 then raise exception 'offer_unavailable' using errcode='P0001'; end if;
 select * into bal from public.balances where membership_id=c.membership_id;
 hash:=app_private.sha256(concat_ws(':',c.id,claim.id,i.id,benefit.row_version,bal.ledger_version));
 return jsonb_build_object('offerClaimId',claim.id,'offerTitle',benefit.title,
  'benefitDescription',benefit.description,'balance',bal.units::text,'balanceChange','0',
  'expiresAt',i.expires_at,'expectedEffectHash',hash);
end $$;

create function public.fulfill_offer(p_context_hash text,p_expected_hash text,p_key text,p_correlation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c app_private.checkout_contexts;replay jsonb;effect jsonb;staff public.business_users;
 result jsonb;claim_id uuid;
begin
 select business_id into c.business_id from app_private.checkout_contexts where token_hash=p_context_hash;
 if c.business_id is null then raise exception 'expired' using errcode='P0001'; end if;
 replay:=app_private.value_request(c.business_id,'fulfill_offer',p_key,
  jsonb_build_object('context',p_context_hash,'effect',p_expected_hash));
 if replay is not null then
  perform app_private.authorize(c.business_id,(select branch_id from app_private.checkout_contexts where token_hash=p_context_hash));
  return replay||jsonb_build_object('replayed',true);
 end if;
 effect:=public.preview_offer_fulfillment(p_context_hash);
 if effect->>'expectedEffectHash' is distinct from p_expected_hash then
  raise exception 'stale_effect' using errcode='23P01'; end if;
 c:=app_private.checkout(p_context_hash,'earning');
 staff:=app_private.authorize(c.business_id,c.branch_id);
 if staff.role='owner' then perform app_private.actor(true); end if;
 claim_id:=(effect->>'offerClaimId')::uuid;
 perform 1 from public.offer_claim_intents where id=c.offer_claim_intent_id for update;
 perform 1 from public.offer_claims where id=claim_id for update;
 -- Recheck after locks so two staff contexts cannot fulfill the same benefit.
 effect:=public.preview_offer_fulfillment(p_context_hash);
 if effect->>'expectedEffectHash' is distinct from p_expected_hash then
  raise exception 'stale_effect' using errcode='23P01'; end if;
 update public.offer_claims set status='fulfilled',fulfilled_at=clock_timestamp(),fulfilled_by=c.staff_user_id,
  branch_id=c.branch_id,applied_discount_paisa=0,benefit_description=effect->>'benefitDescription'
  where id=claim_id and status='claimed';
 if not found then raise exception 'offer_unavailable' using errcode='P0001'; end if;
 update public.offer_claim_intents set consumed_at=clock_timestamp() where id=c.offer_claim_intent_id
  and consumed_at is null and canceled_at is null and expires_at>clock_timestamp();
 if not found then raise exception 'expired' using errcode='P0001'; end if;
 update app_private.checkout_contexts set consumed_at=clock_timestamp() where id=c.id
  and consumed_at is null and expires_at>clock_timestamp();
 if not found then raise exception 'expired' using errcode='P0001'; end if;
 result:=jsonb_build_object('offerClaimId',claim_id,'status','fulfilled',
  'balanceAfterAtCommit',effect->>'balance','replayed',false);
 perform app_private.audit(c.business_id,'offer.fulfilled','offer_claim',claim_id,p_correlation);
 return app_private.value_finish(c.business_id,'fulfill_offer',p_key,result,claim_id);
end $$;

create or replace function public.worker_observe_loyalty(p_outbox uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare event public.outbox_events; entity uuid; result boolean;
begin
 if not pg_has_role(current_user,'loyalty_worker','member') then raise exception 'forbidden' using errcode='42501'; end if;
 select * into event from public.outbox_events where id=p_outbox for update;
 if event.id is null or event.business_id is null or event.schema_version<>1 or event.event_type not in
 ('loyalty.record_purchase','loyalty.finalize_redemption','loyalty.reverse_purchase','loyalty.reverse_redemption',
  'loyalty.adjust_units','loyalty.fulfill_offer')
 or event.payload->>'businessId' is distinct from event.business_id::text
 or (event.payload->>'entityId') !~ '^[a-f0-9-]{36}$' then raise exception 'invalid_event' using errcode='22023'; end if;
 entity:=(event.payload->>'entityId')::uuid;
 if not (event.event_type='loyalty.record_purchase' and exists(select from public.purchases where business_id=event.business_id and id=entity)
 or event.event_type='loyalty.finalize_redemption' and exists(select from public.redemptions where business_id=event.business_id and id=entity)
 or event.event_type='loyalty.reverse_purchase' and exists(select from public.purchase_reversals where business_id=event.business_id and id=entity)
 or event.event_type='loyalty.reverse_redemption' and exists(select from public.redemption_reversals where business_id=event.business_id and id=entity)
 or event.event_type='loyalty.adjust_units' and exists(select from public.adjustments where business_id=event.business_id and id=entity)
 or event.event_type='loyalty.fulfill_offer' and exists(select from public.offer_claims where business_id=event.business_id and id=entity and status='fulfilled')) then
 raise exception 'invalid_event_source' using errcode='22023'; end if;
 insert into public.job_effect_receipts(business_id,handler_name,event_key,completed_at,result_reference)
 values(event.business_id,'loyalty.observed',event.event_key,clock_timestamp(),entity)
 on conflict(handler_name,event_key) do nothing returning true into result;
 return coalesce(result,false);
end $$;
create or replace function public.get_value_result(p_business uuid,p_operation text,p_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare record app_private.value_requests;staff public.business_users;branch_id uuid;
begin
 select * into record from app_private.value_requests where business_id=p_business
  and operation=p_operation and idempotency_key=p_key;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 if record.actor_user_id<>app_private.actor() then raise exception 'not_found' using errcode='P0002'; end if;
 staff:=app_private.authorize(p_business);
 if p_operation in ('record_purchase','reverse_purchase') then
  select p.branch_id into branch_id from public.purchases p where p.business_id=p_business
   and p.id=(record.result->>'purchaseId')::uuid;
 elsif p_operation in ('finalize_redemption','reverse_redemption') then
  select r.branch_id into branch_id from public.redemptions r where r.business_id=p_business
   and r.id=(record.result->>'redemptionId')::uuid;
 elsif p_operation='fulfill_offer' then
  select c.branch_id into branch_id from public.offer_claims c where c.business_id=p_business
   and c.id=(record.result->>'offerClaimId')::uuid;
 end if;
 if branch_id is not null then staff:=app_private.authorize(p_business,branch_id); end if;
 if p_operation in ('reverse_purchase','reverse_redemption') and (staff.role='cashier'
  or staff.role='manager' and not staff.can_reverse_transactions) then raise exception 'not_found' using errcode='P0002'; end if;
 if p_operation='adjust_units' and staff.role<>'owner' then raise exception 'not_found' using errcode='P0002'; end if;
 return jsonb_build_object('pending',record.result is null,'result',record.result);
end $$;
revoke all on function public.preview_offer_fulfillment(text),public.fulfill_offer(text,text,text,uuid)
 from public,anon,authenticated,loyalty_web_gateway,loyalty_worker;
grant execute on function public.preview_offer_fulfillment(text),public.fulfill_offer(text,text,text,uuid) to authenticated;
commit;
