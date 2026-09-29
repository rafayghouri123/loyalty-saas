begin;

create table public.platform_settings (
 key text primary key check(key in ('grace_days','notification_retention_days','log_retention_days','referral_visit_retention_days','device_retention_days','temporary_retention_hours','billing_instructions','canonical_providers','financial_retention_policy','backup_coverage')),
 value jsonb not null,updated_at timestamptz not null default now(),updated_by uuid references public.profiles(user_id)
);
insert into public.platform_settings(key,value) values ('grace_days','7'),('notification_retention_days','90'),('log_retention_days','30'),('referral_visit_retention_days','90'),('device_retention_days','90'),('temporary_retention_hours','24');
create function app_private.setting_check() returns trigger language plpgsql set search_path='' as $$
begin
 if new.key in ('grace_days','notification_retention_days','log_retention_days','referral_visit_retention_days','device_retention_days','temporary_retention_hours') then
  if jsonb_typeof(new.value)<>'number' or new.value::text !~ '^[0-9]+$' or new.value::text::integer not between 1 and 365 or (new.key='grace_days' and new.value::text::integer>30) or (new.key='temporary_retention_hours' and new.value<>'24'::jsonb) then raise exception 'invalid_setting' using errcode='22023';end if;
 elsif new.key='canonical_providers' then
  if jsonb_typeof(new.value)<>'array' or jsonb_array_length(new.value) not between 1 and 100 or exists(select from jsonb_array_elements(new.value) x where jsonb_typeof(x)<>'string' or x#>>'{}' !~ '^[a-z0-9][a-z0-9_-]{1,79}$') then raise exception 'invalid_setting' using errcode='22023';end if;
 else
  if jsonb_typeof(new.value)<>'string' or char_length(new.value#>>'{}') not between 10 and 4000 then raise exception 'invalid_setting' using errcode='22023';end if;
 end if;return new;
end $$;
create trigger valid_setting before insert or update on public.platform_settings for each row execute function app_private.setting_check();
create function app_private.setting_days(p_key text,p_default integer) returns integer language sql stable set search_path='' as $$ select coalesce((select value::text::integer from public.platform_settings where key=p_key),p_default) $$;

create table public.invoices (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,subscription_id uuid not null,
 plan_version_id uuid not null references public.plan_versions,reference text not null unique,amount_paisa bigint not null check(amount_paisa between 1 and 9000000000000),currency text not null default 'PKR' check(currency='PKR'),
 period_start timestamptz not null,period_end timestamptz not null,due_at timestamptz not null,status text not null default 'issued' check(status in ('draft','issued','paid','void','overdue')),
 issued_at timestamptz,paid_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),row_version integer not null default 1,
 unique(business_id,id),unique(subscription_id,period_start,period_end),foreign key(business_id,subscription_id) references public.subscriptions(business_id,id),check(period_start<period_end),check((status='paid')=(paid_at is not null)),check(due_at=period_start)
);
create index invoices_due on public.invoices(business_id,period_start,period_end,status);
create table public.payment_submissions (
 id uuid primary key default gen_random_uuid(),business_id uuid not null,invoice_id uuid not null,claimed_amount_paisa bigint not null check(claimed_amount_paisa between 1 and 9000000000000),
 method text not null check(method in ('bank_transfer','merchant_wallet')),claimed_reference text not null check(char_length(btrim(claimed_reference)) between 1 and 200),proof_asset_id uuid,
 submitted_by uuid not null references public.profiles(user_id),status text not null default 'pending_review' check(status in ('pending_review','accepted','rejected')),review_note text check(char_length(review_note)<=500),
 idempotency_key uuid not null,request_hash text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),row_version integer not null default 1,
 unique(business_id,id),unique(business_id,idempotency_key),foreign key(business_id,invoice_id) references public.invoices(business_id,id),foreign key(business_id,proof_asset_id) references public.media_assets(business_id,id)
);
create table public.payment_events (
 id uuid primary key default gen_random_uuid(),business_id uuid not null,invoice_id uuid not null,submission_id uuid,verified_amount_paisa bigint not null check(verified_amount_paisa between 1 and 9000000000000),
 method text not null check(method in ('bank_transfer','merchant_wallet')),provider_or_bank text not null check(provider_or_bank ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),external_reference text not null check(external_reference=lower(btrim(external_reference)) and char_length(external_reference) between 1 and 200),
 verified_at timestamptz not null default now(),verified_by uuid not null references public.profiles(user_id),event text not null check(event in ('confirmed','correction')),corrects_event_id uuid unique,
 reason text,idempotency_key uuid not null,request_hash text not null,created_at timestamptz not null default now(),unique(business_id,id),unique(business_id,idempotency_key),
 foreign key(business_id,invoice_id) references public.invoices(business_id,id),foreign key(business_id,submission_id) references public.payment_submissions(business_id,id),foreign key(business_id,corrects_event_id) references public.payment_events(business_id,id),
 check((event='correction')=(corrects_event_id is not null)),check(event<>'correction' or char_length(btrim(reason)) between 10 and 500)
);
create unique index payment_confirmed_reference on public.payment_events(method,provider_or_bank,external_reference) where event='confirmed';
create index payment_invoice on public.payment_events(business_id,invoice_id,event);
create trigger payment_append_only before update or delete on public.payment_events for each row execute function app_private.immutable_event();
create table public.support_access_grants (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,admin_user_id uuid not null references public.profiles(user_id),reason text not null check(char_length(btrim(reason)) between 10 and 500),
 starts_at timestamptz not null default now(),expires_at timestamptz not null,revoked_at timestamptz,scope text not null check(scope in ('configuration','transaction_support')),created_at timestamptz not null default now(),check(expires_at>starts_at and expires_at<=starts_at+interval '60 minutes')
);
alter table public.audit_events add foreign key(support_access_grant_id) references public.support_access_grants;
alter table public.subscriptions add column trial_ends_at timestamptz,add column operator_suspended boolean not null default false,add column cancellation_effective_at timestamptz;
update public.subscriptions set trial_ends_at=period_end,billing_anchor_at=period_end where status='trial';
create function app_private.subscription_trial() returns trigger language plpgsql set search_path='' as $$ begin if new.status='trial' then new.trial_ends_at:=new.period_end;new.billing_anchor_at:=new.period_end;end if;return new;end $$;
create trigger subscription_trial before insert on public.subscriptions for each row execute function app_private.subscription_trial();

