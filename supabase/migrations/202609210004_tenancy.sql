-- Phase 2: authoritative identity, configuration, enrollment and relationship records.
begin;

create table public.branch_hours (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 branch_id uuid not null, weekday integer not null check(weekday between 1 and 7),
 opens_at time not null, closes_at time not null, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), row_version integer not null default 1 check(row_version>0),
 foreign key(business_id,branch_id) references public.branches(business_id,id), check(opens_at<closes_at)
);
create index branch_hours_branch on public.branch_hours(business_id,branch_id,weekday);
create function app_private.check_hours() returns trigger language plpgsql set search_path='' as $$
begin
 perform 1 from public.branches where business_id=new.business_id and id=new.branch_id for update;
 if exists(select from public.branch_hours h where h.business_id=new.business_id and h.branch_id=new.branch_id
   and h.weekday=new.weekday and h.id<>new.id and h.opens_at<new.closes_at and new.opens_at<h.closes_at) then
   raise exception 'overlapping_hours' using errcode='23514'; end if;
 return new;
end $$;
create trigger nonoverlapping_hours before insert or update on public.branch_hours for each row execute function app_private.check_hours();

create table public.staff_invitations (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 email text not null check(email=lower(btrim(email)) and char_length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 role text not null check(role in ('manager','cashier')), token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null, status text not null default 'pending' check(status in ('pending','accepted','revoked','expired')),
 invited_by uuid not null references public.profiles(user_id), accepted_by uuid references public.profiles(user_id), accepted_at timestamptz,
 can_manage_campaigns boolean not null default false, can_contact_customers boolean not null default false,
 can_reverse_transactions boolean not null default false, can_export_reports boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), row_version integer not null default 1 check(row_version>0),
 unique(business_id,id), check(expires_at>created_at),
 check((status='accepted')=(accepted_by is not null and accepted_at is not null)),
 check(role<>'cashier' or not(can_manage_campaigns or can_contact_customers or can_reverse_transactions or can_export_reports))
);
create unique index pending_staff_email on public.staff_invitations(business_id,email) where status='pending';
create table public.invitation_branches (
 business_id uuid not null references public.businesses, invitation_id uuid not null, branch_id uuid not null,
 created_at timestamptz not null default now(), primary key(business_id,invitation_id,branch_id),
 foreign key(business_id,invitation_id) references public.staff_invitations(business_id,id),
 foreign key(business_id,branch_id) references public.branches(business_id,id)
);

create table public.policy_documents (
 id uuid primary key default gen_random_uuid(), business_id uuid references public.businesses,
 kind text not null check(kind in ('platform_terms','privacy','push_marketing','push_reward','push_birthday','inbox_birthday','whatsapp_marketing')),
 version text not null check(char_length(btrim(version)) between 1 and 80), body text not null check(char_length(btrim(body)) between 10 and 100000),
 published_at timestamptz, created_at timestamptz not null default now(),
 check(business_id is null), unique nulls not distinct(business_id,kind,version)
);
create function app_private.published_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if old.published_at is not null then raise exception 'published_immutable' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger policy_immutable before update or delete on public.policy_documents for each row execute function app_private.published_immutable();

create table public.plans (
 id uuid primary key default gen_random_uuid(), code text not null unique check(code ~ '^[a-z0-9-]{2,50}$'),
 name text not null check(char_length(btrim(name)) between 2 and 80), active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), row_version integer not null default 1 check(row_version>0)
);
create table public.plan_versions (
 id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.plans,
 version integer not null check(version>0), price_paisa bigint not null check(price_paisa between 1 and 9000000000000),
 billing_period text not null check(billing_period in ('monthly','annual')), branch_limit integer not null check(branch_limit>0),
 staff_limit integer not null check(staff_limit>0), member_limit integer check(member_limit>0), monthly_campaign_limit integer check(monthly_campaign_limit>0),
 trial_days integer not null default 14 check(trial_days between 0 and 30), status text not null default 'draft' check(status in ('draft','published')),
 published_at timestamptz, created_at timestamptz not null default now(), unique(plan_id,version),
 check((status='published')=(published_at is not null))
);
create trigger plan_version_immutable before update or delete on public.plan_versions for each row execute function app_private.published_immutable();
create table public.subscriptions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null unique references public.businesses,
 plan_version_id uuid not null references public.plan_versions, status text not null check(status in ('trial','active','past_due','suspended','canceled')),
 period_start timestamptz not null, period_end timestamptz not null, grace_ends_at timestamptz,
 billing_anchor_at timestamptz not null, canceled_at timestamptz, cancel_at_period_end boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), row_version integer not null default 1 check(row_version>0),
 unique(business_id,id), check(period_start<=period_end), check(grace_ends_at is null or grace_ends_at>=period_end)
);

