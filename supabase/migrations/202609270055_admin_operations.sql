begin;
create function public.admin_read(p_kind text,p_filters jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare actor uuid;bid uuid;offset_no integer;limit_no integer;rows jsonb;total bigint;
begin
 actor:=app_private.phase8_admin(case when p_kind='billing' then 'billing' else null end);
 perform app_private.strict_keys(p_filters,array['businessId','invoiceId','status','planVersionId','actorId','action','supportGrantId','from','until','page','pageSize','eventType']);
 bid:=(p_filters->>'businessId')::uuid;offset_no:=(coalesce((p_filters->>'page')::integer,1)-1)*coalesce((p_filters->>'pageSize')::integer,25);limit_no:=coalesce((p_filters->>'pageSize')::integer,25);
 if limit_no not between 1 and 100 or offset_no not between 0 and 100000 then raise exception 'invalid_input' using errcode='22023';end if;
 if p_kind='overview' then
 return jsonb_build_object('counts',jsonb_build_object('trial',(select count(*) from public.subscriptions where app_private.subscription_state(business_id)='trial'),'active',(select count(*) from public.subscriptions where app_private.subscription_state(business_id)='active'),'pastDue',(select count(*) from public.subscriptions where app_private.subscription_state(business_id)='past_due'),'unreviewedInvoices',(select count(*) from public.payment_submissions where status='pending_review'),'reviewedInvoices',(select count(*) from public.payment_submissions where status<>'pending_review'),'pendingJobs',(select count(*) from public.outbox_events where state='pending'),'oldestJobAt',(select min(created_at) from public.outbox_events where state='pending'),'failedCampaigns',(select count(*) from public.campaigns where status in ('failed','completed_with_errors'))),
 'checks',(select coalesce(jsonb_agg(jsonb_build_object('name',name,'status',case when name='worker_heartbeat' and checked_at<clock_timestamp()-interval '30 seconds' then 'failed' else status end,'checkedAt',checked_at,'details',safe_details)),'[]') from public.operational_checks),
 'settings',(select jsonb_object_agg(key,value) from public.platform_settings),'capabilities',jsonb_build_object('billing',(select can_reconcile_billing from public.platform_admins where user_id=actor),'support',(select can_manage_support from public.platform_admins where user_id=actor)));
 elsif p_kind='businesses' then
 select count(*) into total from public.businesses b join public.subscriptions s on s.business_id=b.id where (bid is null or b.id=bid) and (p_filters->>'status' is null or app_private.subscription_state(b.id)=p_filters->>'status') and (p_filters->>'planVersionId' is null or s.plan_version_id=(p_filters->>'planVersionId')::uuid);
 select coalesce(jsonb_agg(x),'[]') into rows from (select b.id,b.display_name as name,b.slug,b.status,s.plan_version_id as "planVersionId",app_private.subscription_state(b.id) as "subscriptionStatus",b.created_at as "createdAt",(select user_id from public.business_users where business_id=b.id and role='owner' and status='active') as "ownerId",(select count(*) from public.branches where business_id=b.id and status='active') as branches from public.businesses b join public.subscriptions s on s.business_id=b.id where (bid is null or b.id=bid) and (p_filters->>'status' is null or app_private.subscription_state(b.id)=p_filters->>'status') and (p_filters->>'planVersionId' is null or s.plan_version_id=(p_filters->>'planVersionId')::uuid) order by b.created_at desc,b.id limit limit_no offset offset_no) x;
 elsif p_kind='plans' then
 select count(*) into total from public.plan_versions;
 select coalesce(jsonb_agg(x),'[]') into rows from (select v.id,p.code,p.name,p.active,v.version,v.status,v.price_paisa::text as "pricePaisa",v.billing_period as "billingPeriod",v.branch_limit as "branchLimit",v.staff_limit as "staffLimit",v.member_limit as "memberLimit",v.monthly_campaign_limit as "monthlyCampaignLimit",v.trial_days as "trialDays" from public.plan_versions v join public.plans p on p.id=v.plan_id order by p.code,v.version desc limit limit_no offset offset_no) x;
 elsif p_kind='billing' then
 select count(*) into total from public.invoices i where (bid is null or i.business_id=bid) and (p_filters->>'invoiceId' is null or i.id=(p_filters->>'invoiceId')::uuid) and (p_filters->>'status' is null or i.status=p_filters->>'status');
 select coalesce(jsonb_agg(x),'[]') into rows from (select i.id,i.business_id as "businessId",b.display_name as business,i.reference,i.amount_paisa::text as "amountPaisa",i.status,i.period_start as "periodStart",i.period_end as "periodEnd",i.due_at as "dueAt",(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'claimedAmountPaisa',r.claimed_amount_paisa::text,'method',r.method,'reference',r.claimed_reference,'proofAssetId',r.proof_asset_id,'createdAt',r.created_at,'reviewNote',r.review_note) order by r.created_at desc),'[]') from public.payment_submissions r where r.invoice_id=i.id) as submissions,(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'event',e.event,'correctsEventId',e.corrects_event_id,'amountPaisa',e.verified_amount_paisa::text,'provider',e.provider_or_bank,'reference',e.external_reference,'corrected',exists(select from public.payment_events c where c.corrects_event_id=e.id)) order by e.created_at),'[]') from public.payment_events e where e.invoice_id=i.id) as payments from public.invoices i join public.businesses b on b.id=i.business_id where (bid is null or i.business_id=bid) and (p_filters->>'invoiceId' is null or i.id=(p_filters->>'invoiceId')::uuid) and (p_filters->>'status' is null or i.status=p_filters->>'status') order by i.created_at desc,i.id limit limit_no offset offset_no) x;
 elsif p_kind='jobs' then
 select count(*) into total from public.outbox_events e where (bid is null or e.business_id=bid) and (p_filters->>'status' is null or e.state=p_filters->>'status') and (p_filters->>'eventType' is null or e.event_type=p_filters->>'eventType') and (p_filters->>'from' is null or e.created_at>=(p_filters->>'from')::timestamptz) and (p_filters->>'until' is null or e.created_at<(p_filters->>'until')::timestamptz);
 select coalesce(jsonb_agg(x),'[]') into rows from (select e.id,e.business_id as "businessId",e.event_type as "eventType",e.state,e.created_at as "createdAt",e.dispatched_at as "dispatchedAt",e.row_version as "rowVersion",j.retry_count as attempts,j.start_after as "nextAttempt",j.state::text as "queueState" from public.outbox_events e left join pgboss.job j on j.id=e.id where (bid is null or e.business_id=bid) and (p_filters->>'status' is null or e.state=p_filters->>'status') and (p_filters->>'eventType' is null or e.event_type=p_filters->>'eventType') and (p_filters->>'from' is null or e.created_at>=(p_filters->>'from')::timestamptz) and (p_filters->>'until' is null or e.created_at<(p_filters->>'until')::timestamptz) order by e.created_at desc,e.id limit limit_no offset offset_no) x;
 elsif p_kind='audit' then
 select count(*) into total from public.audit_events a where (bid is null or a.business_id=bid) and (p_filters->>'actorId' is null or a.actor_user_id=(p_filters->>'actorId')::uuid) and (p_filters->>'action' is null or a.action=p_filters->>'action') and (p_filters->>'supportGrantId' is null or a.support_access_grant_id=(p_filters->>'supportGrantId')::uuid) and (p_filters->>'from' is null or a.occurred_at>=(p_filters->>'from')::timestamptz) and (p_filters->>'until' is null or a.occurred_at<(p_filters->>'until')::timestamptz);
 select coalesce(jsonb_agg(x),'[]') into rows from (select id,actor_user_id as actor,business_id as "businessId",action,target_type as target,target_id as "targetId",reason,correlation_id as "correlationId",support_access_grant_id as "supportGrantId",occurred_at as "occurredAt" from public.audit_events a where (bid is null or a.business_id=bid) and (p_filters->>'actorId' is null or a.actor_user_id=(p_filters->>'actorId')::uuid) and (p_filters->>'action' is null or a.action=p_filters->>'action') and (p_filters->>'supportGrantId' is null or a.support_access_grant_id=(p_filters->>'supportGrantId')::uuid) and (p_filters->>'from' is null or a.occurred_at>=(p_filters->>'from')::timestamptz) and (p_filters->>'until' is null or a.occurred_at<(p_filters->>'until')::timestamptz) order by occurred_at desc,id limit limit_no offset offset_no) x;
 else raise exception 'invalid_input' using errcode='22023';end if;
 return jsonb_build_object('rows',rows,'total',total,'page',offset_no/limit_no+1,'pageSize',limit_no,'dataAsOf',statement_timestamp(),'checks',(select coalesce(jsonb_agg(jsonb_build_object('name',name,'status',case when name='worker_heartbeat' and checked_at<clock_timestamp()-interval '30 seconds' then 'failed' else status end,'checkedAt',checked_at)),'[]') from public.operational_checks));
