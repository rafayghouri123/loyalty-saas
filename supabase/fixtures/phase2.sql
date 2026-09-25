-- LOCAL TEST FIXTURES ONLY. No deployable pricing, policy wording, credentials or purchases.
-- Loaded exclusively by the --local seed command or the isolated PostgreSQL harness.
begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
 ('a2000000-0000-4000-8000-000000000001','fixture-owner-a@example.invalid',now(),false),
 ('a2000000-0000-4000-8000-000000000002','fixture-owner-b@example.invalid',now(),false),
 ('a2000000-0000-4000-8000-000000000003','fixture-customer@example.invalid',now(),false);
insert into public.profiles(user_id,auth_user_id,display_name) values
 ('a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','TEST Owner A'),
 ('a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002','TEST Owner B'),
 ('a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000003','TEST Customer');
insert into public.plans(id,code,name) values('a2000000-0000-4000-8000-000000000010','local-fixture','TEST ONLY — not an offered plan');
insert into public.plan_versions(id,plan_id,version,price_paisa,billing_period,branch_limit,staff_limit,member_limit,status,published_at)
 values('a2000000-0000-4000-8000-000000000011','a2000000-0000-4000-8000-000000000010',1,100,'monthly',2,5,100,'published',now());
insert into public.policy_documents(kind,version,body,published_at)
 select kind,'local-test-v1','DEVELOPMENT FIXTURE ONLY. This text is not legal advice or a production policy.',now()
 from unnest(array['platform_terms','privacy','push_marketing','push_reward','push_birthday','inbox_birthday','whatsapp_marketing']) kind;
insert into public.businesses(id,slug,display_name,created_by) values
 ('a2000000-0000-4000-8000-000000000020','test-cafe-a','TEST Cafe A','a2000000-0000-4000-8000-000000000001'),
 ('a2000000-0000-4000-8000-000000000021','test-cafe-b','TEST Cafe B','a2000000-0000-4000-8000-000000000002');
insert into public.business_users(business_id,user_id,staff_display_name,staff_email,role) values
 ('a2000000-0000-4000-8000-000000000020','a2000000-0000-4000-8000-000000000001','TEST Owner A','fixture-owner-a@example.invalid','owner'),
 ('a2000000-0000-4000-8000-000000000021','a2000000-0000-4000-8000-000000000002','TEST Owner B','fixture-owner-b@example.invalid','owner');
insert into public.branches(id,business_id,name,address,city) values
 ('a2000000-0000-4000-8000-000000000030','a2000000-0000-4000-8000-000000000020','TEST Branch A','Fictional address A — never navigate','Lahore'),
 ('a2000000-0000-4000-8000-000000000031','a2000000-0000-4000-8000-000000000021','TEST Branch B','Fictional address B — never navigate','Karachi');
insert into public.subscriptions(business_id,plan_version_id,status,period_start,period_end,billing_anchor_at)
 select id,'a2000000-0000-4000-8000-000000000011','trial',now(),now()+interval '14 days',now() from public.businesses where slug in ('test-cafe-a','test-cafe-b');
insert into public.loyalty_programmes(id,business_id,type,name) values
 ('a2000000-0000-4000-8000-000000000040','a2000000-0000-4000-8000-000000000020','stamps','TEST stamp programme'),
 ('a2000000-0000-4000-8000-000000000041','a2000000-0000-4000-8000-000000000021','points','TEST points programme');
insert into public.programme_versions(business_id,programme_id,version,effective_at,stamps_per_purchase,spend_step_paisa,units_per_step,terms,created_by) values
 ('a2000000-0000-4000-8000-000000000020','a2000000-0000-4000-8000-000000000040',1,now(),1,null,null,'TEST ONLY. No live earning commitment.','a2000000-0000-4000-8000-000000000001'),
 ('a2000000-0000-4000-8000-000000000021','a2000000-0000-4000-8000-000000000041',1,now(),null,10000,1,'TEST ONLY. No live earning commitment.','a2000000-0000-4000-8000-000000000002');
insert into public.memberships(id,business_id,customer_user_id,display_name,joined_branch_id) values
 ('a2000000-0000-4000-8000-000000000050','a2000000-0000-4000-8000-000000000020','a2000000-0000-4000-8000-000000000003','TEST Customer at A','a2000000-0000-4000-8000-000000000030'),
 ('a2000000-0000-4000-8000-000000000051','a2000000-0000-4000-8000-000000000021','a2000000-0000-4000-8000-000000000003','TEST Customer at B','a2000000-0000-4000-8000-000000000031');
insert into public.membership_contacts(business_id,membership_id) select business_id,id from public.memberships where id in ('a2000000-0000-4000-8000-000000000050','a2000000-0000-4000-8000-000000000051');
insert into public.balances(business_id,membership_id) select business_id,id from public.memberships where id in ('a2000000-0000-4000-8000-000000000050','a2000000-0000-4000-8000-000000000051');
commit;
