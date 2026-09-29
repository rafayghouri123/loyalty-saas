begin;

CREATE OR REPLACE FUNCTION public.save_initial_programme(p_business_id uuid, p_input jsonb, p_correlation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare staff public.business_users; prog uuid; ver uuid; r uuid; rv uuid; br uuid;
begin
 perform 1 from public.businesses where id=p_business_id for update;
 staff:=app_private.authorize(p_business_id,null,true);
 perform app_private.strict_keys(p_input,array['type','name','minimumSpendPaisa','stampsPerPurchase','spendStepPaisa','unitsPerStep','maxBaseUnitsPerPurchase','terms',
 'rewardTitle','rewardUnitCost','rewardDescription','rewardTerms','rewardBranchIds','estimatedCostPaisa','rowVersion']);
 if not exists(select from public.businesses where id=p_business_id and status='draft' and row_version=(p_input->>'rowVersion')::integer) then raise exception 'conflict' using errcode='40001'; end if;
 if jsonb_typeof(p_input->'rewardBranchIds') is distinct from 'array' or jsonb_array_length(p_input->'rewardBranchIds')<1 then raise exception 'invalid_input' using errcode='22023'; end if;
 select id into prog from public.loyalty_programmes where business_id=p_business_id and is_primary;
 if prog is not null then
 -- Draft versions remain retained; new versions never rewrite a published commitment.
 if exists(select from public.programme_versions where programme_id=prog and status='published') then raise exception 'conflict' using errcode='40001'; end if;
 update public.loyalty_programmes set type=p_input->>'type',name=btrim(p_input->>'name'),row_version=row_version+1,updated_at=clock_timestamp() where id=prog;
 else
 insert into public.loyalty_programmes(business_id,type,name) values(p_business_id,p_input->>'type',btrim(p_input->>'name')) returning id into prog;
 end if;
 insert into public.programme_versions(business_id,programme_id,version,effective_at,minimum_spend_paisa,stamps_per_purchase,spend_step_paisa,units_per_step,max_base_units_per_purchase,terms,created_by)
 values(p_business_id,prog,(select coalesce(max(version),0)+1 from public.programme_versions where programme_id=prog),clock_timestamp(),
 (p_input->>'minimumSpendPaisa')::bigint,(p_input->>'stampsPerPurchase')::integer,(p_input->>'spendStepPaisa')::bigint,(p_input->>'unitsPerStep')::integer,
 (p_input->>'maxBaseUnitsPerPurchase')::integer,btrim(p_input->>'terms'),staff.user_id) returning id into ver;
 select id into r from public.rewards where programme_id=prog order by created_at,id limit 1;
 if r is null then insert into public.rewards(business_id,programme_id,name) values(p_business_id,prog,btrim(p_input->>'rewardTitle')) returning id into r; end if;
 insert into public.reward_versions(business_id,reward_id,version,unit_cost,title,description,terms,estimated_cost_paisa,created_by)
 values(p_business_id,r,(select coalesce(max(version),0)+1 from public.reward_versions where reward_id=r),(p_input->>'rewardUnitCost')::integer,
 btrim(p_input->>'rewardTitle'),coalesce(btrim(p_input->>'rewardDescription'),''),btrim(p_input->>'rewardTerms'),(p_input->>'estimatedCostPaisa')::bigint,staff.user_id) returning id into rv;
 for br in select value::uuid from jsonb_array_elements_text(p_input->'rewardBranchIds') loop
 perform 1 from public.branches where business_id=p_business_id and id=br and status='active';
 if not found then raise exception 'invalid_branch' using errcode='22023'; end if;
 insert into public.reward_branches(business_id,reward_version_id,branch_id) values(p_business_id,rv,br);
 end loop;
 update public.rewards set name=p_input->>'rewardTitle',draft_version_id=rv,updated_at=clock_timestamp(),row_version=row_version+1 where id=r;
 update public.businesses set row_version=row_version+1,updated_at=clock_timestamp() where id=p_business_id;
 perform app_private.audit(p_business_id,'programme.draft_saved','programme',prog,p_correlation_id);
 return jsonb_build_object('programmeVersionId',ver,'rewardVersionId',rv);
end $function$
;

CREATE OR REPLACE FUNCTION public.publish_business(p_business_id uuid, p_row_version integer, p_correlation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare prog uuid; ver uuid; staff public.business_users; stamp timestamptz;
begin
 perform 1 from public.businesses where id=p_business_id for update;
 staff:=app_private.authorize(p_business_id,null,true);
 if not exists(select from public.businesses where id=p_business_id and row_version=p_row_version and status='draft') then raise exception 'conflict' using errcode='40001'; end if;
 if not app_private.entitled(p_business_id) or app_private.policy('platform_terms') is null or app_private.policy('privacy') is null then
 raise exception 'publication_incomplete' using errcode='22023'; end if;
 select id into prog from public.loyalty_programmes where business_id=p_business_id and is_primary and status='draft';
 select id into ver from public.programme_versions where programme_id=prog and status='draft' order by version desc limit 1;
 if ver is null or not exists(select from public.branches where business_id=p_business_id and status='active')
 or not exists(select from public.rewards r join public.reward_versions v on v.id=r.draft_version_id
 where r.programme_id=prog and exists(select from public.reward_branches rb join public.branches b on b.business_id=rb.business_id and b.id=rb.branch_id
 where rb.reward_version_id=v.id and b.status='active')) then raise exception 'publication_incomplete' using errcode='22023'; end if;
 stamp:=clock_timestamp();
 update public.programme_versions set status='published',effective_at=stamp,published_at=stamp where id=ver;
 update public.loyalty_programmes set status='published',updated_at=stamp,row_version=row_version+1 where id=prog;
 update public.rewards set status='published',published_version_id=draft_version_id,draft_version_id=null,updated_at=stamp,row_version=row_version+1 where programme_id=prog;
 update public.businesses set status='active',published_at=stamp,updated_at=stamp,row_version=row_version+1 where id=p_business_id;
 perform app_private.audit(p_business_id,'business.published','business',p_business_id,p_correlation_id);
 return jsonb_build_object('businessId',p_business_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.business_setup(p_business_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare staff public.business_users;
begin
 staff:=app_private.authorize(p_business_id);
 if staff.role<>'owner' then raise exception 'forbidden' using errcode='42501'; end if;
 return jsonb_build_object('business',(select to_jsonb(b)-'created_by' from public.businesses b where id=p_business_id),
 'branches',(select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('hours',(select coalesce(jsonb_agg(jsonb_build_object('weekday',h.weekday,'opensAt',h.opens_at,'closesAt',h.closes_at)),'[]'::jsonb) from public.branch_hours h where h.branch_id=b.id))),'[]'::jsonb) from public.branches b where b.business_id=p_business_id),
 'programme',(select to_jsonb(p) from public.loyalty_programmes p where p.business_id=p_business_id and p.is_primary),
 'programmeVersion',(select to_jsonb(v)||jsonb_build_object('minimum_spend_paisa',v.minimum_spend_paisa::text,'spend_step_paisa',v.spend_step_paisa::text,
 'stamps_per_purchase',v.stamps_per_purchase::text,'units_per_step',v.units_per_step::text,'max_base_units_per_purchase',v.max_base_units_per_purchase::text) from public.programme_versions v join public.loyalty_programmes p on p.id=v.programme_id and p.is_primary where v.business_id=p_business_id order by v.version desc limit 1),
 'rewardVersion',(select to_jsonb(v)||jsonb_build_object('unit_cost',v.unit_cost::text,'estimated_cost_paisa',v.estimated_cost_paisa::text,
 'branch_ids',(select coalesce(jsonb_agg(rb.branch_id),'[]'::jsonb) from public.reward_branches rb where rb.reward_version_id=v.id))
 from public.rewards r join public.reward_versions v on v.id=coalesce(r.draft_version_id,r.published_version_id) where r.business_id=p_business_id and r.programme_id=(select id from public.loyalty_programmes where business_id=p_business_id and is_primary) order by r.created_at,r.id limit 1),
 'rewards',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.rewards r where r.business_id=p_business_id and r.programme_id=(select id from public.loyalty_programmes where business_id=p_business_id and is_primary)),
 'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.staff_display_name,'email',u.staff_email,'role',u.role,'status',u.status,'rowVersion',u.row_version,
 'canManageCampaigns',u.can_manage_campaigns,'canContactCustomers',u.can_contact_customers,'canReverseTransactions',u.can_reverse_transactions,'canExportReports',u.can_export_reports,
 'branchIds',(select coalesce(jsonb_agg(a.branch_id),'[]'::jsonb) from public.branch_assignments a where a.business_user_id=u.id))),'[]'::jsonb) from public.business_users u where u.business_id=p_business_id),
 'invitations',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role,'status',case when i.status='pending' and i.expires_at<=clock_timestamp() then 'expired' else i.status end,
 'expiresAt',i.expires_at,'rowVersion',i.row_version,'branchIds',(select jsonb_agg(ib.branch_id) from public.invitation_branches ib where ib.invitation_id=i.id))),'[]'::jsonb) from public.staff_invitations i where i.business_id=p_business_id),
 'subscription',(select jsonb_build_object('status',s.status,'periodEnd',s.period_end,'entitled',app_private.entitled(p_business_id),
 'withinGrace',s.period_end<=clock_timestamp() and app_private.entitled(p_business_id),'graceEndsAt',coalesce(s.grace_ends_at,s.period_end+interval '7 days')) from public.subscriptions s where s.business_id=p_business_id));
