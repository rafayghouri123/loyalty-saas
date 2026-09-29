begin;


create or replace function app_private.reward_commitment() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then
  if old.published_version_id is not null then raise exception 'published_immutable' using errcode='42501'; end if;
  return old;
 end if;
 if old.published_version_id is not null then
  if new.programme_id<>old.programme_id or new.business_id<>old.business_id or new.status<>'published' then
   raise exception 'published_immutable' using errcode='42501';
  end if;
  if new.published_version_id is distinct from old.published_version_id then
   if new.published_version_id is distinct from old.draft_version_id or new.draft_version_id is not null
    or new.row_version<>old.row_version+1
    or not exists(select 1 from public.reward_versions next_v join public.reward_versions previous_v
      on previous_v.id=old.published_version_id
      where next_v.id=new.published_version_id and next_v.reward_id=old.id and next_v.version>previous_v.version) then
    raise exception 'published_immutable' using errcode='42501';
   end if;
  end if;
 end if;
 return new;
end $$;

create or replace function app_private.reward_branch_commitment() returns trigger language plpgsql set search_path='' as $$
declare protected boolean;
begin
 select exists(
  select 1 from public.reward_versions v
  join public.rewards r on r.id=v.reward_id
  join public.reward_versions current_v on current_v.id=r.published_version_id
  where v.id=case when tg_op='INSERT' then new.reward_version_id else old.reward_version_id end
    and v.version<=current_v.version
 ) into protected;
 if protected then raise exception 'published_immutable' using errcode='42501'; end if;
 if tg_op='UPDATE' then
  select exists(
   select 1 from public.reward_versions v
   join public.rewards r on r.id=v.reward_id
   join public.reward_versions current_v on current_v.id=r.published_version_id
   where v.id=new.reward_version_id and v.version<=current_v.version
  ) into protected;
  if protected then raise exception 'published_immutable' using errcode='42501'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;

