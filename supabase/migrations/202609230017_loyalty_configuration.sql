begin;

create function public.save_programme_version(p_business uuid,p_input jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users; prog public.loyalty_programmes; new_id uuid; mode text; effective timestamptz;
begin
 perform app_private.strict_keys(p_input,array['rowVersion','name','type','minimumSpendPaisa','stampsPerPurchase','spendStepPaisa','unitsPerStep','maxBaseUnitsPerPurchase','terms','effectiveAt']);
 perform 1 from public.businesses where id=p_business for update;
 staff:=app_private.authorize(p_business,null,true);
 select * into prog from public.loyalty_programmes where business_id=p_business for update;
 if prog.id is null or prog.row_version<>(p_input->>'rowVersion')::integer then raise exception 'conflict' using errcode='40001'; end if;
 mode:=p_input->>'type';
 if mode not in ('stamps','points') or (mode<>prog.type and exists(select from public.ledger_entries where business_id=p_business)) then
 raise exception 'programme_mode_locked' using errcode='23514'; end if;
 if mode<>prog.type then
  if exists(select from public.programme_versions where programme_id=prog.id and status='published') then raise exception 'programme_mode_locked' using errcode='23514'; end if;
  update public.loyalty_programmes set type=mode where id=prog.id;
 end if;
 effective:=(p_input->>'effectiveAt')::timestamptz;
 if effective<clock_timestamp()-interval '30 seconds' then raise exception 'invalid_effective_time' using errcode='22023'; end if;
 insert into public.programme_versions(business_id,programme_id,version,effective_at,minimum_spend_paisa,stamps_per_purchase,spend_step_paisa,units_per_step,max_base_units_per_purchase,terms,created_by)
 values(p_business,prog.id,(select coalesce(max(version),0)+1 from public.programme_versions where programme_id=prog.id),effective,
 (p_input->>'minimumSpendPaisa')::bigint,(p_input->>'stampsPerPurchase')::integer,(p_input->>'spendStepPaisa')::bigint,(p_input->>'unitsPerStep')::integer,
 (p_input->>'maxBaseUnitsPerPurchase')::integer,btrim(p_input->>'terms'),staff.user_id) returning id into new_id;
 update public.loyalty_programmes set name=btrim(p_input->>'name'),row_version=row_version+1,updated_at=clock_timestamp() where id=prog.id;
 perform app_private.audit(p_business,'programme.version_drafted','programme_version',new_id,p_correlation);
 return jsonb_build_object('programmeVersionId',new_id,'rowVersion',prog.row_version+1);
end $$;
create function public.publish_programme_version(p_business uuid,p_version uuid,p_row_version integer,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prog public.loyalty_programmes; v public.programme_versions;
begin
 perform 1 from public.businesses where id=p_business for update;
 perform app_private.authorize(p_business,null,true);
 select * into prog from public.loyalty_programmes where business_id=p_business for update;
 if prog.id is null or prog.row_version<>p_row_version then raise exception 'conflict' using errcode='40001'; end if;
 select * into v from public.programme_versions where business_id=p_business and id=p_version and programme_id=prog.id and status='draft' for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 if exists(select from public.programme_versions where programme_id=prog.id and status='published' and effective_at=v.effective_at) then raise exception 'conflict' using errcode='40001'; end if;
 update public.programme_versions set status='published',published_at=clock_timestamp() where id=v.id;
 update public.loyalty_programmes set status=case when status='paused' then 'paused' else 'published' end,
 row_version=row_version+1,updated_at=clock_timestamp() where id=prog.id;
 perform app_private.audit(p_business,'programme.version_published','programme_version',v.id,p_correlation);
 return jsonb_build_object('programmeVersionId',v.id,'effectiveAt',v.effective_at,'rowVersion',prog.row_version+1);
end $$;
create function public.set_programme_status(p_business uuid,p_status text,p_row_version integer,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prog public.loyalty_programmes;
begin
 perform 1 from public.businesses where id=p_business for update;
 perform app_private.authorize(p_business,null,true);
 select * into prog from public.loyalty_programmes where business_id=p_business for update;
 if prog.id is null or prog.row_version<>p_row_version or p_status not in ('published','paused') or prog.status=p_status
 or prog.status not in ('published','paused') then raise exception 'conflict' using errcode='40001'; end if;
 update public.loyalty_programmes set status=p_status,row_version=row_version+1,updated_at=clock_timestamp() where id=prog.id;
 perform app_private.audit(p_business,case when p_status='paused' then 'programme.paused' else 'programme.resumed' end,'programme',prog.id,p_correlation);
 return jsonb_build_object('programmeId',prog.id,'status',p_status,'rowVersion',prog.row_version+1);
end $$;
create function public.save_reward_draft(p_business uuid,p_input jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users; prog public.loyalty_programmes; reward public.rewards; version_id uuid; branch_id uuid;
begin
 perform app_private.strict_keys(p_input,array['rewardId','rowVersion','title','unitCost','description','terms','estimatedCostPaisa','branchIds']);
 perform 1 from public.businesses where id=p_business for update;
 staff:=app_private.authorize(p_business,null,true);
 select * into prog from public.loyalty_programmes where business_id=p_business;
 if prog.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 if jsonb_typeof(p_input->'branchIds') is distinct from 'array' or jsonb_array_length(p_input->'branchIds')<1 then raise exception 'invalid_input' using errcode='22023'; end if;
 if p_input->>'rewardId' is not null then
  select * into reward from public.rewards where business_id=p_business and id=(p_input->>'rewardId')::uuid for update;
  if reward.id is null then raise exception 'not_found' using errcode='P0002'; end if;
  if reward.status='published' or reward.row_version<>(p_input->>'rowVersion')::integer then raise exception 'published_immutable' using errcode='40001'; end if;
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
 update public.rewards set name=btrim(p_input->>'title'),draft_version_id=version_id,row_version=row_version+1,updated_at=clock_timestamp() where id=reward.id;
 perform app_private.audit(p_business,'reward.draft_saved','reward',reward.id,p_correlation);
 return jsonb_build_object('rewardId',reward.id,'rewardVersionId',version_id,'rowVersion',reward.row_version+1);
end $$;
create function public.publish_reward(p_business uuid,p_reward uuid,p_row_version integer,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare reward public.rewards;
begin
 perform 1 from public.businesses where id=p_business for update;
 perform app_private.authorize(p_business,null,true);
 select * into reward from public.rewards where business_id=p_business and id=p_reward for update;
 if reward.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 if reward.status='published' or reward.row_version<>p_row_version or reward.draft_version_id is null
 or not exists(select from public.reward_branches rb join public.branches b on b.business_id=rb.business_id and b.id=rb.branch_id
 where rb.business_id=p_business and rb.reward_version_id=reward.draft_version_id and b.status='active') then raise exception 'conflict' using errcode='40001'; end if;
 update public.rewards set status='published',published_version_id=draft_version_id,draft_version_id=null,row_version=row_version+1,updated_at=clock_timestamp() where id=p_reward;
 perform app_private.audit(p_business,'reward.published','reward',p_reward,p_correlation);
 return jsonb_build_object('rewardId',p_reward,'rewardVersionId',reward.draft_version_id,'rowVersion',reward.row_version+1);
end $$;
create function public.loyalty_configuration(p_business uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare staff public.business_users;
begin
 staff:=app_private.authorize(p_business);
 if staff.role<>'owner' then raise exception 'forbidden' using errcode='42501'; end if;
 return jsonb_build_object('programme',(select jsonb_build_object('id',p.id,'type',p.type,'name',p.name,'status',p.status,'rowVersion',p.row_version,
 'versions',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'status',v.status,'effectiveAt',v.effective_at,
 'minimumSpendPaisa',v.minimum_spend_paisa::text,'stampsPerPurchase',v.stamps_per_purchase,'spendStepPaisa',v.spend_step_paisa::text,
 'unitsPerStep',v.units_per_step,'maxBaseUnitsPerPurchase',v.max_base_units_per_purchase,'terms',v.terms) order by v.version desc),'[]'::jsonb)
 from public.programme_versions v where v.programme_id=p.id)) from public.loyalty_programmes p where p.business_id=p_business),
 'rewards',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'status',r.status,'rowVersion',r.row_version,
 'publishedVersionId',r.published_version_id,'draftVersionId',r.draft_version_id,
 'programmeName',(select p.name from public.loyalty_programmes p where p.id=r.programme_id),
 'unitCost',(select v.unit_cost from public.reward_versions v where v.id=r.published_version_id),
 'branchIds',(select coalesce(jsonb_agg(rb.branch_id),'[]'::jsonb) from public.reward_branches rb where rb.reward_version_id=r.published_version_id),
 'fulfillmentCount',(select count(*) from public.redemptions d where d.business_id=p_business and d.reward_version_id=r.published_version_id and d.status='fulfilled'),
 'draftVersion',(select jsonb_build_object('title',v.title,'unitCost',v.unit_cost,'description',v.description,'terms',v.terms,
 'estimatedCostPaisa',v.estimated_cost_paisa::text,'branchIds',(select coalesce(jsonb_agg(rb.branch_id),'[]'::jsonb) from public.reward_branches rb where rb.reward_version_id=v.id))
 from public.reward_versions v where v.id=r.draft_version_id)) order by r.created_at,r.id),'[]'::jsonb) from public.rewards r where r.business_id=p_business),
 'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name),'[]'::jsonb) from public.branches b where b.business_id=p_business and b.status='active'));
end $$;
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('save_programme_version','publish_programme_version','set_programme_status','save_reward_draft','publish_reward','loyalty_configuration') loop
 execute format('revoke all on function %s from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',f);
 execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
commit;