end $function$
;

CREATE OR REPLACE FUNCTION public.public_business(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.businesses; prog public.loyalty_programmes; v public.programme_versions;
begin
 select * into b from public.businesses where slug=p_slug and status in ('active','paused') and published_at<=clock_timestamp();
 if not found then return null; end if;
 select * into prog from public.loyalty_programmes where business_id=b.id and is_primary and status in ('published','paused');
 select * into v from public.programme_versions where programme_id=prog.id and status='published' and effective_at<=clock_timestamp() order by effective_at desc limit 1;
 if v.id is null then return null; end if;
 return jsonb_build_object('id',b.id,'slug',b.slug,'name',b.display_name,'description',b.description,'accentHex',b.accent_hex,
 'status',b.status,'timezone',b.timezone,'menuUrl',b.menu_url,'reviewUrl',b.review_url,'phone',b.public_contact_phone,
 'canJoin',b.status='active' and prog.status='published' and app_private.entitled(b.id) and app_private.policy('platform_terms') is not null and app_private.policy('privacy') is not null,
 'programme',jsonb_build_object('id',v.id,'type',prog.type,'name',prog.name,'terms',v.terms,'minimumSpendPaisa',v.minimum_spend_paisa::text,
 'stampsPerPurchase',v.stamps_per_purchase::text,'spendStepPaisa',v.spend_step_paisa::text,'unitsPerStep',v.units_per_step::text,'maxBaseUnitsPerPurchase',v.max_base_units_per_purchase::text),
 'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',br.id,'name',br.name,'address',br.address,'city',br.city,'mapsUrl',br.maps_url,
 'hours',(select coalesce(jsonb_agg(jsonb_build_object('weekday',h.weekday,'opensAt',h.opens_at,'closesAt',h.closes_at) order by h.weekday,h.opens_at),'[]'::jsonb)
 from public.branch_hours h where h.business_id=b.id and h.branch_id=br.id)) order by br.created_at,br.id),'[]'::jsonb) from public.branches br where br.business_id=b.id and br.status='active'),
 'rewards',(select coalesce(jsonb_agg(jsonb_build_object('id',rv.id,'title',rv.title,'unitCost',rv.unit_cost::text,'description',rv.description,'terms',rv.terms,
 'branchIds',(select jsonb_agg(rb.branch_id) from public.reward_branches rb where rb.reward_version_id=rv.id))),'[]'::jsonb)
 from public.rewards r join public.reward_versions rv on rv.id=r.published_version_id where r.business_id=b.id and r.programme_id=prog.id and r.status='published'));
