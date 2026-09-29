begin;
create table public.export_requests(
 id uuid primary key default gen_random_uuid(),business_id uuid references public.businesses(id),requested_by uuid not null references public.profiles(user_id),
 kind text not null check(kind in ('report','contacts','account')),filters jsonb not null,columns jsonb not null,
 status text not null default 'pending' check(status in ('pending','processing','completed','failed','expired')),
 expires_at timestamptz,row_count integer check(row_count between 0 and 10000),error_code text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),row_version integer not null default 1,
 auth_session_id uuid not null,key text not null,request_hash text not null,processing_started_at timestamptz,processing_token uuid,
 unique(requested_by,key),check((kind='account')=(business_id is null)),check(jsonb_typeof(columns)='array')
);
create unique index export_one_running on public.export_requests(requested_by) where status in ('pending','processing');
create index export_request_business on public.export_requests(business_id,requested_by,created_at desc);
create table public.export_artifacts(
 id uuid primary key default gen_random_uuid(),export_request_id uuid not null references public.export_requests(id),part_number integer not null check(part_number>0),
 storage_path text not null unique,bytes bigint not null check(bytes between 0 and 3145728),mime_type text not null check(mime_type='text/csv'),
 expires_at timestamptz not null,created_at timestamptz not null default now(),unique(export_request_id,part_number)
);
-- A private Storage URL is encrypted with the existing server key. Only the
-- authenticated no-store download proxy decrypts it; no bearer URL is exposed.
create table app_private.export_links(
 artifact_id uuid primary key references public.export_artifacts(id),ciphertext text not null,key_id text not null
);
create table app_private.export_uploads(
 export_request_id uuid not null references public.export_requests(id),path text primary key,created_at timestamptz not null default now()
);
create table app_private.export_columns(kind text primary key,ids text[] not null);
insert into app_private.export_columns values
 ('overview',array['date','recordedSalesPaisa','eligibleSpendPaisa','purchases','reversedPurchases']),
 ('customers',array['memberId','name','joinedDate','qualifyingPurchases','recordedSalesPaisa','returning']),
 ('rewards',array['sourceId','activityKind','reward','occurredAt','status','units','estimatedCostPaisa']),
 ('referrals',array['claimId','enrolledAt','status','inviterSuppression','inviterIssuedUnits','friendIssuedUnits','qualifiedAt','reversedAt']),
 ('promotions',array['promotionVersionId','slot','version','purchases','reversals','eligibleSpendPaisa','bonusUnits']),
 ('campaigns',array['campaignId','campaign','status','uniqueAudience','suppressedMembers','deviceAttempts','providerAcceptedDeviceSends','failedDeviceAttempts','unknownDeviceAttempts','observedClicks','uniqueOfferClaims','fulfilledClaims','associatedPurchases','associatedSalesPaisa']),
 ('staff',array['staffId','staff','purchases','awardedUnits','redemptions','purchaseReversals','redemptionReversals','offerFulfillments','adjustments','adjustmentUnits']),
 ('contacts',array['memberId','name','phone','sharedEmail']);
alter table public.export_requests enable row level security;
alter table public.export_artifacts enable row level security;
alter table app_private.export_links enable row level security;
alter table app_private.export_columns enable row level security;
alter table app_private.export_uploads enable row level security;
revoke all on public.export_requests,public.export_artifacts,app_private.export_links,app_private.export_columns,app_private.export_uploads from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('loyalty-exports','loyalty-exports',false,3145728,array['text/csv']);
-- No browser policies on this bucket, including listing.