end $$;

create function public.admin_tenant_action(p_business uuid,p_action text,p_reason text,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform app_private.phase8_admin('support',true);if p_reason is null or char_length(btrim(p_reason)) not between 10 and 500 then raise exception 'invalid_input' using errcode='22023';end if;
 perform 1 from public.businesses where id=p_business and status<>'archived' for update;if not found then raise exception 'not_found' using errcode='P0002';end if;
 if p_action='suspend' then update public.subscriptions set operator_suspended=true,status='suspended',updated_at=clock_timestamp(),row_version=row_version+1 where business_id=p_business;
 elsif p_action='reinstate' then update public.subscriptions set operator_suspended=false,status='past_due' where business_id=p_business;perform app_private.refresh_subscription(p_business);
 elsif p_action='pause' then update public.businesses set status='paused',updated_at=clock_timestamp(),row_version=row_version+1 where id=p_business;
 elsif p_action='resume' then
  if not app_private.entitled(p_business) or not exists(select from public.loyalty_programmes where business_id=p_business and status='published') then raise exception 'participation_unavailable' using errcode='42501';end if;
  update public.businesses set status='active',updated_at=clock_timestamp(),row_version=row_version+1 where id=p_business;
 else raise exception 'invalid_input' using errcode='22023';end if;
 perform app_private.admin_audit(p_business,'admin.tenant_'||p_action,'business',p_business,btrim(p_reason),p_correlation);
 return jsonb_build_object('businessId',p_business,'subscriptionStatus',app_private.subscription_state(p_business));
end $$;
create function public.start_support_access(p_business uuid,p_reason text,p_scope text,p_minutes integer,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;g public.support_access_grants;
begin
 actor:=app_private.phase8_admin('support',true);if p_minutes not in (15,30,60) then raise exception 'invalid_input' using errcode='22023';end if;
 perform 1 from public.businesses where id=p_business and status<>'archived' for share;if not found then raise exception 'not_found' using errcode='P0002';end if;
 insert into public.support_access_grants(business_id,admin_user_id,reason,scope,expires_at) values(p_business,actor,btrim(p_reason),p_scope,clock_timestamp()+make_interval(mins=>p_minutes)) returning * into g;
 perform app_private.admin_audit(p_business,'support.started','support_access_grant',g.id,g.reason,p_correlation,'{}',g.id);
 return jsonb_build_object('grantId',g.id,'expiresAt',g.expires_at,'scope',g.scope);
end $$;
create function public.support_read(p_grant uuid,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare actor uuid;g public.support_access_grants;result jsonb;
begin
 actor:=app_private.phase8_admin('support');select * into g from public.support_access_grants where id=p_grant and admin_user_id=actor and revoked_at is null and starts_at<=clock_timestamp() and expires_at>clock_timestamp() for share;
 if not found then raise exception 'forbidden' using errcode='42501';end if;
 if g.scope='configuration' then result:=jsonb_build_object('businessId',g.business_id,'programme',(select jsonb_build_object('id',id,'type',type,'status',status,'name',name) from public.loyalty_programmes where business_id=g.business_id),'branches',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status)),'[]') from public.branches where business_id=g.business_id));
 else result:=jsonb_build_object('businessId',g.business_id,'purchases',(select coalesce(jsonb_agg(x),'[]') from (select id,status,recorded_bill_paisa::text as "recordedBillPaisa",base_units::text as "baseUnits",occurred_at as "occurredAt" from public.purchases where business_id=g.business_id order by occurred_at desc limit 25) x));end if;
 perform app_private.admin_audit(g.business_id,'support.read','business',g.business_id,g.reason,p_correlation,'{}',g.id);return result;
