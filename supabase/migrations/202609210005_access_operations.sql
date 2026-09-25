begin;

create function app_private.actor(p_mfa boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 select p.user_id into actor from public.profiles p join auth.users u on u.id=p.auth_user_id
 join auth.sessions s on s.user_id=u.id and s.id=nullif(auth.jwt()->>'session_id','')::uuid
 where u.id=auth.uid() and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 and u.deleted_at is null and p.anonymized_at is null and (s.not_after is null or s.not_after>clock_timestamp()) for share of p,u,s;
 if actor is null then raise exception 'unauthenticated' using errcode='42501'; end if;
 if p_mfa and (auth.jwt()->>'aal') is distinct from 'aal2' then raise exception 'mfa_required' using errcode='42501'; end if;
 return actor;
end $$;

-- Lock order: business, staff assignment, branch, entity. Every owner change holds
-- the business lock; readers hold compatible permission locks until commit.
create function app_private.authorize(p_business uuid,p_branch uuid default null,p_owner boolean default false)
returns public.business_users language plpgsql security definer set search_path='' as $$
declare actor uuid; staff public.business_users;
begin
 actor:=app_private.actor(p_owner);
 perform 1 from public.businesses where id=p_business and status<>'archived' for share;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 select * into staff from public.business_users where business_id=p_business and user_id=actor and status='active' for share;
 if not found or (p_owner and staff.role<>'owner') then raise exception 'forbidden' using errcode='42501'; end if;
 if p_branch is not null then
   perform 1 from public.branches where business_id=p_business and id=p_branch and status='active' for share;
   if not found then raise exception 'not_found' using errcode='P0002'; end if;
   if staff.role<>'owner' then
     perform 1 from public.branch_assignments where business_id=p_business and business_user_id=staff.id and branch_id=p_branch for share;
     if not found then raise exception 'forbidden' using errcode='42501'; end if;
   end if;
 end if;
 return staff;
end $$;
create function app_private.audit(p_business uuid,p_action text,p_target text,p_id uuid,p_correlation uuid,p_changes jsonb default '{}')
returns void language sql set search_path='' as $$
 insert into public.audit_events(business_id,actor_user_id,action,target_type,target_id,safe_changes,correlation_id,occurred_at)
 values(p_business,app_private.actor(),p_action,p_target,p_id,p_changes,p_correlation::text,clock_timestamp())
$$;
create function app_private.strict_keys(p_input jsonb,p_keys text[]) returns void language plpgsql set search_path='' as $$
begin
 if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'invalid_input' using errcode='22023'; end if;
 if exists(select from jsonb_object_keys(p_input) k where not k=any(p_keys)) then raise exception 'invalid_input' using errcode='22023'; end if;
end $$;
create function app_private.limit_action(p_operation text,p_business uuid default null,p_max integer default 30)
returns jsonb language plpgsql set search_path='' as $$
declare subject text; retry integer;
begin
 select encode(extensions.hmac(convert_to('phase2:'||app_private.actor()::text||':'||coalesce(p_business::text,''),'UTF8'),secret,'sha256'),'hex')
 into strict subject from app_private.rate_limit_key where singleton;
 retry:=app_private.consume_fixed_rate(subject,p_operation,60,p_max,clock_timestamp());
 if retry>0 then return jsonb_build_object('error',jsonb_build_object('code','rate_limited','retryAfterSeconds',retry)); end if;
 return null;
end $$;
create function app_private.entitled(p_business uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select from public.subscriptions s where s.business_id=p_business and s.status in ('trial','active','past_due')
 and (s.period_end>statement_timestamp() or (not s.cancel_at_period_end
 and coalesce(s.grace_ends_at,s.period_end+interval '7 days')>statement_timestamp())))
$$;
create function app_private.policy(p_kind text) returns uuid language sql stable set search_path='' as $$
 select id from public.policy_documents where kind=p_kind and business_id is null and published_at<=statement_timestamp()
 order by published_at desc,id desc limit 1
$$;

create function public.public_configuration() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('plans',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',p.name,'pricePaisa',v.price_paisa::text,
 'billingPeriod',v.billing_period,'trialDays',v.trial_days,'branchLimit',v.branch_limit,'staffLimit',v.staff_limit))
 from public.plans p join public.plan_versions v on v.plan_id=p.id where p.active and v.status='published' and v.published_at<=statement_timestamp()
 and not exists(select from public.plan_versions newer where newer.plan_id=p.id and newer.status='published'
 and newer.published_at<=statement_timestamp() and newer.version>v.version)), '[]'::jsonb),
 'policies',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'kind',d.kind,'version',d.version,'body',d.body,'publishedAt',d.published_at))
 from public.policy_documents d where d.id=app_private.policy(d.kind)),'[]'::jsonb))