CREATE OR REPLACE FUNCTION public.save_reward_draft(p_business uuid, p_input jsonb, p_correlation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare staff public.business_users; prog public.loyalty_programmes; reward public.rewards; version_id uuid; branch_id uuid;
begin
 perform app_private.strict_keys(p_input,array['programmeId','rewardId','rowVersion','title','unitCost','description','terms','estimatedCostPaisa','branchIds']);
 perform 1 from public.businesses where id=p_business for update;
 staff:=app_private.authorize(p_business,null,true);
 select * into prog from public.loyalty_programmes where business_id=p_business and id=coalesce((p_input->>'programmeId')::uuid,(select id from public.loyalty_programmes where business_id=p_business and is_primary));
 if prog.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 if jsonb_typeof(p_input->'branchIds') is distinct from 'array' or jsonb_array_length(p_input->'branchIds')<1 then raise exception 'invalid_input' using errcode='22023'; end if;
 if p_input->>'rewardId' is not null then
  select * into reward from public.rewards where business_id=p_business and id=(p_input->>'rewardId')::uuid for update;
  if reward.id is null or reward.programme_id<>prog.id then raise exception 'not_found' using errcode='P0002'; end if;
  if reward.row_version<>(p_input->>'rowVersion')::integer then raise exception 'conflict' using errcode='40001'; end if;
 else
  insert into public.rewards(business_id,programme_id,name) values(p_business,prog.id,btrim(p_input->>'title')) returning * into reward;
 end if;
 insert into public.reward_versions(business_id,reward_id,version,unit_cost,title,description,terms,estimated_cost_paisa,created_by)
 values(p_business,reward.id,(select coalesce(max(version),0)+1 from public.reward_versions where reward_id=reward.id),
 (p_input->>'unitCost')::integer,btrim(p_input->>'title'),coalesce(btrim(p_input->>'description'),''),btrim(p_input->>'terms'),(p_input->>'estimatedCostPaisa')::bigint,staff.user_id)
 returning id into version_id;
 for branch_id in select value::uuid from jsonb_array_elements_text(p_input->'branchIds') loop
  perform 1 from public.branches where business_id=p_business and id=branch_id and status='active';
  if not found then raise exception 'invalid_branch' using errcode='22023'; end if;
  insert into public.reward_branches(business_id,reward_version_id,branch_id) values(p_business,version_id,branch_id) on conflict do nothing;
 end loop;
 update public.rewards set name=case when reward.status='published' then name else btrim(p_input->>'title') end,draft_version_id=version_id,row_version=row_version+1,updated_at=clock_timestamp() where id=reward.id;
 perform app_private.audit(p_business,'reward.draft_saved','reward',reward.id,p_correlation);
 return jsonb_build_object('rewardId',reward.id,'rewardVersionId',version_id,'rowVersion',reward.row_version+1);
end $function$;

create or replace function public.publish_reward(p_business uuid,p_reward uuid,p_row_version integer,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare reward public.rewards;
begin
 perform 1 from public.businesses where id=p_business for update;
 perform app_private.authorize(p_business,null,true);
 select * into reward from public.rewards where business_id=p_business and id=p_reward for update;
 if reward.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 if not exists(select from public.loyalty_programmes p where p.business_id=p_business and p.id=reward.programme_id
   and p.status in ('published','paused')) then raise exception 'publish_complete_programme_first' using errcode='40001'; end if;
 if reward.row_version<>p_row_version or reward.draft_version_id is null
 or not exists(select from public.reward_branches rb join public.branches b on b.business_id=rb.business_id and b.id=rb.branch_id
 where rb.business_id=p_business and rb.reward_version_id=reward.draft_version_id and b.status='active') then raise exception 'conflict' using errcode='40001'; end if;
 update public.rewards set status='published',name=(select v.title from public.reward_versions v where v.id=reward.draft_version_id),published_version_id=draft_version_id,draft_version_id=null,row_version=row_version+1,updated_at=clock_timestamp() where id=p_reward;
 perform app_private.audit(p_business,case when reward.status='published' then 'reward.updated' else 'reward.published' end,'reward',p_reward,p_correlation);
 return jsonb_build_object('rewardId',p_reward,'rewardVersionId',reward.draft_version_id,'rowVersion',reward.row_version+1);
end $$;

CREATE OR REPLACE FUNCTION public.programme_configuration(p_business uuid,p_programme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare staff public.business_users;
begin
 staff:=app_private.authorize(p_business);
 if staff.role<>'owner' then raise exception 'forbidden' using errcode='42501'; end if;
 return jsonb_build_object('programme',(select jsonb_build_object('id',p.id,'type',p.type,'name',p.name,'status',p.status,'rowVersion',p.row_version,
 'versions',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'name',v.name,'status',v.status,'effectiveAt',v.effective_at,
 'minimumSpendPaisa',v.minimum_spend_paisa::text,'stampsPerPurchase',v.stamps_per_purchase,'spendStepPaisa',v.spend_step_paisa::text,
 'unitsPerStep',v.units_per_step,'maxBaseUnitsPerPurchase',v.max_base_units_per_purchase,'terms',v.terms) order by v.version desc),'[]'::jsonb)
 from public.programme_versions v where v.programme_id=p.id)) from public.loyalty_programmes p where p.business_id=p_business and p.id=p_programme),
 'rewards',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'status',r.status,'rowVersion',r.row_version,
 'publishedVersionId',r.published_version_id,'draftVersionId',r.draft_version_id,
 'programmeName',(select p.name from public.loyalty_programmes p where p.id=r.programme_id),
 'unitCost',(select v.unit_cost from public.reward_versions v where v.id=r.published_version_id),
 'branchIds',(select coalesce(jsonb_agg(rb.branch_id),'[]'::jsonb) from public.reward_branches rb where rb.reward_version_id=r.published_version_id),
 'fulfillmentCount',(select count(*) from public.redemptions d where d.business_id=p_business and d.reward_version_id=r.published_version_id and d.status='fulfilled'),
 'publishedVersion',(select jsonb_build_object('title',v.title,'unitCost',v.unit_cost,'description',v.description,'terms',v.terms,
 'estimatedCostPaisa',v.estimated_cost_paisa::text,'branchIds',(select coalesce(jsonb_agg(rb.branch_id),'[]'::jsonb) from public.reward_branches rb where rb.reward_version_id=v.id))
 from public.reward_versions v where v.id=r.published_version_id),
 'draftVersion',(select jsonb_build_object('title',v.title,'unitCost',v.unit_cost,'description',v.description,'terms',v.terms,
 'estimatedCostPaisa',v.estimated_cost_paisa::text,'branchIds',(select coalesce(jsonb_agg(rb.branch_id),'[]'::jsonb) from public.reward_branches rb where rb.reward_version_id=v.id))
 from public.reward_versions v where v.id=r.draft_version_id)) order by r.created_at,r.id),'[]'::jsonb) from public.rewards r where r.business_id=p_business and r.programme_id=p_programme),
 'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name),'[]'::jsonb) from public.branches b where b.business_id=p_business and b.status='active'));