-- Add each calendar offset to the ORIGINAL local anchor; February clamping never drifts March.
create function app_private.billing_boundary(p_anchor timestamptz,p_interval text,p_index integer) returns timestamptz language plpgsql immutable set search_path='' as $$
begin
 if p_interval not in ('monthly','annual') or p_index not between 0 and 1200 then raise exception 'invalid_period' using errcode='22023';end if;
 return ((p_anchor at time zone 'Asia/Karachi')+make_interval(months=>p_index*case when p_interval='annual' then 12 else 1 end)) at time zone 'Asia/Karachi';
end $$;
create function app_private.subscription_state(p_business uuid,p_at timestamptz default statement_timestamp()) returns text language plpgsql stable set search_path='' as $$
declare s public.subscriptions;i public.invoices;last_end timestamptz;
begin
 select * into s from public.subscriptions where business_id=p_business;if not found then return 'suspended';end if;
 if s.operator_suspended or (s.status='suspended' and not exists(select from public.invoices where subscription_id=s.id)) then return 'suspended';end if;
 if s.status='canceled' or (s.cancel_at_period_end and coalesce(s.cancellation_effective_at,s.period_end)<=p_at) then return 'canceled';end if;
 if least(s.trial_ends_at,s.period_end)>p_at and s.trial_ends_at is not null then return 'trial';end if;
 if exists(select from public.invoices where subscription_id=s.id and status='paid' and period_start<=p_at and p_at<period_end) then return 'active';end if;
 -- Preserve pre-billing fixtures/coverage while all NEW payments use invoices.
 if not exists(select from public.invoices where subscription_id=s.id) and s.period_end>p_at then return s.status;end if;
 select greatest(least(coalesce(s.trial_ends_at,s.period_end),s.period_end),coalesce(max(period_end),s.period_end)) into last_end from public.invoices where subscription_id=s.id and status='paid' and period_start<=p_at;
 if not s.cancel_at_period_end and p_at<last_end+make_interval(days=>app_private.setting_days('grace_days',7)) then return 'past_due';end if;
 return 'suspended';