create table public.loyalty_programmes (
 id uuid primary key default gen_random_uuid(), business_id uuid not null unique references public.businesses,
 type text not null check(type in ('stamps','points')), status text not null default 'draft' check(status in ('draft','published','paused')),
 name text not null check(char_length(btrim(name)) between 2 and 80),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), row_version integer not null default 1 check(row_version>0), unique(business_id,id)
);
create table public.programme_versions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses, programme_id uuid not null,
 version integer not null check(version>0), status text not null default 'draft' check(status in ('draft','published')),
 effective_at timestamptz not null, published_at timestamptz, minimum_spend_paisa bigint not null default 0 check(minimum_spend_paisa between 0 and 100000000),
 stamps_per_purchase integer check(stamps_per_purchase between 1 and 10), spend_step_paisa bigint check(spend_step_paisa between 100 and 100000000),
 units_per_step integer check(units_per_step between 1 and 1000), max_base_units_per_purchase integer not null default 1000 check(max_base_units_per_purchase between 1 and 100000),
 terms text not null check(char_length(btrim(terms)) between 10 and 3000), created_by uuid not null references public.profiles(user_id),
 created_at timestamptz not null default now(), unique(business_id,id), unique(programme_id,version),
 foreign key(business_id,programme_id) references public.loyalty_programmes(business_id,id),
 check((status='published')=(published_at is not null)),
 check((stamps_per_purchase is not null and spend_step_paisa is null and units_per_step is null and max_base_units_per_purchase>=stamps_per_purchase)
 or (stamps_per_purchase is null and spend_step_paisa is not null and units_per_step is not null))
);
create unique index programme_effective on public.programme_versions(programme_id,effective_at) where status='published';
create function app_private.programme_mode() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select from public.loyalty_programmes p where p.business_id=new.business_id and p.id=new.programme_id
   and (p.type='stamps')=(new.stamps_per_purchase is not null)) then raise exception 'programme_mode' using errcode='23514'; end if;
 return new;
end $$;
create trigger programme_mode before insert or update on public.programme_versions for each row execute function app_private.programme_mode();
create trigger programme_immutable before update or delete on public.programme_versions for each row execute function app_private.published_immutable();
create table public.rewards (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses, programme_id uuid not null,
 name text not null check(char_length(btrim(name)) between 2 and 80), status text not null default 'draft' check(status in ('draft','published')),
 published_version_id uuid, draft_version_id uuid, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), row_version integer not null default 1 check(row_version>0), unique(business_id,id),
 foreign key(business_id,programme_id) references public.loyalty_programmes(business_id,id), check((status='published')=(published_version_id is not null))
);
create table public.reward_versions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses, reward_id uuid not null,
 version integer not null check(version>0), unit_cost integer not null check(unit_cost between 1 and 1000000),
 title text not null check(char_length(btrim(title)) between 2 and 80), description text not null default '' check(char_length(description)<=500),
 terms text not null check(char_length(btrim(terms)) between 10 and 2000), estimated_cost_paisa bigint check(estimated_cost_paisa between 0 and 100000000),
 created_by uuid not null references public.profiles(user_id), created_at timestamptz not null default now(),
 unique(business_id,id), unique(business_id,reward_id,id), unique(reward_id,version),
 foreign key(business_id,reward_id) references public.rewards(business_id,id)
);
alter table public.rewards add foreign key(business_id,id,published_version_id) references public.reward_versions(business_id,reward_id,id),
 add foreign key(business_id,id,draft_version_id) references public.reward_versions(business_id,reward_id,id);
create table public.reward_branches (
 business_id uuid not null references public.businesses, reward_version_id uuid not null, branch_id uuid not null,
 created_at timestamptz not null default now(), primary key(business_id,reward_version_id,branch_id),
 foreign key(business_id,reward_version_id) references public.reward_versions(business_id,id),
 foreign key(business_id,branch_id) references public.branches(business_id,id)
);
create trigger reward_version_immutable before update or delete on public.reward_versions for each row execute function app_private.immutable_event();
create function app_private.reward_commitment() returns trigger language plpgsql set search_path='' as $$
begin
 if old.published_version_id is not null and (tg_op='DELETE' or new.published_version_id is distinct from old.published_version_id
   or new.programme_id<>old.programme_id or new.business_id<>old.business_id) then raise exception 'published_immutable' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger reward_commitment before update or delete on public.rewards for each row execute function app_private.reward_commitment();

