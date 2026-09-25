begin;
create function public.save_initial_programme(p_business_id uuid,p_input jsonb,p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users; prog uuid; ver uuid; r uuid; rv uuid; br uuid;
begin
 perform 1 from public.businesses where id=p_business_id for update;
 staff:=app_private.authorize(p_business_id,null,true);
 perform app_private.strict_keys(p_input,array['type','name','minimumSpendPaisa','stampsPerPurchase','spendStepPaisa','unitsPerStep','maxBaseUnitsPerPurchase','terms',
 'rewardTitle','rewardUnitCost','rewardDescription','rewardTerms','rewardBranchIds','estimatedCostPaisa','rowVersion']);
 if not exists(select from public.businesses where id=p_business_id and status='draft' and row_version=(p_input->>'rowVersion')::integer) then raise exception 'conflict' using errcode='40001'; end if;
 if jsonb_typeof(p_input->'rewardBranchIds') is distinct from 'array' or jsonb_array_length(p_input->'rewardBranchIds')<1 then raise exception 'invalid_input' using errcode='22023'; end if;
 select id into prog from public.loyalty_programmes where business_id=p_business_id;
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
end $$;

create function public.publish_business(p_business_id uuid,p_row_version integer,p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prog uuid; ver uuid; staff public.business_users; stamp timestamptz;
begin
 perform 1 from public.businesses where id=p_business_id for update;
 staff:=app_private.authorize(p_business_id,null,true);
 if not exists(select from public.businesses where id=p_business_id and row_version=p_row_version and status='draft') then raise exception 'conflict' using errcode='40001'; end if;
 if not app_private.entitled(p_business_id) or app_private.policy('platform_terms') is null or app_private.policy('privacy') is null then
 raise exception 'publication_incomplete' using errcode='22023'; end if;
 select id into prog from public.loyalty_programmes where business_id=p_business_id and status='draft';
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
end $$;

create function public.public_business(p_slug text) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.businesses; prog public.loyalty_programmes; v public.programme_versions;
begin
 select * into b from public.businesses where slug=p_slug and status in ('active','paused') and published_at<=clock_timestamp();
 if not found then return null; end if;
 select * into prog from public.loyalty_programmes where business_id=b.id and status in ('published','paused');
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
 from public.rewards r join public.reward_versions rv on rv.id=r.published_version_id where r.business_id=b.id and r.status='published'));
end $$;

create function app_private.record_consent(p_member public.memberships,p_channel text,p_purpose text,p_allowed boolean,p_document uuid,p_source text)
returns void language plpgsql set search_path='' as $$
declare d public.policy_documents; stamp timestamptz;
begin
 select * into strict d from public.policy_documents where id=p_document;
 stamp:=clock_timestamp();
 insert into public.consent_preferences(business_id,membership_id,channel,purpose,allowed,text_version,policy_document_id,changed_at,source)
 values(p_member.business_id,p_member.id,p_channel,p_purpose,p_allowed,d.version,d.id,stamp,p_source)
 on conflict(business_id,membership_id,channel,purpose) do update set allowed=excluded.allowed,text_version=excluded.text_version,
 policy_document_id=excluded.policy_document_id,changed_at=stamp,source=excluded.source,updated_at=stamp,row_version=public.consent_preferences.row_version+1;
 insert into public.consent_events(business_id,membership_id,channel,purpose,allowed,text_version,policy_document_id,source,actor_user_id,occurred_at)
 values(p_member.business_id,p_member.id,p_channel,p_purpose,p_allowed,d.version,d.id,p_source,app_private.actor(),stamp);
end $$;
create function app_private.deny_all_consent(p_member public.memberships) returns void language plpgsql set search_path='' as $$
declare c public.consent_preferences;
begin
 for c in select * from public.consent_preferences where business_id=p_member.business_id and membership_id=p_member.id and allowed order by channel,purpose loop
 perform app_private.record_consent(p_member,c.channel,c.purpose,false,c.policy_document_id,'customer_settings');
 end loop;
end $$;