end $$;
create function public.end_support_access(p_grant uuid,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;g public.support_access_grants;
begin actor:=app_private.phase8_admin('support');update public.support_access_grants set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=p_grant and admin_user_id=actor returning * into g;if not found then raise exception 'not_found' using errcode='P0002';end if;perform app_private.admin_audit(g.business_id,'support.ended','support_access_grant',g.id,g.reason,p_correlation,'{}',g.id);return jsonb_build_object('ended',true);end $$;

-- Restrict retries to DB effects/validated artifacts. Never blindly retry a provider-unknown send.
create function public.admin_job_action(p_event uuid,p_action text,p_reason text,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.outbox_events;actor uuid;
begin
 actor:=app_private.phase8_admin('support',true);if p_reason is null or char_length(btrim(p_reason)) not between 10 and 500 then raise exception 'invalid_input' using errcode='22023';end if;
 select * into e from public.outbox_events where id=p_event for update;if not found then raise exception 'not_found' using errcode='P0002';end if;
 if p_action='cancel' and e.event_type='campaign.scheduled' then update public.campaigns set status='paused',updated_at=clock_timestamp(),row_version=row_version+1 where id=e.event_key::uuid and business_id=e.business_id and status in ('scheduled','processing');if not found then raise exception 'conflict' using errcode='40001';end if;
 elsif p_action='retry' and e.event_type in ('profile.created','media.validate','report.export_requested','privacy.requested') then
  if exists(select from pgboss.job where id=e.id and state in ('created','retry','active')) then raise exception 'conflict' using errcode='40001';end if;
  if e.event_type='report.export_requested' and not exists(select from public.export_requests where id=e.event_key::uuid and status='failed' and created_at>clock_timestamp()-interval '24 hours') then raise exception 'expired' using errcode='22023';end if;
  if e.event_type='report.export_requested' then update public.export_requests set status='pending',processing_token=null,error_code=null where id=e.event_key::uuid;end if;
  delete from pgboss.job where id=e.id and state in ('failed','cancelled','completed');
  update public.outbox_events set state='pending',dispatched_at=null,updated_at=clock_timestamp(),row_version=row_version+1 where id=e.id;
 else raise exception 'retry_not_safe' using errcode='22023';end if;
 perform app_private.admin_audit(e.business_id,'job.'||p_action,'outbox_event',e.id,btrim(p_reason),p_correlation);return jsonb_build_object('id',e.id,'action',p_action);
end $$;

-- Private proof access checks owner or billing admin and exact invoice relationship.
create function public.payment_proof_access(p_asset uuid,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.media_assets;actor uuid;u public.business_users;
begin
 actor:=app_private.actor(true);select * into a from public.media_assets where id=p_asset and kind='payment_proof' and visibility='private' and validation_status='accepted' and exists(select from public.payment_submissions where proof_asset_id=p_asset);
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 if not exists(select from public.platform_admins where user_id=actor and active and can_reconcile_billing) then u:=app_private.authorize(a.business_id,null,true);end if;
 perform app_private.admin_audit(a.business_id,'payment.proof_viewed','media_asset',a.id,null,p_correlation);
 return jsonb_build_object('path',a.storage_path,'bytes',a.bytes::text,'mimeType',a.mime_type);
end $$;

do $$ declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['admin_read','admin_tenant_action','start_support_access','support_read','end_support_access','admin_job_action','payment_proof_access']) loop execute format('revoke all on function %s from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',f);execute format('grant execute on function %s to authenticated',f);end loop;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
