begin;
create function public.worker_observe_loyalty(p_outbox uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare event public.outbox_events; entity uuid; result boolean;
begin
 if not pg_has_role(current_user,'loyalty_worker','member') then raise exception 'forbidden' using errcode='42501'; end if;
 select * into event from public.outbox_events where id=p_outbox for update;
 if event.id is null or event.business_id is null or event.schema_version<>1 or event.event_type not in
 ('loyalty.record_purchase','loyalty.finalize_redemption','loyalty.reverse_purchase','loyalty.reverse_redemption','loyalty.adjust_units')
 or event.payload->>'businessId' is distinct from event.business_id::text
 or (event.payload->>'entityId') !~ '^[a-f0-9-]{36}$' then raise exception 'invalid_event' using errcode='22023'; end if;
 entity:=(event.payload->>'entityId')::uuid;
 if not (event.event_type='loyalty.record_purchase' and exists(select from public.purchases where business_id=event.business_id and id=entity)
 or event.event_type='loyalty.finalize_redemption' and exists(select from public.redemptions where business_id=event.business_id and id=entity)
 or event.event_type='loyalty.reverse_purchase' and exists(select from public.purchase_reversals where business_id=event.business_id and id=entity)
 or event.event_type='loyalty.reverse_redemption' and exists(select from public.redemption_reversals where business_id=event.business_id and id=entity)
 or event.event_type='loyalty.adjust_units' and exists(select from public.adjustments where business_id=event.business_id and id=entity)) then
 raise exception 'invalid_event_source' using errcode='22023'; end if;
 insert into public.job_effect_receipts(business_id,handler_name,event_key,completed_at,result_reference)
 values(event.business_id,'loyalty.observed',event.event_key,clock_timestamp(),entity)
 on conflict(handler_name,event_key) do nothing returning true into result;
 return coalesce(result,false);
end $$;
revoke all on function public.worker_observe_loyalty(uuid) from public,anon,authenticated,loyalty_web_gateway,loyalty_worker;
grant execute on function public.worker_observe_loyalty(uuid) to loyalty_worker;
commit;