create function public.join_business(p_input jsonb,p_correlation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; b public.businesses; m public.memberships; v uuid; stamp timestamptz; email text; limited jsonb; member_limit integer; outcome text;
begin
 actor:=app_private.actor();
 limited:=app_private.limit_action('join_business',null,10); if limited is not null then return limited; end if;
 begin
 perform app_private.strict_keys(p_input,array['businessSlug','branchId','displayName','shareVerifiedEmail','phone','whatsappMarketingConsent',
 'acceptedProgrammeVersionId','platformTermsDocumentId','privacyDocumentId','rejoin']);
 select * into b from public.businesses where slug=p_input->>'businessSlug' for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 select * into m from public.memberships where business_id=b.id and customer_user_id=actor for update;
 if m.status='active' then return jsonb_build_object('membershipId',m.id,'status','existing','cardRoute','/app/cards/'||m.id); end if;
 if m.id is not null and (m.status<>'left' or not coalesce((p_input->>'rejoin')::boolean,false)) then raise exception 'forbidden' using errcode='42501'; end if;
 if b.status<>'active' or not app_private.entitled(b.id) then raise exception 'participation_unavailable' using errcode='42501'; end if;
 select pv.id into v from public.programme_versions pv join public.loyalty_programmes p on p.id=pv.programme_id
 where p.business_id=b.id and p.status='published' and pv.status='published' and pv.effective_at<=clock_timestamp() order by pv.effective_at desc limit 1;
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
 insert into public.memberships(business_id,customer_user_id,display_name,joined_at,joined_branch_id)
 values(b.id,actor,btrim(p_input->>'displayName'),stamp,(p_input->>'branchId')::uuid) returning * into m;
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
end $$;

create function public.my_memberships() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 actor:=app_private.actor();
 return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'businessId',b.id,'businessName',b.display_name,'slug',b.slug,'accentHex',b.accent_hex,
 'displayName',m.display_name,'status',m.status,'joinedAt',m.joined_at,'joinedBranchId',m.joined_branch_id,'units',bal.units::text,'ledgerVersion',bal.ledger_version::text,
 'programmeType',p.type) order by m.joined_at desc) from public.memberships m join public.businesses b on b.id=m.business_id
 join public.balances bal on bal.membership_id=m.id left join public.loyalty_programmes p on p.business_id=b.id where m.customer_user_id=actor),'[]'::jsonb);
