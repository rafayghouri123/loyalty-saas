begin;
create function public.staff_context(p_business uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare staff public.business_users;
begin
 staff:=app_private.authorize(p_business);
 return jsonb_build_object('businessId',p_business,'businessName',(select display_name from public.businesses where id=p_business),
 'timezone',(select timezone from public.businesses where id=p_business),'role',staff.role,
 'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name),'[]'::jsonb)
 from public.branches b where b.business_id=p_business and b.status='active' and (staff.role='owner' or exists(select from public.branch_assignments a
 where a.business_id=p_business and a.business_user_id=staff.id and a.branch_id=b.id))));
end $$;
create function public.staff_activity(p_business uuid,p_branch uuid,p_type text,p_start date,p_end date,p_size integer,p_page integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare staff public.business_users; zone text; start_at timestamptz; end_at timestamptz;
begin
 staff:=app_private.authorize(p_business,p_branch);
 if p_type is null or p_type not in ('all','purchase','redemption','reversal') or p_start is null or p_end is null or p_end<p_start or p_end-p_start>89 or p_size not in (25,50,100) or p_page not between 0 and 10000 then
 raise exception 'invalid_input' using errcode='22023'; end if;
 select timezone into zone from public.businesses where id=p_business;
 start_at:=p_start::timestamp at time zone zone;end_at:=(p_end+1)::timestamp at time zone zone;
 return jsonb_build_object('businessId',p_business,'page',p_page,'pageSize',p_size,'dataAsOf',clock_timestamp(),
 'rows',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'type',t.type,'sourceType',t.source_type,'occurredAt',t.occurred_at,'branchId',t.branch_id,
 'memberName',t.member_name,'reference',t.reference,'recordedBillPaisa',t.bill_paisa::text,'signedUnits',t.units::text,'status',t.status,'staffUserId',t.staff_user_id)
 order by t.occurred_at desc,t.id desc),'[]'::jsonb) from (
  select event.* from (
   select p.id,'purchase'::text as type,'purchase'::text as source_type,p.occurred_at,p.branch_id,m.display_name as member_name,coalesce(p.receipt_reference,p.id::text) as reference,
    p.recorded_bill_paisa as bill_paisa,(p.base_units+p.promotion_bonus_units)::bigint as units,p.status,p.staff_user_id
   from public.purchases p join public.memberships m on m.business_id=p.business_id and m.id=p.membership_id where p.business_id=p_business
   union all
   select r.id,'redemption','redemption',r.fulfilled_at,r.branch_id,m.display_name,r.id::text,null::bigint,-r.unit_cost::bigint,r.status,r.fulfilled_by
   from public.redemptions r join public.memberships m on m.business_id=r.business_id and m.id=r.membership_id where r.business_id=p_business
   union all
   select p.id,'reversal','purchase',r.reversed_at,p.branch_id,m.display_name,'Reversal of '||coalesce(p.receipt_reference,p.id::text),null::bigint,
    coalesce((select sum(e.units) from public.ledger_entries e where e.business_id=p_business and e.purchase_reversal_id=r.id),0),'reversed',r.actor_user_id
   from public.purchase_reversals r join public.purchases p on p.business_id=r.business_id and p.id=r.purchase_id
   join public.memberships m on m.business_id=p.business_id and m.id=p.membership_id where r.business_id=p_business
   union all
   select d.id,'reversal','redemption',r.reversed_at,d.branch_id,m.display_name,'Reversal of '||d.id::text,null::bigint,d.unit_cost::bigint,'reversed',r.actor_user_id
   from public.redemption_reversals r join public.redemptions d on d.business_id=r.business_id and d.id=r.redemption_id
   join public.memberships m on m.business_id=d.business_id and m.id=d.membership_id where r.business_id=p_business
  ) event where event.occurred_at>=start_at and event.occurred_at<end_at and (p_type='all' or event.type=p_type) and (p_branch is null or event.branch_id=p_branch)
   and (staff.role='owner' or (staff.role='cashier' and event.staff_user_id=staff.user_id and exists(select from public.branch_assignments a
    where a.business_id=p_business and a.business_user_id=staff.id and a.branch_id=event.branch_id))
    or (staff.role='manager' and exists(select from public.branch_assignments a where a.business_id=p_business and a.business_user_id=staff.id and a.branch_id=event.branch_id)))
   order by event.occurred_at desc,event.id desc limit p_size offset p_page*p_size
 ) t));
end $$;
create function public.staff_activity_detail(p_business uuid,p_type text,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users; branch_id uuid; actor_id uuid; member_id uuid; source jsonb;
begin
 if p_type='purchase' then
  select p.branch_id,p.staff_user_id,p.membership_id,to_jsonb(p)-array['idempotency_key','request_hash'] into branch_id,actor_id,member_id,source from public.purchases p where p.business_id=p_business and p.id=p_id;
 elsif p_type='redemption' then
  select r.branch_id,r.fulfilled_by,r.membership_id,to_jsonb(r)-'idempotency_key' into branch_id,actor_id,member_id,source from public.redemptions r where r.business_id=p_business and r.id=p_id;
 else raise exception 'invalid_input' using errcode='22023'; end if;
 if branch_id is null then raise exception 'not_found' using errcode='P0002'; end if;
 staff:=app_private.authorize(p_business,branch_id);
 if staff.role='cashier' and actor_id<>staff.user_id then raise exception 'not_found' using errcode='P0002'; end if;
 return jsonb_build_object('type',p_type,'source',source,'memberName',(select display_name from public.memberships where business_id=p_business and id=member_id),
 'balance',(select units::text from public.balances where business_id=p_business and membership_id=member_id),
 'ledgerVersion',(select ledger_version::text from public.balances where business_id=p_business and membership_id=member_id),
 'ledger',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.entry_kind,'units',e.units::text,'reversesEntryId',e.reverses_entry_id,'occurredAt',e.occurred_at)
 order by e.occurred_at,e.id),'[]'::jsonb) from public.ledger_entries e where e.business_id=p_business and (p_type='purchase' and e.purchase_id=p_id or p_type='redemption' and e.redemption_id=p_id)),
 'reversal',case when p_type='purchase' then (select jsonb_build_object('id',r.id,'reason',r.reason,'reversedAt',r.reversed_at) from public.purchase_reversals r where r.business_id=p_business and r.purchase_id=p_id)
 else (select jsonb_build_object('id',r.id,'reason',r.reason,'reversedAt',r.reversed_at) from public.redemption_reversals r where r.business_id=p_business and r.redemption_id=p_id) end,
 'canReverse',staff.role='owner' or staff.role='manager' and staff.can_reverse_transactions);
end $$;
revoke all on function public.staff_context(uuid),public.staff_activity(uuid,uuid,text,date,date,integer,integer),public.staff_activity_detail(uuid,text,uuid) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.staff_context(uuid),public.staff_activity(uuid,uuid,text,date,date,integer,integer),public.staff_activity_detail(uuid,text,uuid) to authenticated;
commit;
