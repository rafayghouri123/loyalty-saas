begin;
create table public.privacy_requests (
 id uuid primary key default gen_random_uuid(),customer_user_id uuid references public.profiles(user_id),membership_id uuid,business_id uuid,
 kind text not null check(kind in ('export','delete_membership','delete_account')),status text not null default 'pending' check(status in ('pending','processing','blocked','completed','failed')),
 requested_at timestamptz not null default now(),completed_at timestamptz,result_storage_path text,result_expires_at timestamptz,error_code text,
 retained_categories jsonb not null default '["Financial ledger and balances","Minimal audit and enrollment proof","Backup copies until operator-configured expiry"]',export_request_id uuid references public.export_requests,
 idempotency_key uuid not null,request_hash text not null,processing_token uuid,processing_started_at timestamptz,database_completed_at timestamptz,auth_identity_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),row_version integer not null default 1,
 unique(customer_user_id,idempotency_key),foreign key(business_id,membership_id) references public.memberships(business_id,id),check((kind='delete_membership')=(membership_id is not null and business_id is not null)),check(jsonb_typeof(retained_categories)='array')
);
create index privacy_subject on public.privacy_requests(customer_user_id,requested_at desc);
create unique index privacy_one_deletion on public.privacy_requests(customer_user_id) where kind='delete_account' and status in ('pending','processing');
alter table public.export_requests add column privacy_request_id uuid references public.privacy_requests;
alter table public.export_artifacts drop constraint export_artifacts_mime_type_check;
alter table public.export_artifacts add check(mime_type in ('text/csv','application/json'));
update storage.buckets set allowed_mime_types=array['text/csv','application/json'] where id='loyalty-exports';
alter table public.privacy_requests enable row level security;
revoke all on public.privacy_requests from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;

create function public.request_privacy(p_kind text,p_membership uuid,p_key uuid,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;m public.memberships;r public.privacy_requests;x public.export_requests;hash text;subject text;retry integer;
begin
 actor:=app_private.actor();if p_kind not in ('export','delete_membership','delete_account') or p_key is null or ((p_kind='delete_membership') is distinct from (p_membership is not null)) then raise exception 'invalid_input' using errcode='22023';end if;
 if p_kind='delete_account' then perform app_private.require_recent_auth();end if;
 perform pg_advisory_xact_lock(hashtextextended('privacy:'||actor::text,0));
 hash:=encode(extensions.digest(jsonb_build_object('kind',p_kind,'membership',p_membership)::text,'sha256'),'hex');select * into r from public.privacy_requests where customer_user_id=actor and idempotency_key=p_key;
 if found then if r.request_hash<>hash then raise exception 'conflict' using errcode='40001';end if;return jsonb_build_object('requestId',r.id,'status',r.status,'errorCode',r.error_code,'replayed',true);end if;
 if p_kind='delete_membership' then select * into m from public.memberships where id=p_membership and customer_user_id=actor;if not found then raise exception 'not_found' using errcode='P0002';end if;end if;
 if p_kind='export' then
  perform pg_advisory_xact_lock(hashtextextended('report-export:'||actor::text,0));
  select encode(extensions.hmac(convert_to('export:'||actor::text,'UTF8'),secret,'sha256'),'hex') into strict subject from app_private.rate_limit_key where singleton;
  retry:=app_private.consume_fixed_rate(subject,'report.export',3600,3,clock_timestamp());if retry>0 then return jsonb_build_object('error',jsonb_build_object('code','rate_limited','retryAfterSeconds',retry));end if;
  if exists(select from public.export_requests where requested_by=actor and status in ('pending','processing')) then raise exception 'conflict' using errcode='40001';end if;
 end if;
 insert into public.privacy_requests(customer_user_id,membership_id,business_id,kind,idempotency_key,request_hash,auth_identity_id,status,error_code)
 values(actor,m.id,m.business_id,p_kind,p_key,hash,auth.uid(),case when p_kind='delete_account' and exists(select from public.business_users u join public.businesses b on b.id=u.business_id where u.user_id=actor and u.role='owner' and u.status='active' and b.status<>'archived') then 'blocked' else 'pending' end,
 case when p_kind='delete_account' and exists(select from public.business_users u join public.businesses b on b.id=u.business_id where u.user_id=actor and u.role='owner' and u.status='active' and b.status<>'archived') then 'active_business_owner' end) returning * into r;
 if p_kind='export' then
  insert into public.export_requests(requested_by,kind,filters,columns,auth_session_id,key,request_hash,privacy_request_id) values(actor,'account','{}','[]',(auth.jwt()->>'session_id')::uuid,p_key::text,hash,r.id) returning * into x;
  update public.privacy_requests set export_request_id=x.id where id=r.id;
 end if;
 perform app_private.audit(m.business_id,'privacy.requested','privacy_request',r.id,p_correlation,jsonb_build_object('kind',p_kind,'status',r.status));
 if r.status='pending' then insert into public.outbox_events(business_id,event_type,event_key,schema_version,payload) values(m.business_id,'privacy.requested',r.id::text,1,jsonb_build_object('privacyRequestId',r.id));end if;
 return jsonb_build_object('requestId',r.id,'status',r.status,'errorCode',r.error_code,'replayed',false);
end $$;

create function public.my_privacy_requests() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin actor:=app_private.actor();return jsonb_build_object('retentionConfigured',exists(select from public.platform_settings where key='financial_retention_policy') and exists(select from public.platform_settings where key='backup_coverage'),
 'financialPolicy',(select value#>>'{}' from public.platform_settings where key='financial_retention_policy'),'backupCoverage',(select value#>>'{}' from public.platform_settings where key='backup_coverage'),
 'requests',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'status',case when x.status='expired' then 'expired' else r.status end,'membershipId',r.membership_id,'requestedAt',r.requested_at,'completedAt',r.completed_at,'errorCode',r.error_code,'retainedCategories',r.retained_categories,'exportRequestId',r.export_request_id,'expiresAt',x.expires_at,'parts',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'part',a.part_number,'bytes',a.bytes::text,'mimeType',a.mime_type) order by a.part_number),'[]') from public.export_artifacts a where a.export_request_id=x.id and a.expires_at>clock_timestamp())) order by r.requested_at desc),'[]') from (select * from public.privacy_requests where customer_user_id=actor order by requested_at desc limit 100) r left join public.export_requests x on x.id=r.export_request_id));end $$;
