begin;

create or replace function app_private.programme_mode() returns trigger language plpgsql set search_path='' as $$
declare current_mode text;
begin
 select type into current_mode from public.loyalty_programmes where business_id=new.business_id and id=new.programme_id;
 if current_mode is null or (current_mode='stamps')<>(new.stamps_per_purchase is not null)
 and (new.status<>'draft' or exists(select from public.ledger_entries where business_id=new.business_id)) then
 raise exception 'programme_mode' using errcode='23514'; end if;
 return new;
end $$;

create or replace function public.save_programme_version(p_business uuid,p_input jsonb,p_correlation uuid) returns jsonb
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

create or replace function public.publish_programme_version(p_business uuid,p_version uuid,p_row_version integer,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prog public.loyalty_programmes; v public.programme_versions; next_mode text; activation timestamptz;
begin
 perform 1 from public.businesses where id=p_business for update;
 perform app_private.authorize(p_business,null,true);
 select * into prog from public.loyalty_programmes where business_id=p_business for update;
 if prog.id is null or prog.row_version<>p_row_version then raise exception 'conflict' using errcode='40001'; end if;
 select * into v from public.programme_versions where business_id=p_business and id=p_version and programme_id=prog.id and status='draft' for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 next_mode:=case when v.stamps_per_purchase is null then 'points' else 'stamps' end;
 activation:=v.effective_at;
 if next_mode<>prog.type then
  if exists(select from public.ledger_entries where business_id=p_business) then raise exception 'programme_mode_locked' using errcode='23514'; end if;
  activation:=clock_timestamp();
  update public.loyalty_programmes set type=next_mode where id=prog.id;
 end if;
 if exists(select from public.programme_versions where programme_id=prog.id and status='published' and effective_at=activation) then
 raise exception 'conflict' using errcode='40001'; end if;
 update public.programme_versions set effective_at=activation,status='published',published_at=clock_timestamp() where id=v.id;
 update public.loyalty_programmes set status=case when status='paused' then 'paused' else 'published' end,
 row_version=row_version+1,updated_at=clock_timestamp() where id=prog.id;
 perform app_private.audit(p_business,'programme.version_published','programme_version',v.id,p_correlation);
 return jsonb_build_object('programmeVersionId',v.id,'effectiveAt',activation,'rowVersion',prog.row_version+1);
end $$;

commit;