$$;
create function public.read_policy(p_id uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',id,'kind',kind,'version',version,'body',body,'publishedAt',published_at)
 from public.policy_documents where id=p_id and published_at<=statement_timestamp() and business_id is null
$$;
create function public.my_workspaces() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 actor:=app_private.actor();
 return coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.display_name,'role',u.role,'status',b.status,
 'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',br.id,'name',br.name)),'[]'::jsonb) from public.branches br
 where br.business_id=b.id and br.status='active' and (u.role='owner' or exists(select from public.branch_assignments a
 where a.business_id=b.id and a.business_user_id=u.id and a.branch_id=br.id))))) from public.business_users u
 join public.businesses b on b.id=u.business_id where u.user_id=actor and u.status='active' and b.status<>'archived'),'[]'::jsonb);
end $$;
create function public.check_slug(p_slug text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform app_private.actor();
 return p_slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$' and p_slug not in
 ('app','admin','api','auth','dashboard','staff','workspace','privacy','terms','join','invite','support','www')
 and not exists(select from public.businesses where slug=p_slug);
end $$;

-- Exactly one owner is checked at transaction end, allowing atomic bootstrap/transfer.
create function app_private.exact_owner() returns trigger language plpgsql set search_path='' as $$
declare bid uuid;
begin
 if tg_table_name='businesses' then bid:=coalesce(new.id,old.id); else bid:=coalesce(new.business_id,old.business_id); end if;
 if exists(select from public.businesses where id=bid and status<>'archived') and
 (select count(*) from public.business_users where business_id=bid and role='owner' and status='active')<>1 then
 raise exception 'exactly_one_owner_required' using errcode='23514'; end if;
 return null;
end $$;
create constraint trigger exact_business_owner after insert or update on public.businesses deferrable initially deferred for each row execute function app_private.exact_owner();
create constraint trigger exact_assignment_owner after insert or update or delete on public.business_users deferrable initially deferred for each row execute function app_private.exact_owner();

create function app_private.write_hours(p_business uuid,p_branch uuid,p_hours jsonb) returns void language plpgsql set search_path='' as $$
declare h jsonb;
begin
 if p_hours is null or jsonb_typeof(p_hours)<>'array' or jsonb_array_length(p_hours)>42 then raise exception 'invalid_input' using errcode='22023'; end if;
 delete from public.branch_hours where business_id=p_business and branch_id=p_branch;
 for h in select value from jsonb_array_elements(p_hours) loop
 perform app_private.strict_keys(h,array['weekday','opensAt','closesAt']);
 insert into public.branch_hours(business_id,branch_id,weekday,opens_at,closes_at)
 values(p_business,p_branch,(h->>'weekday')::integer,(h->>'opensAt')::time,(h->>'closesAt')::time);
 end loop;
end $$;

create function public.bootstrap_business(p_input jsonb,p_correlation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; b uuid; br uuid; pv public.plan_versions; stamp timestamptz; limited jsonb; identity public.profiles; email text;
begin
 actor:=app_private.actor(true);
 limited:=app_private.limit_action('bootstrap',null,5); if limited is not null then return limited; end if;
 begin
 perform app_private.strict_keys(p_input,array['planVersionId','name','slug','description','accentHex','branchName','address','city','area','mapsUrl','phone','hours']);
 perform pg_advisory_xact_lock(hashtextextended('owner-trial:'||actor::text,0));
 -- Concurrent retries of the same slug either return the original owner's result or conflict.
 perform pg_advisory_xact_lock(hashtextextended('bootstrap:'||(p_input->>'slug'),0));
 select id into b from public.businesses where slug=p_input->>'slug';
 if b is not null then
   if exists(select from public.business_users where business_id=b and user_id=actor and role='owner' and status='active') then
     return jsonb_build_object('businessId',b,'existing',true);
   end if;
   raise exception 'conflict' using errcode='23505';
 end if;
 if exists(select from public.businesses where created_by=actor) then
   update app_private.business_provision_grants set consumed_at=clock_timestamp()
   where id=(select id from app_private.business_provision_grants where owner_id=actor and consumed_at is null and expires_at>clock_timestamp() order by created_at limit 1 for update);
   if not found then raise exception 'trial_already_used' using errcode='22023'; end if;
 end if;
 select v.* into pv from public.plan_versions v join public.plans p on p.id=v.plan_id
 where v.id=(p_input->>'planVersionId')::uuid and p.active and v.status='published' and v.published_at<=clock_timestamp()
 and not exists(select from public.plan_versions newer where newer.plan_id=p.id and newer.status='published' and newer.published_at<=clock_timestamp() and newer.version>v.version) for share of p,v;
 if not found then raise exception 'plan_unavailable' using errcode='22023'; end if;
 select * into strict identity from public.profiles where user_id=actor;
 select u.email into strict email from auth.users u where u.id=auth.uid();
 stamp:=clock_timestamp();
 insert into public.businesses(slug,display_name,description,accent_hex,created_by)
 values(p_input->>'slug',btrim(p_input->>'name'),nullif(btrim(p_input->>'description'),''),coalesce(p_input->>'accentHex','#166534'),actor) returning id into b;
 insert into public.business_users(business_id,user_id,staff_display_name,staff_email,role)
 values(b,actor,identity.display_name,lower(email),'owner');
 insert into public.branches(business_id,name,address,city,area,maps_url,phone)
 values(b,btrim(p_input->>'branchName'),btrim(p_input->>'address'),btrim(p_input->>'city'),nullif(btrim(p_input->>'area'),''),
 nullif(p_input->>'mapsUrl',''),nullif(p_input->>'phone','')) returning id into br;
 perform app_private.write_hours(b,br,p_input->'hours');
 insert into public.subscriptions(business_id,plan_version_id,status,period_start,period_end,billing_anchor_at)
 values(b,pv.id,'trial',stamp,stamp+make_interval(days=>pv.trial_days),stamp);
 perform app_private.audit(b,'business.bootstrapped','business',b,p_correlation_id);
 return jsonb_build_object('businessId',b,'branchId',br,'existing',false);
 exception when integrity_constraint_violation or data_exception or sqlstate 'P0002' or sqlstate '42501' or sqlstate '40001' then
  return jsonb_build_object('error',jsonb_build_object('code','request_rejected','sqlState',SQLSTATE));
 end;
end $$;

create function public.business_access(p_business_id uuid,p_branch_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare staff public.business_users;
begin
 staff:=app_private.authorize(p_business_id,p_branch_id);
 return jsonb_build_object('role',staff.role,'businessId',staff.business_id,'branchId',p_branch_id,
 'canManageCampaigns',staff.role='owner' or staff.can_manage_campaigns,'canContactCustomers',staff.role='owner' or staff.can_contact_customers,
 'canReverseTransactions',staff.role='owner' or staff.can_reverse_transactions,'canExportReports',staff.role='owner' or staff.can_export_reports);
end $$;

create function public.create_staff_invitation(p_business_id uuid,p_input jsonb,p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff public.business_users; raw text; inv uuid; br uuid; limited jsonb; max_staff integer;
begin
 perform 1 from public.businesses where id=p_business_id for update;
 staff:=app_private.authorize(p_business_id,null,true);
 limited:=app_private.limit_action('staff_invite',p_business_id,5); if limited is not null then return limited; end if;
 begin
 perform app_private.strict_keys(p_input,array['email','role','branchIds','canManageCampaigns','canContactCustomers','canReverseTransactions','canExportReports']);
 if jsonb_typeof(p_input->'branchIds') is distinct from 'array' or jsonb_array_length(p_input->'branchIds')<1 then raise exception 'invalid_input' using errcode='22023'; end if;
 if not app_private.entitled(p_business_id) then raise exception 'participation_unavailable' using errcode='42501'; end if;
 update public.staff_invitations set status='expired',updated_at=clock_timestamp(),row_version=row_version+1
 where business_id=p_business_id and status='pending' and expires_at<=clock_timestamp();
 select v.staff_limit into strict max_staff from public.subscriptions s join public.plan_versions v on v.id=s.plan_version_id where s.business_id=p_business_id;
 if (select count(*) from public.business_users where business_id=p_business_id and status='active')+
 (select count(*) from public.staff_invitations where business_id=p_business_id and status='pending')>=max_staff then raise exception 'staff_limit' using errcode='22023'; end if;
 raw:=translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_');
 insert into public.staff_invitations(business_id,email,role,token_hash,expires_at,invited_by,
 can_manage_campaigns,can_contact_customers,can_reverse_transactions,can_export_reports)
 values(p_business_id,lower(btrim(p_input->>'email')),p_input->>'role',encode(extensions.digest(raw,'sha256'),'hex'),clock_timestamp()+interval '72 hours',staff.user_id,
 coalesce((p_input->>'canManageCampaigns')::boolean,false),coalesce((p_input->>'canContactCustomers')::boolean,false),
 coalesce((p_input->>'canReverseTransactions')::boolean,false),coalesce((p_input->>'canExportReports')::boolean,false)) returning id into inv;
 for br in select value::uuid from jsonb_array_elements_text(p_input->'branchIds') loop
 perform 1 from public.branches where business_id=p_business_id and id=br and status='active';
 if not found then raise exception 'invalid_branch' using errcode='22023'; end if;
 insert into public.invitation_branches values(p_business_id,inv,br,now());
 end loop;
 perform app_private.audit(p_business_id,'staff.invited','staff_invitation',inv,p_correlation_id);
 return jsonb_build_object('invitationId',inv,'token',raw,'expiresAt',clock_timestamp()+interval '72 hours');
 exception when integrity_constraint_violation or data_exception or sqlstate 'P0002' or sqlstate '42501' or sqlstate '40001' then
  return jsonb_build_object('error',jsonb_build_object('code','request_rejected','sqlState',SQLSTATE));
 end;
end $$;

create function public.read_invitation(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; inv public.staff_invitations;
begin
 actor:=app_private.actor();
 if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'not_found' using errcode='P0002'; end if;
 select i.* into inv from public.staff_invitations i join auth.users u on u.id=auth.uid() and lower(u.email)=i.email
 where i.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and i.status='pending' and i.expires_at>clock_timestamp();
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 return jsonb_build_object('businessName',(select display_name from public.businesses where id=inv.business_id),'role',inv.role,'expiresAt',inv.expires_at,
 'inviter',(select staff_display_name from public.business_users where business_id=inv.business_id and user_id=inv.invited_by),
 'branches',(select jsonb_agg(b.name) from public.invitation_branches ib join public.branches b on b.business_id=ib.business_id and b.id=ib.branch_id where ib.invitation_id=inv.id));
end $$;
create function public.accept_staff_invitation(p_token text,p_correlation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; inv public.staff_invitations; bid uuid; staff_id uuid; email text; limited jsonb; max_staff integer;
begin
 actor:=app_private.actor();
 limited:=app_private.limit_action('accept_invite',null,10); if limited is not null then return limited; end if;
 begin
 if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'not_found' using errcode='P0002'; end if;
 select business_id into bid from public.staff_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 perform 1 from public.businesses where id=bid and status<>'archived' for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 select * into inv from public.staff_invitations where business_id=bid and token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
 select lower(u.email) into strict email from auth.users u where u.id=auth.uid();
 if email<>inv.email or inv.status<>'pending' or inv.expires_at<=clock_timestamp() then raise exception 'not_found' using errcode='P0002'; end if;
 if not app_private.entitled(bid) then raise exception 'participation_unavailable' using errcode='42501'; end if;
 select v.staff_limit into strict max_staff from public.subscriptions s join public.plan_versions v on v.id=s.plan_version_id where s.business_id=bid;
 if (select count(*) from public.business_users where business_id=bid and status='active')+
 (select count(*) from public.staff_invitations where business_id=bid and status='pending' and expires_at>clock_timestamp())>max_staff then
 raise exception 'staff_limit' using errcode='22023'; end if;
 if exists(select from public.business_users where business_id=bid and user_id=actor and status='active') then raise exception 'conflict' using errcode='23505'; end if;
 if exists(select from public.invitation_branches i join public.branches b on b.business_id=i.business_id and b.id=i.branch_id
 where i.invitation_id=inv.id and b.status<>'active') then raise exception 'invalid_branch' using errcode='22023'; end if;
 if not exists(select from public.invitation_branches where invitation_id=inv.id) then raise exception 'invalid_branch' using errcode='22023'; end if;
 insert into public.business_users(business_id,user_id,staff_display_name,staff_email,role,can_manage_campaigns,can_contact_customers,can_reverse_transactions,can_export_reports)
 select bid,actor,p.display_name,email,inv.role,inv.can_manage_campaigns,inv.can_contact_customers,inv.can_reverse_transactions,inv.can_export_reports from public.profiles p where p.user_id=actor
 on conflict(business_id,user_id) do update set role=excluded.role,status='active',staff_display_name=excluded.staff_display_name,staff_email=excluded.staff_email,
 can_manage_campaigns=excluded.can_manage_campaigns,can_contact_customers=excluded.can_contact_customers,can_reverse_transactions=excluded.can_reverse_transactions,
 can_export_reports=excluded.can_export_reports,updated_at=clock_timestamp(),row_version=public.business_users.row_version+1 returning id into staff_id;
 delete from public.branch_assignments where business_id=bid and business_user_id=staff_id;
 insert into public.branch_assignments(business_id,business_user_id,branch_id) select bid,staff_id,branch_id from public.invitation_branches where invitation_id=inv.id;
 update public.staff_invitations set status='accepted',accepted_by=actor,accepted_at=clock_timestamp(),updated_at=clock_timestamp(),row_version=row_version+1 where id=inv.id;
 perform app_private.audit(bid,'staff.accepted','business_user',staff_id,p_correlation_id);
 return jsonb_build_object('businessId',bid,'role',inv.role);
 exception when sqlstate 'P0002' or sqlstate '42501' or sqlstate '22023' or unique_violation then
  -- Roll back invitation effects, retaining the outer attempt counter.
  return jsonb_build_object('error',jsonb_build_object('code','invitation_unavailable'));
 end;
end $$;

create function public.manage_staff(p_business_id uuid,p_input jsonb,p_correlation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner public.business_users; target public.business_users; br uuid; affected uuid;
begin
 perform 1 from public.businesses where id=p_business_id for update;
 owner:=app_private.authorize(p_business_id,null,true);
 perform app_private.strict_keys(p_input,array['id','rowVersion','action','role','branchIds','canManageCampaigns','canContactCustomers','canReverseTransactions','canExportReports']);
 if p_input->>'action'='revoke_invite' then
 update public.staff_invitations set status='revoked',updated_at=clock_timestamp(),row_version=row_version+1
 where business_id=p_business_id and id=(p_input->>'id')::uuid and row_version=(p_input->>'rowVersion')::integer and status='pending' returning id into affected;
 else
 select * into target from public.business_users where business_id=p_business_id and id=(p_input->>'id')::uuid and row_version=(p_input->>'rowVersion')::integer for update;
 if not found then raise exception 'conflict' using errcode='40001'; end if;
 if target.role='owner' or target.user_id=owner.user_id then raise exception 'forbidden' using errcode='42501'; end if;
 if p_input->>'action'='revoke' then
 update public.business_users set status='revoked',updated_at=clock_timestamp(),row_version=row_version+1 where id=target.id returning id into affected;
 elsif p_input->>'action'='edit' and p_input->>'role' in ('manager','cashier') then
 if jsonb_typeof(p_input->'branchIds') is distinct from 'array' or jsonb_array_length(p_input->'branchIds')<1 then raise exception 'invalid_input' using errcode='22023'; end if;
 update public.business_users set role=p_input->>'role',can_manage_campaigns=coalesce((p_input->>'canManageCampaigns')::boolean,false),
 can_contact_customers=coalesce((p_input->>'canContactCustomers')::boolean,false),can_reverse_transactions=coalesce((p_input->>'canReverseTransactions')::boolean,false),
 can_export_reports=coalesce((p_input->>'canExportReports')::boolean,false),updated_at=clock_timestamp(),row_version=row_version+1 where id=target.id returning id into affected;
 delete from public.branch_assignments where business_id=p_business_id and business_user_id=target.id;
 for br in select value::uuid from jsonb_array_elements_text(p_input->'branchIds') loop
 perform 1 from public.branches where business_id=p_business_id and id=br and status='active';
 if not found then raise exception 'invalid_branch' using errcode='22023'; end if;
 insert into public.branch_assignments(business_id,business_user_id,branch_id) values(p_business_id,target.id,br);
 end loop;
 else raise exception 'invalid_input' using errcode='22023'; end if;
 end if;
 if affected is null then raise exception 'conflict' using errcode='40001'; end if;
 perform app_private.audit(p_business_id,'staff.'||(p_input->>'action'),'staff',affected,p_correlation_id);
 return jsonb_build_object('id',affected);
end $$;

do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname=any(array['public_configuration','read_policy','my_workspaces','check_slug','bootstrap_business','business_access',
 'create_staff_invitation','read_invitation','accept_staff_invitation','manage_staff']) loop
 execute format('revoke all on function %s from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',f);
 execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
grant execute on function public.public_configuration(),public.read_policy(uuid) to anon;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