create function public.account_export_access(p_artifact uuid,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;a public.export_artifacts;x public.export_requests;l app_private.export_links;
begin
 actor:=app_private.actor();select * into a from public.export_artifacts where id=p_artifact and expires_at>clock_timestamp();if not found then raise exception 'not_found' using errcode='P0002';end if;
 select * into x from public.export_requests where id=a.export_request_id and requested_by=actor and kind='account' and status='completed' and expires_at>clock_timestamp();if not found then raise exception 'forbidden' using errcode='42501';end if;
 if not exists(select from public.privacy_requests where id=x.privacy_request_id and customer_user_id=actor and status='completed') then raise exception 'forbidden' using errcode='42501';end if;
 select * into strict l from app_private.export_links where artifact_id=a.id;perform app_private.audit(null,'account.export_download','export_artifact',a.id,p_correlation);
 return jsonb_build_object('artifactId',a.id,'exportRequestId',x.id,'ciphertext',l.ciphertext,'keyId',l.key_id,'bytes',a.bytes::text,'mimeType',a.mime_type,'part',a.part_number);
end $$;

create function app_private.suppress_member(p_member uuid,p_whole boolean) returns void language plpgsql set search_path='' as $$
declare m public.memberships;
begin
 select * into strict m from public.memberships where id=p_member for update;
 update public.memberships set status='anonymized',display_name='Deleted member',left_at=coalesce(left_at,clock_timestamp()),customer_user_id=case when p_whole then null else customer_user_id end,updated_at=clock_timestamp(),row_version=row_version+1 where id=m.id;
 update public.membership_contacts set phone_e164=null,shared_email=null,phone_status='unverified',phone_confirmed_at=null,phone_confirmed_by=null,contact_changed_at=clock_timestamp(),updated_at=clock_timestamp(),row_version=row_version+1 where membership_id=m.id;
 update public.consent_preferences set allowed=false,changed_at=clock_timestamp(),updated_at=clock_timestamp(),row_version=row_version+1 where membership_id=m.id;
 update public.membership_handles set status='revoked',revoked_at=coalesce(revoked_at,clock_timestamp()) where membership_id=m.id;
 update public.redemption_intents set canceled_at=clock_timestamp() where membership_id=m.id and consumed_at is null and canceled_at is null;
 update public.offer_claim_intents set canceled_at=clock_timestamp() where membership_id=m.id and consumed_at is null and canceled_at is null;
 update public.scanner_codes set consumed_at=coalesce(consumed_at,clock_timestamp()) where membership_id=m.id;
 update app_private.checkout_contexts set consumed_at=coalesce(consumed_at,clock_timestamp()) where membership_id=m.id;
 update public.followup_tasks set state=case when state in ('pending','assigned','opened') then 'opted_out' else state end,rendered_body='[Deleted personal content]',lease_owner_business_user_id=null,lease_expires_at=null,updated_at=clock_timestamp(),row_version=row_version+1 where membership_id=m.id;
 update public.followup_events set note=null where task_id in (select id from public.followup_tasks where membership_id=m.id);
 update public.campaign_recipients set status='suppressed',suppression_reason='member_unavailable' where membership_id=m.id and status in ('pending','processing');
end $$;

create function public.worker_privacy_job(p_outbox uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.outbox_events;r public.privacy_requests;token uuid;
begin
 select * into e from public.outbox_events where id=p_outbox;
 if e.event_type is distinct from 'privacy.requested' or e.schema_version<>1 or e.payload<>jsonb_build_object('privacyRequestId',e.event_key::uuid) then raise exception 'invalid_event' using errcode='22023';end if;
 select * into strict r from public.privacy_requests where id=e.event_key::uuid and business_id is not distinct from e.business_id for update;
 if r.status in ('completed','blocked') then return null;end if;
 if r.kind='delete_account' and exists(select from public.business_users u join public.businesses b on b.id=u.business_id where u.user_id=r.customer_user_id and u.role='owner' and u.status='active' and b.status<>'archived') then update public.privacy_requests set status='blocked',error_code='active_business_owner' where id=r.id;return null;end if;
 if r.status='processing' and r.processing_started_at>clock_timestamp()-interval '10 minutes' then raise exception 'lease_active' using errcode='40001';end if;
 if r.kind='export' and r.requested_at+interval '24 hours'<=clock_timestamp() then update public.export_requests set status='expired' where id=r.export_request_id;update public.privacy_requests set status='failed',error_code='expired' where id=r.id;return null;end if;
 token:=gen_random_uuid();update public.privacy_requests set status='processing',processing_token=token,processing_started_at=clock_timestamp(),error_code=null,updated_at=clock_timestamp() where id=r.id;
 if r.kind='export' then
 delete from app_private.export_links where artifact_id in (select id from public.export_artifacts where export_request_id=r.export_request_id);
 delete from public.export_artifacts where export_request_id=r.export_request_id;
 update public.export_requests set status='processing',processing_token=token,processing_started_at=clock_timestamp() where id=r.export_request_id;end if;
 return jsonb_build_object('requestId',r.id,'customerId',r.customer_user_id,'membershipId',r.membership_id,'kind',r.kind,'processingToken',token,'exportRequestId',r.export_request_id,'authIdentityId',r.auth_identity_id,'expiresAt',r.requested_at+interval '24 hours');
end $$;

-- Keyset pages bound worker memory. Each projection contains ONLY this account's data.
create function public.worker_account_export_page(p_request uuid,p_token uuid,p_section text,p_cursor uuid default null) returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare r public.privacy_requests;rows jsonb;last_id uuid;
begin
 select * into strict r from public.privacy_requests where id=p_request and kind='export' and status='processing' and processing_token=p_token and requested_at+interval '24 hours'>clock_timestamp();
 if not exists(select from public.profiles where user_id=r.customer_user_id and anonymized_at is null and auth_user_id is not null) then raise exception 'forbidden' using errcode='42501';end if;
 update public.privacy_requests set processing_started_at=clock_timestamp() where id=r.id;
 if p_section='profile' then select coalesce(jsonb_agg(x),'[]') into rows from (select user_id as id,display_name,preferred_timezone,birthday_month,birthday_day,created_at,updated_at,(select email from auth.users where id=p.auth_user_id) as verified_email from public.profiles p where user_id=r.customer_user_id and (p_cursor is null or user_id>p_cursor)) x;
 elsif p_section='memberships' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select m.id,m.business_id,b.display_name as business,m.display_name,m.status,m.joined_at,m.left_at,m.joined_branch_id,c.phone_e164,c.phone_status,c.shared_email,c.contact_changed_at,bal.units::text as balance_units from public.memberships m join public.businesses b on b.id=m.business_id left join public.membership_contacts c on c.membership_id=m.id left join public.balances bal on bal.membership_id=m.id where m.customer_user_id=r.customer_user_id and (p_cursor is null or m.id>p_cursor) order by m.id limit 100) x;
 elsif p_section='purchases' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select p.id,p.business_id,p.membership_id,p.branch_id,p.status,p.recorded_bill_paisa::text as recorded_bill_paisa,p.eligible_spend_paisa::text as eligible_spend_paisa,p.base_units::text as base_units,p.promotion_bonus_units::text as promotion_bonus_units,p.occurred_at from public.purchases p join public.memberships m on m.id=p.membership_id where m.customer_user_id=r.customer_user_id and (p_cursor is null or p.id>p_cursor) order by p.id limit 100) x;
 elsif p_section='ledger' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select l.id,l.business_id,l.membership_id,l.entry_kind,l.units::text as units,l.purchase_id,l.redemption_id,l.occurred_at from public.ledger_entries l join public.memberships m on m.id=l.membership_id where m.customer_user_id=r.customer_user_id and (p_cursor is null or l.id>p_cursor) order by l.id limit 100) x;
 elsif p_section='consent' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select c.id,c.business_id,c.membership_id,c.channel,c.purpose,c.allowed,c.text_version,c.source,c.occurred_at from public.consent_events c join public.memberships m on m.id=c.membership_id where m.customer_user_id=r.customer_user_id and (p_cursor is null or c.id>p_cursor) order by c.id limit 100) x;
 elsif p_section='enrollment' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select a.id,a.business_id,a.membership_id,a.programme_version_id,a.platform_terms_document_id,a.privacy_document_id,a.accepted_at from public.enrollment_acceptances a join public.memberships m on m.id=a.membership_id where m.customer_user_id=r.customer_user_id and (p_cursor is null or a.id>p_cursor) order by a.id limit 100) x;
 elsif p_section='redemptions' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select a.id,a.business_id,a.membership_id,a.reward_version_id,a.unit_cost::text as unit_cost,a.fulfilled_at from public.redemptions a join public.memberships m on m.id=a.membership_id where m.customer_user_id=r.customer_user_id and (p_cursor is null or a.id>p_cursor) order by a.id limit 100) x;
 elsif p_section='offers' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select a.id,a.business_id,a.offer_id,a.status,a.claimed_at,a.fulfilled_at,a.applied_discount_paisa::text as applied_discount_paisa,a.benefit_description from public.offer_claims a join public.memberships m on m.id=a.membership_id where m.customer_user_id=r.customer_user_id and (p_cursor is null or a.id>p_cursor) order by a.id limit 100) x;
 elsif p_section='referrals' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select a.id,a.business_id,a.status,a.enrolled_at,a.qualified_at,a.qualifies_until,a.reversed_at,a.inviter_awarded_units::text as inviter_awarded_units,a.friend_awarded_units::text as friend_awarded_units,case when m.id=a.referrer_membership_id then 'inviter' else 'friend' end as my_role from public.referral_claims a join public.memberships m on m.id in (a.referrer_membership_id,a.referred_membership_id) where m.customer_user_id=r.customer_user_id and (p_cursor is null or a.id>p_cursor) order by a.id limit 100) x;
 elsif p_section='devices' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select id,status,browser_label,last_seen_at,revoked_at,created_at from public.push_devices where customer_user_id=r.customer_user_id and (p_cursor is null or id>p_cursor) order by id limit 100) x;
 elsif p_section='communications' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select t.id,t.business_id,t.state,t.rendered_body,t.opened_at,t.marked_sent_at,t.created_at from public.followup_tasks t join public.memberships m on m.id=t.membership_id where m.customer_user_id=r.customer_user_id and (p_cursor is null or t.id>p_cursor) order by t.id limit 100) x;
 elsif p_section='current_consent' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select c.id,c.business_id,c.membership_id,c.channel,c.purpose,c.allowed,c.text_version,c.policy_document_id,c.changed_at,c.source from public.consent_preferences c join public.memberships m on m.id=c.membership_id where m.customer_user_id=r.customer_user_id and (p_cursor is null or c.id>p_cursor) order by c.id limit 100) x;
 elsif p_section='notifications' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select c.id,c.business_id,c.membership_id,c.status,c.suppression_reason,c.snapshot_at,c.observed_clicked_at,v.title,v.body from public.campaign_recipients c join public.memberships m on m.id=c.membership_id join public.campaign_versions v on v.id=c.campaign_version_id where m.customer_user_id=r.customer_user_id and (p_cursor is null or c.id>p_cursor) order by c.id limit 100) x;
 elsif p_section='automations' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select a.id,a.business_id,a.membership_id,a.state,a.rendered_title,a.rendered_body,a.created_at from public.automation_runs a join public.memberships m on m.id=a.membership_id where m.customer_user_id=r.customer_user_id and (p_cursor is null or a.id>p_cursor) order by a.id limit 100) x;
 elsif p_section='payment_submissions' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select id,business_id,invoice_id,claimed_amount_paisa::text as claimed_amount_paisa,method,claimed_reference,status,review_note,created_at from public.payment_submissions where submitted_by=r.customer_user_id and (p_cursor is null or id>p_cursor) order by id limit 100) x;
 elsif p_section='audit' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select id,business_id,action,target_type,target_id,reason,occurred_at from public.audit_events where actor_user_id=r.customer_user_id and (p_cursor is null or id>p_cursor) order by id limit 100) x;
 elsif p_section='staff' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select id,business_id,staff_display_name,staff_email,role,status,created_at from public.business_users where user_id=r.customer_user_id and (p_cursor is null or id>p_cursor) order by id limit 100) x;
 elsif p_section='privacy' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select id,kind,status,requested_at,completed_at,retained_categories from public.privacy_requests where customer_user_id=r.customer_user_id and (p_cursor is null or id>p_cursor) order by id limit 100) x;
 else raise exception 'invalid_section' using errcode='22023';end if;
 last_id:=(rows->(jsonb_array_length(rows)-1)->>'id')::uuid;
 return jsonb_build_object('rows',rows,'nextCursor',case when jsonb_array_length(rows)=100 then last_id end);