end $$;
create function public.membership_preferences(p_membership_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; m public.memberships;
begin
 actor:=app_private.actor();
 select * into m from public.memberships where id=p_membership_id and customer_user_id=actor;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 return jsonb_build_object('id',m.id,'businessName',(select display_name from public.businesses where id=m.business_id),'joinedAt',m.joined_at,'status',m.status,
 'contact',(select jsonb_build_object('phone',c.phone_e164,'phoneStatus',c.phone_status,'sharedEmail',c.shared_email,'rowVersion',c.row_version) from public.membership_contacts c where c.membership_id=m.id),
 'hasBirthday',(select birthday_month is not null from public.profiles where user_id=actor),
 'consents',(select coalesce(jsonb_agg(jsonb_build_object('channel',c.channel,'purpose',c.purpose,'allowed',c.allowed,'textVersion',c.text_version)),'[]'::jsonb) from public.consent_preferences c where c.membership_id=m.id));
end $$;
create function public.save_membership_contact(p_membership_id uuid,p_input jsonb,p_correlation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; m public.memberships; c public.membership_contacts; email text; pref public.consent_preferences;
begin
 actor:=app_private.actor();
 perform app_private.strict_keys(p_input,array['phone','shareVerifiedEmail','rowVersion']);
 select * into m from public.memberships where id=p_membership_id and customer_user_id=actor and status<>'anonymized' for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 select * into c from public.membership_contacts where membership_id=m.id for update;
 if c.row_version is distinct from (p_input->>'rowVersion')::integer then raise exception 'conflict' using errcode='40001'; end if;
 if coalesce((p_input->>'shareVerifiedEmail')::boolean,false) then select u.email into email from auth.users u where u.id=auth.uid(); end if;
 if c.phone_e164 is distinct from nullif(p_input->>'phone','') then
 select * into pref from public.consent_preferences where membership_id=m.id and channel='whatsapp' and purpose='marketing';
 if found then perform app_private.record_consent(m,'whatsapp','marketing',false,pref.policy_document_id,'customer_settings'); end if;
 end if;
 update public.membership_contacts set phone_e164=nullif(p_input->>'phone',''),shared_email=email,
 phone_status=case when phone_e164 is distinct from nullif(p_input->>'phone','') then 'unverified' else phone_status end,
 phone_confirmed_at=case when phone_e164 is distinct from nullif(p_input->>'phone','') then null else phone_confirmed_at end,
 phone_confirmed_by=case when phone_e164 is distinct from nullif(p_input->>'phone','') then null else phone_confirmed_by end,
 contact_changed_at=clock_timestamp(),updated_at=clock_timestamp(),row_version=row_version+1 where membership_id=m.id;
 perform app_private.audit(m.business_id,'contact.updated','membership',m.id,p_correlation_id);
 return public.membership_preferences(m.id);
end $$;
create function public.set_consent(p_membership_id uuid,p_channel text,p_purpose text,p_allowed boolean,p_text_version text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; m public.memberships; d uuid; pref public.consent_preferences;
begin
 actor:=app_private.actor();
 select * into m from public.memberships where id=p_membership_id and customer_user_id=actor and status<>'anonymized' for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 d:=app_private.policy(p_channel||'_'||case when p_purpose='reward_updates' then 'reward' else p_purpose end);
 if d is null or not exists(select from public.policy_documents where id=d and version=p_text_version) then raise exception 'stale_terms' using errcode='40001'; end if;
 if p_allowed then
 if m.status<>'active' then raise exception 'forbidden' using errcode='42501'; end if;
 if p_channel='whatsapp' and not exists(select from public.membership_contacts where membership_id=m.id and phone_e164 is not null) then raise exception 'phone_required' using errcode='22023'; end if;
 if p_purpose='birthday' and not exists(select from public.profiles where user_id=actor and birthday_month is not null) then raise exception 'birthday_required' using errcode='22023'; end if;
 if p_channel='push' and p_purpose='birthday' and not exists(select from public.consent_preferences where membership_id=m.id and channel='inbox' and purpose='birthday' and allowed) then raise exception 'birthday_consent_required' using errcode='22023'; end if;
 end if;
 perform app_private.record_consent(m,p_channel,p_purpose,p_allowed,d,'customer_settings');
 if not p_allowed and p_channel='inbox' and p_purpose='birthday' then
 select * into pref from public.consent_preferences where membership_id=m.id and channel='push' and purpose='birthday' and allowed;
 if found then perform app_private.record_consent(m,'push','birthday',false,pref.policy_document_id,'customer_settings'); end if;
 end if;
 perform app_private.audit(m.business_id,'consent.updated','membership',m.id,p_correlation_id,jsonb_build_object('channel',p_channel,'purpose',p_purpose,'allowed',p_allowed));
 return public.membership_preferences(m.id);
end $$;
create function public.leave_membership(p_membership_id uuid,p_correlation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; m public.memberships;
begin
 actor:=app_private.actor();
 select * into m from public.memberships where id=p_membership_id and customer_user_id=actor for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 if m.status not in ('active','left') then raise exception 'forbidden' using errcode='42501'; end if;
 perform app_private.deny_all_consent(m);
 if m.status='active' then
 update public.memberships set status='left',left_at=clock_timestamp(),updated_at=clock_timestamp(),row_version=row_version+1 where id=m.id;
 perform app_private.audit(m.business_id,'membership.left','membership',m.id,p_correlation_id);
 end if;
 return jsonb_build_object('membershipId',m.id,'status','left');
end $$;

create function public.business_setup(p_business_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare staff public.business_users;
begin
 staff:=app_private.authorize(p_business_id);
 if staff.role<>'owner' then raise exception 'forbidden' using errcode='42501'; end if;
 return jsonb_build_object('business',(select to_jsonb(b)-'created_by' from public.businesses b where id=p_business_id),
 'branches',(select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('hours',(select coalesce(jsonb_agg(jsonb_build_object('weekday',h.weekday,'opensAt',h.opens_at,'closesAt',h.closes_at)),'[]'::jsonb) from public.branch_hours h where h.branch_id=b.id))),'[]'::jsonb) from public.branches b where b.business_id=p_business_id),
 'programme',(select to_jsonb(p) from public.loyalty_programmes p where p.business_id=p_business_id),
 'programmeVersion',(select to_jsonb(v)||jsonb_build_object('minimum_spend_paisa',v.minimum_spend_paisa::text,'spend_step_paisa',v.spend_step_paisa::text,
 'stamps_per_purchase',v.stamps_per_purchase::text,'units_per_step',v.units_per_step::text,'max_base_units_per_purchase',v.max_base_units_per_purchase::text) from public.programme_versions v where v.business_id=p_business_id order by version desc limit 1),
 'rewardVersion',(select to_jsonb(v)||jsonb_build_object('unit_cost',v.unit_cost::text,'estimated_cost_paisa',v.estimated_cost_paisa::text,
 'branch_ids',(select coalesce(jsonb_agg(rb.branch_id),'[]'::jsonb) from public.reward_branches rb where rb.reward_version_id=v.id))
 from public.rewards r join public.reward_versions v on v.id=coalesce(r.draft_version_id,r.published_version_id) where r.business_id=p_business_id order by r.created_at,r.id limit 1),
 'rewards',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.rewards r where r.business_id=p_business_id),
 'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.staff_display_name,'email',u.staff_email,'role',u.role,'status',u.status,'rowVersion',u.row_version,
 'canManageCampaigns',u.can_manage_campaigns,'canContactCustomers',u.can_contact_customers,'canReverseTransactions',u.can_reverse_transactions,'canExportReports',u.can_export_reports,
 'branchIds',(select coalesce(jsonb_agg(a.branch_id),'[]'::jsonb) from public.branch_assignments a where a.business_user_id=u.id))),'[]'::jsonb) from public.business_users u where u.business_id=p_business_id),
 'invitations',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role,'status',case when i.status='pending' and i.expires_at<=clock_timestamp() then 'expired' else i.status end,
 'expiresAt',i.expires_at,'rowVersion',i.row_version,'branchIds',(select jsonb_agg(ib.branch_id) from public.invitation_branches ib where ib.invitation_id=i.id))),'[]'::jsonb) from public.staff_invitations i where i.business_id=p_business_id),
 'subscription',(select jsonb_build_object('status',s.status,'periodEnd',s.period_end,'entitled',app_private.entitled(p_business_id),
 'withinGrace',s.period_end<=clock_timestamp() and app_private.entitled(p_business_id),'graceEndsAt',coalesce(s.grace_ends_at,s.period_end+interval '7 days')) from public.subscriptions s where s.business_id=p_business_id));
