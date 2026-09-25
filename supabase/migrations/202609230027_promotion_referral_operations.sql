begin;

create function app_private.referral_code_valid(p_code text) returns boolean language sql immutable set search_path='' as $$
 select p_code collate "C" ~ '^[A-Za-z0-9_-]{21}[AEIMQUYcgkosw048]$'
$$;
create function app_private.current_referral_rule(p_business uuid) returns public.referral_rule_versions
 language sql volatile set search_path='' as $$
 select r from public.referral_rule_versions r where r.business_id=p_business and r.effective_at<=clock_timestamp()
 order by r.effective_at desc,r.id desc limit 1
$$;

create function public.save_promotion(p_business uuid,p_input jsonb,p_correlation uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare actor uuid; promo public.earning_promotions; v public.promotion_versions; tz text; branches uuid[]; weekdays integer[];
 existing uuid; version_no integer; branch uuid; start_date date; end_date date; start_time time; end_time time; effective timestamptz;
begin
 perform app_private.strict_keys(p_input,array['promotionId','rowVersion','name','branchIds','startsOn','endsOn','weekdays',
 'startsAt','endsAt','minimumSpendPaisa','memberDailyCap','maxBonusUnitsPerPurchase','effectiveAt']);
 actor:=app_private.actor(true);
 perform app_private.authorize(p_business,null,true);
 select timezone into tz from public.businesses where id=p_business for update;
 if tz is null then raise exception 'not_found' using errcode='P0002'; end if;
 branches:=array(select jsonb_array_elements_text(p_input->'branchIds')::uuid);
 weekdays:=array(select jsonb_array_elements_text(p_input->'weekdays')::integer);
 start_date:=(p_input->>'startsOn')::date; end_date:=(p_input->>'endsOn')::date;
 start_time:=(p_input->>'startsAt')::time; end_time:=(p_input->>'endsAt')::time;
 effective:=(p_input->>'effectiveAt')::timestamptz;
 if char_length(btrim(coalesce(p_input->>'name',''))) not between 2 and 80 or start_date is null or end_date is null
 or end_date<start_date or end_date-start_date>365 or start_time is null or end_time is null or start_time>=end_time
 or effective is null or effective<clock_timestamp()-interval '1 minute'
 or array_length(branches,1) is null or array_length(weekdays,1) is null
 or cardinality(branches)<>cardinality(array(select distinct unnest(branches)))
 or cardinality(weekdays)<>cardinality(array(select distinct unnest(weekdays)))
 or not (weekdays <@ array[1,2,3,4,5,6,7]) then raise exception 'invalid_input' using errcode='22023'; end if;
 if (p_input->>'minimumSpendPaisa')::bigint not between 0 and 100000000
 or (p_input->>'maxBonusUnitsPerPurchase')::integer not between 1 and 100000
 or ((p_input->>'memberDailyCap') is not null and (p_input->>'memberDailyCap')::integer not between 1 and 100) then
 raise exception 'invalid_input' using errcode='22023'; end if;
 foreach branch in array branches loop
  perform 1 from public.branches where business_id=p_business and id=branch and status='active';
  if not found then raise exception 'invalid_branch' using errcode='22023'; end if;
 end loop;
 if p_input->>'promotionId' is null then
  insert into public.earning_promotions(business_id,name,created_by) values(p_business,btrim(p_input->>'name'),actor) returning * into promo;
 else
  select * into promo from public.earning_promotions where business_id=p_business and id=(p_input->>'promotionId')::uuid for update;
  if promo.id is null then raise exception 'not_found' using errcode='P0002'; end if;
  if promo.row_version<>(p_input->>'rowVersion')::integer then raise exception 'stale' using errcode='40001'; end if;
  update public.earning_promotions set name=btrim(p_input->>'name'),row_version=row_version+1 where id=promo.id returning * into promo;
 end if;
 select coalesce(max(version),0)+1 into version_no from public.promotion_versions where business_id=p_business and promotion_id=promo.id;
 insert into public.promotion_versions(business_id,promotion_id,version,starts_on,ends_on,weekdays,starts_at,ends_at,timezone,
 minimum_spend_paisa,member_daily_cap,max_bonus_units_per_purchase,effective_at,created_by)
 values(p_business,promo.id,version_no,start_date,end_date,weekdays,start_time,end_time,tz,
 (p_input->>'minimumSpendPaisa')::bigint,(p_input->>'memberDailyCap')::integer,
 (p_input->>'maxBonusUnitsPerPurchase')::integer,effective,actor) returning * into v;
 insert into public.promotion_branches(business_id,promotion_version_id,branch_id)
 select p_business,v.id,unnest(branches);
 perform app_private.audit(p_business,'promotion.draft_saved','promotion',promo.id,p_correlation,jsonb_build_object('version',version_no));
 return jsonb_build_object('promotionId',promo.id,'promotionVersionId',v.id,'rowVersion',promo.row_version,'version',version_no);
end $$;

create function public.publish_promotion(p_business uuid,p_promotion uuid,p_version uuid,p_row_version integer,p_enable boolean,p_correlation uuid)
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
  if clash is not null then raise exception 'promotion_overlap' using errcode='40001',detail=clash::text; end if;
 end if;
 update public.promotion_versions set status='published',published_at=clock_timestamp() where id=v.id;
 update public.earning_promotions set status=case when p_enable then 'enabled' else status end,
 current_version_id=v.id,row_version=row_version+1 where id=promo.id returning * into promo;
 perform app_private.audit(p_business,'promotion.published','promotion',promo.id,p_correlation,jsonb_build_object('versionId',v.id,'enabled',p_enable));
 return jsonb_build_object('promotionId',promo.id,'promotionVersionId',v.id,'status',promo.status,'rowVersion',promo.row_version);
end $$;

create function public.set_promotion_status(p_business uuid,p_promotion uuid,p_status text,p_row_version integer,p_correlation uuid)
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
  if clash is not null then raise exception 'promotion_overlap' using errcode='40001',detail=clash::text; end if;
 end if;
 update public.earning_promotions set status=p_status,row_version=row_version+1 where id=promo.id returning * into promo;
 perform app_private.audit(p_business,'promotion.'||p_status,'promotion',p_promotion,p_correlation);
 return jsonb_build_object('promotionId',p_promotion,'status',p_status,'rowVersion',promo.row_version);
end $$;

create function public.promotion_configuration(p_business uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.business_users;
begin
 item:=app_private.authorize(p_business);
 if item.role<>'owner' then raise exception 'forbidden' using errcode='42501'; end if;
 return jsonb_build_object('timezone',(select timezone from public.businesses where id=p_business),
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

create function public.save_referral_rules(p_business uuid,p_input jsonb,p_correlation uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare r public.referral_rule_versions; actor uuid; version_no integer;
begin
 perform app_private.strict_keys(p_input,array['enabled','inviterBonusUnits','friendBonusUnits','minimumSpendPaisa',
 'monthlyInviterCap','attributionDays','qualificationDays']);
 actor:=app_private.actor(true);
 perform app_private.authorize(p_business,null,true);
 perform 1 from public.businesses where id=p_business for update;
 if (p_input->>'inviterBonusUnits')::integer not between 1 and 1000
 or (p_input->>'friendBonusUnits')::integer not between 1 and 1000
 or (p_input->>'minimumSpendPaisa')::bigint not between 0 and 100000000
 or (p_input->>'monthlyInviterCap')::integer not between 1 and 1000
 or (p_input->>'attributionDays')::integer not between 1 and 30
 or (p_input->>'qualificationDays')::integer not between 1 and 90
 or (p_input->>'enabled')::boolean is null then raise exception 'invalid_input' using errcode='22023'; end if;
 select coalesce(max(version),0)+1 into version_no from public.referral_rule_versions where business_id=p_business;
 insert into public.referral_rule_versions(business_id,version,effective_at,enabled,inviter_bonus_units,friend_bonus_units,
 minimum_spend_paisa,monthly_inviter_cap,attribution_days,qualification_days,created_by)
 values(p_business,version_no,clock_timestamp(),(p_input->>'enabled')::boolean,(p_input->>'inviterBonusUnits')::integer,
 (p_input->>'friendBonusUnits')::integer,(p_input->>'minimumSpendPaisa')::bigint,
 (p_input->>'monthlyInviterCap')::integer,(p_input->>'attributionDays')::integer,
 (p_input->>'qualificationDays')::integer,actor) returning * into r;
 perform app_private.audit(p_business,'referral.rules_published','referral_rule',r.id,p_correlation,jsonb_build_object('version',r.version,'enabled',r.enabled));
 return jsonb_build_object('ruleVersionId',r.id,'version',r.version,'enabled',r.enabled,'effectiveAt',r.effective_at);
end $$;

create function public.my_referral_code(p_member uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.memberships; code public.referral_codes; raw text; attempt integer; r public.referral_rule_versions; stats jsonb;
begin
 select * into m from public.memberships where id=p_member and customer_user_id=app_private.actor() and status<>'anonymized' for share;
 if m.id is null then raise exception 'not_found' using errcode='P0002'; end if;
 select jsonb_build_object('signups',count(*),'qualified',count(*) filter(where c.status='qualified'),
  'pending',count(*) filter(where c.status='pending' and c.qualifies_until>clock_timestamp()),
  'expired',count(*) filter(where c.status='expired' or c.status='pending' and c.qualifies_until<=clock_timestamp()),
  'reversed',count(*) filter(where c.status='reversed'),
  'earnedUnits',coalesce(sum(c.inviter_awarded_units) filter(where c.status='qualified'),0)) into stats
 from public.referral_claims c where c.business_id=m.business_id and c.referrer_membership_id=m.id;
 select * into r from app_private.current_referral_rule(m.business_id);
 if m.status<>'active' or r.id is null or not r.enabled or not exists(select from public.businesses where id=m.business_id and status='active')
  or not exists(select from public.loyalty_programmes where business_id=m.business_id and status='published') then
 return jsonb_build_object('available',false,'stats',stats); end if;
 select * into code from public.referral_codes where business_id=m.business_id and membership_id=m.id and active for update;
 if code.id is null then
  for attempt in 1..5 loop
   raw:=rtrim(translate(encode(extensions.gen_random_bytes(16),'base64'),'+/','-_'),'=');
   begin
    insert into public.referral_codes(business_id,membership_id,code) values(m.business_id,m.id,raw) returning * into code;
    exit;
   exception when unique_violation then
    if exists(select from public.referral_codes where business_id=m.business_id and membership_id=m.id and active) then
     select * into code from public.referral_codes where business_id=m.business_id and membership_id=m.id and active; exit;
    end if;
   end;
  end loop;
  if code.id is null then raise exception 'code_unavailable' using errcode='40001'; end if;
 end if;
 return jsonb_build_object('available',true,'code',code.code,'businessId',m.business_id,'stats',stats);
end $$;

create function public.resolve_referral(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare code public.referral_codes; r public.referral_rule_versions; b public.businesses;
begin
 if not app_private.referral_code_valid(p_code) then return null; end if;
 select * into code from public.referral_codes rc where rc.code=p_code and rc.active;
 if code.id is null then return null; end if;
 select * into b from public.businesses where id=code.business_id and status='active';
 select * into r from app_private.current_referral_rule(code.business_id);
 if b.id is null or r.id is null or not r.enabled or not exists(select from public.memberships where business_id=code.business_id and id=code.membership_id and status='active')
 or not exists(select from public.loyalty_programmes where business_id=code.business_id and status='published') then return null; end if;
 return jsonb_build_object('businessId',b.id,'businessSlug',b.slug,'attributionDays',r.attribution_days);
end $$;

create function public.gateway_issue_referral_grant(p_auth_user uuid,p_session uuid,p_slug text,p_code text,p_seen_at timestamptz,p_token_hash text)
 returns boolean language plpgsql security definer set search_path='' as $$
declare code public.referral_codes; r public.referral_rule_versions; b public.businesses;
begin
 if p_token_hash !~ '^[a-f0-9]{64}$' or not app_private.referral_code_valid(p_code)
  or p_seen_at is null or p_seen_at>clock_timestamp()+interval '30 seconds' then return false; end if;
 select * into b from public.businesses where slug=p_slug and status='active';
 if b.id is null then return false; end if;
 select * into code from public.referral_codes rc where rc.business_id=b.id and rc.code=p_code and rc.active;
 select * into r from app_private.current_referral_rule(b.id);
 if code.id is null or r.id is null or not r.enabled or p_seen_at+make_interval(days=>r.attribution_days)<=clock_timestamp()+interval '1 second'
  or not exists(select from public.loyalty_programmes where business_id=b.id and status='published')
  or not exists(select from public.memberships where business_id=b.id and id=code.membership_id and status='active')
  or exists(select from public.memberships where business_id=b.id and customer_user_id=(select user_id from public.profiles where auth_user_id=p_auth_user))
  or not exists(select from auth.users u join auth.sessions s on s.user_id=u.id and s.id=p_session
   where u.id=p_auth_user and u.email_confirmed_at is not null and u.deleted_at is null and not coalesce(u.is_anonymous,false)
   and (s.not_after is null or s.not_after>clock_timestamp())) then return false; end if;
 insert into app_private.referral_attribution_grants(token_hash,business_id,code_id,auth_user_id,session_id,seen_at,expires_at)
 values(p_token_hash,b.id,code.id,p_auth_user,p_session,p_seen_at,
  least(clock_timestamp()+interval '10 minutes',p_seen_at+make_interval(days=>r.attribution_days)));
 return true;
end $$;

create function public.join_business_referral(p_input jsonb,p_grant_hash text,p_correlation_id uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare code public.referral_codes; r public.referral_rule_versions; result jsonb; m public.memberships;
 b public.businesses; g app_private.referral_attribution_grants;
begin
 perform app_private.actor();
 select * into b from public.businesses where slug=p_input->>'businessSlug';
 if p_grant_hash is not null and p_grant_hash<>'' then
  if p_grant_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_grant' using errcode='42501'; end if;
  select * into g from app_private.referral_attribution_grants where token_hash=p_grant_hash for update;
  if g.token_hash is null or g.business_id is distinct from b.id or g.auth_user_id<>auth.uid()
   or g.session_id is distinct from nullif(auth.jwt()->>'session_id','')::uuid
   or g.consumed_at is not null or g.expires_at<=clock_timestamp() then raise exception 'invalid_grant' using errcode='42501'; end if;
  select * into code from public.referral_codes where id=g.code_id and business_id=b.id;
 end if;
 result:=public.join_business(p_input,p_correlation_id);
 if result->>'status'='created' and code.id is not null then
  -- join_business holds the business row. Recheck after that lock, so a pause
  -- racing enrollment cannot attach a stale claim.
  select * into r from app_private.current_referral_rule(b.id);
  if r.id is not null and r.enabled and g.seen_at+make_interval(days=>r.attribution_days)>clock_timestamp()
   and exists(select from public.referral_codes where id=code.id and active)
   and exists(select from public.memberships where business_id=b.id and id=code.membership_id and status='active')
   and code.membership_id is distinct from (result->>'membershipId')::uuid then
   select * into m from public.memberships where id=(result->>'membershipId')::uuid;
   insert into public.referral_claims(business_id,referrer_membership_id,referred_membership_id,code_id,rule_version_id,enrolled_at,qualifies_until)
   values(b.id,code.membership_id,m.id,code.id,r.id,m.joined_at,m.joined_at+make_interval(days=>r.qualification_days));
   result:=result||jsonb_build_object('referralApplied',true);
  end if;
 end if;
 if g.token_hash is not null and result->>'status' in ('created','existing','reactivated') then
  update app_private.referral_attribution_grants set consumed_at=clock_timestamp() where token_hash=g.token_hash;
 end if;
 return result;
end $$;

create function public.worker_purge_referral_grants() returns integer language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
 delete from app_private.referral_attribution_grants where expires_at<clock_timestamp()-interval '1 day';
 get diagnostics removed=row_count;
 return removed;
end $$;

create function public.referral_configuration(p_business uuid,p_start date,p_end date,p_status text,p_branch uuid,p_page integer,p_size integer)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare staff public.business_users; r public.referral_rule_versions; summary jsonb; rows_json jsonb; total bigint;
 tz text; lower_bound timestamptz; upper_bound timestamptz;
begin
 staff:=app_private.authorize(p_business);
 if staff.role<>'owner' and staff.role<>'manager' then raise exception 'forbidden' using errcode='42501'; end if;
 if p_branch is not null then perform app_private.authorize(p_business,p_branch); end if;
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>366
  or p_status not in ('all','pending','qualified','expired','reversed') or p_page not between 0 and 10000 or p_size not in (25,50,100) then
 raise exception 'invalid_input' using errcode='22023'; end if;
 select timezone into tz from public.businesses where id=p_business;
 lower_bound:=p_start::timestamp at time zone tz;
 upper_bound:=(p_end+1)::timestamp at time zone tz;
 select * into r from app_private.current_referral_rule(p_business);
 with scoped as (
  select c.*,coalesce(p.branch_id,m.joined_branch_id) branch_id,
   case when c.status='pending' and c.qualifies_until<=clock_timestamp() then 'expired' else c.status end display_status
  from public.referral_claims c join public.memberships m on m.business_id=c.business_id and m.id=c.referred_membership_id
   left join public.purchases p on p.business_id=c.business_id and p.id=c.qualifying_purchase_id
  where c.business_id=p_business and c.enrolled_at>=lower_bound and c.enrolled_at<upper_bound
 ) select jsonb_build_object('signups',count(*),'qualified',count(*) filter(where display_status='qualified'),
  'pending',count(*) filter(where display_status='pending'),'expired',count(*) filter(where display_status='expired'),
  'reversed',count(*) filter(where display_status='reversed'),
  'inviterUnits',coalesce(sum(inviter_awarded_units) filter(where display_status='qualified'),0),
  'friendUnits',coalesce(sum(friend_awarded_units) filter(where display_status='qualified'),0)) into summary
 from scoped s where (p_branch is null or s.branch_id=p_branch)
 and (staff.role='owner' or exists(select from public.branch_assignments a where a.business_id=p_business
  and a.business_user_id=staff.id and a.branch_id=s.branch_id));
 with scoped as (
  select c.*,coalesce(p.branch_id,m.joined_branch_id) branch_id,p.receipt_reference,
   case when c.status='pending' and c.qualifies_until<=clock_timestamp() then 'expired' else c.status end display_status
  from public.referral_claims c join public.memberships m on m.business_id=c.business_id and m.id=c.referred_membership_id
   left join public.purchases p on p.business_id=c.business_id and p.id=c.qualifying_purchase_id
  where c.business_id=p_business and c.enrolled_at>=lower_bound and c.enrolled_at<upper_bound
 ), filtered as (
  select s.* from scoped s where (p_branch is null or s.branch_id=p_branch)
   and (staff.role='owner' or exists(select from public.branch_assignments a where a.business_id=p_business
    and a.business_user_id=staff.id and a.branch_id=s.branch_id))
   and (p_status='all' or s.display_status=p_status)
 ) select count(*) into total from filtered;
 with scoped as (
  select c.*,coalesce(p.branch_id,m.joined_branch_id) branch_id,p.receipt_reference,
   case when c.status='pending' and c.qualifies_until<=clock_timestamp() then 'expired' else c.status end display_status
  from public.referral_claims c join public.memberships m on m.business_id=c.business_id and m.id=c.referred_membership_id
   left join public.purchases p on p.business_id=c.business_id and p.id=c.qualifying_purchase_id
  where c.business_id=p_business and c.enrolled_at>=lower_bound and c.enrolled_at<upper_bound
 ), page_rows as (
  select s.* from scoped s where (p_branch is null or s.branch_id=p_branch)
   and (staff.role='owner' or exists(select from public.branch_assignments a where a.business_id=p_business
    and a.business_user_id=staff.id and a.branch_id=s.branch_id))
   and (p_status='all' or s.display_status=p_status)
  order by s.enrolled_at desc,s.id desc limit p_size offset p_page*p_size
 ) select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'enrolledAt',x.enrolled_at,'status',x.display_status,
  'friendLabel','Friend '||left(md5(x.id::text),6),'branchId',x.branch_id,
  'qualifyingPurchaseId',x.qualifying_purchase_id,'qualifyingReceipt',x.receipt_reference,
  'inviterUnits',x.inviter_awarded_units,'friendUnits',x.friend_awarded_units,'suppression',x.inviter_suppression,
  'reviewSignal',case when exists(select from public.membership_contacts a join public.membership_contacts f
   on f.business_id=a.business_id and f.phone_e164=a.phone_e164
   where a.business_id=p_business and a.membership_id=x.referrer_membership_id
   and f.membership_id=x.referred_membership_id and a.phone_e164 is not null)
   then 'shared_unverified_phone' else 'none' end) order by x.enrolled_at desc,x.id desc),'[]'::jsonb)
 into rows_json from page_rows x;
 return jsonb_build_object('timezone',tz,'startDate',p_start,'endDate',p_end,'canEdit',staff.role='owner',
  'rule',case when r.id is null then null else jsonb_build_object('id',r.id,'version',r.version,'enabled',r.enabled,
  'inviterBonusUnits',r.inviter_bonus_units,'friendBonusUnits',r.friend_bonus_units,'minimumSpendPaisa',r.minimum_spend_paisa::text,
  'monthlyInviterCap',r.monthly_inviter_cap,'attributionDays',r.attribution_days,'qualificationDays',r.qualification_days) end,
  'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',br.id,'name',br.name) order by br.name),'[]'::jsonb)
   from public.branches br where br.business_id=p_business and br.status='active' and
   (staff.role='owner' or exists(select from public.branch_assignments a where a.business_id=p_business
    and a.business_user_id=staff.id and a.branch_id=br.id))),
  'metrics',summary,'total',total,'page',p_page,'pageSize',p_size,'results',rows_json);
end $$;

do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('save_promotion','publish_promotion','set_promotion_status','promotion_configuration','save_referral_rules',
 'my_referral_code','resolve_referral','join_business_referral','referral_configuration') loop
 execute format('revoke all on function %s from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',f);
 if f::text like 'resolve_referral%' then execute format('grant execute on function %s to anon,authenticated',f);
 else execute format('grant execute on function %s to authenticated',f); end if;
 end loop;
end $$;
revoke all on function public.gateway_issue_referral_grant(uuid,uuid,text,text,timestamptz,text),
 public.worker_purge_referral_grants() from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.gateway_issue_referral_grant(uuid,uuid,text,text,timestamptz,text) to loyalty_web_gateway;
grant execute on function public.worker_purge_referral_grants() to loyalty_worker;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
