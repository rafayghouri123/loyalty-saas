begin;
create function public.owner_member_financial(p_business uuid,p_membership uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare member public.memberships;
begin
 perform app_private.authorize(p_business,null,true);
 select * into member from public.memberships where business_id=p_business and id=p_membership;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 return jsonb_build_object('id',member.id,'displayName',member.display_name,'status',member.status,'joinedAt',member.joined_at,
 'joinedBranchId',member.joined_branch_id,'lastQualifyingPurchaseAt',member.last_qualifying_purchase_at,
 'balance',(select units::text from public.balances where business_id=p_business and membership_id=p_membership),
 'ledgerVersion',(select ledger_version::text from public.balances where business_id=p_business and membership_id=p_membership),
 'activity',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.entry_kind,'units',e.units::text,'occurredAt',e.occurred_at,
 'purchaseId',e.purchase_id,'redemptionId',e.redemption_id,'reversesEntryId',e.reverses_entry_id) order by e.occurred_at desc,e.id desc),'[]'::jsonb)
 from (select * from public.ledger_entries where business_id=p_business and membership_id=p_membership order by occurred_at desc,id desc limit 25) e));
end $$;
revoke all on function public.owner_member_financial(uuid,uuid) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.owner_member_financial(uuid,uuid) to authenticated;
commit;
