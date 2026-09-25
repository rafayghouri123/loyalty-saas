begin;

-- Aggregate approximate visits only for the owner across all branches; never expose browser identities.
create or replace function public.referral_configuration(p_business uuid,p_start date,p_end date,p_status text,p_branch uuid,p_page integer,p_size integer)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare staff public.business_users; r public.referral_rule_versions; summary jsonb; rows_json jsonb; total bigint;
 tz text; lower_bound timestamptz; upper_bound timestamptz;
begin
 staff:=app_private.authorize(p_business);
 if staff.role<>'owner' and staff.role<>'manager' then raise exception 'forbidden' using errcode='42501'; end if;
 if p_branch is not null then perform app_private.authorize(p_business,p_branch); end if;
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>366
  or p_status not in ('all','pending','qualified','expired','reversed') or p_page not between 0 and 10000 or p_size not in (25,50,100) then
 raise exception 'invalid_input' using errcode='22023'; end if;
 select timezone into tz from public.businesses where id=p_business;
 lower_bound:=p_start::timestamp at time zone tz;
 upper_bound:=(p_end+1)::timestamp at time zone tz;
 select * into r from app_private.current_referral_rule(p_business);
 with scoped as (
  select c.*,coalesce(p.branch_id,m.joined_branch_id) branch_id,
   case when c.status='pending' and c.qualifies_until<=clock_timestamp() then 'expired' else c.status end display_status
  from public.referral_claims c join public.memberships m on m.business_id=c.business_id and m.id=c.referred_membership_id
   left join public.purchases p on p.business_id=c.business_id and p.id=c.qualifying_purchase_id
  where c.business_id=p_business and c.enrolled_at>=lower_bound and c.enrolled_at<upper_bound
 ) select jsonb_build_object('signups',count(*),'qualified',count(*) filter(where display_status='qualified'),
  'pending',count(*) filter(where display_status='pending'),'expired',count(*) filter(where display_status='expired'),
  'reversed',count(*) filter(where display_status='reversed'),
  'inviterUnits',coalesce(sum(inviter_awarded_units) filter(where display_status='qualified'),0),
  'friendUnits',coalesce(sum(friend_awarded_units) filter(where display_status='qualified'),0)) into summary
 from scoped s where (p_branch is null or s.branch_id=p_branch)
 and (staff.role='owner' or exists(select from public.branch_assignments a where a.business_id=p_business
  and a.business_user_id=staff.id and a.branch_id=s.branch_id));
 with scoped as (
  select c.*,coalesce(p.branch_id,m.joined_branch_id) branch_id,p.receipt_reference,
   case when c.status='pending' and c.qualifies_until<=clock_timestamp() then 'expired' else c.status end display_status
  from public.referral_claims c join public.memberships m on m.business_id=c.business_id and m.id=c.referred_membership_id
   left join public.purchases p on p.business_id=c.business_id and p.id=c.qualifying_purchase_id
  where c.business_id=p_business and c.enrolled_at>=lower_bound and c.enrolled_at<upper_bound
 ), filtered as (
  select s.* from scoped s where (p_branch is null or s.branch_id=p_branch)
   and (staff.role='owner' or exists(select from public.branch_assignments a where a.business_id=p_business
    and a.business_user_id=staff.id and a.branch_id=s.branch_id))
   and (p_status='all' or s.display_status=p_status)
 ) select count(*) into total from filtered;
 with scoped as (
  select c.*,coalesce(p.branch_id,m.joined_branch_id) branch_id,p.receipt_reference,
   case when c.status='pending' and c.qualifies_until<=clock_timestamp() then 'expired' else c.status end display_status
  from public.referral_claims c join public.memberships m on m.business_id=c.business_id and m.id=c.referred_membership_id
   left join public.purchases p on p.business_id=c.business_id and p.id=c.qualifying_purchase_id
  where c.business_id=p_business and c.enrolled_at>=lower_bound and c.enrolled_at<upper_bound
 ), page_rows as (
  select s.* from scoped s where (p_branch is null or s.branch_id=p_branch)
   and (staff.role='owner' or exists(select from public.branch_assignments a where a.business_id=p_business
    and a.business_user_id=staff.id and a.branch_id=s.branch_id))
   and (p_status='all' or s.display_status=p_status)
  order by s.enrolled_at desc,s.id desc limit p_size offset p_page*p_size
 ) select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'enrolledAt',x.enrolled_at,'status',x.display_status,
  'friendLabel','Friend '||left(md5(x.id::text),6),'branchId',x.branch_id,
  'qualifyingPurchaseId',x.qualifying_purchase_id,'qualifyingReceipt',x.receipt_reference,
  'inviterUnits',x.inviter_awarded_units,'friendUnits',x.friend_awarded_units,'suppression',x.inviter_suppression,
  'reviewSignal',case when exists(select from public.membership_contacts a join public.membership_contacts f
   on f.business_id=a.business_id and f.phone_e164=a.phone_e164
   where a.business_id=p_business and a.membership_id=x.referrer_membership_id
   and f.membership_id=x.referred_membership_id and a.phone_e164 is not null)
   then 'shared_unverified_phone' else 'none' end) order by x.enrolled_at desc,x.id desc),'[]'::jsonb)
 into rows_json from page_rows x;
 return jsonb_build_object('timezone',tz,'startDate',p_start,'endDate',p_end,'canEdit',staff.role='owner',
  'rule',case when r.id is null then null else jsonb_build_object('id',r.id,'version',r.version,'enabled',r.enabled,
  'inviterBonusUnits',r.inviter_bonus_units,'friendBonusUnits',r.friend_bonus_units,'minimumSpendPaisa',r.minimum_spend_paisa::text,
  'monthlyInviterCap',r.monthly_inviter_cap,'attributionDays',r.attribution_days,'qualificationDays',r.qualification_days) end,
  'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',br.id,'name',br.name) order by br.name),'[]'::jsonb)
   from public.branches br where br.business_id=p_business and br.status='active' and
   (staff.role='owner' or exists(select from public.branch_assignments a where a.business_id=p_business
    and a.business_user_id=staff.id and a.branch_id=br.id))),
  'metrics',summary||jsonb_build_object('visits',case when staff.role='owner' and p_branch is null then
   (select count(*) from public.referral_visit_events ve where ve.business_id=p_business and ve.occurred_at>=lower_bound and ve.occurred_at<upper_bound)
   else null end),'total',total,'page',p_page,'pageSize',p_size,'results',rows_json);
end $$;


commit;
