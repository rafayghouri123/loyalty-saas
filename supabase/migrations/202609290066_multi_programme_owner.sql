begin;

create unique index programme_name_per_business on public.loyalty_programmes(business_id,lower(name));

create function public.business_programmes(p_business uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;
begin
  staff:=app_private.authorize(p_business);
  if staff.role<>'owner' then raise exception 'forbidden' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'name',p.name,'type',p.type,'status',p.status,'isPrimary',p.is_primary,
    'rewardCount',(select count(*) from public.rewards r where r.programme_id=p.id and r.status='published'),
    'cardCount',(select count(*) from public.memberships m where m.programme_id=p.id and m.status<>'anonymized'),
    'versions',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'name',v.name,
      'status',v.status,'effectiveAt',v.effective_at) order by v.version desc),'[]'::jsonb)
      from public.programme_versions v where v.programme_id=p.id)) order by p.is_primary desc,p.created_at,p.id)
    from public.loyalty_programmes p where p.business_id=p_business),'[]'::jsonb);
end $$;

create function public.create_additional_programme(p_business uuid,p_input jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users; prog uuid; ver uuid; reward uuid; reward_ver uuid; branch_id uuid;
begin
  perform app_private.strict_keys(p_input,array['rowVersion','type','name','minimumSpendPaisa','stampsPerPurchase',
    'spendStepPaisa','unitsPerStep','maxBaseUnitsPerPurchase','terms','rewardTitle','rewardUnitCost',
    'rewardDescription','rewardTerms','rewardBranchIds','estimatedCostPaisa']);
  perform 1 from public.businesses where id=p_business for update;
  staff:=app_private.authorize(p_business,null,true);
  if not exists(select from public.businesses where id=p_business and status in ('active','paused')
    and row_version=(p_input->>'rowVersion')::integer) then raise exception 'conflict' using errcode='40001'; end if;
  if not app_private.entitled(p_business) then raise exception 'participation_unavailable' using errcode='42501'; end if;
  if jsonb_typeof(p_input->'rewardBranchIds') is distinct from 'array'
    or jsonb_array_length(p_input->'rewardBranchIds')<1 then raise exception 'invalid_input' using errcode='22023'; end if;
  insert into public.loyalty_programmes(business_id,type,name,is_primary)
    values(p_business,p_input->>'type',btrim(p_input->>'name'),false) returning id into prog;
  insert into public.programme_versions(business_id,programme_id,version,name,effective_at,
    minimum_spend_paisa,stamps_per_purchase,spend_step_paisa,units_per_step,max_base_units_per_purchase,terms,created_by)
    values(p_business,prog,1,btrim(p_input->>'name'),clock_timestamp(),
      (p_input->>'minimumSpendPaisa')::bigint,(p_input->>'stampsPerPurchase')::integer,
      (p_input->>'spendStepPaisa')::bigint,(p_input->>'unitsPerStep')::integer,
      (p_input->>'maxBaseUnitsPerPurchase')::integer,btrim(p_input->>'terms'),staff.user_id)
    returning id into ver;
  insert into public.rewards(business_id,programme_id,name)
    values(p_business,prog,btrim(p_input->>'rewardTitle')) returning id into reward;
  insert into public.reward_versions(business_id,reward_id,version,unit_cost,title,description,terms,estimated_cost_paisa,created_by)
    values(p_business,reward,1,(p_input->>'rewardUnitCost')::integer,btrim(p_input->>'rewardTitle'),
      coalesce(btrim(p_input->>'rewardDescription'),''),btrim(p_input->>'rewardTerms'),
      (p_input->>'estimatedCostPaisa')::bigint,staff.user_id) returning id into reward_ver;
  for branch_id in select value::uuid from jsonb_array_elements_text(p_input->'rewardBranchIds') loop
    perform 1 from public.branches where business_id=p_business and id=branch_id and status='active';
    if not found then raise exception 'invalid_branch' using errcode='22023'; end if;
    insert into public.reward_branches(business_id,reward_version_id,branch_id)
      values(p_business,reward_ver,branch_id) on conflict do nothing;
  end loop;
  update public.rewards set draft_version_id=reward_ver,row_version=row_version+1 where id=reward;
  update public.businesses set row_version=row_version+1,updated_at=clock_timestamp() where id=p_business;
  perform app_private.audit(p_business,'programme.additional_draft_saved','programme',prog,p_correlation);
  return jsonb_build_object('programmeId',prog,'programmeVersionId',ver,'rewardVersionId',reward_ver);
end $$;

create function public.publish_additional_programme(p_business uuid,p_programme uuid,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prog public.loyalty_programmes; version_id uuid; stamp timestamptz;
begin
  perform 1 from public.businesses where id=p_business for update;
  perform app_private.authorize(p_business,null,true);
  if not app_private.entitled(p_business) then raise exception 'participation_unavailable' using errcode='42501'; end if;
  select * into prog from public.loyalty_programmes where business_id=p_business and id=p_programme
    and not is_primary and status='draft' for update;
  if not found then raise exception 'not_found' using errcode='P0002'; end if;
  select id into version_id from public.programme_versions where programme_id=prog.id and status='draft'
    order by version desc limit 1;
  if version_id is null or not exists(select from public.rewards r join public.reward_versions v on v.id=r.draft_version_id
    where r.programme_id=prog.id and exists(select from public.reward_branches rb join public.branches b
      on b.business_id=rb.business_id and b.id=rb.branch_id and b.status='active'
      where rb.reward_version_id=v.id)) then raise exception 'publication_incomplete' using errcode='22023'; end if;
  stamp:=clock_timestamp();
  update public.loyalty_programmes set
    name=(select v.name from public.programme_versions v where v.id=version_id),
    type=(select case when v.stamps_per_purchase is null then 'points' else 'stamps' end
      from public.programme_versions v where v.id=version_id)
    where id=prog.id;
  update public.programme_versions set status='published',effective_at=stamp,published_at=stamp where id=version_id;
  update public.loyalty_programmes set status='published',updated_at=stamp,row_version=row_version+1 where id=prog.id;
  update public.rewards set status='published',published_version_id=draft_version_id,draft_version_id=null,
    updated_at=stamp,row_version=row_version+1 where programme_id=prog.id and draft_version_id is not null;
  perform app_private.audit(p_business,'programme.additional_published','programme',prog.id,p_correlation);
  return jsonb_build_object('programmeId',prog.id);
end $$;

create function public.public_programmes(p_slug text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_business_id uuid;
begin
  select id into v_business_id from public.businesses where slug=p_slug and status in ('active','paused')
    and published_at<=clock_timestamp();
  if v_business_id is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'type',p.type,
    'programmeVersionId',v.id,'terms',v.terms,'rewardCount',(select count(*) from public.rewards r
      where r.programme_id=p.id and r.status='published')) order by p.is_primary desc,p.created_at,p.id)
    from public.loyalty_programmes p join lateral
      (select id,terms from public.programme_versions where programme_id=p.id and status='published'
       and effective_at<=clock_timestamp() order by effective_at desc,id desc limit 1) v on true
    where p.business_id=v_business_id and p.status='published'),'[]'::jsonb);
