begin;

CREATE OR REPLACE FUNCTION public.business_members(p_business_id uuid, p_branch_id uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare staff public.business_users; limited jsonb;
begin
 staff:=app_private.authorize(p_business_id,p_branch_id);
 if staff.role='cashier' or (staff.role='manager' and p_branch_id is null) then raise exception 'forbidden' using errcode='42501'; end if;
 limited:=app_private.limit_action('members_read',p_business_id); if limited is not null then return limited; end if;
 begin
 if p_offset is null or p_offset not between 0 and 100000 then raise exception 'invalid_input' using errcode='22023'; end if;
 return coalesce((select jsonb_agg(x.data) from (select jsonb_build_object('id',m.id,'name',m.display_name,'status',m.status,'joinedAt',m.joined_at,
 'units',b.units::text,'programmeName',(select p.name from public.loyalty_programmes p where p.id=m.programme_id),'contact',case when staff.role='owner' or staff.can_contact_customers then
 (select jsonb_build_object('phone',c.phone_e164,'sharedEmail',c.shared_email) from public.membership_contacts c where c.membership_id=m.id) else null end) as data
 from public.memberships m join public.balances b on b.membership_id=m.id where m.business_id=p_business_id
 and (p_branch_id is null or m.joined_branch_id=p_branch_id) order by m.joined_at desc,m.id limit 25 offset p_offset) x),'[]'::jsonb);
 exception when integrity_constraint_violation or data_exception or sqlstate 'P0002' or sqlstate '42501' or sqlstate '40001' then
  return jsonb_build_object('error',jsonb_build_object('code','request_rejected','sqlState',SQLSTATE));
 end;
end $function$
;

CREATE OR REPLACE FUNCTION public.owner_member_financial(p_business uuid, p_membership uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare member public.memberships;
begin
 perform app_private.authorize(p_business,null,true);
 select * into member from public.memberships where business_id=p_business and id=p_membership;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 return jsonb_build_object('id',member.id,'displayName',member.display_name,'status',member.status,'joinedAt',member.joined_at,
 'joinedBranchId',member.joined_branch_id,'programmeName',(select p.name from public.loyalty_programmes p where p.id=member.programme_id),'programmeType',(select p.type from public.loyalty_programmes p where p.id=member.programme_id),'lastQualifyingPurchaseAt',member.last_qualifying_purchase_at,
 'balance',(select units::text from public.balances where business_id=p_business and membership_id=p_membership),
 'ledgerVersion',(select ledger_version::text from public.balances where business_id=p_business and membership_id=p_membership),
 'activity',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.entry_kind,'units',e.units::text,'occurredAt',e.occurred_at,
 'purchaseId',e.purchase_id,'redemptionId',e.redemption_id,'reversesEntryId',e.reverses_entry_id) order by e.occurred_at desc,e.id desc),'[]'::jsonb)
 from (select * from public.ledger_entries where business_id=p_business and membership_id=p_membership order by occurred_at desc,id desc limit 25) e));
end $function$
;

commit;
