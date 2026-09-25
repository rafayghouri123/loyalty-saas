-- Phase 5 communication records. Browser roles have no direct table access.
begin;

create table public.offers (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 kind text not null check(kind in ('informational','discount','treat')),
 title text not null check(title=btrim(title) and char_length(title) between 2 and 80),
 description text not null check(char_length(description) between 1 and 1000),
 terms text not null default '' check(char_length(terms)<=2000), image_asset_id uuid,
 starts_at timestamptz not null, expires_at timestamptz not null,
 status text not null default 'draft' check(status in ('draft','published','paused','expired')),
 audience text not null check(audience in ('all_members','recipient_list')),
 is_automation_template boolean not null default false, source_template_id uuid,
 generated_by_run_id uuid unique, discount_percent integer,
 minimum_spend_paisa bigint not null default 0 check(minimum_spend_paisa between 0 and 100000000),
 max_discount_paisa bigint check(max_discount_paisa between 0 and 100000000),
 created_by uuid not null references public.profiles(user_id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 row_version integer not null default 1 check(row_version>0), unique(business_id,id),
 foreign key(business_id,source_template_id) references public.offers(business_id,id),
 check(starts_at<expires_at), check(not is_automation_template or (audience='recipient_list' and generated_by_run_id is null)),
 check(source_template_id is null or (not is_automation_template and audience='recipient_list')),
 check((kind='discount' and discount_percent between 1 and 100 and char_length(btrim(terms)) between 10 and 2000)
   or (kind='treat' and discount_percent is null and max_discount_paisa is null and char_length(btrim(terms)) between 10 and 2000)
   or (kind='informational' and discount_percent is null and max_discount_paisa is null and minimum_spend_paisa=0))
);
create index offers_business_status on public.offers(business_id,status,expires_at,id);
create table public.offer_branches (
 business_id uuid not null, offer_id uuid not null, branch_id uuid not null,
 primary key(business_id,offer_id,branch_id),
 foreign key(business_id,offer_id) references public.offers(business_id,id),
 foreign key(business_id,branch_id) references public.branches(business_id,id)
);
create table public.offer_recipients (
 business_id uuid not null, offer_id uuid not null, membership_id uuid not null,
 valid_from timestamptz not null, valid_until timestamptz not null, automation_run_id uuid,
 primary key(offer_id,membership_id),
 foreign key(business_id,offer_id) references public.offers(business_id,id),
 foreign key(business_id,membership_id) references public.memberships(business_id,id),
 check(valid_from<valid_until)
);
create index offer_recipients_member on public.offer_recipients(business_id,membership_id,valid_until);
create table public.offer_claims (
 id uuid primary key default gen_random_uuid(), business_id uuid not null, offer_id uuid not null,
 membership_id uuid not null, campaign_id uuid, automation_run_id uuid,
 status text not null default 'claimed' check(status in ('claimed','fulfilled','expired','voided')),
 claimed_at timestamptz not null default now(), fulfilled_at timestamptz, fulfilled_by uuid references public.profiles(user_id),
 branch_id uuid, purchase_id uuid unique, void_reason text,
 applied_discount_paisa bigint check(applied_discount_paisa>=0), benefit_description text,
 unique(business_id,id), unique(offer_id,membership_id),
 foreign key(business_id,offer_id) references public.offers(business_id,id),
 foreign key(business_id,membership_id) references public.memberships(business_id,id),
 foreign key(business_id,branch_id) references public.branches(business_id,id),
 foreign key(business_id,purchase_id) references public.purchases(business_id,id),
 check((status='fulfilled')=(fulfilled_at is not null and fulfilled_by is not null))
);
create index offer_claims_member on public.offer_claims(business_id,membership_id,claimed_at desc);
create table public.offer_claim_intents (
 id uuid primary key default gen_random_uuid(), business_id uuid not null,
 offer_claim_id uuid not null, membership_id uuid not null,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null, consumed_at timestamptz, canceled_at timestamptz,
 created_by uuid not null references public.profiles(user_id), created_at timestamptz not null default now(),
 unique(business_id,id), foreign key(business_id,offer_claim_id) references public.offer_claims(business_id,id),
 foreign key(business_id,membership_id) references public.memberships(business_id,id),
 check(consumed_at is null or canceled_at is null)
);
create table public.campaigns (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 name text not null check(name=btrim(name) and char_length(name) between 2 and 100),
 status text not null default 'draft' check(status in ('draft','scheduled','processing','paused','canceled','completed','completed_with_errors','failed')),
 current_version_id uuid, created_by uuid not null references public.profiles(user_id),
 scheduled_at timestamptz, started_at timestamptz, completed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 row_version integer not null default 1 check(row_version>0), unique(business_id,id)
);
create index campaigns_due on public.campaigns(scheduled_at,id) where status='scheduled';
create table public.campaign_versions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null, campaign_id uuid not null,
 version integer not null check(version>0), title text not null check(title=btrim(title) and char_length(title) between 3 and 80),
 body text not null check(body=btrim(body) and char_length(body) between 10 and 500), image_asset_id uuid,
 destination text not null check(destination in ('card','offer')), offer_id uuid,
 audience text not null check(audience in ('all_opted_in','inactive','reward_ready','near_reward')),
 inactive_days integer check(inactive_days between 7 and 365), near_reward_units integer check(near_reward_units between 1 and 1000),
 target_reward_version_id uuid, timezone text not null,
 expires_at timestamptz not null, created_at timestamptz not null default now(),
 unique(business_id,id), unique(business_id,campaign_id,id), unique(campaign_id,version),
 foreign key(business_id,campaign_id) references public.campaigns(business_id,id),
 foreign key(business_id,offer_id) references public.offers(business_id,id),
 foreign key(business_id,target_reward_version_id) references public.reward_versions(business_id,id),
 check((destination='offer')=(offer_id is not null)),
 check((audience='inactive')=(inactive_days is not null)),
 check((audience in ('reward_ready','near_reward'))=(target_reward_version_id is not null)),
 check((audience='near_reward')=(near_reward_units is not null))
);
alter table public.campaigns add foreign key(business_id,id,current_version_id) references public.campaign_versions(business_id,campaign_id,id);
create table public.campaign_branches (
 business_id uuid not null,campaign_version_id uuid not null,branch_id uuid not null,
 primary key(business_id,campaign_version_id,branch_id),
 foreign key(business_id,campaign_version_id) references public.campaign_versions(business_id,id),
 foreign key(business_id,branch_id) references public.branches(business_id,id)
);
create table public.campaign_recipients (
 id uuid primary key default gen_random_uuid(), business_id uuid not null,
 campaign_id uuid not null,campaign_version_id uuid not null,membership_id uuid not null,
 status text not null default 'pending' check(status in ('pending','suppressed','processing','attempted','failed')),
 suppression_reason text,snapshot_at timestamptz not null default now(),observed_clicked_at timestamptz,
 unique(business_id,id),unique(campaign_id,membership_id),
 foreign key(business_id,campaign_id,campaign_version_id) references public.campaign_versions(business_id,campaign_id,id),
 foreign key(business_id,membership_id) references public.memberships(business_id,id)
);
create index campaign_recipients_pending on public.campaign_recipients(campaign_id,id) where status='pending';
create table public.push_test_registrations (
 business_id uuid not null,business_user_id uuid not null,push_device_id uuid not null,
 active boolean not null default true,created_at timestamptz not null default now(),
 primary key(business_id,business_user_id,push_device_id),
 foreign key(business_id,business_user_id) references public.business_users(business_id,id),
 foreign key(push_device_id) references public.push_devices(id)
);
create table public.automation_rules (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,
 kind text not null check(kind in ('reward_available','inactivity','birthday')),
 enabled boolean not null default false,
 title_template text not null check(title_template=btrim(title_template) and char_length(title_template) between 3 and 80),
 body_template text not null check(body_template=btrim(body_template) and char_length(body_template) between 10 and 500),
 inactive_days integer check(inactive_days between 7 and 365),reward_version_id uuid,offer_id uuid,
 birthday_validity_days integer check(birthday_validity_days between 1 and 30),
 version integer not null default 1 check(version>0),updated_at timestamptz not null default now(),
 unique(business_id,id),unique(business_id,kind),
 foreign key(business_id,reward_version_id) references public.reward_versions(business_id,id),
 foreign key(business_id,offer_id) references public.offers(business_id,id),
 check((kind='reward_available' and reward_version_id is not null and inactive_days is null and offer_id is null and birthday_validity_days is null)
 or (kind='inactivity' and inactive_days is not null and reward_version_id is null and birthday_validity_days is null)
 or (kind='birthday' and offer_id is not null and birthday_validity_days is not null and reward_version_id is null and inactive_days is null))
);
create table public.automation_runs (
 id uuid primary key default gen_random_uuid(),business_id uuid not null,rule_id uuid not null,
 rule_version integer not null,membership_id uuid not null,event_key text not null,
 state text not null default 'pending' check(state in ('pending','suppressed','processing','completed','failed')),
 scheduled_at timestamptz not null,expires_at timestamptz not null,suppression_reason text,
 rendered_title text not null check(char_length(rendered_title) between 3 and 80),
 rendered_body text not null check(char_length(rendered_body) between 10 and 500),
 rule_snapshot jsonb not null,source_purchase_id uuid,source_ledger_entry_id uuid,birthday_year integer,
 created_at timestamptz not null default now(),unique(business_id,id),unique(business_id,membership_id,event_key),
 foreign key(business_id,rule_id) references public.automation_rules(business_id,id),
 foreign key(business_id,membership_id) references public.memberships(business_id,id),
 foreign key(business_id,source_purchase_id) references public.purchases(business_id,id),
 foreign key(business_id,source_ledger_entry_id) references public.ledger_entries(business_id,id),
 check(scheduled_at<expires_at)
);
create unique index automation_birthday_annual on public.automation_runs(business_id,membership_id,birthday_year) where birthday_year is not null;
alter table public.offers add foreign key(business_id,generated_by_run_id) references public.automation_runs(business_id,id);
alter table public.offer_recipients add foreign key(business_id,automation_run_id) references public.automation_runs(business_id,id);
alter table public.offer_claims add foreign key(business_id,campaign_id) references public.campaigns(business_id,id),
 add foreign key(business_id,automation_run_id) references public.automation_runs(business_id,id);
