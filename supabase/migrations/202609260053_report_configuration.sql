begin;
-- Avoid PL/pgSQL variable ambiguity with the branches relation's whole-row name.
create or replace function public.report_configuration(p_business uuid) returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare s public.business_users;allowed_branch_ids uuid[];
begin
 s:=app_private.report_staff(p_business);
 allowed_branch_ids:=array(select b.id from public.branches b where b.business_id=p_business and (s.role='owner' or exists(select from public.branch_assignments a where a.business_id=p_business and a.branch_id=b.id and a.business_user_id=s.id)));
 return jsonb_build_object('businessName',(select display_name from public.businesses where id=p_business),'timezone',(select timezone from public.businesses where id=p_business),'role',s.role,
 'canExport',s.role='owner' or s.can_export_reports,'canExportContacts',s.role='owner' or (s.can_export_reports and s.can_contact_customers),
 'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]') from public.branches where id=any(allowed_branch_ids)),
 'programmes',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name','Programme version '||version) order by version desc),'[]') from public.programme_versions where business_id=p_business and status='published'),
 'rewards',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.title) order by v.title),'[]') from public.reward_versions v where v.business_id=p_business and exists(select from public.reward_branches b where b.reward_version_id=v.id and b.branch_id=any(allowed_branch_ids))),
 'promotions',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name) order by e.name),'[]') from public.earning_promotions e where e.business_id=p_business and exists(select from public.promotion_versions v join public.promotion_branches b on b.promotion_version_id=v.id where v.promotion_id=e.id and b.branch_id=any(allowed_branch_ids))),
 'campaigns',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name),'[]') from public.campaigns c where c.business_id=p_business and exists(select from public.campaign_branches b where b.campaign_version_id=c.current_version_id and b.branch_id=any(allowed_branch_ids))));
end $$;
notify pgrst,'reload schema';
commit;
