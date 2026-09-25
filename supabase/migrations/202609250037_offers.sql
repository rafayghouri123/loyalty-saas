begin;

create function app_private.communication_staff(p_business uuid,p_branch uuid default null)
returns public.business_users language plpgsql security definer set search_path='' as $$
declare staff public.business_users;
begin
 staff:=app_private.authorize(p_business,p_branch);
 if staff.role='owner' then perform app_private.actor(true);
 elsif staff.role<>'manager' or not staff.can_manage_campaigns then raise exception 'forbidden' using errcode='42501'; end if;
 return staff;
end $$;

create function public.offer_configuration(p_business uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users;
begin
 staff:=app_private.communication_staff(p_business);
 return jsonb_build_object('offers',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'title',o.title,'kind',o.kind,
  'description',o.description,'terms',o.terms,'status',o.status,'audience',o.audience,'startsAt',o.starts_at,
  'expiresAt',o.expires_at,'isAutomationTemplate',o.is_automation_template,'sourceTemplateId',o.source_template_id,
  'generatedByRunId',o.generated_by_run_id,'discountPercent',o.discount_percent,'imageAssetId',o.image_asset_id,
  'minimumSpendPaisa',o.minimum_spend_paisa::text,'maxDiscountPaisa',o.max_discount_paisa::text,
  'rowVersion',o.row_version,'branchIds',(select coalesce(jsonb_agg(ob.branch_id),'[]'::jsonb)
   from public.offer_branches ob where ob.offer_id=o.id),
  'recipientIds',(select coalesce(jsonb_agg(r.membership_id),'[]'::jsonb) from public.offer_recipients r where r.offer_id=o.id),
  'claimCount',(select count(*) from public.offer_claims c where c.offer_id=o.id),
  'fulfilledCount',(select count(*) from public.offer_claims c where c.offer_id=o.id and c.status='fulfilled'))
  order by o.created_at desc,o.id desc),'[]'::jsonb) from public.offers o where o.business_id=p_business
  and o.generated_by_run_id is null),
 'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name),'[]'::jsonb)
  from public.branches b where b.business_id=p_business and b.status='active' and
  (staff.role='owner' or exists(select from public.branch_assignments a where a.business_id=p_business
   and a.business_user_id=staff.id and a.branch_id=b.id))),
 'images',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'path',a.business_id::text||'/'||a.id::text||'/v1.webp') order by a.created_at desc),'[]'::jsonb)
  from public.media_assets a where a.business_id=p_business and a.kind='offer' and a.validation_status='accepted' and a.visibility='public_brand'),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.display_name) order by m.display_name,m.id),'[]'::jsonb)
  from (select m.id,m.display_name from public.memberships m where m.business_id=p_business and m.status='active'
   and (staff.role='owner' or m.joined_branch_id in(select a.branch_id from public.branch_assignments a
    where a.business_id=p_business and a.business_user_id=staff.id)) order by m.display_name,m.id limit 1000) m));
end $$;