create table public.memberships (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses, customer_user_id uuid references public.profiles(user_id),
 display_name text not null check(char_length(btrim(display_name)) between 1 and 80), joined_at timestamptz not null default now(), joined_branch_id uuid,
 status text not null default 'active' check(status in ('active','left','suspended','anonymized')), left_at timestamptz, last_qualifying_purchase_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), row_version integer not null default 1 check(row_version>0),
 unique(business_id,id), unique(business_id,customer_user_id), foreign key(business_id,joined_branch_id) references public.branches(business_id,id)
);
create index memberships_customer on public.memberships(customer_user_id,business_id);
create index memberships_affiliation on public.memberships(business_id,joined_branch_id,status);
create table public.membership_contacts (
 membership_id uuid primary key, business_id uuid not null references public.businesses, phone_e164 text check(phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 phone_status text not null default 'unverified' check(phone_status in ('unverified','staff_confirmed')), phone_confirmed_at timestamptz,
 phone_confirmed_by uuid references public.profiles(user_id), shared_email text check(char_length(shared_email)<=254 and shared_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 contact_changed_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), row_version integer not null default 1 check(row_version>0),
 foreign key(business_id,membership_id) references public.memberships(business_id,id),
 check((phone_status='staff_confirmed')=(phone_confirmed_at is not null and phone_confirmed_by is not null)),
 check(phone_status<>'staff_confirmed' or phone_e164 is not null)
);
create table public.consent_preferences (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses, membership_id uuid not null,
 channel text not null, purpose text not null, allowed boolean not null default false, text_version text not null,
 policy_document_id uuid not null references public.policy_documents, changed_at timestamptz not null,
 source text not null check(source in ('customer_settings','enrollment','staff_recorded_optout')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), row_version integer not null default 1 check(row_version>0),
 unique(business_id,membership_id,channel,purpose), foreign key(business_id,membership_id) references public.memberships(business_id,id),
 check((channel='push' and purpose in ('marketing','reward_updates','birthday')) or (channel='whatsapp' and purpose='marketing') or (channel='inbox' and purpose='birthday')),
 check(source<>'staff_recorded_optout' or not allowed)
);
create table public.consent_events (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses, membership_id uuid not null,
 channel text not null, purpose text not null, allowed boolean not null, text_version text not null, policy_document_id uuid not null references public.policy_documents,
 source text not null check(source in ('customer_settings','enrollment','staff_recorded_optout')), actor_user_id uuid references public.profiles(user_id),
 occurred_at timestamptz not null default now(), created_at timestamptz not null default now(),
 foreign key(business_id,membership_id) references public.memberships(business_id,id),
 check((channel='push' and purpose in ('marketing','reward_updates','birthday')) or (channel='whatsapp' and purpose='marketing') or (channel='inbox' and purpose='birthday')),
 check(source<>'staff_recorded_optout' or not allowed)
);
create index consent_events_member on public.consent_events(business_id,membership_id,occurred_at);
create function app_private.consent_document() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select from public.policy_documents d where d.id=new.policy_document_id and d.version=new.text_version
   and d.published_at<=clock_timestamp() and d.business_id is null
   and d.kind=new.channel||'_'||case when new.purpose='reward_updates' then 'reward' else new.purpose end) then
   raise exception 'invalid_consent_document' using errcode='23514'; end if;
 return new;
end $$;
create trigger consent_document before insert or update on public.consent_preferences for each row execute function app_private.consent_document();
create trigger consent_event_document before insert on public.consent_events for each row execute function app_private.consent_document();
create trigger consent_immutable before update or delete on public.consent_events for each row execute function app_private.immutable_event();
create table public.enrollment_acceptances (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses, membership_id uuid not null, programme_version_id uuid not null,
 platform_terms_document_id uuid not null references public.policy_documents, privacy_document_id uuid not null references public.policy_documents,
 accepted_at timestamptz not null, customer_user_id uuid references public.profiles(user_id), created_at timestamptz not null default now(),
 foreign key(business_id,membership_id) references public.memberships(business_id,id),
 foreign key(business_id,programme_version_id) references public.programme_versions(business_id,id)
);
create trigger enrollment_immutable before update or delete on public.enrollment_acceptances for each row execute function app_private.immutable_event();
create table public.balances (
 membership_id uuid primary key, business_id uuid not null references public.businesses,
 units bigint not null default 0 check(abs(units::numeric)<=9000000000000), ledger_version bigint not null default 0 check(ledger_version>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), row_version integer not null default 1 check(row_version>0),
 foreign key(business_id,membership_id) references public.memberships(business_id,id)
);

-- All relationship/configuration reads use narrow, independently authorized projections.
do $$ declare t text; begin
 foreach t in array array['branch_hours','staff_invitations','invitation_branches','policy_documents','plans','plan_versions','subscriptions',
 'loyalty_programmes','programme_versions','rewards','reward_versions','reward_branches','memberships','membership_contacts',
 'consent_preferences','consent_events','enrollment_acceptances','balances'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',t);
 end loop;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
commit;
