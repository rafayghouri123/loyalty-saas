begin;

-- Use a constraint-conflict SQLSTATE for expected slot overlap; hosted RPC gateways retry 40001.
create or replace function public.publish_promotion(p_business uuid,p_promotion uuid,p_version uuid,p_row_version integer,p_enable boolean,p_correlation uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare promo public.earning_promotions; v public.promotion_versions; clash jsonb;
begin
 perform app_private.authorize(p_business,null,true);
 perform 1 from public.businesses where id=p_business for update;
 select * into promo from public.earning_promotions where business_id=p_business and id=p_promotion for update;
 select * into v from public.promotion_versions where business_id=p_business and promotion_id=p_promotion and id=p_version for update;
 if promo.id is null or v.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 if promo.row_version<>p_row_version or v.status<>'draft' then raise exception 'stale' using errcode='40001'; end if;
 if p_enable and (select status from public.businesses where id=p_business)<>'active' then raise exception 'participation_unavailable' using errcode='42501'; end if;
 -- Business row serializes all competing publication/enable edits. A prior version of this
 -- same container stops being selected when its next published version becomes effective.
 if p_enable then
  select jsonb_build_object('promotionName',op.name,'branchName',br.name) into clash from public.earning_promotions op
  join public.promotion_versions other on other.promotion_id=op.id and other.business_id=op.business_id and other.status='published'
  join public.promotion_branches ob on ob.business_id=other.business_id and ob.promotion_version_id=other.id
  join public.promotion_branches nb on nb.business_id=ob.business_id and nb.branch_id=ob.branch_id and nb.promotion_version_id=v.id
  join public.branches br on br.business_id=ob.business_id and br.id=ob.branch_id
  where op.business_id=p_business and op.id<>p_promotion and op.status='enabled'
   and other.starts_on<=v.ends_on and v.starts_on<=other.ends_on and other.weekdays && v.weekdays
   and other.starts_at<v.ends_at and v.starts_at<other.ends_at
   and (select coalesce(min(later.effective_at),'infinity'::timestamptz) from public.promotion_versions later
    where later.business_id=other.business_id and later.promotion_id=other.promotion_id and later.status='published'
    and later.effective_at>other.effective_at)>v.effective_at
  limit 1;
  if clash is not null then raise exception 'promotion_overlap' using errcode='23P01',detail=clash::text; end if;
 end if;
 update public.promotion_versions set status='published',published_at=clock_timestamp() where id=v.id;
 update public.earning_promotions set status=case when p_enable then 'enabled' else status end,
 current_version_id=v.id,row_version=row_version+1 where id=promo.id returning * into promo;
 perform app_private.audit(p_business,'promotion.published','promotion',promo.id,p_correlation,jsonb_build_object('versionId',v.id,'enabled',p_enable));
 return jsonb_build_object('promotionId',promo.id,'promotionVersionId',v.id,'status',promo.status,'rowVersion',promo.row_version);
end $$;

create or replace function public.set_promotion_status(p_business uuid,p_promotion uuid,p_status text,p_row_version integer,p_correlation uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare promo public.earning_promotions; v public.promotion_versions; clash jsonb;
begin
 perform app_private.authorize(p_business,null,true);
 perform 1 from public.businesses where id=p_business for update;
 select * into promo from public.earning_promotions where business_id=p_business and id=p_promotion for update;
 if promo.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 if promo.row_version<>p_row_version or p_status not in ('enabled','paused') then raise exception 'stale' using errcode='40001'; end if;
 if p_status='enabled' then
  select * into v from public.promotion_versions where business_id=p_business and promotion_id=p_promotion and status='published'
   and effective_at<=clock_timestamp() order by effective_at desc limit 1;
  if v.id is null then raise exception 'rules_unavailable' using errcode='40001'; end if;
  select jsonb_build_object('promotionName',op.name,'branchName',br.name) into clash from public.earning_promotions op
  join public.promotion_versions other on other.promotion_id=op.id and other.business_id=op.business_id and other.status='published'
  join public.promotion_branches ob on ob.business_id=other.business_id and ob.promotion_version_id=other.id
  join public.promotion_branches nb on nb.business_id=ob.business_id and nb.branch_id=ob.branch_id and nb.promotion_version_id=v.id
  join public.branches br on br.business_id=ob.business_id and br.id=ob.branch_id
  where op.business_id=p_business and op.id<>p_promotion and op.status='enabled'
   and other.starts_on<=v.ends_on and v.starts_on<=other.ends_on and other.weekdays && v.weekdays
   and other.starts_at<v.ends_at and v.starts_at<other.ends_at limit 1;
  if clash is not null then raise exception 'promotion_overlap' using errcode='23P01',detail=clash::text; end if;
 end if;
 update public.earning_promotions set status=p_status,row_version=row_version+1 where id=promo.id returning * into promo;
 perform app_private.audit(p_business,'promotion.'||p_status,'promotion',p_promotion,p_correlation);
 return jsonb_build_object('promotionId',p_promotion,'status',p_status,'rowVersion',promo.row_version);
end $$;


commit;