end $$;
create or replace function app_private.entitled(p_business uuid) returns boolean language sql stable set search_path='' as $$ select app_private.subscription_state(p_business) in ('trial','active','past_due') $$;
create function app_private.refresh_subscription(p_business uuid) returns void language plpgsql set search_path='' as $$
declare s public.subscriptions;i public.invoices;state text;
begin
 select * into strict s from public.subscriptions where business_id=p_business for update;
 -- Stored suspended state is derived unless it was an explicit operator suspension.
 if s.status='suspended' and not s.operator_suspended then update public.subscriptions set status='past_due' where id=s.id;end if;
 state:=app_private.subscription_state(p_business);
 select * into i from public.invoices where subscription_id=s.id and status='paid' and period_start<=clock_timestamp() order by period_end desc limit 1;
 update public.subscriptions set status=state,period_start=coalesce(i.period_start,s.period_start),period_end=coalesce(i.period_end,s.trial_ends_at,s.period_end),
 grace_ends_at=coalesce(i.period_end,s.trial_ends_at,s.period_end)+make_interval(days=>app_private.setting_days('grace_days',7)),updated_at=clock_timestamp(),row_version=row_version+1 where id=s.id;
end $$;
create function app_private.issue_invoices(p_business uuid,p_at timestamptz) returns integer language plpgsql set search_path='' as $$
declare s public.subscriptions;v public.plan_versions;idx integer;start_at timestamptz;end_at timestamptz;made integer:=0;invoice_id uuid;
begin
 select * into strict s from public.subscriptions where business_id=p_business for update;select * into strict v from public.plan_versions where id=s.plan_version_id;
 if s.cancel_at_period_end or s.status='canceled' then return 0;end if;
 -- Bound catch-up work per subscription; an invoice describes its anchored interval, never payment time.
 for idx in 0..least(1200,greatest(0,((extract(year from (p_at at time zone 'Asia/Karachi'))-extract(year from (s.billing_anchor_at at time zone 'Asia/Karachi')))*12+extract(month from (p_at at time zone 'Asia/Karachi'))-extract(month from (s.billing_anchor_at at time zone 'Asia/Karachi')))::integer/case when v.billing_period='annual' then 12 else 1 end)+1) loop
  start_at:=app_private.billing_boundary(s.billing_anchor_at,v.billing_period,idx);end_at:=app_private.billing_boundary(s.billing_anchor_at,v.billing_period,idx+1);
  if start_at>p_at+interval '7 days' then exit;end if;
  invoice_id:=gen_random_uuid();
  insert into public.invoices(id,business_id,subscription_id,plan_version_id,reference,amount_paisa,period_start,period_end,due_at,issued_at,status)
  values(invoice_id,p_business,s.id,v.id,'INV-'||upper(replace(invoice_id::text,'-','')),v.price_paisa,start_at,end_at,start_at,p_at,case when start_at<=p_at then 'overdue' else 'issued' end) on conflict(subscription_id,period_start,period_end) do nothing;
  if found then made:=made+1;insert into public.audit_events(business_id,action,target_type,target_id,safe_changes,correlation_id,occurred_at) values(p_business,'invoice.issued','invoice',invoice_id,'{}',gen_random_uuid()::text,clock_timestamp());end if;
 end loop;
 return made;
end $$;

create function app_private.phase8_admin(p_capability text default null,p_fresh boolean default false) returns uuid language plpgsql set search_path='' as $$
declare a uuid;
begin
 a:=app_private.actor(true);
 if not exists(select from public.platform_admins where user_id=a and active and (p_capability is null or p_capability='billing' and can_reconcile_billing or p_capability='support' and can_manage_support)) then raise exception 'forbidden' using errcode='42501';end if;
 if p_fresh then perform app_private.require_recent_auth();end if;return a;