end $function$
;

CREATE OR REPLACE FUNCTION public.join_business(p_input jsonb, p_correlation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid; b public.businesses; m public.memberships; v uuid; prog uuid; stamp timestamptz; email text; limited jsonb; member_limit integer; outcome text;
begin
 actor:=app_private.actor();
 limited:=app_private.limit_action('join_business',null,10); if limited is not null then return limited; end if;
 begin
 perform app_private.strict_keys(p_input,array['businessSlug','branchId','displayName','shareVerifiedEmail','phone','whatsappMarketingConsent',
 'acceptedProgrammeVersionId','platformTermsDocumentId','privacyDocumentId','rejoin']);
 select * into b from public.businesses where slug=p_input->>'businessSlug' for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 select p.id,pv.id into prog,v from public.loyalty_programmes p join public.programme_versions pv on pv.programme_id=p.id
 where p.business_id=b.id and p.status='published' and pv.id=(p_input->>'acceptedProgrammeVersionId')::uuid
 and pv.status='published' and pv.effective_at<=clock_timestamp()
 and pv.id=(select current_version.id from public.programme_versions current_version
   where current_version.programme_id=p.id and current_version.status='published' and current_version.effective_at<=clock_timestamp()
   order by current_version.effective_at desc,current_version.id desc limit 1);
 select * into m from public.memberships where business_id=b.id and programme_id=prog and customer_user_id=actor for update;
 if m.status='active' then return jsonb_build_object('membershipId',m.id,'status','existing','cardRoute','/app/cards/'||m.id); end if;
 if m.id is not null and (m.status<>'left' or not coalesce((p_input->>'rejoin')::boolean,false)) then raise exception 'forbidden' using errcode='42501'; end if;
 if b.status<>'active' or not app_private.entitled(b.id) then raise exception 'participation_unavailable' using errcode='42501'; end if;
 if v is null or v is distinct from (p_input->>'acceptedProgrammeVersionId')::uuid
 or app_private.policy('platform_terms') is null or app_private.policy('privacy') is null
 or app_private.policy('platform_terms') is distinct from (p_input->>'platformTermsDocumentId')::uuid
 or app_private.policy('privacy') is distinct from (p_input->>'privacyDocumentId')::uuid then raise exception 'stale_terms' using errcode='40001'; end if;
 stamp:=clock_timestamp();
 if m.id is not null then
 update public.memberships set status='active',left_at=null,updated_at=stamp,row_version=row_version+1 where id=m.id returning * into m;
 perform app_private.deny_all_consent(m); outcome:='reactivated';
 else
 if coalesce((p_input->>'rejoin')::boolean,false) then raise exception 'invalid_input' using errcode='22023'; end if;
 perform 1 from public.branches where business_id=b.id and id=(p_input->>'branchId')::uuid and status='active';
 if not found then raise exception 'invalid_branch' using errcode='22023'; end if;
 select pv.member_limit into member_limit from public.subscriptions s join public.plan_versions pv on pv.id=s.plan_version_id where s.business_id=b.id;
 if member_limit is not null and (select count(*) from public.memberships where business_id=b.id and status<>'anonymized')>=member_limit then raise exception 'member_limit' using errcode='22023'; end if;
 insert into public.memberships(business_id,programme_id,customer_user_id,display_name,joined_at,joined_branch_id)
 values(b.id,prog,actor,btrim(p_input->>'displayName'),stamp,(p_input->>'branchId')::uuid) returning * into m;
 if coalesce((p_input->>'shareVerifiedEmail')::boolean,false) then select u.email into email from auth.users u where u.id=auth.uid(); end if;
 insert into public.membership_contacts(business_id,membership_id,phone_e164,shared_email) values(b.id,m.id,nullif(p_input->>'phone',''),email);
 insert into public.balances(business_id,membership_id) values(b.id,m.id);
 if coalesce((p_input->>'whatsappMarketingConsent')::boolean,false) then
 if nullif(p_input->>'phone','') is null or app_private.policy('whatsapp_marketing') is null then raise exception 'invalid_input' using errcode='22023'; end if;
 perform app_private.record_consent(m,'whatsapp','marketing',true,app_private.policy('whatsapp_marketing'),'enrollment');
 end if;
 outcome:='created';
 end if;
 insert into public.enrollment_acceptances(business_id,membership_id,programme_version_id,platform_terms_document_id,privacy_document_id,accepted_at,customer_user_id)
 values(b.id,m.id,v,(p_input->>'platformTermsDocumentId')::uuid,(p_input->>'privacyDocumentId')::uuid,stamp,actor);
 perform app_private.audit(b.id,'membership.'||outcome,'membership',m.id,p_correlation_id);
 return jsonb_build_object('membershipId',m.id,'status',outcome,'cardRoute','/app/cards/'||m.id);
 exception when integrity_constraint_violation or data_exception or sqlstate 'P0002' or sqlstate '42501' or sqlstate '40001' then
  return jsonb_build_object('error',jsonb_build_object('code','request_rejected','sqlState',SQLSTATE));
 end;
end $function$
;

CREATE OR REPLACE FUNCTION public.my_memberships()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid;
begin
 actor:=app_private.actor();
 return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'businessId',b.id,'businessName',b.display_name,'slug',b.slug,'accentHex',b.accent_hex,
 'displayName',m.display_name,'status',m.status,'joinedAt',m.joined_at,'joinedBranchId',m.joined_branch_id,'units',bal.units::text,'ledgerVersion',bal.ledger_version::text,
 'programmeId',p.id,'programmeName',p.name,'programmeType',p.type) order by m.joined_at desc) from public.memberships m join public.businesses b on b.id=m.business_id
 join public.balances bal on bal.membership_id=m.id join public.loyalty_programmes p on p.business_id=b.id and p.id=m.programme_id where m.customer_user_id=actor),'[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.customer_card(p_membership uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.memberships; bal public.balances;
