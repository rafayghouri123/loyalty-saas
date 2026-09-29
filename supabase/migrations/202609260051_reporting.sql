begin;
-- On-demand source queries. These indexes are not stored report aggregates.
create index reports_purchase_branch_date on public.purchases(business_id,branch_id,occurred_at,id);
create index reports_purchase_member_history on public.purchases(business_id,membership_id,occurred_at) where status='committed' and qualifies_for_loyalty;
create index reports_members_join on public.memberships(business_id,joined_branch_id,joined_at,id);
create index reports_redemption_branch_date on public.redemptions(business_id,branch_id,fulfilled_at,id);
create index reports_referral_date on public.referral_claims(business_id,enrolled_at,id);
create index reports_campaign_date on public.campaigns(business_id,scheduled_at,id);
create index reports_purchase_reversal_date on public.purchase_reversals(business_id,reversed_at,id);
create index reports_redemption_reversal_date on public.redemption_reversals(business_id,reversed_at,id);
create index reports_adjustment_date on public.adjustments(business_id,created_at,id);
create index reports_followup_open on public.followup_tasks(business_id,opened_at,id) where opened_at is not null;
create index reports_followup_sent on public.followup_tasks(business_id,marked_sent_at,id) where marked_sent_at is not null;

create function app_private.report_staff(p_business uuid,p_export boolean default false,p_contacts boolean default false) returns public.business_users
language plpgsql security definer set search_path='' as $$
declare s public.business_users;
begin
 s:=app_private.authorize(p_business);
 if s.role not in ('owner','manager') or (p_export and s.role='manager' and not s.can_export_reports)
 or (p_contacts and s.role='manager' and not s.can_contact_customers) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_contacts and s.role='owner' then perform app_private.actor(true); end if;
 perform 1 from public.branch_assignments where business_id=p_business and business_user_id=s.id order by branch_id for share;
 return s;
end $$;