create function public.save_offer(p_business uuid,p_input jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users; o public.offers; bid uuid; mids uuid[]; branches uuid[]; v_kind text;
begin
 perform app_private.strict_keys(p_input,array['offerId','rowVersion','kind','title','description','terms','startsAt','expiresAt',
 'audience','branchIds','recipientIds','isAutomationTemplate','discountPercent','minimumSpendPaisa','maxDiscountPaisa','imageAssetId']);
 staff:=app_private.communication_staff(p_business);
 if not app_private.entitled(p_business) then raise exception 'subscription_inactive' using errcode='42501'; end if;
 v_kind:=p_input->>'kind';
 branches:=array(select jsonb_array_elements_text(p_input->'branchIds')::uuid);
 mids:=coalesce(array(select jsonb_array_elements_text(p_input->'recipientIds')::uuid),'{}'::uuid[]);
 if v_kind not in ('informational','discount','treat') or p_input->>'audience' not in ('all_members','recipient_list')
  or char_length(btrim(coalesce(p_input->>'title',''))) not between 2 and 80
  or char_length(coalesce(p_input->>'description','')) not between 1 and 1000
  or char_length(coalesce(p_input->>'terms',''))>2000
  or ((p_input->>'startsAt')::timestamptz >= (p_input->>'expiresAt')::timestamptz)
  or cardinality(branches)=0 or cardinality(branches)<>cardinality(array(select distinct unnest(branches)))
  or cardinality(mids)>1000 or cardinality(mids)<>cardinality(array(select distinct unnest(mids)))
  or (p_input->>'audience'='all_members' and cardinality(mids)>0)
  or coalesce((p_input->>'isAutomationTemplate')::boolean,false) and (v_kind='informational' or p_input->>'audience'<>'recipient_list')
  or (v_kind<>'informational' and char_length(btrim(coalesce(p_input->>'terms',''))) not between 10 and 2000)
  or (v_kind='discount' and (p_input->>'discountPercent')::integer not between 1 and 100)
  or (v_kind<>'discount' and (p_input->>'discountPercent' is not null or p_input->>'maxDiscountPaisa' is not null))
  or (v_kind='informational' and coalesce((p_input->>'minimumSpendPaisa')::bigint,0)<>0)
  or coalesce((p_input->>'minimumSpendPaisa')::bigint,0) not between 0 and 100000000
  or (p_input->>'maxDiscountPaisa' is not null and (p_input->>'maxDiscountPaisa')::bigint not between 0 and 100000000)
  then raise exception 'invalid_input' using errcode='22023'; end if;
 foreach bid in array branches loop
  perform app_private.authorize(p_business,bid);
 end loop;
 if exists(select from unnest(mids) mid left join public.memberships m on m.id=mid and m.business_id=p_business
  where m.id is null or m.status<>'active') then raise exception 'invalid_member' using errcode='22023'; end if;
 if p_input->>'offerId' is null then
  insert into public.offers(business_id,kind,title,description,terms,image_asset_id,starts_at,expires_at,audience,is_automation_template,
   discount_percent,minimum_spend_paisa,max_discount_paisa,created_by)
  values(p_business,v_kind,btrim(p_input->>'title'),p_input->>'description',coalesce(p_input->>'terms',''),(p_input->>'imageAssetId')::uuid,
   (p_input->>'startsAt')::timestamptz,(p_input->>'expiresAt')::timestamptz,p_input->>'audience',
   coalesce((p_input->>'isAutomationTemplate')::boolean,false),(p_input->>'discountPercent')::integer,
   coalesce((p_input->>'minimumSpendPaisa')::bigint,0),(p_input->>'maxDiscountPaisa')::bigint,staff.user_id)
  returning * into o;
 else
  select * into o from public.offers where business_id=p_business and id=(p_input->>'offerId')::uuid for update;
  if o.id is null then raise exception 'not_found' using errcode='P0002'; end if;
  if o.status<>'draft' or o.generated_by_run_id is not null then raise exception 'published_immutable' using errcode='23514'; end if;
  if o.row_version<>(p_input->>'rowVersion')::integer then raise exception 'stale' using errcode='40001'; end if;
  update public.offers set kind=v_kind,title=btrim(p_input->>'title'),description=p_input->>'description',image_asset_id=(p_input->>'imageAssetId')::uuid,
   terms=coalesce(p_input->>'terms',''),starts_at=(p_input->>'startsAt')::timestamptz,
   expires_at=(p_input->>'expiresAt')::timestamptz,audience=p_input->>'audience',
   is_automation_template=coalesce((p_input->>'isAutomationTemplate')::boolean,false),
   discount_percent=(p_input->>'discountPercent')::integer,
   minimum_spend_paisa=coalesce((p_input->>'minimumSpendPaisa')::bigint,0),
   max_discount_paisa=(p_input->>'maxDiscountPaisa')::bigint,
   updated_at=clock_timestamp(),row_version=row_version+1 where id=o.id returning * into o;
  delete from public.offer_branches where offer_id=o.id;
  delete from public.offer_recipients where offer_id=o.id;
 end if;
 insert into public.offer_branches(business_id,offer_id,branch_id)
 select p_business,o.id,unnest(branches);
 insert into public.offer_recipients(business_id,offer_id,membership_id,valid_from,valid_until)
 select p_business,o.id,unnest(mids),o.starts_at,o.expires_at;
 perform app_private.audit(p_business,'offer.draft_saved','offer',o.id,p_correlation);
 return jsonb_build_object('offerId',o.id,'rowVersion',o.row_version,'status',o.status);
end $$;

create function public.set_offer_status(p_business uuid,p_offer uuid,p_status text,p_row_version integer,p_correlation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.offers;
begin
 perform app_private.communication_staff(p_business);
 select * into o from public.offers where business_id=p_business and id=p_offer for update;
 if o.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 if o.row_version<>p_row_version then raise exception 'stale' using errcode='40001'; end if;
 if not ((o.status='draft' and p_status='published') or (o.status='published' and p_status='paused')
 or (o.status='paused' and p_status='published' and o.expires_at>clock_timestamp()))
 then raise exception 'invalid_transition' using errcode='22023'; end if;
 if p_status='published' and (o.expires_at<=clock_timestamp() or not exists(select from public.offer_branches where offer_id=o.id))
 then raise exception 'expired' using errcode='P0001'; end if;
 update public.offers set status=p_status,row_version=row_version+1,updated_at=clock_timestamp() where id=o.id returning * into o;
 perform app_private.audit(p_business,'offer.status_changed','offer',o.id,p_correlation,jsonb_build_object('status',p_status));
 return jsonb_build_object('offerId',o.id,'status',o.status,'rowVersion',o.row_version);
end $$;

create function app_private.offer_eligible(p_offer uuid,p_member uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select from public.offers o join public.memberships m on m.business_id=o.business_id and m.id=p_member
 join public.businesses b on b.id=o.business_id
 where o.id=p_offer and m.status='active' and b.status='active' and o.status='published' and not o.is_automation_template
 and o.starts_at<=statement_timestamp() and o.expires_at>statement_timestamp()
 and (o.audience='all_members' or exists(select from public.offer_recipients r where r.offer_id=o.id
  and r.membership_id=m.id and r.valid_from<=statement_timestamp() and r.valid_until>statement_timestamp())))
$$;

create function public.my_offers(p_business uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 actor:=app_private.actor();
 return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'businessId',o.business_id,'businessName',b.display_name,
  'title',o.title,'kind',o.kind,'description',o.description,'terms',o.terms,'startsAt',o.starts_at,
  'expiresAt',o.expires_at,'minimumSpendPaisa',o.minimum_spend_paisa::text,'discountPercent',o.discount_percent,
  'maxDiscountPaisa',o.max_discount_paisa::text,'claimId',c.id,'claimStatus',c.status)
  order by o.expires_at,o.id) from public.memberships m join public.offers o on o.business_id=m.business_id
  join public.businesses b on b.id=m.business_id
  left join public.offer_claims c on c.offer_id=o.id and c.membership_id=m.id
  where m.customer_user_id=actor and m.status='active' and b.status='active'
   and (p_business is null or p_business=m.business_id) and o.status='published' and not o.is_automation_template
   and o.starts_at<=clock_timestamp() and o.expires_at>clock_timestamp()
   and (o.audience='all_members' or exists(select from public.offer_recipients r where r.offer_id=o.id
    and r.membership_id=m.id and r.valid_from<=clock_timestamp() and r.valid_until>clock_timestamp()))),'[]'::jsonb);