end $$;
create function app_private.require_recent_auth() returns void language plpgsql set search_path='' as $$
begin
 if not exists(select from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) a where a->>'method' in ('oauth','otp','totp','mfa/totp') and a->>'timestamp' ~ '^[0-9]{1,12}$' and to_timestamp((a->>'timestamp')::double precision) between clock_timestamp()-interval '15 minutes' and clock_timestamp()+interval '30 seconds') then raise exception 'reauthentication_required' using errcode='42501';end if;
end $$;
create function app_private.admin_audit(p_business uuid,p_action text,p_type text,p_id uuid,p_reason text,p_correlation uuid,p_changes jsonb default '{}',p_grant uuid default null) returns void language sql set search_path='' as $$
 insert into public.audit_events(business_id,actor_user_id,action,target_type,target_id,reason,safe_changes,correlation_id,support_access_grant_id,occurred_at) values(p_business,app_private.actor(true),p_action,p_type,p_id,p_reason,p_changes,p_correlation::text,p_grant,clock_timestamp())
$$;

create function public.billing_view(p_business uuid,p_invoice uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.business_users;
begin
 u:=app_private.authorize(p_business);if u.role<>'owner' then raise exception 'forbidden' using errcode='42501';end if;
 if p_invoice is not null and not exists(select from public.invoices where business_id=p_business and id=p_invoice) then raise exception 'not_found' using errcode='P0002';end if;
 return jsonb_build_object('businessId',p_business,'subscription',(select jsonb_build_object('id',s.id,'plan',p.name,'planVersion',v.version,'pricePaisa',v.price_paisa::text,'billingPeriod',v.billing_period,'status',app_private.subscription_state(p_business),'periodStart',s.period_start,'periodEnd',s.period_end,'graceEndsAt',coalesce(s.grace_ends_at,s.period_end+make_interval(days=>app_private.setting_days('grace_days',7))),'cancelAtPeriodEnd',s.cancel_at_period_end,'limits',jsonb_build_object('branches',v.branch_limit,'staff',v.staff_limit,'members',v.member_limit,'campaigns',v.monthly_campaign_limit)) from public.subscriptions s join public.plan_versions v on v.id=s.plan_version_id join public.plans p on p.id=v.plan_id where s.business_id=p_business),
 'usage',jsonb_build_object('branches',(select count(*) from public.branches where business_id=p_business and status='active'),'staff',(select count(*) from public.business_users where business_id=p_business and status='active')+(select count(*) from public.staff_invitations where business_id=p_business and status='pending' and expires_at>clock_timestamp()),'members',(select count(*) from public.memberships where business_id=p_business and status<>'anonymized'),'campaigns',(select count(*) from public.campaigns where business_id=p_business and date_trunc('month',scheduled_at at time zone 'Asia/Karachi')=date_trunc('month',statement_timestamp() at time zone 'Asia/Karachi'))),
 'instructions',(select value#>>'{}' from public.platform_settings where key='billing_instructions'),
 'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'reference',i.reference,'amountPaisa',i.amount_paisa::text,'periodStart',i.period_start,'periodEnd',i.period_end,'dueAt',i.due_at,'status',i.status,'submissions',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'status',x.status,'reviewNote',x.review_note,'createdAt',x.created_at,'claimedAmountPaisa',x.claimed_amount_paisa::text)),'[]') from public.payment_submissions x where x.invoice_id=i.id)) order by i.period_start desc) from (select * from public.invoices where business_id=p_business and (p_invoice is null or id=p_invoice) order by period_start desc limit 100) i),'[]'));
end $$;
create function public.submit_payment_evidence(p_business uuid,p_invoice uuid,p_input jsonb,p_key uuid,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;i public.invoices;r public.payment_submissions;hash text;limited jsonb;
begin
 perform app_private.authorize(p_business,null,true);actor:=app_private.actor(true);limited:=app_private.limit_action('payment_submission',p_business,5);if limited is not null then return limited;end if;
 perform app_private.strict_keys(p_input,array['claimedAmountPaisa','method','reference','proofAssetId']);if p_key is null then raise exception 'invalid_input' using errcode='22023';end if;
 select * into i from public.invoices where business_id=p_business and id=p_invoice for update;if not found then raise exception 'not_found' using errcode='P0002';end if;
 hash:=encode(extensions.digest(jsonb_build_object('invoice',p_invoice,'input',p_input)::text,'sha256'),'hex');select * into r from public.payment_submissions where business_id=p_business and idempotency_key=p_key;
 if found then if r.request_hash<>hash or r.submitted_by<>actor then raise exception 'conflict' using errcode='40001';end if;return jsonb_build_object('submissionId',r.id,'status',r.status,'replayed',true);end if;
 if i.status not in ('issued','overdue') then raise exception 'conflict' using errcode='40001';end if;
 if p_input->>'proofAssetId' is not null and not exists(select from public.media_assets where id=(p_input->>'proofAssetId')::uuid and business_id=p_business and kind='payment_proof' and visibility='private' and validation_status='accepted' and uploaded_by=actor) then raise exception 'invalid_proof' using errcode='22023';end if;
 insert into public.payment_submissions(business_id,invoice_id,claimed_amount_paisa,method,claimed_reference,proof_asset_id,submitted_by,idempotency_key,request_hash) values(p_business,p_invoice,(p_input->>'claimedAmountPaisa')::bigint,p_input->>'method',btrim(p_input->>'reference'),(p_input->>'proofAssetId')::uuid,actor,p_key,hash) returning * into r;
 perform app_private.audit(p_business,'payment.evidence_submitted','payment_submission',r.id,p_correlation);
 return jsonb_build_object('submissionId',r.id,'status',r.status,'replayed',false);
end $$;
create function public.reconcile_payment(p_invoice uuid,p_input jsonb,p_key uuid,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;i public.invoices;e public.payment_events;r public.payment_submissions;hash text;limited jsonb;provider text;ref text;amount bigint;decision text;
begin
 actor:=app_private.phase8_admin('billing',true);limited:=app_private.limit_action('payment_review',null,10);if limited is not null then return limited;end if;
 perform app_private.strict_keys(p_input,array['submissionId','verifiedAmountPaisa','method','provider','reference','decision','reason','reconciled']);if p_key is null then raise exception 'invalid_input' using errcode='22023';end if;
 select * into i from public.invoices where id=p_invoice;if not found then raise exception 'not_found' using errcode='P0002';end if;
 perform 1 from public.subscriptions where id=i.subscription_id for update;select * into strict i from public.invoices where id=p_invoice for update;
 hash:=encode(extensions.digest(jsonb_build_object('invoice',p_invoice,'input',p_input)::text,'sha256'),'hex');select * into e from public.payment_events where business_id=i.business_id and idempotency_key=p_key;
 if found then if e.request_hash<>hash or e.verified_by<>actor then raise exception 'conflict' using errcode='40001';end if;return jsonb_build_object('paymentEventId',e.id,'invoiceId',i.id,'status',i.status,'replayed',true);end if;
 decision:=p_input->>'decision';if decision not in ('confirm','reject') then raise exception 'invalid_input' using errcode='22023';end if;
 if p_input->>'submissionId' is not null then select * into r from public.payment_submissions where business_id=i.business_id and invoice_id=i.id and id=(p_input->>'submissionId')::uuid for update;if not found or r.status<>'pending_review' then raise exception 'conflict' using errcode='40001';end if;end if;
 if decision='reject' then
  if r.id is null or p_input->>'reason' is null or char_length(btrim(p_input->>'reason')) not between 10 and 500 then raise exception 'invalid_input' using errcode='22023';end if;
  update public.payment_submissions set status='rejected',review_note=btrim(p_input->>'reason'),updated_at=clock_timestamp() where id=r.id;
  perform app_private.admin_audit(i.business_id,'payment.rejected','payment_submission',r.id,btrim(p_input->>'reason'),p_correlation);return jsonb_build_object('submissionId',r.id,'status','rejected');
 end if;
 provider:=lower(btrim(p_input->>'provider'));ref:=lower(btrim(p_input->>'reference'));amount:=(p_input->>'verifiedAmountPaisa')::bigint;
 if (p_input->>'reconciled')::boolean is distinct from true or amount is distinct from i.amount_paisa or i.status not in ('issued','overdue') or not exists(select from public.platform_settings where key='canonical_providers' and value ? provider) then raise exception 'payment_not_reconciled' using errcode='22023';end if;
 insert into public.payment_events(business_id,invoice_id,submission_id,verified_amount_paisa,method,provider_or_bank,external_reference,verified_by,event,idempotency_key,request_hash) values(i.business_id,i.id,r.id,amount,p_input->>'method',provider,ref,actor,'confirmed',p_key,hash) returning * into e;
 update public.invoices set status='paid',paid_at=clock_timestamp(),updated_at=clock_timestamp(),row_version=row_version+1 where id=i.id;
 if r.id is not null then update public.payment_submissions set status='accepted',review_note=null,updated_at=clock_timestamp() where id=r.id;end if;
 perform app_private.refresh_subscription(i.business_id);perform app_private.admin_audit(i.business_id,'payment.confirmed','payment_event',e.id,null,p_correlation,jsonb_build_object('invoiceId',i.id,'amountPaisa',amount::text));
 return jsonb_build_object('paymentEventId',e.id,'invoiceId',i.id,'status','paid','subscriptionStatus',app_private.subscription_state(i.business_id),'replayed',false);
end $$;
create function public.correct_payment(p_event uuid,p_reason text,p_key uuid,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;e public.payment_events;r public.payment_events;i public.invoices;hash text;
begin
 actor:=app_private.phase8_admin('billing',true);if p_key is null or p_reason is null or char_length(btrim(p_reason)) not between 10 and 500 then raise exception 'invalid_input' using errcode='22023';end if;
 select * into e from public.payment_events where id=p_event and event='confirmed';if not found then raise exception 'not_found' using errcode='P0002';end if;
 select * into strict i from public.invoices where id=e.invoice_id;perform 1 from public.subscriptions where id=i.subscription_id for update;perform 1 from public.invoices where id=i.id for update;
 hash:=encode(extensions.digest(jsonb_build_object('event',p_event,'reason',btrim(p_reason))::text,'sha256'),'hex');select * into r from public.payment_events where business_id=e.business_id and idempotency_key=p_key;
 if found then if r.request_hash<>hash or r.verified_by<>actor then raise exception 'conflict' using errcode='40001';end if;return jsonb_build_object('paymentEventId',r.id,'replayed',true);end if;
 insert into public.payment_events(business_id,invoice_id,verified_amount_paisa,method,provider_or_bank,external_reference,verified_by,event,corrects_event_id,reason,idempotency_key,request_hash) values(e.business_id,e.invoice_id,e.verified_amount_paisa,e.method,e.provider_or_bank,e.external_reference,actor,'correction',e.id,btrim(p_reason),p_key,hash) returning * into r;
 update public.invoices set status=case when due_at<=clock_timestamp() then 'overdue' else 'issued' end,paid_at=null,updated_at=clock_timestamp(),row_version=row_version+1 where id=i.id;
 perform app_private.refresh_subscription(e.business_id);perform app_private.admin_audit(e.business_id,'payment.corrected','payment_event',r.id,btrim(p_reason),p_correlation,jsonb_build_object('correctsEventId',e.id,'amountPaisa',e.verified_amount_paisa::text));
 return jsonb_build_object('paymentEventId',r.id,'invoiceId',i.id,'subscriptionStatus',app_private.subscription_state(e.business_id),'replayed',false);
end $$;
create function public.cancel_subscription_renewal(p_business uuid,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform app_private.authorize(p_business,null,true);
 update public.subscriptions set cancel_at_period_end=true,canceled_at=coalesce(canceled_at,clock_timestamp()),cancellation_effective_at=coalesce(cancellation_effective_at,period_end),updated_at=clock_timestamp(),row_version=row_version+1 where business_id=p_business;
 perform app_private.audit(p_business,'subscription.renewal_canceled','business',p_business,p_correlation);return jsonb_build_object('cancelAtPeriodEnd',true);
end $$;

create function public.save_plan_version(p_input jsonb,p_publish boolean,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;selected_plan uuid;v public.plan_versions;version_no integer;
begin
 actor:=app_private.phase8_admin('billing');perform app_private.strict_keys(p_input,array['id','rowVersion','code','name','active','pricePaisa','billingPeriod','branchLimit','staffLimit','memberLimit','monthlyCampaignLimit','trialDays']);
 perform pg_advisory_xact_lock(hashtextextended('plan:'||(p_input->>'code'),0));
 insert into public.plans(code,name,active) values(p_input->>'code',btrim(p_input->>'name'),coalesce((p_input->>'active')::boolean,true)) on conflict(code) do update set name=excluded.name,active=excluded.active,updated_at=clock_timestamp(),row_version=public.plans.row_version+1 returning id into selected_plan;
 if p_input->>'id' is not null then select * into v from public.plan_versions where id=(p_input->>'id')::uuid and plan_id=selected_plan and status='draft' for update;if not found then raise exception 'conflict' using errcode='40001';end if;
  update public.plan_versions set price_paisa=(p_input->>'pricePaisa')::bigint,billing_period=p_input->>'billingPeriod',branch_limit=(p_input->>'branchLimit')::integer,staff_limit=(p_input->>'staffLimit')::integer,member_limit=(p_input->>'memberLimit')::integer,monthly_campaign_limit=(p_input->>'monthlyCampaignLimit')::integer,trial_days=(p_input->>'trialDays')::integer,status=case when p_publish then 'published' else 'draft' end,published_at=case when p_publish then clock_timestamp() end where id=v.id returning * into v;
 else
  select coalesce(max(version),0)+1 into version_no from public.plan_versions where plan_versions.plan_id=selected_plan;
  insert into public.plan_versions(plan_id,version,price_paisa,billing_period,branch_limit,staff_limit,member_limit,monthly_campaign_limit,trial_days,status,published_at) values(selected_plan,version_no,(p_input->>'pricePaisa')::bigint,p_input->>'billingPeriod',(p_input->>'branchLimit')::integer,(p_input->>'staffLimit')::integer,(p_input->>'memberLimit')::integer,(p_input->>'monthlyCampaignLimit')::integer,coalesce((p_input->>'trialDays')::integer,14),case when p_publish then 'published' else 'draft' end,case when p_publish then clock_timestamp() end) returning * into v;
 end if;
 perform app_private.admin_audit(null,case when p_publish then 'plan.published' else 'plan.draft_saved' end,'plan_version',v.id,null,p_correlation);
 return jsonb_build_object('id',v.id,'version',v.version,'status',v.status);
end $$;
create function public.update_platform_setting(p_key text,p_value jsonb,p_reason text,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 actor:=app_private.phase8_admin('support',true);if p_reason is null or char_length(btrim(p_reason)) not between 10 and 500 then raise exception 'invalid_input' using errcode='22023';end if;
 insert into public.platform_settings(key,value,updated_by) values(p_key,p_value,actor) on conflict(key) do update set value=excluded.value,updated_by=actor,updated_at=clock_timestamp();
 perform app_private.admin_audit(null,'platform.setting_updated','platform_setting',null,btrim(p_reason),p_correlation,jsonb_build_object('key',p_key));return jsonb_build_object('saved',true);
end $$;

create function public.worker_billing_cycle() returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid;made integer:=0;
begin
 for b in select s.business_id from public.subscriptions s join public.businesses b on b.id=s.business_id where b.status<>'archived' order by s.business_id limit 10000 loop made:=made+app_private.issue_invoices(b,clock_timestamp());perform app_private.refresh_subscription(b);end loop;
 return jsonb_build_object('issued',made);
end $$;

do $$ declare t text;f regprocedure;begin
 foreach t in array array['platform_settings','invoices','payment_submissions','payment_events','support_access_grants'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',t);end loop;
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['billing_view','submit_payment_evidence','reconcile_payment','correct_payment','cancel_subscription_renewal','save_plan_version','update_platform_setting','worker_billing_cycle']) loop execute format('revoke all on function %s from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',f);execute format('grant execute on function %s to %I',f,case when f::text like '%worker_billing_cycle%' then 'loyalty_worker' else 'authenticated' end);end loop;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