create table public.delivery_attempts (
 id uuid primary key default gen_random_uuid(),business_id uuid not null,
 campaign_recipient_id uuid,automation_run_id uuid,push_device_id uuid not null references public.push_devices,
 event_key text not null,attempt_number integer not null check(attempt_number>0),
 state text not null default 'pending' check(state in ('pending','provider_accepted','failed','unknown')),
 provider_message_id text,error_code text,attempted_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key(business_id,campaign_recipient_id) references public.campaign_recipients(business_id,id),
 foreign key(business_id,automation_run_id) references public.automation_runs(business_id,id),
 unique(event_key,push_device_id,attempt_number),
 check((campaign_recipient_id is null)<>(automation_run_id is null))
);
create index delivery_attempts_campaign on public.delivery_attempts(business_id,campaign_recipient_id,state);
create table public.contact_frequency_reservations (
 id uuid primary key default gen_random_uuid(),customer_user_id uuid not null references public.profiles(user_id),
 business_id uuid not null references public.businesses,event_key text not null,
 kind text not null check(kind in ('marketing','reward_update')),
 business_window_start timestamptz not null,global_window_start timestamptz not null,
 reserved_at timestamptz not null default now(),
 state text not null default 'reserved' check(state in ('reserved','attempted','released')),
 unique(customer_user_id,business_id,event_key)
);
create index frequency_business on public.contact_frequency_reservations(customer_user_id,business_id,kind,reserved_at) where state<>'released';
create index frequency_global on public.contact_frequency_reservations(customer_user_id,kind,reserved_at) where state<>'released';
alter table public.purchases add foreign key(business_id,primary_offer_claim_id) references public.offer_claims(business_id,id);

do $$ declare t text; begin
 foreach t in array array['offers','offer_branches','offer_recipients','offer_claims','offer_claim_intents','campaigns',
 'campaign_versions','campaign_branches','campaign_recipients','push_test_registrations','automation_rules',
 'automation_runs','delivery_attempts','contact_frequency_reservations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',t);
 end loop;
end $$;
commit;