begin
 select * into m from public.memberships where id=p_membership and customer_user_id=app_private.actor();
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 select * into bal from public.balances where business_id=m.business_id and membership_id=m.id;
 return jsonb_build_object('id',m.id,'businessId',m.business_id,'name',(select display_name from public.businesses where id=m.business_id),
 'memberName',m.display_name,'programmeId',m.programme_id,'programmeName',(select name from public.loyalty_programmes where id=m.programme_id),'status',m.status,'units',bal.units::text,'ledgerVersion',bal.ledger_version::text,
 'programmeType',(select type from public.loyalty_programmes where id=m.programme_id),
 'rewards',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'title',v.title,'description',v.description,'terms',v.terms,'unitCost',v.unit_cost::text,
 'available',bal.units>=v.unit_cost and m.status='active' and exists(select from public.businesses b where b.id=m.business_id and b.status<>'archived')
 and exists(select from public.reward_branches rb join public.branches br on br.business_id=rb.business_id and br.id=rb.branch_id
 where rb.business_id=m.business_id and rb.reward_version_id=v.id and br.status='active'),
 'branchIds',(select coalesce(jsonb_agg(rb.branch_id),'[]'::jsonb) from public.reward_branches rb where rb.reward_version_id=v.id),
 'eligibleBranches',(select coalesce(jsonb_agg(br.name order by br.name),'[]'::jsonb) from public.reward_branches rb
 join public.branches br on br.business_id=rb.business_id and br.id=rb.branch_id
 where rb.business_id=m.business_id and rb.reward_version_id=v.id and br.status='active')) order by v.unit_cost,v.id),'[]'::jsonb)
 from public.rewards r join public.reward_versions v on v.id=r.published_version_id where r.business_id=m.business_id and r.programme_id=m.programme_id and r.status='published'),
 'activity',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.entry_kind,'units',e.units::text,'occurredAt',e.occurred_at) order by e.occurred_at desc,e.id desc),'[]'::jsonb)
 from (select * from public.ledger_entries where business_id=m.business_id and membership_id=m.id order by occurred_at desc,id desc limit 10) e));
