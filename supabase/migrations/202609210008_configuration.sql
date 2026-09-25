begin;
create function public.save_branch(p_business_id uuid,p_input jsonb,p_correlation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_branch_id uuid; staff public.business_users; max_branches integer;
begin
 perform 1 from public.businesses where businesses.id=p_business_id for update;
 staff:=app_private.authorize(p_business_id,null,true);
 perform app_private.strict_keys(p_input,array['id','rowVersion','name','address','city','area','mapsUrl','phone','status','hours']);
 v_branch_id:=nullif(p_input->>'id','')::uuid;
 select v.branch_limit into strict max_branches from public.subscriptions s join public.plan_versions v on v.id=s.plan_version_id where s.business_id=p_business_id;
 if p_input->>'status'='active' and (v_branch_id is null or exists(select from public.branches b where b.id=v_branch_id and b.business_id=p_business_id and b.status='inactive')) then
 if not app_private.entitled(p_business_id) or (select count(*) from public.branches b where b.business_id=p_business_id and b.status='active')>=max_branches then raise exception 'branch_limit' using errcode='22023'; end if;
 end if;
 if v_branch_id is null then
 if not app_private.entitled(p_business_id) then raise exception 'participation_unavailable' using errcode='42501'; end if;
 insert into public.branches(business_id,name,address,city,area,maps_url,phone,status) values(p_business_id,btrim(p_input->>'name'),btrim(p_input->>'address'),btrim(p_input->>'city'),
 nullif(btrim(p_input->>'area'),''),nullif(p_input->>'mapsUrl',''),nullif(p_input->>'phone',''),p_input->>'status') returning branches.id into v_branch_id;
 else
 if p_input->>'status'='inactive' and exists(select from public.businesses b join public.loyalty_programmes p on p.business_id=b.id where b.id=p_business_id and b.status='active' and p.status='published')
 and not exists(select from public.branches b where b.business_id=p_business_id and b.id<>v_branch_id and b.status='active') then raise exception 'pause_before_deactivating' using errcode='22023'; end if;
 update public.branches b set name=btrim(p_input->>'name'),address=btrim(p_input->>'address'),city=btrim(p_input->>'city'),area=nullif(btrim(p_input->>'area'),''),
 maps_url=nullif(p_input->>'mapsUrl',''),phone=nullif(p_input->>'phone',''),status=p_input->>'status',updated_at=clock_timestamp(),row_version=b.row_version+1
 where b.business_id=p_business_id and b.id=v_branch_id and b.row_version=(p_input->>'rowVersion')::integer;
 if not found then raise exception 'conflict' using errcode='40001'; end if;
 end if;
 perform app_private.write_hours(p_business_id,v_branch_id,p_input->'hours');
 perform app_private.audit(p_business_id,'branch.saved','branch',v_branch_id,p_correlation_id);
 return jsonb_build_object('branchId',v_branch_id);
end $$;

create function public.save_business_settings(p_business_id uuid,p_input jsonb,p_correlation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.businesses where id=p_business_id for update;
 perform app_private.authorize(p_business_id,null,true);
 perform app_private.strict_keys(p_input,array['rowVersion','name','description','accentHex','phone','supportEmail','menuUrl','reviewUrl','timezone']);
 update public.businesses set timezone=coalesce(p_input->>'timezone',timezone),display_name=btrim(p_input->>'name'),description=nullif(btrim(p_input->>'description'),''),accent_hex=p_input->>'accentHex',
 public_contact_phone=nullif(p_input->>'phone',''),support_email=nullif(p_input->>'supportEmail',''),menu_url=nullif(p_input->>'menuUrl',''),review_url=nullif(p_input->>'reviewUrl',''),
 updated_at=clock_timestamp(),row_version=row_version+1 where id=p_business_id and row_version=(p_input->>'rowVersion')::integer;
 if not found then raise exception 'conflict' using errcode='40001'; end if;
 perform app_private.audit(p_business_id,'business.settings_saved','business',p_business_id,p_correlation_id);
 return jsonb_build_object('businessId',p_business_id);
end $$;
alter table public.businesses add constraint business_phone check(public_contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
 add constraint support_email_shape check(char_length(support_email)<=254 and support_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
alter table public.branches add constraint branch_phone check(phone ~ '^\+[1-9][0-9]{7,14}$');
create function public.set_business_participation(p_business_id uuid,p_status text,p_row_version integer,p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.businesses where id=p_business_id for update;
 perform app_private.authorize(p_business_id,null,true);
 if p_status not in ('paused','active') or p_status is null then raise exception 'invalid_input' using errcode='22023'; end if;
 if p_status='active' and (not app_private.entitled(p_business_id) or not exists(select from public.branches where business_id=p_business_id and status='active')) then raise exception 'participation_unavailable' using errcode='22023'; end if;
 update public.businesses set status=p_status,updated_at=clock_timestamp(),row_version=row_version+1 where id=p_business_id and row_version=p_row_version and status in ('paused','active');
 if not found then raise exception 'conflict' using errcode='40001'; end if;
 perform app_private.audit(p_business_id,'business.'||p_status,'business',p_business_id,p_correlation_id);
 return jsonb_build_object('businessId',p_business_id,'status',p_status);
end $$;

create function public.update_profile(p_input jsonb,p_correlation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; p public.profiles; month integer; day integer; limited jsonb;
begin
 actor:=app_private.actor();
 limited:=app_private.limit_action('profile_settings',null,10); if limited is not null then return limited; end if;
 begin
 perform app_private.strict_keys(p_input,array['displayName','timezone','birthdayMonth','birthdayDay','updateMembershipNames','rowVersion']);
 select * into strict p from public.profiles where user_id=actor for update;
 month:=(p_input->>'birthdayMonth')::integer; day:=(p_input->>'birthdayDay')::integer;
 if p.row_version is distinct from (p_input->>'rowVersion')::integer then raise exception 'conflict' using errcode='40001'; end if;
 if month is not null and (month is distinct from p.birthday_month or day is distinct from p.birthday_day)
 and p.birthday_changed_at>clock_timestamp()-interval '365 days' then raise exception 'birthday_cooldown' using errcode='22023'; end if;
 update public.profiles set display_name=btrim(p_input->>'displayName'),preferred_timezone=p_input->>'timezone',birthday_month=month,birthday_day=day,
 birthday_changed_at=case when month is not null and (month is distinct from birthday_month or day is distinct from birthday_day) then clock_timestamp() else birthday_changed_at end,
 updated_at=clock_timestamp(),row_version=row_version+1 where user_id=actor;
 if coalesce((p_input->>'updateMembershipNames')::boolean,false) then
 update public.memberships set display_name=btrim(p_input->>'displayName'),updated_at=clock_timestamp(),row_version=row_version+1 where customer_user_id=actor and status<>'anonymized';
 end if;
 perform app_private.audit(null,'profile.updated','profile',actor,p_correlation_id);
 return jsonb_build_object('userId',actor);
 exception when integrity_constraint_violation or data_exception or sqlstate 'P0002' or sqlstate '42501' or sqlstate '40001' then
  return jsonb_build_object('error',jsonb_build_object('code','request_rejected','sqlState',SQLSTATE));
 end;
end $$;

-- Public output contains only accepted, non-private versioned rendition paths.
create function public.public_brand_media(p_slug text) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('logo',(select storage_path from public.media_assets a where a.business_id=b.id and a.id=b.logo_asset_id and a.kind='logo' and a.validation_status='accepted' and a.visibility='public_brand'),
 'cover',(select storage_path from public.media_assets a where a.business_id=b.id and a.id=b.cover_asset_id and a.kind='cover' and a.validation_status='accepted' and a.visibility='public_brand'))
 from public.businesses b where b.slug=p_slug and b.status in ('active','paused') and b.published_at<=statement_timestamp()
$$;
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname=any(array['save_branch','save_business_settings','set_business_participation','update_profile','public_brand_media']) loop
 execute format('revoke all on function %s from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',f);
 execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
grant execute on function public.public_brand_media(text) to anon;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