end $function$;

CREATE OR REPLACE FUNCTION public.loyalty_configuration(p_business uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare staff public.business_users;
begin
 staff:=app_private.authorize(p_business);
 if staff.role<>'owner' then raise exception 'forbidden' using errcode='42501'; end if;
 return jsonb_build_object('programme',(select jsonb_build_object('id',p.id,'type',p.type,'name',p.name,'status',p.status,'rowVersion',p.row_version,
 'versions',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'name',v.name,'status',v.status,'effectiveAt',v.effective_at,
 'minimumSpendPaisa',v.minimum_spend_paisa::text,'stampsPerPurchase',v.stamps_per_purchase,'spendStepPaisa',v.spend_step_paisa::text,
 'unitsPerStep',v.units_per_step,'maxBaseUnitsPerPurchase',v.max_base_units_per_purchase,'terms',v.terms) order by v.version desc),'[]'::jsonb)
 from public.programme_versions v where v.programme_id=p.id)) from public.loyalty_programmes p where p.business_id=p_business and p.is_primary),
 'rewards',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'status',r.status,'rowVersion',r.row_version,
 'publishedVersionId',r.published_version_id,'draftVersionId',r.draft_version_id,
 'programmeName',(select p.name from public.loyalty_programmes p where p.id=r.programme_id),
 'unitCost',(select v.unit_cost from public.reward_versions v where v.id=r.published_version_id),
 'branchIds',(select coalesce(jsonb_agg(rb.branch_id),'[]'::jsonb) from public.reward_branches rb where rb.reward_version_id=r.published_version_id),
 'fulfillmentCount',(select count(*) from public.redemptions d where d.business_id=p_business and d.reward_version_id=r.published_version_id and d.status='fulfilled'),
 'publishedVersion',(select jsonb_build_object('title',v.title,'unitCost',v.unit_cost,'description',v.description,'terms',v.terms,
 'estimatedCostPaisa',v.estimated_cost_paisa::text,'branchIds',(select coalesce(jsonb_agg(rb.branch_id),'[]'::jsonb) from public.reward_branches rb where rb.reward_version_id=v.id))
 from public.reward_versions v where v.id=r.published_version_id),
 'draftVersion',(select jsonb_build_object('title',v.title,'unitCost',v.unit_cost,'description',v.description,'terms',v.terms,
 'estimatedCostPaisa',v.estimated_cost_paisa::text,'branchIds',(select coalesce(jsonb_agg(rb.branch_id),'[]'::jsonb) from public.reward_branches rb where rb.reward_version_id=v.id))
 from public.reward_versions v where v.id=r.draft_version_id)) order by r.created_at,r.id),'[]'::jsonb) from public.rewards r where r.business_id=p_business and r.programme_id=(select id from public.loyalty_programmes where business_id=p_business and is_primary)),
 'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name),'[]'::jsonb) from public.branches b where b.business_id=p_business and b.status='active'));
end $function$;

commit;