end $function$
;

CREATE OR REPLACE FUNCTION app_private.purchase_effect(p_context_hash text, p_bill bigint, p_eligible bigint, p_confirmed boolean, p_receipt text, p_corrects uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c app_private.checkout_contexts; b public.businesses; prog public.loyalty_programmes; v public.programme_versions;
 bal public.balances; inviter_balance public.balances; calc jsonb; base_units bigint; bonus bigint:=0;
 at_time timestamptz; v_local_date date; promo public.promotion_versions; promo_id uuid;
 promo_count integer:=0; promo_used bigint:=0; promo_reason text:='no_matching_slot';
 claim public.referral_claims; rule public.referral_rule_versions; referrer public.memberships;
 inviter_units integer:=0; friend_units integer:=0; referral_reason text:='no_claim'; inviter_month date; inviter_used bigint:=0;
 locked_id uuid; effect_hash text;
begin
 if p_bill is null or p_eligible is null or p_bill<0 or p_bill>100000000 or p_eligible<0 or p_eligible>p_bill
 or char_length(coalesce(p_receipt,''))>80 then raise exception 'invalid_input' using errcode='22023'; end if;
 c:=app_private.checkout(p_context_hash,'earning');
 perform app_private.authorize(c.business_id,c.branch_id);
 select * into b from public.businesses where id=c.business_id for share;
 select p.* into prog from public.loyalty_programmes p join public.memberships m on m.business_id=p.business_id and m.programme_id=p.id where m.business_id=c.business_id and m.id=c.membership_id for share of p;
 if b.status<>'active' or prog.status<>'published' or not app_private.entitled(c.business_id) then raise exception 'participation_unavailable' using errcode='42501'; end if;
 select * into claim from public.referral_claims where business_id=c.business_id and referred_membership_id=c.membership_id;
 -- Lock both possible value recipients before a claim or balance lock. A changed claim
 -- relationship is rejected and retried by the caller rather than widening this lock set.
 for locked_id in select id from public.memberships where business_id=c.business_id
  and id in (c.membership_id,claim.referrer_membership_id) order by id loop
  perform 1 from public.memberships where business_id=c.business_id and id=locked_id for update;
 end loop;
 if not exists(select from public.memberships where business_id=c.business_id and id=c.membership_id and status='active') then
 raise exception 'member_unavailable' using errcode='42501'; end if;
 for locked_id in select membership_id from public.balances where business_id=c.business_id
  and membership_id in (c.membership_id,claim.referrer_membership_id) order by membership_id loop
  perform 1 from public.balances where business_id=c.business_id and membership_id=locked_id for update;
 end loop;
 select * into bal from public.balances where business_id=c.business_id and membership_id=c.membership_id;
 if bal.membership_id is null then raise exception 'balance_missing' using errcode='P0002'; end if;
 if claim.id is not null then
  select * into claim from public.referral_claims where id=claim.id for update;
  if claim.referred_membership_id<>c.membership_id or claim.business_id<>c.business_id then raise exception 'claim_changed' using errcode='40001'; end if;
  select * into inviter_balance from public.balances where business_id=c.business_id and membership_id=claim.referrer_membership_id;
  select * into referrer from public.memberships where id=claim.referrer_membership_id;
  select * into rule from public.referral_rule_versions where id=claim.rule_version_id;
 end if;
 if p_corrects is not null and not exists(select from public.purchases where business_id=c.business_id and id=p_corrects and membership_id=c.membership_id
  and branch_id=c.branch_id and status='reversed' and not exists(select from public.purchases x where x.business_id=c.business_id
  and x.corrects_purchase_id=p_corrects and x.status='committed')) then raise exception 'invalid_correction' using errcode='23514'; end if;
 -- This is the one clock capture after all affected value locks.
 at_time:=clock_timestamp();
 select * into v from public.programme_versions where business_id=c.business_id and programme_id=prog.id
  and status='published' and effective_at<=at_time order by effective_at desc,id desc limit 1;
 if v.id is null then raise exception 'rules_unavailable' using errcode='P0002'; end if;
 calc:=app_private.calculate_base_earning(prog.type,v.minimum_spend_paisa,v.stamps_per_purchase,v.spend_step_paisa,v.units_per_step,
  v.max_base_units_per_purchase,p_bill,p_eligible,p_confirmed);
 base_units:=(calc->>'baseUnits')::bigint;
 v_local_date:=(at_time at time zone b.timezone)::date;
 if (calc->>'qualifiesForLoyalty')::boolean and base_units>0 then
  select count(*),(array_agg(s.id))[1],coalesce(sum(least(base_units,s.max_bonus_units_per_purchase)),0)
   into promo_count,promo_id,promo_used
  from (select pv.* from public.earning_promotions ep join public.promotion_versions pv
   on pv.business_id=ep.business_id and pv.promotion_id=ep.id and pv.status='published'
   where ep.business_id=c.business_id and ep.status='enabled' and pv.effective_at<=at_time
   and pv.id=(select pv2.id from public.promotion_versions pv2 where pv2.business_id=ep.business_id
    and pv2.promotion_id=ep.id and pv2.status='published' and pv2.effective_at<=at_time
    order by pv2.effective_at desc,pv2.id desc limit 1)
   and app_private.promotion_window(pv.starts_on,pv.ends_on,pv.weekdays,pv.starts_at,pv.ends_at,pv.timezone,at_time)
   and p_eligible>=pv.minimum_spend_paisa
   and exists(select from public.promotion_branches pb where pb.business_id=c.business_id and pb.promotion_version_id=pv.id and pb.branch_id=c.branch_id)) s;
  if promo_count>1 then raise exception 'promotion_overlap' using errcode='40001'; end if;
  if promo_count=1 then
   select * into promo from public.promotion_versions where id=promo_id;
   if promo.member_daily_cap is not null and (select count(*) from public.promotion_usage u where u.business_id=c.business_id
    and u.promotion_id=promo.promotion_id and u.membership_id=c.membership_id and u.local_date=v_local_date and u.reversed_at is null)>=promo.member_daily_cap then
    promo_reason:='daily_cap'; promo_id:=null;
   else bonus:=promo_used; promo_reason:=case when bonus<base_units then 'bonus_capped' else 'applied' end; end if;
  end if;
 end if;
 if claim.id is not null then
  if claim.status='pending' and claim.qualifies_until<=at_time then referral_reason:='expired';
  elsif claim.status<>'pending' then referral_reason:=claim.status;
  elsif (calc->>'qualifiesForLoyalty')::boolean and p_eligible>=rule.minimum_spend_paisa and at_time>=claim.enrolled_at then
   friend_units:=rule.friend_bonus_units; referral_reason:='applied';
   inviter_month:=date_trunc('month',at_time at time zone b.timezone)::date;
   if referrer.status in ('left','suspended') then friend_units:=0; referral_reason:='referrer_inactive';
   elsif referrer.status='anonymized' then referral_reason:='member_unavailable';
   elsif (select count(*) from public.referral_cap_usage u where u.business_id=c.business_id
    and u.referrer_membership_id=claim.referrer_membership_id and u.local_month=inviter_month and u.reversed_at is null)>=rule.monthly_inviter_cap then
    referral_reason:='monthly_cap';
   else inviter_units:=rule.inviter_bonus_units; end if;
  else referral_reason:='below_qualification_threshold'; end if;
 end if;
 effect_hash:=app_private.sha256(concat_ws(':',c.id,v.id,p_bill,p_eligible,p_confirmed,coalesce(p_receipt,''),coalesce(p_corrects::text,''),
  bal.ledger_version,base_units,coalesce(promo_id::text,''),bonus,promo_reason,coalesce(claim.id::text,''),
  coalesce(rule.id::text,''),friend_units,inviter_units,referral_reason,coalesce(inviter_balance.ledger_version::text,'')));
 return jsonb_build_object('businessId',c.business_id,'branchId',c.branch_id,'membershipId',c.membership_id,'programmeVersionId',v.id,
 'programmeType',prog.type,'recordedBillPaisa',p_bill::text,'eligibleSpendPaisa',p_eligible::text,'baseUnits',base_units::text,
 'promotionBonusUnits',bonus::text,'promotionVersionId',promo_id,'promotionReason',promo_reason,
 'referralBonusUnits',friend_units::text,'inviterBonusUnits',inviter_units::text,'referralClaimId',case when friend_units>0 then claim.id else null end,
 'referralReason',referral_reason,'qualifiesForLoyalty',calc->'qualifiesForLoyalty','capReduced',calc->'capReduced',
 'balance',bal.units::text,'ledgerVersion',bal.ledger_version::text,'evaluatedAt',at_time,
 'expectedEffectHash',effect_hash);
end $function$
;

CREATE OR REPLACE FUNCTION public.create_redemption_intent(p_membership uuid, p_reward_version uuid, p_token_hash text, p_correlation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.memberships; reward public.reward_versions; balance_units bigint; new_id uuid; expiry timestamptz; limited jsonb; ttl_seconds integer;
begin
 perform app_private.actor();
 limited:=app_private.limit_action('redemption_intent',null,12); if limited is not null then return limited; end if;
 begin
 select * into m from public.memberships where id=p_membership and customer_user_id=app_private.actor() and status='active' for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 perform 1 from public.businesses where id=m.business_id and status<>'archived' for share;
 if not found then raise exception 'participation_unavailable' using errcode='42501'; end if;
 select rv.* into reward from public.reward_versions rv join public.rewards r on r.id=rv.reward_id and r.business_id=rv.business_id
 where rv.business_id=m.business_id and rv.id=p_reward_version and r.programme_id=m.programme_id and r.status='published' and r.published_version_id=rv.id;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 if not exists(select from public.reward_branches rb join public.branches b on b.business_id=rb.business_id and b.id=rb.branch_id
 where rb.business_id=m.business_id and rb.reward_version_id=reward.id and b.status='active') then raise exception 'not_found' using errcode='P0002'; end if;
 select units into balance_units from public.balances where business_id=m.business_id and membership_id=m.id for update;
 if balance_units<reward.unit_cost then raise exception 'insufficient_balance' using errcode='P0003'; end if;
 if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_input' using errcode='22023'; end if;
 update public.redemption_intents set canceled_at=clock_timestamp() where business_id=m.business_id and membership_id=m.id
 and reward_version_id=reward.id and consumed_at is null and canceled_at is null and expires_at>clock_timestamp();
 select redemption_intent_ttl_seconds into ttl_seconds from app_private.loyalty_settings where singleton=true;
 expiry:=clock_timestamp()+make_interval(secs=>ttl_seconds);
 insert into public.redemption_intents(business_id,membership_id,reward_version_id,token_hash,expires_at,created_by)
 values(m.business_id,m.id,reward.id,p_token_hash,expiry,app_private.actor()) returning id into new_id;
 perform app_private.audit(m.business_id,'redemption.intent_created','redemption_intent',new_id,p_correlation_id);
 return jsonb_build_object('intentId',new_id,'expiresAt',expiry,'unitCost',reward.unit_cost::text,'rewardTitle',reward.title);
 exception when others then
  return jsonb_build_object('error',jsonb_build_object('code',case SQLSTATE when 'P0002' then 'not_found' when 'P0003' then 'insufficient_balance'
   when '22023' then 'invalid_input' when '23505' then 'conflict' when '42501' then 'forbidden' else 'temporary_failure' end));
 end;
end $function$
;

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
 'draftVersion',(select jsonb_build_object('title',v.title,'unitCost',v.unit_cost,'description',v.description,'terms',v.terms,
 'estimatedCostPaisa',v.estimated_cost_paisa::text,'branchIds',(select coalesce(jsonb_agg(rb.branch_id),'[]'::jsonb) from public.reward_branches rb where rb.reward_version_id=v.id))
 from public.reward_versions v where v.id=r.draft_version_id)) order by r.created_at,r.id),'[]'::jsonb) from public.rewards r where r.business_id=p_business and r.programme_id=(select id from public.loyalty_programmes where business_id=p_business and is_primary)),
 'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name),'[]'::jsonb) from public.branches b where b.business_id=p_business and b.status='active'));
end $function$
;

revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;

commit;
