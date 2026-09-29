begin;

create or replace function public.preview_purchase(p_context_hash text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare effect jsonb; minimum_spend bigint;
begin
 perform app_private.strict_keys(p_input,array['recordedBillPaisa','eligibleSpendPaisa','qualifyingPurchaseConfirmed',
  'receiptReference','correctsPurchaseId','offerEligibleBeforeDiscountPaisa']);
 effect:=app_private.purchase_effect_with_offer(p_context_hash,(p_input->>'recordedBillPaisa')::bigint,
  (p_input->>'eligibleSpendPaisa')::bigint,(p_input->>'qualifyingPurchaseConfirmed')::boolean,
  p_input->>'receiptReference',(p_input->>'correctsPurchaseId')::uuid,
  (p_input->>'offerEligibleBeforeDiscountPaisa')::bigint);
 select v.minimum_spend_paisa into minimum_spend from public.programme_versions v
  where v.id=(effect->>'programmeVersionId')::uuid;
 return effect||jsonb_build_object('minimumSpendPaisa',minimum_spend::text);
end $$;

commit;