end $$;

create function public.offer_detail(p_offer uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; o public.offers; m public.memberships; c public.offer_claims;a public.media_assets;
begin
 actor:=app_private.actor();
 select * into o from public.offers where id=p_offer;
 if o.id is null or o.is_automation_template then raise exception 'not_found' using errcode='P0002'; end if;
 select * into m from public.memberships where business_id=o.business_id and customer_user_id=actor and status='active';
 if m.id is null or (not app_private.offer_eligible(o.id,m.id) and
   not exists(select from public.offer_claims where offer_id=o.id and membership_id=m.id)) then
  raise exception 'not_found' using errcode='P0002'; end if;
 select * into c from public.offer_claims where offer_id=o.id and membership_id=m.id;
 select * into a from public.media_assets where business_id=o.business_id and id=o.image_asset_id;
 return jsonb_build_object('id',o.id,'businessId',o.business_id,'membershipId',m.id,
  'businessName',(select display_name from public.businesses where id=o.business_id),
  'businessTimezone',(select timezone from public.businesses where id=o.business_id),'title',o.title,
  'kind',o.kind,'description',o.description,'terms',o.terms,'startsAt',o.starts_at,'expiresAt',o.expires_at,
  'status',o.status,'minimumSpendPaisa',o.minimum_spend_paisa::text,'discountPercent',o.discount_percent,
  'maxDiscountPaisa',o.max_discount_paisa::text,'imagePath',case when a.validation_status='accepted' and a.visibility='public_brand'
   then a.business_id::text||'/'||a.id::text||'/v1.webp' end,'claimId',c.id,'claimStatus',c.status,
  'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name)),'[]'::jsonb)
   from public.offer_branches ob join public.branches b on b.id=ob.branch_id where ob.offer_id=o.id));
end $$;

create function public.claim_offer(p_offer uuid,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; o public.offers; m public.memberships; c public.offer_claims; limited jsonb;
begin
 actor:=app_private.actor();
 limited:=app_private.limit_action('claim_offer',null,20); if limited is not null then return limited; end if;
 select * into o from public.offers where id=p_offer;
 if o.id is null or o.kind='informational' or o.is_automation_template then raise exception 'not_found' using errcode='P0002'; end if;
 select * into m from public.memberships where business_id=o.business_id and customer_user_id=actor and status='active' for share;
 if m.id is null or not app_private.offer_eligible(o.id,m.id) then raise exception 'not_found' using errcode='P0002'; end if;
 insert into public.offer_claims(business_id,offer_id,membership_id,automation_run_id,benefit_description)
 values(o.business_id,o.id,m.id,o.generated_by_run_id,case when o.kind='treat' then o.description end)
 on conflict(offer_id,membership_id) do nothing;
 select * into c from public.offer_claims where offer_id=o.id and membership_id=m.id;
 perform app_private.audit(o.business_id,'offer.claimed','offer_claim',c.id,p_correlation);
 return jsonb_build_object('claimId',c.id,'status',c.status,'expiresAt',o.expires_at);
end $$;

do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('offer_configuration','save_offer','set_offer_status','my_offers','offer_detail','claim_offer') loop
  execute format('revoke all on function %s from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
