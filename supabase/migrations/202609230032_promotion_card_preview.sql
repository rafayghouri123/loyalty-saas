begin;

-- Owner-only card example uses the current cafe brand and first published reward.
create or replace function public.promotion_configuration(p_business uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.business_users;
begin
 item:=app_private.authorize(p_business);
 if item.role<>'owner' then raise exception 'forbidden' using errcode='42501'; end if;
 return jsonb_build_object('timezone',(select timezone from public.businesses where id=p_business),
 'businessName',(select display_name from public.businesses where id=p_business),
 'accentHex',(select accent_hex from public.businesses where id=p_business),
 'programmeType',(select type from public.loyalty_programmes where business_id=p_business),
 'nextReward',(select jsonb_build_object('title',v.title,'unitCost',v.unit_cost) from public.rewards r
  join public.reward_versions v on v.business_id=r.business_id and v.id=r.published_version_id
  where r.business_id=p_business and r.status='published' order by v.unit_cost,r.id limit 1),
 'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]'::jsonb) from public.branches where business_id=p_business and status='active'),
 'promotions',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'status',p.status,'rowVersion',p.row_version,
 'versions',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'status',v.status,'startsOn',v.starts_on,'endsOn',v.ends_on,
 'weekdays',v.weekdays,'startsAt',v.starts_at,'endsAt',v.ends_at,'minimumSpendPaisa',v.minimum_spend_paisa::text,
 'memberDailyCap',v.member_daily_cap,'maxBonusUnitsPerPurchase',v.max_bonus_units_per_purchase,'effectiveAt',v.effective_at,
 'branches',(select coalesce(jsonb_agg(pb.branch_id),'[]'::jsonb) from public.promotion_branches pb where pb.promotion_version_id=v.id)) order by v.version desc),'[]'::jsonb)
 from public.promotion_versions v where v.promotion_id=p.id),
 'attributedPurchases',(select count(*) from public.promotion_usage u where u.promotion_id=p.id and u.reversed_at is null),
 'bonusUnits',(select coalesce(sum(u.bonus_units),0) from public.promotion_usage u where u.promotion_id=p.id and u.reversed_at is null)) order by p.created_at desc),'[]'::jsonb)
 from public.earning_promotions p where p.business_id=p_business));
end $$;


commit;