create function app_private.report_filters(p_business uuid,p_input jsonb,p_staff public.business_users) returns jsonb
language plpgsql set search_path='' as $$
declare tz text; starts date; ends date; branches uuid[]; selected uuid[]; bid uuid; kind text; preset text; lim integer; off integer; all_branches boolean;
begin
 perform app_private.strict_keys(p_input,array['reportKind','preset','startDate','endDate','branchIds','programmeVersionId','rewardVersionId','promotionId','campaignId','sort','cursor','pageSize']);
 select timezone into tz from public.businesses where id=p_business;
 kind:=coalesce(p_input->>'reportKind','overview');preset:=coalesce(p_input->>'preset','last30');
 if kind not in ('overview','customers','rewards','referrals','promotions','campaigns','staff','contacts') or preset not in ('today','last7','last30','custom')
 or coalesce(p_input->>'sort','default') not in ('default','reverse') then raise exception 'invalid_input' using errcode='22023'; end if;
 ends:=(clock_timestamp() at time zone tz)::date;
 if preset='custom' then
  if coalesce(p_input->>'startDate','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_input->>'endDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_input' using errcode='22023';end if;
  starts:=(p_input->>'startDate')::date;ends:=(p_input->>'endDate')::date;
 else starts:=ends-case preset when 'today' then 0 when 'last7' then 6 else 29 end;
  if p_input->>'startDate' is not null or p_input->>'endDate' is not null then raise exception 'invalid_input' using errcode='22023';end if;
 end if;
 if ends<starts or ends-starts>89 then raise exception 'range_max_90_days' using errcode='22023';end if;
 lim:=coalesce((p_input->>'pageSize')::integer,25);off:=coalesce((p_input->>'cursor')::integer,0);
 if lim not in (25,50,100) or off not between 0 and 100000 or (p_input->>'cursor' is not null and p_input->>'cursor' !~ '^(0|[1-9][0-9]{0,5})$') then raise exception 'invalid_input' using errcode='22023';end if;
 if p_input ? 'branchIds' and jsonb_typeof(p_input->'branchIds')<>'array' then raise exception 'invalid_input' using errcode='22023';end if;
 selected:=array(select jsonb_array_elements_text(coalesce(p_input->'branchIds','[]'))::uuid);
 if cardinality(selected)>100 or cardinality(selected)<>cardinality(array(select distinct unnest(selected))) then raise exception 'invalid_input' using errcode='22023';end if;
 all_branches:=p_staff.role='owner' and cardinality(selected)=0;
 branches:=array(select b.id from public.branches b where b.business_id=p_business and (p_staff.role='owner' or exists(
 select from public.branch_assignments a where a.business_id=p_business and a.business_user_id=p_staff.id and a.branch_id=b.id)) order by b.id);
 foreach bid in array selected loop if not bid=any(branches) then raise exception 'forbidden_branch' using errcode='42501';end if;end loop;
 if cardinality(selected)>0 then branches:=selected;end if;
 if cardinality(branches)=0 and p_staff.role<>'owner' then raise exception 'forbidden' using errcode='42501';end if;
 if p_input->>'programmeVersionId' is not null then
  if kind not in ('overview','customers','promotions') or not exists(select from public.programme_versions where business_id=p_business and id=(p_input->>'programmeVersionId')::uuid) then raise exception 'invalid_filter' using errcode='22023';end if;
 end if;
 if p_input->>'rewardVersionId' is not null then
  if kind<>'rewards' or not exists(select from public.reward_versions r where r.business_id=p_business and r.id=(p_input->>'rewardVersionId')::uuid and exists(select from public.reward_branches rb where rb.reward_version_id=r.id and rb.branch_id=any(branches))) then raise exception 'invalid_filter' using errcode='22023';end if;
 end if;
 if p_input->>'promotionId' is not null then
  if kind<>'promotions' or not exists(select from public.earning_promotions e join public.promotion_versions v on v.promotion_id=e.id join public.promotion_branches b on b.promotion_version_id=v.id where e.business_id=p_business and e.id=(p_input->>'promotionId')::uuid and b.branch_id=any(branches)) then raise exception 'invalid_filter' using errcode='22023';end if;
 end if;
 if p_input->>'campaignId' is not null then
  if kind<>'campaigns' or not exists(select from public.campaigns c join public.campaign_branches b on b.campaign_version_id=c.current_version_id where c.business_id=p_business and c.id=(p_input->>'campaignId')::uuid and b.branch_id=any(branches)) then raise exception 'invalid_filter' using errcode='22023';end if;
 end if;
 return jsonb_build_object('reportKind',kind,'preset',preset,'startDate',starts,'endDate',ends,'timezone',tz,'utcStart',to_char((starts::timestamp at time zone tz) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'utcEnd',to_char(((ends+1)::timestamp at time zone tz) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
 'branchIds',to_jsonb(branches),'allBranches',all_branches,'pageSize',lim,'cursor',off,'sort',coalesce(p_input->>'sort','default'),
 'programmeVersionId',p_input->>'programmeVersionId','rewardVersionId',p_input->>'rewardVersionId','promotionId',p_input->>'promotionId','campaignId',p_input->>'campaignId');
end $$;

-- STABLE fixes every nested SELECT to the snapshot of this single report statement.
-- Export callers use a 10001-row sentinel; ordinary reads have max 100 rows.
create function app_private.report_data(p_business uuid,f jsonb,p_export boolean default false) returns jsonb
language plpgsql stable set search_path='' as $$
#variable_conflict use_column
declare kind text:=f->>'reportKind';tz text:=f->>'timezone';lo timestamptz:=(f->>'utcStart')::timestamptz;hi timestamptz:=(f->>'utcEnd')::timestamptz;
 branches uuid[]:=array(select jsonb_array_elements_text(f->'branchIds')::uuid);all_b boolean:=(f->>'allBranches')::boolean;
 pv uuid:=(f->>'programmeVersionId')::uuid;rv uuid:=(f->>'rewardVersionId')::uuid;promo uuid:=(f->>'promotionId')::uuid;campaign uuid:=(f->>'campaignId')::uuid;
 lim integer:=case when p_export then 10001 else (f->>'pageSize')::integer end;off integer:=case when p_export then 0 else (f->>'cursor')::integer end;
 metrics jsonb:='{}';rows jsonb:='[]';series jsonb:='[]';total bigint:=0; stamp timestamptz:=statement_timestamp();
begin
 if kind in ('overview','customers') then
  with cohort as materialized(select p.* from public.purchases p where p.business_id=p_business and p.branch_id=any(branches) and p.occurred_at>=lo and p.occurred_at<hi and (pv is null or p.programme_version_id=pv)),
  buyers as(select distinct p.membership_id from cohort p where p.status='committed' and p.qualifies_for_loyalty),
  returning_buyers as(select b.membership_id from buyers b where exists(select from public.purchases old where old.business_id=p_business and old.membership_id=b.membership_id and old.status='committed' and old.qualifies_for_loyalty and old.occurred_at<lo)),
  sums as(select coalesce(sum(recorded_bill_paisa) filter(where status='committed'),0) sales,coalesce(sum(eligible_spend_paisa) filter(where status='committed'),0) spend,count(*) filter(where status='committed') n,count(*) filter(where status='reversed') reversed from cohort),
  scoped as(select m.* from public.memberships m where m.business_id=p_business and (all_b or m.joined_branch_id=any(branches) or exists(select from public.purchases p where p.business_id=p_business and p.membership_id=m.id and p.branch_id=any(branches) and p.status='committed' and p.qualifies_for_loyalty)))
  select jsonb_build_object('recordedSalesPaisa',sales::text,'eligibleSpendPaisa',spend::text,'recordedPurchases',n,'averageBillPaisa',case when n=0 then null else round(sales::numeric/n)::text end,
  'newMembers',(select count(*) from public.memberships m where m.business_id=p_business and (all_b or m.joined_branch_id=any(branches)) and m.joined_at>=lo and m.joined_at<hi),
  'purchasingMembers',(select count(*) from buyers),'returningMembers',(select count(*) from returning_buyers),
  'returningShare',case when not exists(select from buyers) then null else round(100.0*(select count(*) from returning_buyers)/(select count(*) from buyers),2)::text end,
  'repeatWithinPeriod',(select count(*) from(select membership_id from cohort where status='committed' and qualifies_for_loyalty group by membership_id having count(*)>=2)q),
  'neverPurchased',(select count(*) from scoped m where not exists(select from public.purchases p where p.business_id=p_business and p.membership_id=m.id and p.status='committed' and p.qualifies_for_loyalty and p.branch_id=any(branches) and p.occurred_at<hi)),
  'inactive30Days',(select count(*) from scoped m where exists(select from public.purchases p where p.business_id=p_business and p.membership_id=m.id and p.status='committed' and p.qualifies_for_loyalty and p.branch_id=any(branches) and p.occurred_at<hi) and not exists(select from public.purchases p where p.business_id=p_business and p.membership_id=m.id and p.status='committed' and p.qualifies_for_loyalty and p.branch_id=any(branches) and p.occurred_at>=hi-interval '30 days' and p.occurred_at<hi)),
  'reversedSourcePurchases',reversed) into metrics from sums;
  if kind='overview' then
   select count(*) into total from generate_series((f->>'startDate')::date::timestamp,(f->>'endDate')::date::timestamp,interval '1 day');
   select coalesce(jsonb_agg(x.val order by x.day),'[]') into series from(
    select d.day,jsonb_build_object('date',d.day::date,'recordedSalesPaisa',coalesce(sum(p.recorded_bill_paisa) filter(where p.status='committed'),0)::text,
    'eligibleSpendPaisa',coalesce(sum(p.eligible_spend_paisa) filter(where p.status='committed'),0)::text,'purchases',count(p.id) filter(where p.status='committed'),'reversedPurchases',count(p.id) filter(where p.status='reversed')) val
    from (select day from generate_series((f->>'startDate')::date::timestamp,(f->>'endDate')::date::timestamp,interval '1 day')day)d
    left join public.purchases p on p.business_id=p_business and p.branch_id=any(branches) and p.occurred_at>=d.day at time zone tz and p.occurred_at<(d.day+interval '1 day') at time zone tz and (pv is null or p.programme_version_id=pv)
    group by d.day)x;
   select coalesce(jsonb_agg(value order by case when f->>'sort'='reverse' then value->>'date' end desc,value->>'date'),'[]') into rows from
    (select value from jsonb_array_elements(series) order by case when f->>'sort'='reverse' then value->>'date' end desc,value->>'date' limit lim offset off)x;
  else
   with q as(select m.id,m.display_name,m.joined_at from public.memberships m where m.business_id=p_business and m.joined_at<hi and (all_b or m.joined_branch_id=any(branches) or exists(select from public.purchases p where p.business_id=p_business and p.membership_id=m.id and p.status='committed' and p.qualifies_for_loyalty and p.branch_id=any(branches))))
   select count(*) into total from q;
   select coalesce(jsonb_agg(x.val order by case when f->>'sort'='reverse' then x.id end desc,x.id),'[]') into rows from(
    select m.id,jsonb_build_object('memberId',m.id,'name',m.display_name,'joinedDate',(m.joined_at at time zone tz)::date,
    'qualifyingPurchases',count(p.id) filter(where p.status='committed' and p.qualifies_for_loyalty),'recordedSalesPaisa',coalesce(sum(p.recorded_bill_paisa) filter(where p.status='committed'),0)::text,
    'returning',exists(select from public.purchases old where old.business_id=p_business and old.membership_id=m.id and old.status='committed' and old.qualifies_for_loyalty and old.occurred_at<lo)) val
    from(select m.* from public.memberships m where m.business_id=p_business and m.joined_at<hi and (all_b or m.joined_branch_id=any(branches) or exists(select from public.purchases p where p.business_id=p_business and p.membership_id=m.id and p.status='committed' and p.qualifies_for_loyalty and p.branch_id=any(branches))) order by case when f->>'sort'='reverse' then m.id end desc,m.id limit lim offset off)m
    left join public.purchases p on p.business_id=p_business and p.membership_id=m.id and p.branch_id=any(branches) and p.occurred_at>=lo and p.occurred_at<hi and (pv is null or p.programme_version_id=pv) group by m.id,m.display_name,m.joined_at)x;
  end if;
 elsif kind='rewards' then
  with sources as(select e.entry_kind,e.units+coalesce(r.units,0) net from public.ledger_entries e left join public.ledger_entries r on r.reverses_entry_id=e.id
   left join public.purchases p on p.id=e.purchase_id left join public.redemptions d on d.id=e.redemption_id
   where e.business_id=p_business and e.entry_kind in ('purchase_base','promotion_bonus','referral_bonus','redemption')
   and coalesce(p.occurred_at,d.fulfilled_at)>=lo and coalesce(p.occurred_at,d.fulfilled_at)<hi and coalesce(p.branch_id,d.branch_id)=any(branches)
   and (pv is null or p.programme_version_id=pv) and (rv is null or d.reward_version_id=rv)),
  costs as(select count(*) filter(where status='fulfilled') n,count(*) filter(where status='fulfilled' and estimated_cost_paisa is not null) known,
   sum(estimated_cost_paisa) filter(where status='fulfilled' and estimated_cost_paisa is not null) cost from public.redemptions where business_id=p_business and branch_id=any(branches) and fulfilled_at>=lo and fulfilled_at<hi and (rv is null or reward_version_id=rv))
  select jsonb_build_object('baseUnits',coalesce((select sum(net) from sources where entry_kind='purchase_base'),0)::text,'promotionUnits',coalesce((select sum(net) from sources where entry_kind='promotion_bonus'),0)::text,
  'referralUnits',coalesce((select sum(net) from sources where entry_kind='referral_bonus'),0)::text,'redeemedUnits',coalesce((select -sum(net) from sources where entry_kind='redemption'),0)::text,
  'rewardsFulfilled',n,'costKnownRewards',known,'costUnknownRewards',n-known,'knownEstimatedCostPaisa',cost::text,
  'estimatedCostPaisa',case when known=n and n>0 then cost::text else null end,
  'purchaseReversalActivity',(select count(*) from public.purchase_reversals r join public.purchases p on p.id=r.purchase_id where r.business_id=p_business and p.branch_id=any(branches) and r.reversed_at>=lo and r.reversed_at<hi and (pv is null or p.programme_version_id=pv)),
  'redemptionReversalActivity',(select count(*) from public.redemption_reversals r join public.redemptions d on d.id=r.redemption_id where r.business_id=p_business and d.branch_id=any(branches) and r.reversed_at>=lo and r.reversed_at<hi and (rv is null or d.reward_version_id=rv)))
  ||case when all_b then jsonb_build_object('outstandingUnitsCurrent',(select coalesce(sum(greatest(units,0)),0)::text from public.balances where business_id=p_business),
  'adjustmentDebtCurrent',(select coalesce(-sum(least(units,0)),0)::text from public.balances where business_id=p_business)) else '{}'::jsonb end into metrics from costs;
  if rv is not null then metrics:=metrics||jsonb_build_object('baseUnits',null,'promotionUnits',null,'referralUnits',null);end if;
  with activity as(
   select d.id,jsonb_build_object('sourceId',d.id,'activityKind','redemption_source','reward',r.title,'occurredAt',d.fulfilled_at,'status',d.status,'units',(-d.unit_cost)::text,'estimatedCostPaisa',d.estimated_cost_paisa::text) val
   from public.redemptions d join public.reward_versions r on r.id=d.reward_version_id where d.business_id=p_business and d.branch_id=any(branches) and d.fulfilled_at>=lo and d.fulfilled_at<hi and (rv is null or d.reward_version_id=rv) and pv is null
   union all select v.id,jsonb_build_object('sourceId',p.id,'activityKind','purchase_reversal','reward',null,'occurredAt',v.reversed_at,'status','reversed','units',(select coalesce(sum(e.units),0)::text from public.ledger_entries e where e.purchase_reversal_id=v.id),'estimatedCostPaisa',null)
   from public.purchase_reversals v join public.purchases p on p.id=v.purchase_id where v.business_id=p_business and p.branch_id=any(branches) and v.reversed_at>=lo and v.reversed_at<hi and rv is null and (pv is null or p.programme_version_id=pv)
   union all select v.id,jsonb_build_object('sourceId',d.id,'activityKind','redemption_reversal','reward',r.title,'occurredAt',v.reversed_at,'status','reversed','units',d.unit_cost::text,'estimatedCostPaisa',null)
   from public.redemption_reversals v join public.redemptions d on d.id=v.redemption_id join public.reward_versions r on r.id=d.reward_version_id where v.business_id=p_business and d.branch_id=any(branches) and v.reversed_at>=lo and v.reversed_at<hi and (rv is null or d.reward_version_id=rv) and pv is null)
  select count(*),coalesce((select jsonb_agg(val order by case when f->>'sort'='reverse' then id end desc,id) from(select * from activity order by case when f->>'sort'='reverse' then id end desc,id limit lim offset off)x),'[]') into total,rows from activity;
 elsif kind='referrals' then
  with claims as materialized(select c.* from public.referral_claims c join public.memberships m on m.id=c.referred_membership_id left join public.purchases p on p.id=c.qualifying_purchase_id
   where c.business_id=p_business and c.enrolled_at>=lo and c.enrolled_at<hi and (all_b or coalesce(p.branch_id,m.joined_branch_id)=any(branches)))
  select jsonb_build_object('enrolledClaims',count(*),'qualified',count(*) filter(where status='qualified'),'capped',count(*) filter(where inviter_suppression='monthly_cap'),
  'expired',count(*) filter(where status='expired' or (status='pending' and qualifies_until<stamp)),'pending',count(*) filter(where status='pending' and qualifies_until>=stamp),'reversed',count(*) filter(where status='reversed'),
  'bonusUnitsIssued',coalesce(sum(inviter_awarded_units+friend_awarded_units),0)::text,'netBonusUnits',coalesce(sum(inviter_awarded_units+friend_awarded_units) filter(where status='qualified'),0)::text,
  'approximateLinkVisits',(select count(*) from public.referral_visit_events v join public.referral_codes c on c.id=v.referral_code_id join public.memberships m on m.id=c.membership_id
   where v.business_id=p_business and v.occurred_at>=greatest(lo,stamp-interval '90 days') and v.occurred_at<hi and (all_b or m.joined_branch_id=any(branches))),
  'visitCoverageStart',greatest(lo,stamp-interval '90 days')) into metrics from claims;
  with q as(select c.* from public.referral_claims c join public.memberships m on m.id=c.referred_membership_id left join public.purchases p on p.id=c.qualifying_purchase_id
   where c.business_id=p_business and c.enrolled_at>=lo and c.enrolled_at<hi and (all_b or coalesce(p.branch_id,m.joined_branch_id)=any(branches)))
  select count(*) into total from q;
  select coalesce(jsonb_agg(x.val order by case when f->>'sort'='reverse' then x.id end desc,x.id),'[]') into rows from(select c.id,jsonb_build_object('claimId',c.id,'enrolledAt',c.enrolled_at,'status',case when c.status='pending' and c.qualifies_until<stamp then 'expired' else c.status end,
   'inviterSuppression',c.inviter_suppression,'inviterIssuedUnits',c.inviter_awarded_units::text,'friendIssuedUnits',c.friend_awarded_units::text,'qualifiedAt',c.qualified_at,'reversedAt',c.reversed_at) val
   from public.referral_claims c join public.memberships m on m.id=c.referred_membership_id left join public.purchases p on p.id=c.qualifying_purchase_id where c.business_id=p_business and c.enrolled_at>=lo and c.enrolled_at<hi and (all_b or coalesce(p.branch_id,m.joined_branch_id)=any(branches)) order by case when f->>'sort'='reverse' then c.id end desc,c.id limit lim offset off)x;
 elsif kind='promotions' then
  with q as(select p.promotion_version_id,count(*) purchases,count(*) filter(where p.status='reversed') reversals,
   coalesce(sum(p.eligible_spend_paisa) filter(where p.status='committed'),0)::text spend,coalesce(sum(p.promotion_bonus_units) filter(where p.status='committed'),0)::text bonus
   from public.purchases p join public.promotion_versions v on v.id=p.promotion_version_id where p.business_id=p_business and p.branch_id=any(branches) and p.occurred_at>=lo and p.occurred_at<hi
   and (pv is null or p.programme_version_id=pv) and (promo is null or v.promotion_id=promo) group by p.promotion_version_id)
  select jsonb_build_object('attributedPurchases',coalesce(sum(purchases),0),'reversedPurchases',coalesce(sum(reversals),0),'netBonusUnits',coalesce(sum(bonus::numeric),0)::text),count(*) into metrics,total from q;
  select coalesce(jsonb_agg(x.val order by case when f->>'sort'='reverse' then x.id end desc,x.id),'[]') into rows from(select v.id,jsonb_build_object('promotionVersionId',v.id,'slot',e.name,'version',v.version,'purchases',count(*),'reversals',count(*) filter(where p.status='reversed'),
   'eligibleSpendPaisa',coalesce(sum(p.eligible_spend_paisa) filter(where p.status='committed'),0)::text,'bonusUnits',coalesce(sum(p.promotion_bonus_units) filter(where p.status='committed'),0)::text) val
   from public.purchases p join public.promotion_versions v on v.id=p.promotion_version_id join public.earning_promotions e on e.id=v.promotion_id where p.business_id=p_business and p.branch_id=any(branches) and p.occurred_at>=lo and p.occurred_at<hi and (pv is null or p.programme_version_id=pv) and (promo is null or v.promotion_id=promo)
   group by v.id,e.name,v.version order by case when f->>'sort'='reverse' then v.id end desc,v.id limit lim offset off)x;
 elsif kind='campaigns' then
  with selected as materialized(select c.* from public.campaigns c where c.business_id=p_business and c.scheduled_at>=lo and c.scheduled_at<hi and (campaign is null or c.id=campaign) and exists(select from public.campaign_branches b where b.campaign_version_id=c.current_version_id and b.branch_id=any(branches))),
  recipients as materialized(select r.* from public.campaign_recipients r join selected c on c.id=r.campaign_id join public.memberships m on m.id=r.membership_id where all_b or m.joined_branch_id=any(branches) or exists(select from public.purchases p where p.business_id=p_business and p.membership_id=m.id and p.status='committed' and p.qualifies_for_loyalty and p.branch_id=any(branches))),
  claims as materialized(select o.* from public.offer_claims o join recipients r on r.campaign_id=o.campaign_id and r.membership_id=o.membership_id where o.branch_id is null or o.branch_id=any(branches)),
  result as(select c.id,jsonb_build_object('campaignId',c.id,'campaign',c.name,'status',c.status,'uniqueAudience',(select count(*) from recipients r where r.campaign_id=c.id),
   'suppressedMembers',(select count(*) from recipients r where r.campaign_id=c.id and r.status='suppressed'),
   'deviceAttempts',(select count(*) from public.delivery_attempts a join recipients r on r.id=a.campaign_recipient_id where r.campaign_id=c.id),
   'providerAcceptedDeviceSends',(select count(*) from public.delivery_attempts a join recipients r on r.id=a.campaign_recipient_id where r.campaign_id=c.id and a.state='provider_accepted'),
   'failedDeviceAttempts',(select count(*) from public.delivery_attempts a join recipients r on r.id=a.campaign_recipient_id where r.campaign_id=c.id and a.state='failed'),
   'unknownDeviceAttempts',(select count(*) from public.delivery_attempts a join recipients r on r.id=a.campaign_recipient_id where r.campaign_id=c.id and a.state='unknown'),
   'observedClicks',(select count(*) from recipients r where r.campaign_id=c.id and r.observed_clicked_at is not null),
   'uniqueOfferClaims',(select count(*) from claims o where o.campaign_id=c.id),'fulfilledClaims',(select count(*) from claims o where o.campaign_id=c.id and o.status='fulfilled'),
   'associatedPurchases',(select count(*) from claims o join public.purchases p on p.id=o.purchase_id where o.campaign_id=c.id and o.status='fulfilled' and p.status='committed' and p.primary_offer_claim_id=o.id),
   'associatedSalesPaisa',(select coalesce(sum(p.recorded_bill_paisa),0)::text from claims o join public.purchases p on p.id=o.purchase_id where o.campaign_id=c.id and o.status='fulfilled' and p.status='committed' and p.primary_offer_claim_id=o.id)) val from selected c)
  select count(*),coalesce((select jsonb_agg(val order by case when f->>'sort'='reverse' then id end desc,id) from(select * from result order by case when f->>'sort'='reverse' then id end desc,id limit lim offset off)x),'[]'),
   jsonb_build_object('uniqueAudience',coalesce(sum((val->>'uniqueAudience')::bigint),0),'deviceAttempts',coalesce(sum((val->>'deviceAttempts')::bigint),0),
   'providerAcceptedDeviceSends',coalesce(sum((val->>'providerAcceptedDeviceSends')::bigint),0),'observedClicks',coalesce(sum((val->>'observedClicks')::bigint),0),
   'manualTasksOpened',(select count(*) from public.followup_tasks t join public.memberships m on m.id=t.membership_id where t.business_id=p_business and t.opened_at>=lo and t.opened_at<hi and (all_b or m.joined_branch_id=any(branches) or exists(select from public.purchases p where p.business_id=p_business and p.membership_id=m.id and p.branch_id=any(branches) and p.status='committed' and p.qualifies_for_loyalty))),
   'manualTasksStaffMarkedSent',(select count(*) from public.followup_tasks t join public.memberships m on m.id=t.membership_id where t.business_id=p_business and t.marked_sent_at>=lo and t.marked_sent_at<hi and (all_b or m.joined_branch_id=any(branches) or exists(select from public.purchases p where p.business_id=p_business and p.membership_id=m.id and p.branch_id=any(branches) and p.status='committed' and p.qualifies_for_loyalty))))
  into total,rows,metrics from result;
 elsif kind='staff' then
  with events as materialized(
   select p.staff_user_id actor,'purchase' kind,p.recorded_bill_paisa::numeric money,coalesce((select sum(e.units) from public.ledger_entries e where e.business_id=p_business and e.purchase_id=p.id and e.entry_kind in ('purchase_base','promotion_bonus','referral_bonus')),0)::numeric units from public.purchases p where p.business_id=p_business and p.branch_id=any(branches) and p.occurred_at>=lo and p.occurred_at<hi and (pv is null or p.programme_version_id=pv)
   union all select r.actor_user_id,'purchase_reversal',0,0 from public.purchase_reversals r join public.purchases p on p.id=r.purchase_id where r.business_id=p_business and p.branch_id=any(branches) and r.reversed_at>=lo and r.reversed_at<hi and (pv is null or p.programme_version_id=pv)
   union all select d.fulfilled_by,'redemption',0,d.unit_cost from public.redemptions d where d.business_id=p_business and d.branch_id=any(branches) and d.fulfilled_at>=lo and d.fulfilled_at<hi and pv is null
   union all select r.actor_user_id,'redemption_reversal',0,0 from public.redemption_reversals r join public.redemptions d on d.id=r.redemption_id where r.business_id=p_business and d.branch_id=any(branches) and r.reversed_at>=lo and r.reversed_at<hi and pv is null
   union all select a.actor_user_id,'adjustment',0,a.units from public.adjustments a where a.business_id=p_business and all_b and a.created_at>=lo and a.created_at<hi and pv is null
   union all select o.fulfilled_by,'offer_fulfillment',0,0 from public.offer_claims o where o.business_id=p_business and o.branch_id=any(branches) and o.status='fulfilled' and o.fulfilled_at>=lo and o.fulfilled_at<hi and pv is null),
  result as(select e.actor,jsonb_build_object('staffId',e.actor,'staff',coalesce(u.staff_display_name,'Retained staff'),
   'purchases',count(*) filter(where kind='purchase'),'awardedUnits',coalesce(sum(units) filter(where kind='purchase'),0)::text,'redemptions',count(*) filter(where kind='redemption'),
   'purchaseReversals',count(*) filter(where kind='purchase_reversal'),'redemptionReversals',count(*) filter(where kind='redemption_reversal'),
   'offerFulfillments',count(*) filter(where kind='offer_fulfillment'),'adjustments',count(*) filter(where kind='adjustment'),'adjustmentUnits',coalesce(sum(units) filter(where kind='adjustment'),0)::text) val
   from events e left join public.business_users u on u.business_id=p_business and u.user_id=e.actor group by e.actor,u.staff_display_name)
  select count(*),coalesce((select jsonb_agg(val order by case when f->>'sort'='reverse' then actor end desc,actor) from(select * from result order by case when f->>'sort'='reverse' then actor end desc,actor limit lim offset off)x),'[]'),
  jsonb_build_object('purchaseActivity',(select count(*) from events where kind='purchase'),'reversalActivity',(select count(*) from events where kind in ('purchase_reversal','redemption_reversal')),'adjustmentActivity',(select count(*) from events where kind='adjustment')) into total,rows,metrics from result;
 elsif kind='contacts' then
  select count(*) into total from public.memberships m where m.business_id=p_business and m.joined_at>=lo and m.joined_at<hi and (all_b or m.joined_branch_id=any(branches));
  select coalesce(jsonb_agg(x.val order by case when f->>'sort'='reverse' then x.id end desc,x.id),'[]') into rows from(select m.id,jsonb_build_object('memberId',m.id,'name',m.display_name,'phone',c.phone_e164,'sharedEmail',c.shared_email) val
   from public.memberships m left join public.membership_contacts c on c.membership_id=m.id where m.business_id=p_business and m.joined_at>=lo and m.joined_at<hi and (all_b or m.joined_branch_id=any(branches)) order by m.id limit lim offset off)x;
 end if;
 return jsonb_build_object('reportKind',kind,'metrics',metrics,'rows',rows,'series',series,'totalRows',total,'nextCursor',case when not p_export and off+lim<total then (off+lim)::text else null end,'appliedFilters',f,'dataAsOf',stamp);
end $$;

create function public.report_configuration(p_business uuid) returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare s public.business_users;branches uuid[];
begin
 s:=app_private.report_staff(p_business);
 branches:=array(select b.id from public.branches b where b.business_id=p_business and (s.role='owner' or exists(select from public.branch_assignments a where a.business_id=p_business and a.branch_id=b.id and a.business_user_id=s.id)));
 return jsonb_build_object('businessName',(select display_name from public.businesses where id=p_business),'timezone',(select timezone from public.businesses where id=p_business),'role',s.role,
 'canExport',s.role='owner' or s.can_export_reports,'canExportContacts',s.role='owner' or (s.can_export_reports and s.can_contact_customers),
 'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]') from public.branches where id=any(branches)),
 'programmes',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name','Programme version '||version) order by version desc),'[]') from public.programme_versions where business_id=p_business and status='published'),
 'rewards',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.title) order by v.title),'[]') from public.reward_versions v where v.business_id=p_business and exists(select from public.reward_branches b where b.reward_version_id=v.id and b.branch_id=any(branches))),
 'promotions',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name) order by e.name),'[]') from public.earning_promotions e where e.business_id=p_business and exists(select from public.promotion_versions v join public.promotion_branches b on b.promotion_version_id=v.id where v.promotion_id=e.id and b.branch_id=any(branches))),
 'campaigns',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name),'[]') from public.campaigns c where c.business_id=p_business and exists(select from public.campaign_branches b where b.campaign_version_id=c.current_version_id and b.branch_id=any(branches))));
end $$;
create function public.get_report(p_business uuid,p_filters jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare s public.business_users;f jsonb;limited jsonb;
begin
 s:=app_private.report_staff(p_business);f:=app_private.report_filters(p_business,p_filters,s);
 if f->>'reportKind'='contacts' then raise exception 'forbidden' using errcode='42501';end if;
 limited:=app_private.limit_action('report.read',p_business,30);if limited is not null then return limited;end if;
 return app_private.report_data(p_business,f);
end $$;
revoke all on function app_private.report_staff(uuid,boolean,boolean),app_private.report_filters(uuid,jsonb,public.business_users),app_private.report_data(uuid,jsonb,boolean) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
revoke all on function public.report_configuration(uuid),public.get_report(uuid,jsonb) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.report_configuration(uuid),public.get_report(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
