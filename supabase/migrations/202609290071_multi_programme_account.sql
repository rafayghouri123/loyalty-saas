begin;

CREATE OR REPLACE FUNCTION public.adjust_units(p_business uuid, p_membership uuid, p_units bigint, p_reason text, p_expected_version bigint, p_key text, p_correlation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare replay jsonb; staff public.business_users; bal public.balances; adjustment_id uuid; result jsonb;
begin
 replay:=app_private.value_request(p_business,'adjust_units',p_key,jsonb_build_object('membershipId',p_membership,'units',p_units::text,'reason',p_reason,'expectedLedgerVersion',p_expected_version));
 if replay is not null then
  perform app_private.authorize(p_business,null,true);
  return replay||jsonb_build_object('replayed',true);
 end if;
 staff:=app_private.authorize(p_business,null,true);
 if p_units is null or p_units=0 or abs(p_units::numeric)>100000 or char_length(btrim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'invalid_input' using errcode='22023'; end if;
 if p_units>0 and (not exists(select from public.businesses where id=p_business and status='active')
  or not exists(select from public.loyalty_programmes p join public.memberships m on m.business_id=p.business_id and m.programme_id=p.id where p.business_id=p_business and m.id=p_membership and p.status='published')
  or not app_private.entitled(p_business)) then raise exception 'participation_unavailable' using errcode='42501'; end if;
 if abs(p_units)>=1000 and not exists(select from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a
 where a->>'method' in ('oauth','otp','totp','mfa/totp') and (a->>'timestamp') ~ '^[0-9]{1,12}$'
 and to_timestamp((a->>'timestamp')::double precision) between clock_timestamp()-interval '15 minutes' and clock_timestamp()+interval '30 seconds') then
 raise exception 'reauthentication_required' using errcode='42501'; end if;
 perform 1 from public.memberships where business_id=p_business and id=p_membership and status<>'anonymized' for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 select * into bal from public.balances where business_id=p_business and membership_id=p_membership for update;
 if bal.ledger_version<>p_expected_version then raise exception 'stale_effect' using errcode='40001'; end if;
 if bal.units+p_units<0 then raise exception 'insufficient_balance' using errcode='P0003'; end if;
 insert into public.adjustments(business_id,membership_id,units,reason,actor_user_id,idempotency_key)
 values(p_business,p_membership,p_units,btrim(p_reason),staff.user_id,p_key) returning id into adjustment_id;
 insert into public.ledger_entries(business_id,membership_id,entry_kind,units,adjustment_id,actor_user_id)
 values(p_business,p_membership,'adjustment',p_units,adjustment_id,staff.user_id);
 select * into bal from public.balances where membership_id=p_membership;
 result:=jsonb_build_object('adjustmentId',adjustment_id,'units',p_units::text,'balanceAfterAtCommit',bal.units::text,
 'ledgerVersion',bal.ledger_version::text,'replayed',false);
 perform app_private.audit(p_business,'balance.adjusted','membership',p_membership,p_correlation_id,jsonb_build_object('reason',btrim(p_reason),'units',p_units::text));
 return app_private.value_finish(p_business,'adjust_units',p_key,result,adjustment_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.worker_account_export_page(p_request uuid, p_token uuid, p_section text, p_cursor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '5s'
AS $function$
declare r public.privacy_requests;rows jsonb;last_id uuid;
begin
 select * into strict r from public.privacy_requests where id=p_request and kind='export' and status='processing' and processing_token=p_token and requested_at+interval '24 hours'>clock_timestamp();
 if not exists(select from public.profiles where user_id=r.customer_user_id and anonymized_at is null and auth_user_id is not null) then raise exception 'forbidden' using errcode='42501';end if;
 update public.privacy_requests set processing_started_at=clock_timestamp() where id=r.id;
 if p_section='profile' then select coalesce(jsonb_agg(x),'[]') into rows from (select user_id as id,display_name,preferred_timezone,birthday_month,birthday_day,created_at,updated_at,(select email from auth.users where id=p.auth_user_id) as verified_email from public.profiles p where user_id=r.customer_user_id and (p_cursor is null or user_id>p_cursor)) x;
 elsif p_section='memberships' then select coalesce(jsonb_agg(x order by x.id),'[]') into rows from (select m.id,m.business_id,m.programme_id,lp.name as programme,b.display_name as business,m.display_name,m.status,m.joined_at,m.left_at,m.joined_branch_id,c.phone_e164,c.phone_status,c.shared_email,c.contact_changed_at,bal.units::text as balance_units from public.memberships m join public.businesses b on b.id=m.business_id join public.loyalty_programmes lp on lp.id=m.programme_id left join public.membership_contacts c on c.membership_id=m.id left join public.balances bal on bal.membership_id=m.id where m.customer_user_id=r.customer_user_id and (p_cursor is null or m.id>p_cursor) order by m.id limit 100) x;
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
end $function$
;

commit;