create function public.request_report_export(p_business uuid,p_filters jsonb,p_columns jsonb,p_key text,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare s public.business_users;f jsonb;columns text[];allowed text[];subject text;retry integer;r public.export_requests;hash text;actor uuid;
begin
 s:=app_private.report_staff(p_business,true,coalesce(p_filters->>'reportKind','overview')='contacts');actor:=s.user_id;
 if s.role='owner' then perform app_private.actor(true);end if;
 f:=app_private.report_filters(p_business,p_filters,s);
 if p_key is null or char_length(p_key) not between 16 and 100 or p_correlation is null or p_columns is null or jsonb_typeof(p_columns)<>'array' then raise exception 'invalid_input' using errcode='22023';end if;
 columns:=array(select jsonb_array_elements_text(p_columns));select ids into allowed from app_private.export_columns where kind=f->>'reportKind';
 if cardinality(columns)=0 or cardinality(columns)>20 or cardinality(columns)<>cardinality(array(select distinct unnest(columns))) or not columns<@allowed then raise exception 'invalid_columns' using errcode='22023';end if;
 hash:=encode(extensions.digest(convert_to(jsonb_build_object('business',p_business,'filters',p_filters,'columns',p_columns)::text,'UTF8'),'sha256'),'hex');
 -- No profile lock upgrade: actor() already holds a share lock. A transaction
 -- advisory lock serializes exports without an upgrade deadlock across tabs.
 perform pg_advisory_xact_lock(hashtextextended('report-export:'||actor::text,0));
 select * into r from public.export_requests where requested_by=actor and key=p_key;
 if found then
  if r.request_hash<>hash then raise exception 'conflict' using errcode='40001';end if;
  return jsonb_build_object('exportRequestId',r.id,'status',r.status,'replayed',true);
 end if;
 select encode(extensions.hmac(convert_to('export:'||actor::text,'UTF8'),secret,'sha256'),'hex') into strict subject from app_private.rate_limit_key where singleton;
 retry:=app_private.consume_fixed_rate(subject,'report.export',3600,3,clock_timestamp());
 if retry>0 then return jsonb_build_object('error',jsonb_build_object('code','rate_limited','retryAfterSeconds',retry));end if;
 if exists(select from public.export_requests where requested_by=actor and status in ('pending','processing')) then return jsonb_build_object('error',jsonb_build_object('code','conflict','message','One export is already running.'));end if;
 insert into public.export_requests(business_id,requested_by,kind,filters,columns,auth_session_id,key,request_hash)
 values(p_business,actor,case when f->>'reportKind'='contacts' then 'contacts' else 'report' end,f,p_columns,(auth.jwt()->>'session_id')::uuid,p_key,hash) returning * into r;
 perform app_private.audit(p_business,'export.requested','export_request',r.id,p_correlation,jsonb_build_object('kind',r.kind,'reportKind',f->>'reportKind','columns',p_columns));
 insert into public.outbox_events(business_id,event_type,event_key,schema_version,payload) values(p_business,'report.export_requested',r.id::text,1,jsonb_build_object('exportRequestId',r.id));
 return jsonb_build_object('exportRequestId',r.id,'status',r.status,'replayed',false);
end $$;

create function app_private.export_current_scope(r public.export_requests) returns jsonb language plpgsql set search_path='' as $$
declare s public.business_users;allowed uuid[];selected uuid[];
begin
 if not exists(select from public.profiles p join auth.users u on u.id=p.auth_user_id join auth.sessions a on a.user_id=u.id and a.id=r.auth_session_id
 where p.user_id=r.requested_by and p.anonymized_at is null and u.deleted_at is null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (a.not_after is null or a.not_after>clock_timestamp())) then raise exception 'forbidden' using errcode='42501';end if;
 perform 1 from public.businesses where id=r.business_id and status<>'archived' for share;if not found then raise exception 'forbidden' using errcode='42501';end if;
 select * into s from public.business_users where business_id=r.business_id and user_id=r.requested_by and status='active' for share;
 if s.id is null or s.role not in ('owner','manager') or (s.role='manager' and (not s.can_export_reports or (r.kind='contacts' and not s.can_contact_customers))) then raise exception 'forbidden' using errcode='42501';end if;
 perform 1 from public.branch_assignments where business_id=r.business_id and business_user_id=s.id order by branch_id for share;
 selected:=array(select jsonb_array_elements_text(r.filters->'branchIds')::uuid);
 allowed:=array(select b.id from public.branches b where b.business_id=r.business_id and (s.role='owner' or exists(select from public.branch_assignments a where a.business_id=r.business_id and a.business_user_id=s.id and a.branch_id=b.id)));
 if not selected<@allowed or ((r.filters->>'allBranches')::boolean and s.role<>'owner') then raise exception 'forbidden' using errcode='42501';end if;
 return r.filters;
end $$;

create function public.report_export_status(p_business uuid,p_export uuid,p_download boolean default false,p_correlation uuid default null) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare r public.export_requests;s public.business_users;a public.export_artifacts;l app_private.export_links;
begin
 select * into r from public.export_requests where id=p_export and business_id=p_business and requested_by=app_private.actor();
 if r.id is null then raise exception 'not_found' using errcode='P0002';end if;
 s:=app_private.report_staff(p_business,true,r.kind='contacts');perform app_private.export_current_scope(r);
 if p_download then
  if r.status<>'completed' or r.expires_at<=clock_timestamp() then raise exception 'expired' using errcode='P0002';end if;
  select * into strict a from public.export_artifacts where export_request_id=r.id and part_number=1 and expires_at>clock_timestamp();
  select * into strict l from app_private.export_links where artifact_id=a.id;
  perform app_private.audit(p_business,'export.download_authorized','export_request',r.id,coalesce(p_correlation,gen_random_uuid()),jsonb_build_object('kind',r.kind,'bytes',a.bytes));
  return jsonb_build_object('artifactId',a.id,'ciphertext',l.ciphertext,'keyId',l.key_id,'bytes',a.bytes::text,'mimeType',a.mime_type);
 end if;
 return jsonb_build_object('exportRequestId',r.id,'status',case when r.expires_at<=clock_timestamp() then 'expired' else r.status end,'rowCount',r.row_count,'errorCode',r.error_code,'expiresAt',r.expires_at);
end $$;

create function public.worker_report_export(p_outbox uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.outbox_events;r public.export_requests;f jsonb;result jsonb;token uuid;path text;
begin
 select * into e from public.outbox_events where id=p_outbox and event_type='report.export_requested' and schema_version=1;
 if e.id is null then raise exception 'invalid_job' using errcode='22023';end if;
 select * into r from public.export_requests where id=(e.payload->>'exportRequestId')::uuid and business_id=e.business_id for update;
 if r.id is null then raise exception 'invalid_job' using errcode='22023';end if;
 if r.status in ('completed','failed','expired') then return null;end if;
 if r.status='processing' and r.processing_started_at>clock_timestamp()-interval '5 minutes' then raise exception 'export_in_progress' using errcode='40001';end if;
 begin f:=app_private.export_current_scope(r);exception when insufficient_privilege then update public.export_requests set status='failed',error_code='permission_revoked',updated_at=clock_timestamp() where id=r.id;return null;end;
 if clock_timestamp()-r.created_at>interval '24 hours' then update public.export_requests set status='expired',updated_at=clock_timestamp() where id=r.id;return null;end if;
 result:=app_private.report_data(r.business_id,f,true);
 if (result->>'totalRows')::bigint>10000 then update public.export_requests set status='failed',error_code='narrow_filters',updated_at=clock_timestamp() where id=r.id;return null;end if;
 token:=gen_random_uuid();path:=r.business_id::text||'/'||r.id::text||'/'||token::text||'.csv';
 insert into app_private.export_uploads(export_request_id,path) values(r.id,path);
 update public.export_requests set status='processing',processing_token=token,row_count=(result->>'totalRows')::integer,processing_started_at=clock_timestamp(),updated_at=clock_timestamp() where id=r.id;
 return jsonb_build_object('exportRequestId',r.id,'businessId',r.business_id,'columns',r.columns,'rows',result->'rows','metrics',result->'metrics','dataAsOf',result->'dataAsOf','filters',f,
 'artifactId',r.id,'processingToken',token,'path',path,'expiresAt',r.created_at+interval '24 hours');
end $$;
create function public.worker_finish_report_export(p_export uuid,p_token uuid,p_bytes bigint,p_ciphertext text,p_key_id text,p_error text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.export_requests;
begin
 select * into strict r from public.export_requests where id=p_export for update;
 if r.status in ('completed','failed','expired') then return false;end if;
 if p_token is distinct from r.processing_token then return false;end if;
 begin perform app_private.export_current_scope(r);exception when insufficient_privilege then p_error:='permission_revoked';end;
 if r.created_at+interval '24 hours'<=clock_timestamp() then p_error:='expired';end if;
 if p_error is not null then
  if p_error not in ('permission_revoked','narrow_filters','expired','temporary_failure') then raise exception 'invalid_input' using errcode='22023';end if;
  update public.export_requests set status=case when p_error='expired' then 'expired' else 'failed' end,error_code=p_error,updated_at=clock_timestamp() where id=r.id;return false;
 end if;
 if r.status<>'processing' or p_bytes not between 0 and 3145728 or p_ciphertext is null or char_length(p_ciphertext) not between 30 and 8192 or p_key_id is null then raise exception 'invalid_input' using errcode='22023';end if;
 insert into public.export_artifacts(id,export_request_id,part_number,storage_path,bytes,mime_type,expires_at) values(r.id,r.id,1,r.business_id::text||'/'||r.id::text||'/'||p_token::text||'.csv',p_bytes,'text/csv',r.created_at+interval '24 hours');
 insert into app_private.export_links values(r.id,p_ciphertext,p_key_id);
 update public.export_requests set status='completed',expires_at=r.created_at+interval '24 hours',updated_at=clock_timestamp() where id=r.id;
 insert into public.job_effect_receipts(business_id,handler_name,event_key,result_reference,completed_at) values(r.business_id,'report-export',r.id::text,r.id,clock_timestamp()) on conflict do nothing;
 return true;
end $$;
create function public.worker_expired_report_exports() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 update public.export_requests set status='expired',updated_at=clock_timestamp() where status in ('pending','processing','completed') and created_at+interval '24 hours'<=clock_timestamp();
 return (select coalesce(jsonb_agg(jsonb_build_object('exportRequestId',a.export_request_id,'path',a.path)),'[]') from
 (select u.* from app_private.export_uploads u join public.export_requests r on r.id=u.export_request_id left join public.export_artifacts a on a.storage_path=u.path
 where r.created_at+interval '24 hours'<=clock_timestamp() or a.expires_at<=clock_timestamp() or (r.status in ('completed','failed') and a.id is null)
 order by u.created_at,u.path limit 50)a);
end
$$;
create function public.worker_fail_report_export(p_outbox uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.outbox_events;
begin
 select * into e from public.outbox_events where id=p_outbox and event_type='report.export_requested' and schema_version=1;
 if e.id is null then raise exception 'invalid_job' using errcode='22023';end if;
 update public.export_requests set status='failed',error_code='temporary_failure',updated_at=clock_timestamp()
 where id=(e.payload->>'exportRequestId')::uuid and business_id=e.business_id and status in ('pending','processing');
end $$;
create function public.worker_purge_report_export(p_export uuid,p_path text) returns void language plpgsql security definer set search_path='' as $$
declare a public.export_artifacts;r public.export_requests;
begin
 select * into r from public.export_requests where id=p_export for update;
 if r.id is null or not exists(select from app_private.export_uploads where export_request_id=r.id and path=p_path) then raise exception 'invalid_path' using errcode='22023';end if;
 select * into a from public.export_artifacts where export_request_id=r.id and storage_path=p_path;
 if a.id is not null and a.expires_at>clock_timestamp() then raise exception 'not_expired' using errcode='22023';end if;
 if a.id is null and r.created_at+interval '24 hours'>clock_timestamp() and r.status not in ('completed','failed') then raise exception 'not_expired' using errcode='22023';end if;
 if a.id is not null then delete from app_private.export_links where artifact_id=a.id;delete from public.export_artifacts where id=a.id;
 update public.export_requests set status='expired',updated_at=clock_timestamp() where id=r.id;end if;
 delete from app_private.export_uploads where export_request_id=r.id and path=p_path;
end $$;
do $$ declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['request_report_export','report_export_status','worker_report_export','worker_finish_report_export','worker_expired_report_exports','worker_purge_report_export','worker_fail_report_export']) loop
 execute format('revoke all on function %s from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',f);
 execute format('grant execute on function %s to %I',f,case when f::text like '%worker_%' then 'loyalty_worker' else 'authenticated' end);end loop;
end $$;
revoke all on function app_private.export_current_scope(public.export_requests) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
notify pgrst,'reload schema';commit;