end $$;

create function public.business_members(p_business_id uuid,p_branch_id uuid default null,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare staff public.business_users; limited jsonb;
begin
 staff:=app_private.authorize(p_business_id,p_branch_id);
 if staff.role='cashier' or (staff.role='manager' and p_branch_id is null) then raise exception 'forbidden' using errcode='42501'; end if;
 limited:=app_private.limit_action('members_read',p_business_id); if limited is not null then return limited; end if;
 begin
 if p_offset is null or p_offset not between 0 and 100000 then raise exception 'invalid_input' using errcode='22023'; end if;
 return coalesce((select jsonb_agg(x.data) from (select jsonb_build_object('id',m.id,'name',m.display_name,'status',m.status,'joinedAt',m.joined_at,
 'units',b.units::text,'contact',case when staff.role='owner' or staff.can_contact_customers then
 (select jsonb_build_object('phone',c.phone_e164,'sharedEmail',c.shared_email) from public.membership_contacts c where c.membership_id=m.id) else null end) as data
 from public.memberships m join public.balances b on b.membership_id=m.id where m.business_id=p_business_id
 and (p_branch_id is null or m.joined_branch_id=p_branch_id) order by m.joined_at desc,m.id limit 25 offset p_offset) x),'[]'::jsonb);
 exception when integrity_constraint_violation or data_exception or sqlstate 'P0002' or sqlstate '42501' or sqlstate '40001' then
  return jsonb_build_object('error',jsonb_build_object('code','request_rejected','sqlState',SQLSTATE));
 end;
end $$;

do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname=any(array['save_initial_programme','publish_business','public_business','join_business','my_memberships','membership_preferences','save_membership_contact',
 'set_consent','leave_membership','business_setup','business_members']) loop
 execute format('revoke all on function %s from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',f);
 execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
grant execute on function public.public_business(text) to anon;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
