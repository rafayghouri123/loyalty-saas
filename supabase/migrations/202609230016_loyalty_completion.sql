begin;

create function app_private.can_reverse(p_business uuid,p_branch uuid) returns public.business_users
language plpgsql set search_path='' as $$
declare staff public.business_users;
begin
 staff:=app_private.authorize(p_business,p_branch);
 if staff.role='cashier' or (staff.role='manager' and not staff.can_reverse_transactions) then raise exception 'forbidden' using errcode='42501'; end if;
 if staff.role='owner' then perform app_private.actor(true); end if;
 return staff;
end $$;
create function public.reverse_purchase(p_business uuid,p_purchase uuid,p_reason text,p_expected_version bigint,p_key text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare replay jsonb; source public.purchases; staff public.business_users; bal public.balances; reversal_id uuid; item public.ledger_entries; result jsonb; entry_ids uuid[]:='{}';
begin
 replay:=app_private.value_request(p_business,'reverse_purchase',p_key,jsonb_build_object('purchaseId',p_purchase,'reason',p_reason,'expectedLedgerVersion',p_expected_version));
 if replay is not null then
  perform app_private.can_reverse(p_business,(select branch_id from public.purchases where business_id=p_business and id=p_purchase));
  return replay||jsonb_build_object('replayed',true);
 end if;
 select * into source from public.purchases where business_id=p_business and id=p_purchase;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 staff:=app_private.can_reverse(p_business,source.branch_id);
 if source.status<>'committed' or char_length(btrim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'conflict' using errcode='40001'; end if;
 perform 1 from public.memberships where business_id=p_business and id=source.membership_id for update;
 select * into bal from public.balances where business_id=p_business and membership_id=source.membership_id for update;
 if bal.ledger_version<>p_expected_version then raise exception 'stale_effect' using errcode='40001'; end if;
 select * into source from public.purchases where business_id=p_business and id=p_purchase for update;
 if source.status<>'committed' then raise exception 'conflict' using errcode='40001'; end if;
 insert into public.purchase_reversals(business_id,purchase_id,reason,actor_user_id,idempotency_key)
 values(p_business,p_purchase,btrim(p_reason),staff.user_id,p_key) returning id into reversal_id;
 for item in select * from public.ledger_entries where business_id=p_business and purchase_id=p_purchase and entry_kind in ('purchase_base','promotion_bonus','referral_bonus') order by membership_id,id loop
  insert into public.ledger_entries(business_id,membership_id,entry_kind,units,purchase_id,redemption_id,referral_claim_id,reverses_entry_id,purchase_reversal_id,actor_user_id)
  values(p_business,item.membership_id,'reversal',-item.units,item.purchase_id,item.redemption_id,item.referral_claim_id,item.id,reversal_id,staff.user_id);
  entry_ids:=array_append(entry_ids,item.id);
 end loop;
 update public.purchases set status='reversed' where id=p_purchase;
 update public.memberships set last_qualifying_purchase_at=(select max(occurred_at) from public.purchases where business_id=p_business and membership_id=source.membership_id and status='committed' and qualifies_for_loyalty),
 updated_at=clock_timestamp(),row_version=row_version+1 where id=source.membership_id;
 select * into bal from public.balances where membership_id=source.membership_id;
 result:=jsonb_build_object('reversalId',reversal_id,'purchaseId',p_purchase,'reversedEntryIds',to_jsonb(entry_ids),
 'balanceAfterAtCommit',bal.units::text,'ledgerVersion',bal.ledger_version::text,'replayed',false);
 perform app_private.audit(p_business,'purchase.reversed','purchase',p_purchase,p_correlation_id,jsonb_build_object('reason',btrim(p_reason)));
 return app_private.value_finish(p_business,'reverse_purchase',p_key,result,reversal_id);
end $$;
create function public.reverse_redemption(p_business uuid,p_redemption uuid,p_reason text,p_expected_version bigint,p_key text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare replay jsonb; source public.redemptions; staff public.business_users; bal public.balances; reversal_id uuid; original public.ledger_entries; result jsonb;
begin
 replay:=app_private.value_request(p_business,'reverse_redemption',p_key,jsonb_build_object('redemptionId',p_redemption,'reason',p_reason,'expectedLedgerVersion',p_expected_version));
 if replay is not null then
  perform app_private.can_reverse(p_business,(select branch_id from public.redemptions where business_id=p_business and id=p_redemption));
  return replay||jsonb_build_object('replayed',true);
 end if;
 select * into source from public.redemptions where business_id=p_business and id=p_redemption;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 staff:=app_private.can_reverse(p_business,source.branch_id);
 if source.status<>'fulfilled' or char_length(btrim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'conflict' using errcode='40001'; end if;
 perform 1 from public.memberships where business_id=p_business and id=source.membership_id for update;
 select * into bal from public.balances where business_id=p_business and membership_id=source.membership_id for update;
 if bal.ledger_version<>p_expected_version then raise exception 'stale_effect' using errcode='40001'; end if;
 select * into source from public.redemptions where business_id=p_business and id=p_redemption for update;
 if source.status<>'fulfilled' then raise exception 'conflict' using errcode='40001'; end if;
 select * into original from public.ledger_entries where business_id=p_business and redemption_id=p_redemption and entry_kind='redemption';
 insert into public.redemption_reversals(business_id,redemption_id,reason,actor_user_id,idempotency_key)
 values(p_business,p_redemption,btrim(p_reason),staff.user_id,p_key) returning id into reversal_id;
 insert into public.ledger_entries(business_id,membership_id,entry_kind,units,redemption_id,reverses_entry_id,redemption_reversal_id,actor_user_id)
 values(p_business,source.membership_id,'reversal',-original.units,p_redemption,original.id,reversal_id,staff.user_id);
 update public.redemptions set status='reversed' where id=p_redemption;
 select * into bal from public.balances where membership_id=source.membership_id;
 result:=jsonb_build_object('reversalId',reversal_id,'redemptionId',p_redemption,'balanceAfterAtCommit',bal.units::text,
 'ledgerVersion',bal.ledger_version::text,'replayed',false);
 perform app_private.audit(p_business,'redemption.reversed','redemption',p_redemption,p_correlation_id,jsonb_build_object('reason',btrim(p_reason)));
 return app_private.value_finish(p_business,'reverse_redemption',p_key,result,reversal_id);
end $$;
create function public.adjust_units(p_business uuid,p_membership uuid,p_units bigint,p_reason text,p_expected_version bigint,p_key text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare replay jsonb; staff public.business_users; bal public.balances; adjustment_id uuid; result jsonb;
begin
 replay:=app_private.value_request(p_business,'adjust_units',p_key,jsonb_build_object('membershipId',p_membership,'units',p_units::text,'reason',p_reason,'expectedLedgerVersion',p_expected_version));
 if replay is not null then
  perform app_private.authorize(p_business,null,true);
  return replay||jsonb_build_object('replayed',true);
 end if;
 staff:=app_private.authorize(p_business,null,true);
 if p_units is null or p_units=0 or abs(p_units::numeric)>100000 or char_length(btrim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'invalid_input' using errcode='22023'; end if;
 if p_units>0 and (not exists(select from public.businesses where id=p_business and status='active')
  or not exists(select from public.loyalty_programmes where business_id=p_business and status='published')
  or not app_private.entitled(p_business)) then raise exception 'participation_unavailable' using errcode='42501'; end if;
 if abs(p_units)>=1000 and not exists(select from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a
 where a->>'method' in ('oauth','otp','totp','mfa/totp') and (a->>'timestamp') ~ '^[0-9]{1,12}$'
 and to_timestamp((a->>'timestamp')::double precision) between clock_timestamp()-interval '15 minutes' and clock_timestamp()+interval '30 seconds') then
 raise exception 'reauthentication_required' using errcode='42501'; end if;
 perform 1 from public.memberships where business_id=p_business and id=p_membership and status<>'anonymized' for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 select * into bal from public.balances where business_id=p_business and membership_id=p_membership for update;
 if bal.ledger_version<>p_expected_version then raise exception 'stale_effect' using errcode='40001'; end if;
 if bal.units+p_units<0 then raise exception 'insufficient_balance' using errcode='P0003'; end if;
 insert into public.adjustments(business_id,membership_id,units,reason,actor_user_id,idempotency_key)
 values(p_business,p_membership,p_units,btrim(p_reason),staff.user_id,p_key) returning id into adjustment_id;
 insert into public.ledger_entries(business_id,membership_id,entry_kind,units,adjustment_id,actor_user_id)
 values(p_business,p_membership,'adjustment',p_units,adjustment_id,staff.user_id);
 select * into bal from public.balances where membership_id=p_membership;
 result:=jsonb_build_object('adjustmentId',adjustment_id,'units',p_units::text,'balanceAfterAtCommit',bal.units::text,
 'ledgerVersion',bal.ledger_version::text,'replayed',false);
 perform app_private.audit(p_business,'balance.adjusted','membership',p_membership,p_correlation_id,jsonb_build_object('reason',btrim(p_reason),'units',p_units::text));
 return app_private.value_finish(p_business,'adjust_units',p_key,result,adjustment_id);
end $$;
create function public.get_value_result(p_business uuid,p_operation text,p_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare record app_private.value_requests; staff public.business_users; branch_id uuid;
begin
 select * into record from app_private.value_requests where business_id=p_business and operation=p_operation and idempotency_key=p_key;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 if record.actor_user_id<>app_private.actor() then raise exception 'not_found' using errcode='P0002'; end if;
 staff:=app_private.authorize(p_business);
 if p_operation in ('record_purchase','reverse_purchase') then
  select p.branch_id into branch_id from public.purchases p where p.business_id=p_business and p.id=(record.result->>'purchaseId')::uuid;
 elsif p_operation in ('finalize_redemption','reverse_redemption') then
  select r.branch_id into branch_id from public.redemptions r where r.business_id=p_business and r.id=(record.result->>'redemptionId')::uuid;
 end if;
 if branch_id is not null then staff:=app_private.authorize(p_business,branch_id); end if;
 if p_operation in ('reverse_purchase','reverse_redemption') and (staff.role='cashier' or staff.role='manager' and not staff.can_reverse_transactions) then raise exception 'not_found' using errcode='P0002'; end if;
 if p_operation='adjust_units' and staff.role<>'owner' then raise exception 'not_found' using errcode='P0002'; end if;
 return jsonb_build_object('pending',record.result is null,'result',record.result);
end $$;
create function public.customer_card(p_membership uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.memberships; bal public.balances;
begin
 select * into m from public.memberships where id=p_membership and customer_user_id=app_private.actor();
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 select * into bal from public.balances where business_id=m.business_id and membership_id=m.id;
 return jsonb_build_object('id',m.id,'businessId',m.business_id,'name',(select display_name from public.businesses where id=m.business_id),
 'memberName',m.display_name,'status',m.status,'units',bal.units::text,'ledgerVersion',bal.ledger_version::text,
 'programmeType',(select type from public.loyalty_programmes where business_id=m.business_id),
 'rewards',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'title',v.title,'description',v.description,'terms',v.terms,'unitCost',v.unit_cost::text,
 'available',bal.units>=v.unit_cost and m.status='active' and exists(select from public.businesses b where b.id=m.business_id and b.status<>'archived')
 and exists(select from public.reward_branches rb join public.branches br on br.business_id=rb.business_id and br.id=rb.branch_id
 where rb.business_id=m.business_id and rb.reward_version_id=v.id and br.status='active'),
 'branchIds',(select coalesce(jsonb_agg(rb.branch_id),'[]'::jsonb) from public.reward_branches rb where rb.reward_version_id=v.id)) order by v.unit_cost,v.id),'[]'::jsonb)
 from public.rewards r join public.reward_versions v on v.id=r.published_version_id where r.business_id=m.business_id and r.status='published'),
 'activity',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.entry_kind,'units',e.units::text,'occurredAt',e.occurred_at) order by e.occurred_at desc,e.id desc),'[]'::jsonb)
 from (select * from public.ledger_entries where business_id=m.business_id and membership_id=m.id order by occurred_at desc,id desc limit 10) e));
end $$;
create function public.reconcile_balances(p_business uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare staff public.business_users; mismatch bigint;
begin
 staff:=app_private.authorize(p_business,null,true);
 select count(*) into mismatch from public.balances b where b.business_id=p_business
 and (b.units is distinct from coalesce((select sum(e.units) from public.ledger_entries e where e.business_id=b.business_id and e.membership_id=b.membership_id),0)
 or b.ledger_version is distinct from (select count(*) from public.ledger_entries e where e.business_id=b.business_id and e.membership_id=b.membership_id));
 return jsonb_build_object('businessId',p_business,'mismatches',mismatch,'checkedAt',clock_timestamp());
end $$;

do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('set_membership_handle','create_scanner_code','resolve_scanner','preview_purchase','record_purchase','create_redemption_intent','cancel_redemption_intent',
 'preview_redemption','finalize_redemption','reverse_purchase','reverse_redemption','adjust_units','get_value_result','customer_card','reconcile_balances') loop
 execute format('revoke all on function %s from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',f);
 execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