end $$;

create function public.worker_reserve_account_upload(p_request uuid,p_token uuid,p_path text) returns void language plpgsql security definer set search_path='' as $$
declare r public.privacy_requests;
begin
 select * into strict r from public.privacy_requests where id=p_request and kind='export' and status='processing' and processing_token=p_token and requested_at+interval '24 hours'>clock_timestamp();
 if p_path not like r.customer_user_id::text||'/'||r.export_request_id::text||'/'||p_token::text||'/%' or p_path !~ '/[0-9]+\.json$' then raise exception 'invalid_path' using errcode='22023';end if;
 insert into app_private.export_uploads(export_request_id,path) values(r.export_request_id,p_path) on conflict do nothing;
end $$;
create function public.worker_account_artifact(p_request uuid,p_token uuid,p_part integer,p_path text,p_bytes bigint,p_ciphertext text,p_key_id text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.privacy_requests;a uuid;
begin
 select * into strict r from public.privacy_requests where id=p_request and kind='export' and status='processing' and processing_token=p_token and requested_at+interval '24 hours'>clock_timestamp() for update;
 if p_part not between 1 and 100000 or p_path<>r.customer_user_id::text||'/'||r.export_request_id::text||'/'||p_token::text||'/'||p_part::text||'.json' then raise exception 'invalid_artifact' using errcode='22023';end if;
 insert into public.export_artifacts(export_request_id,part_number,storage_path,bytes,mime_type,expires_at) values(r.export_request_id,p_part,p_path,p_bytes,'application/json',r.requested_at+interval '24 hours') returning id into a;
 insert into app_private.export_links values(a,p_ciphertext,p_key_id);insert into app_private.export_uploads(export_request_id,path) values(r.export_request_id,p_path) on conflict do nothing;return a;
end $$;
create function public.worker_privacy_database(p_request uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.privacy_requests;mid uuid;bid uuid;
begin
 select * into strict r from public.privacy_requests where id=p_request and status='processing' and processing_token=p_token for update;
 if r.kind='export' then raise exception 'invalid_kind' using errcode='22023';end if;
 if r.database_completed_at is not null then return jsonb_build_object('authIdentityId',r.auth_identity_id);end if;
 -- Same lock used by bootstrap prevents creating a new owner while deletion is checked.
 perform pg_advisory_xact_lock(hashtextextended('owner-trial:'||r.customer_user_id::text,0));
 if r.kind='delete_account' and exists(select from public.business_users u join public.businesses b on b.id=u.business_id where u.user_id=r.customer_user_id and u.role='owner' and u.status='active' and b.status<>'archived') then update public.privacy_requests set status='blocked',error_code='active_business_owner' where id=r.id;return jsonb_build_object('blocked',true);end if;
 for bid in select distinct business_id from public.memberships where (r.kind='delete_account' and customer_user_id=r.customer_user_id) or id=r.membership_id order by business_id loop perform 1 from public.businesses where id=bid for update;end loop;
 for mid in select id from public.memberships where (r.kind='delete_account' and customer_user_id=r.customer_user_id) or (id=r.membership_id and customer_user_id=r.customer_user_id) order by id loop perform app_private.suppress_member(mid,r.kind='delete_account');end loop;
 if r.kind='delete_account' then
  update public.push_devices set status='revoked',revoked_at=coalesce(revoked_at,clock_timestamp()),token_ciphertext=repeat('x',40),browser_label=null,updated_at=clock_timestamp() where customer_user_id=r.customer_user_id;
  update public.push_registration_challenges set canceled_at=clock_timestamp(),nonce_ciphertext=repeat('x',40) where customer_user_id=r.customer_user_id and consumed_at is null and canceled_at is null;
  update public.business_users set status='revoked',staff_display_name='Deleted user',staff_email='deleted@example.invalid',updated_at=clock_timestamp(),row_version=row_version+1 where user_id=r.customer_user_id;
  update public.platform_admins set active=false where user_id=r.customer_user_id;
  delete from auth.sessions where user_id=r.auth_identity_id;
  update public.profiles set display_name='Deleted user',birthday_month=null,birthday_day=null,birthday_changed_at=null,preferred_timezone='Asia/Karachi',deletion_requested_at=r.requested_at,anonymized_at=clock_timestamp(),auth_user_id=null,updated_at=clock_timestamp(),row_version=row_version+1 where user_id=r.customer_user_id;
 end if;
 update public.privacy_requests set database_completed_at=clock_timestamp(),updated_at=clock_timestamp() where id=r.id;
 return jsonb_build_object('authIdentityId',case when r.kind='delete_account' then r.auth_identity_id end);
end $$;
create function public.worker_finish_privacy(p_request uuid,p_token uuid,p_error text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.privacy_requests;
begin
 select * into r from public.privacy_requests where id=p_request and processing_token=p_token and status='processing' for update;if not found then return false;end if;
 if p_error is not null and p_error not in ('temporary_failure','expired','permission_revoked') then raise exception 'invalid_error' using errcode='22023';end if;
 if p_error is null and r.kind='export' and not exists(select from public.export_artifacts where export_request_id=r.export_request_id and part_number=1) then raise exception 'artifact_missing' using errcode='23514';end if;
 if p_error is null and r.kind<>'export' and r.database_completed_at is null then raise exception 'database_incomplete' using errcode='23514';end if;
 update public.privacy_requests set status=case when p_error is null then 'completed' else 'failed' end,error_code=p_error,completed_at=case when p_error is null then clock_timestamp() end,auth_identity_id=case when p_error is null and kind='delete_account' then null else auth_identity_id end,updated_at=clock_timestamp() where id=r.id;
 if r.kind='export' then update public.export_requests set status=case when p_error is null then 'completed' else 'failed' end,error_code=p_error,expires_at=r.requested_at+interval '24 hours',updated_at=clock_timestamp() where id=r.export_request_id;end if;
 if p_error is null then insert into public.job_effect_receipts(handler_name,event_key,result_reference,completed_at) values('privacy.completed',r.id::text,r.id,clock_timestamp()) on conflict do nothing;insert into public.audit_events(business_id,actor_user_id,action,target_type,target_id,safe_changes,correlation_id,occurred_at) values(r.business_id,r.customer_user_id,'privacy.completed','privacy_request',r.id,jsonb_build_object('kind',r.kind),gen_random_uuid()::text,clock_timestamp());end if;
 return true;
end $$;
create function public.admin_privacy_queue(p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform app_private.phase8_admin('support');if p_page not between 1 and 4000 then raise exception 'invalid_input' using errcode='22023';end if;return jsonb_build_object('rows',(select coalesce(jsonb_agg(x),'[]') from (select id,customer_user_id as "subjectId",kind,status,requested_at as "requestedAt",completed_at as "completedAt",error_code as "errorCode",retained_categories as "retainedCategories" from public.privacy_requests order by requested_at desc,id limit 25 offset (p_page-1)*25) x),'total',(select count(*) from public.privacy_requests));end $$;
create function public.admin_retry_privacy(p_request uuid,p_reason text,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.privacy_requests;
begin
 perform app_private.phase8_admin('support',true);if p_reason is null or char_length(btrim(p_reason)) not between 10 and 500 then raise exception 'invalid_input' using errcode='22023';end if;
 select * into strict r from public.privacy_requests where id=p_request and status in ('failed','blocked') for update;
 if r.kind='export' and r.requested_at+interval '24 hours'<=clock_timestamp() then raise exception 'expired' using errcode='22023';end if;
 if r.kind='delete_account' and exists(select from public.business_users u join public.businesses b on b.id=u.business_id where u.user_id=r.customer_user_id and u.role='owner' and u.status='active' and b.status<>'archived') then raise exception 'owner_unresolved' using errcode='42501';end if;
 if r.kind='export' then raise exception 'request_new_export' using errcode='22023';end if;
 update public.privacy_requests set status='pending',processing_token=null,error_code=null where id=r.id;
 insert into public.outbox_events(business_id,event_type,event_key,schema_version,payload) values(r.business_id,'privacy.requested',r.id::text,1,jsonb_build_object('privacyRequestId',r.id)) on conflict(event_type,event_key) do update set state='pending',dispatched_at=null;
 delete from pgboss.job where id=(select id from public.outbox_events where event_type='privacy.requested' and event_key=r.id::text) and state in ('failed','completed','cancelled');
 perform app_private.admin_audit(r.business_id,'privacy.retry_approved','privacy_request',r.id,btrim(p_reason),p_correlation);return jsonb_build_object('requestId',r.id,'status','pending');
end $$;

create function public.worker_retention() returns jsonb language plpgsql security definer set search_path='' as $$
declare expired_devices integer;
begin
 update public.push_devices set status='revoked',revoked_at=clock_timestamp(),token_ciphertext=repeat('x',40),updated_at=clock_timestamp() where status in ('active','pending') and last_seen_at<clock_timestamp()-make_interval(days=>app_private.setting_days('device_retention_days',90));get diagnostics expired_devices=row_count;
 update public.push_registration_challenges set canceled_at=clock_timestamp(),nonce_ciphertext=repeat('x',40) where consumed_at is null and canceled_at is null and push_device_id in (select id from public.push_devices where status='revoked');
 update public.followup_tasks set rendered_body='[Content removed under retention policy]' where created_at<clock_timestamp()-make_interval(days=>app_private.setting_days('notification_retention_days',90)) and rendered_body not in ('[Content removed under retention policy]','[Deleted personal content]');
 update public.delivery_attempts set error_code=null,provider_message_id=null where attempted_at<clock_timestamp()-make_interval(days=>app_private.setting_days('notification_retention_days',90));
 delete from public.referral_visit_events where occurred_at<clock_timestamp()-make_interval(days=>app_private.setting_days('referral_visit_retention_days',90));
 delete from app_private.checkout_contexts where expires_at<clock_timestamp()-interval '24 hours';
 return jsonb_build_object('revokedDevices',expired_devices);
end $$;
do $$ declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['request_privacy','my_privacy_requests','account_export_access','worker_privacy_job','worker_account_export_page','worker_account_artifact','worker_reserve_account_upload','worker_privacy_database','worker_finish_privacy','admin_privacy_queue','admin_retry_privacy','worker_retention']) loop execute format('revoke all on function %s from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',f);execute format('grant execute on function %s to %I',f,case when f::text like '%worker_%' then 'loyalty_worker' else 'authenticated' end);end loop;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