end $$;

create function public.public_programme(p_slug text,p_programme uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare base jsonb; prog public.loyalty_programmes; version public.programme_versions;
begin
  base:=public.public_business(p_slug);
  if base is null then return null; end if;
  select * into prog from public.loyalty_programmes where id=p_programme and business_id=(base->>'id')::uuid
    and status in ('published','paused');
  if not found then return null; end if;
  select * into version from public.programme_versions where programme_id=prog.id and status='published'
    and effective_at<=clock_timestamp() order by effective_at desc,id desc limit 1;
  if version.id is null then return null; end if;
  return base||jsonb_build_object('canJoin',(base->>'status')='active' and prog.status='published'
      and app_private.entitled(prog.business_id) and app_private.policy('platform_terms') is not null
      and app_private.policy('privacy') is not null,
    'programme',jsonb_build_object('id',version.id,'programmeId',prog.id,'type',prog.type,'name',prog.name,
      'terms',version.terms,'minimumSpendPaisa',version.minimum_spend_paisa::text,
      'stampsPerPurchase',version.stamps_per_purchase::text,'spendStepPaisa',version.spend_step_paisa::text,
      'unitsPerStep',version.units_per_step::text,'maxBaseUnitsPerPurchase',version.max_base_units_per_purchase::text),
    'rewards',(select coalesce(jsonb_agg(jsonb_build_object('id',rv.id,'title',rv.title,
      'unitCost',rv.unit_cost::text,'description',rv.description,'terms',rv.terms,
      'branchIds',(select jsonb_agg(rb.branch_id) from public.reward_branches rb where rb.reward_version_id=rv.id))),'[]'::jsonb)
      from public.rewards r join public.reward_versions rv on rv.id=r.published_version_id
      where r.programme_id=prog.id and r.status='published'));
end $$;

revoke all on function public.business_programmes(uuid),public.create_additional_programme(uuid,jsonb,uuid),
  public.publish_additional_programme(uuid,uuid,uuid) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.business_programmes(uuid),public.create_additional_programme(uuid,jsonb,uuid),
  public.publish_additional_programme(uuid,uuid,uuid) to authenticated;
revoke all on function public.public_programmes(text),public.public_programme(text,uuid)
  from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.public_programmes(text),public.public_programme(text,uuid) to anon,authenticated;
commit;
