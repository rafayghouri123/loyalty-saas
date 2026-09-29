begin;
create function public.admin_invoice_view(p_invoice uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.invoices;r jsonb;
begin
 perform app_private.phase8_admin('billing');select * into i from public.invoices where id=p_invoice;if not found then raise exception 'not_found' using errcode='P0002';end if;
 r:=public.admin_read('billing',jsonb_build_object('businessId',i.business_id,'invoiceId',i.id,'pageSize',1));
 return jsonb_build_object('rows',jsonb_build_array((select value from jsonb_array_elements(r->'rows') where value->>'id'=p_invoice::text)),'total',1);
end $$;
create function public.worker_health_status() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('workerFresh',exists(select from public.operational_checks where name='worker_heartbeat' and status='ok' and checked_at>clock_timestamp()-interval '30 seconds'),
 'authAttempts1m',(select coalesce(sum(count),0) from public.rate_limit_buckets where operation in ('email_ip','google_ip') and window_start>clock_timestamp()-interval '1 minute'),'pendingOutbox',(select count(*) from public.outbox_events where state='pending'),'oldestPendingAt',(select min(created_at) from public.outbox_events where state='pending'),
 'failedAttempts15m',(select count(*) from public.delivery_attempts where state in ('failed','unknown') and created_at>clock_timestamp()-interval '15 minutes'),
 'ledgerStatus',(select status from public.operational_checks where name='ledger_reconciliation'),
 'backupStatus',(select case when checked_at<clock_timestamp()-interval '26 hours' then 'failed' else status end from public.operational_checks where name='backup'),
 'restoreStatus',(select status from public.operational_checks where name='restore_rehearsal'))
$$;
revoke all on function public.admin_invoice_view(uuid),public.worker_health_status() from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.admin_invoice_view(uuid) to authenticated;
grant execute on function public.worker_health_status() to loyalty_worker;
-- Existing frequent cleanup must honor the same configured policy as the daily job.
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.worker_purge_manual_messages()'::regprocedure);execute replace(definition,$old$interval '90 days'$old$,$new$make_interval(days=>app_private.setting_days('notification_retention_days',90))$new$);
 definition:=pg_get_functiondef('public.worker_purge_referral_visits()'::regprocedure);execute replace(definition,$old$interval '90 days'$old$,$new$make_interval(days=>app_private.setting_days('referral_visit_retention_days',90))$new$);
end $$;
create or replace function app_private.manual_event_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and new.note is null and (to_jsonb(old)-'note')=(to_jsonb(new)-'note') and
 (old.occurred_at<clock_timestamp()-make_interval(days=>app_private.setting_days('notification_retention_days',90)) or exists(select from public.followup_tasks t join public.memberships m on m.id=t.membership_id where t.id=old.task_id and m.status='anonymized')) then return new;end if;
 raise exception 'immutable_event' using errcode='42501';
end $$;
-- Operator-only restore replay. No browser or worker grant: run before starting ANY sender.
create function app_private.restore_privacy_replay(p_requests jsonb,p_consents jsonb,p_devices jsonb) returns integer language plpgsql set search_path='' as $$
declare entry jsonb;mid uuid;pid uuid;count_no integer:=0;
begin
 if jsonb_typeof(p_requests)<>'array' or jsonb_typeof(p_consents)<>'array' or jsonb_typeof(p_devices)<>'array' then raise exception 'invalid_journal' using errcode='22023';end if;
 for entry in select value from jsonb_array_elements(p_requests) loop
  perform app_private.strict_keys(entry,array['customerId','kind','membershipId']);pid:=(entry->>'customerId')::uuid;
  if entry->>'kind'='delete_account' then
   if exists(select from public.business_users u join public.businesses b on b.id=u.business_id where u.user_id=pid and u.role='owner' and u.status='active' and b.status<>'archived') then raise exception 'restore_owner_blocker' using errcode='42501';end if;
   for mid in select id from public.memberships where customer_user_id=pid loop perform app_private.suppress_member(mid,true);end loop;
   update public.push_devices set status='revoked',revoked_at=coalesce(revoked_at,clock_timestamp()),token_ciphertext=repeat('x',40),browser_label=null where customer_user_id=pid;
   update public.business_users set status='revoked',staff_display_name='Deleted user',staff_email='deleted@example.invalid' where user_id=pid;
   update public.platform_admins set active=false where user_id=pid;
   delete from auth.sessions where user_id in (select auth_user_id from public.profiles where user_id=pid);
   delete from auth.users where id in (select auth_user_id from public.profiles where user_id=pid);
   update public.profiles set auth_user_id=null,anonymized_at=coalesce(anonymized_at,clock_timestamp()),display_name='Deleted user',birthday_month=null,birthday_day=null,preferred_timezone='Asia/Karachi' where user_id=pid;
  elsif entry->>'kind'='delete_membership' then
   if exists(select from public.memberships where id=(entry->>'membershipId')::uuid and customer_user_id=pid) then perform app_private.suppress_member((entry->>'membershipId')::uuid,false);end if;
  else raise exception 'invalid_journal' using errcode='22023';end if;count_no:=count_no+1;
 end loop;
 for entry in select value from jsonb_array_elements(p_consents) loop perform app_private.strict_keys(entry,array['membershipId','channel','purpose']);update public.consent_preferences set allowed=false,changed_at=clock_timestamp(),row_version=row_version+1 where membership_id=(entry->>'membershipId')::uuid and channel=entry->>'channel' and purpose=entry->>'purpose';end loop;
 for entry in select value from jsonb_array_elements(p_devices) loop perform app_private.strict_keys(entry,array['deviceId']);update public.push_devices set status='revoked',revoked_at=coalesce(revoked_at,clock_timestamp()),token_ciphertext=repeat('x',40) where id=(entry->>'deviceId')::uuid;end loop;
 return count_no;
end $$;
-- Financial periods lock the business timezone, just like customer ledger activity.
create trigger invoice_timezone_lock before insert on public.invoices for each row execute function app_private.lock_business_timezone();
-- Payment event relationships also hold under direct privileged SQL, not just the RPC.
create function app_private.payment_event_valid() returns trigger language plpgsql set search_path='' as $$
declare original public.payment_events;i public.invoices;
begin
 select * into strict i from public.invoices where business_id=new.business_id and id=new.invoice_id;
 if new.verified_amount_paisa<>i.amount_paisa then raise exception 'amount_mismatch' using errcode='23514';end if;
 if new.submission_id is not null and not exists(select from public.payment_submissions where id=new.submission_id and business_id=new.business_id and invoice_id=new.invoice_id) then raise exception 'submission_mismatch' using errcode='23514';end if;
 if new.event='correction' then
 select * into original from public.payment_events where id=new.corrects_event_id and business_id=new.business_id and invoice_id=new.invoice_id and event='confirmed';
 if original.id is null or new.verified_amount_paisa<>original.verified_amount_paisa or new.method<>original.method or new.provider_or_bank<>original.provider_or_bank or new.external_reference<>original.external_reference then raise exception 'correction_mismatch' using errcode='23514';end if;
 end if;return new;
end $$;
create trigger payment_event_valid before insert on public.payment_events for each row execute function app_private.payment_event_valid();
-- An issued invoice's economic snapshot is immutable; explicit reconciliation changes status only.
create function app_private.invoice_snapshot() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or (new.business_id,new.subscription_id,new.plan_version_id,new.amount_paisa,new.reference,new.period_start,new.period_end,new.due_at,new.currency) is distinct from (old.business_id,old.subscription_id,old.plan_version_id,old.amount_paisa,old.reference,old.period_start,old.period_end,old.due_at,old.currency) then raise exception 'invoice_immutable' using errcode='42501';end if;return new;
end $$;
create trigger invoice_snapshot before update or delete on public.invoices for each row execute function app_private.invoice_snapshot();
-- Explicit economically compatible changes: no invented prorating or repricing paid history.
create function public.admin_change_plan(p_business uuid,p_plan uuid,p_invoice uuid,p_reason text,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.subscriptions;v public.plan_versions;i public.invoices;old_version uuid;
begin
 perform app_private.phase8_admin('billing',true);
 if p_reason is null or char_length(btrim(p_reason)) not between 10 and 500 then raise exception 'invalid_input' using errcode='22023';end if;
 select * into strict s from public.subscriptions where business_id=p_business for update;old_version:=s.plan_version_id;
 select pv.* into v from public.plan_versions pv where pv.id=p_plan and pv.status='published' and exists(select from public.plans p where p.id=pv.plan_id and p.active);
 select * into i from public.invoices where id=p_invoice and subscription_id=s.id and status='paid' and period_start<=clock_timestamp() and period_end>clock_timestamp() for share;
 if v.id is null or i.id is null then raise exception 'billing_verification_required' using errcode='42501';end if;
 if v.price_paisa<>i.amount_paisa or v.billing_period<>(select billing_period from public.plan_versions where id=i.plan_version_id) then raise exception 'incompatible_paid_interval' using errcode='22023';end if;
 if exists(select from public.invoices where subscription_id=s.id and period_start>=i.period_end and status<>'void' and (amount_paisa<>v.price_paisa or (select billing_period from public.plan_versions where id=plan_version_id)<>v.billing_period)) then raise exception 'future_invoice_conflict' using errcode='40001';end if;
 update public.subscriptions set plan_version_id=v.id,updated_at=clock_timestamp(),row_version=row_version+1 where id=s.id;
 perform app_private.admin_audit(p_business,'subscription.plan_changed','subscription',s.id,btrim(p_reason),p_correlation,jsonb_build_object('previousPlanVersionId',old_version,'planVersionId',v.id,'verifiedInvoiceId',i.id));
 return jsonb_build_object('planVersionId',v.id,'preservedHistory',true);
end $$;
revoke all on function public.admin_change_plan(uuid,uuid,uuid,text,uuid) from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
grant execute on function public.admin_change_plan(uuid,uuid,uuid,text,uuid) to authenticated;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
