begin;

create function app_private.valid_iso_weekdays(p_days integer[]) returns boolean language sql immutable set search_path='' as $$
 select coalesce(array_length(p_days,1) between 1 and 7 and p_days <@ array[1,2,3,4,5,6,7]
  and cardinality(p_days)=cardinality(array(select distinct unnest(p_days))),false)
$$;

create table public.earning_promotions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 name text not null check(char_length(btrim(name)) between 2 and 80),
 status text not null default 'draft' check(status in ('draft','enabled','paused','ended')),
 current_version_id uuid, row_version integer not null default 1 check(row_version>0),
 created_by uuid not null references public.profiles(user_id), created_at timestamptz not null default now(),
 unique(business_id,id)
);
create table public.promotion_versions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null,
 promotion_id uuid not null, version integer not null check(version>0),
 status text not null default 'draft' check(status in ('draft','published')),
 starts_on date not null, ends_on date not null, weekdays integer[] not null,
 starts_at time not null, ends_at time not null, timezone text not null,
 multiplier integer not null default 2 check(multiplier=2),
 minimum_spend_paisa bigint not null default 0 check(minimum_spend_paisa between 0 and 100000000),
 member_daily_cap integer check(member_daily_cap between 1 and 100),
 max_bonus_units_per_purchase integer not null default 1000 check(max_bonus_units_per_purchase between 1 and 100000),
 effective_at timestamptz not null, published_at timestamptz,
 created_by uuid not null references public.profiles(user_id), created_at timestamptz not null default now(),
 unique(business_id,id), unique(business_id,promotion_id,version),
 foreign key(business_id,promotion_id) references public.earning_promotions(business_id,id),
 check(ends_on>=starts_on and ends_on-starts_on<=365),
 check(starts_at<ends_at),
 check(app_private.valid_iso_weekdays(weekdays)),
 check((status='published')=(published_at is not null))
);
-- The immutable check helper also rejects duplicate weekdays from direct writes.
alter table public.earning_promotions add foreign key(business_id,current_version_id) references public.promotion_versions(business_id,id);
create table public.promotion_branches (
 business_id uuid not null, promotion_version_id uuid not null, branch_id uuid not null,
 primary key(business_id,promotion_version_id,branch_id),
 foreign key(business_id,promotion_version_id) references public.promotion_versions(business_id,id),
 foreign key(business_id,branch_id) references public.branches(business_id,id)
);
alter table public.purchases add foreign key(business_id,promotion_version_id) references public.promotion_versions(business_id,id);
alter table public.purchases add constraint purchase_promotion_effect check((promotion_bonus_units>0)=(promotion_version_id is not null));
create table public.promotion_usage (
 id uuid primary key default gen_random_uuid(), business_id uuid not null,
 promotion_version_id uuid not null, promotion_id uuid not null,
 membership_id uuid not null, purchase_id uuid not null unique,
 local_date date not null, bonus_units integer not null check(bonus_units between 1 and 100000),
 reversed_at timestamptz, created_at timestamptz not null default now(),
 unique(business_id,id),
 foreign key(business_id,promotion_version_id) references public.promotion_versions(business_id,id),
 foreign key(business_id,promotion_id) references public.earning_promotions(business_id,id),
 foreign key(business_id,membership_id) references public.memberships(business_id,id),
 foreign key(business_id,purchase_id) references public.purchases(business_id,id)
);
create index promotion_usage_cap on public.promotion_usage(business_id,promotion_id,membership_id,local_date) where reversed_at is null;
create index promotion_version_schedule on public.promotion_versions(business_id,status,effective_at,starts_on,ends_on);

create table public.referral_rule_versions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 version integer not null check(version>0), effective_at timestamptz not null,
 enabled boolean not null default true,
 inviter_bonus_units integer not null check(inviter_bonus_units between 1 and 1000),
 friend_bonus_units integer not null check(friend_bonus_units between 1 and 1000),
 minimum_spend_paisa bigint not null check(minimum_spend_paisa between 0 and 100000000),
 monthly_inviter_cap integer not null default 10 check(monthly_inviter_cap between 1 and 1000),
 attribution_days integer not null default 7 check(attribution_days between 1 and 30),
 qualification_days integer not null default 30 check(qualification_days between 1 and 90),
 created_by uuid not null references public.profiles(user_id), created_at timestamptz not null default now(),
 unique(business_id,id), unique(business_id,version), unique(business_id,effective_at)
);
create table public.referral_codes (
 id uuid primary key default gen_random_uuid(), business_id uuid not null,
 membership_id uuid not null, code text collate "C" not null unique,
 active boolean not null default true, created_at timestamptz not null default now(),
 unique(business_id,id), foreign key(business_id,membership_id) references public.memberships(business_id,id),
 check(code ~ '^[A-Za-z0-9_-]{21}[AEIMQUYcgkosw048]$')
);
create unique index referral_active_member_code on public.referral_codes(business_id,membership_id) where active;
create table public.referral_claims (
 id uuid primary key default gen_random_uuid(), business_id uuid not null,
 referrer_membership_id uuid not null, referred_membership_id uuid not null,
 code_id uuid not null, rule_version_id uuid not null,
 enrolled_at timestamptz not null, qualifies_until timestamptz not null,
 status text not null default 'pending' check(status in ('pending','qualified','expired','reversed')),
 qualifying_purchase_id uuid, qualified_at timestamptz,
 inviter_awarded_units integer not null default 0 check(inviter_awarded_units between 0 and 1000),
 friend_awarded_units integer not null default 0 check(friend_awarded_units between 0 and 1000),
 inviter_suppression text not null default 'none' check(inviter_suppression in ('none','monthly_cap','member_unavailable')),
 reversed_at timestamptz, created_at timestamptz not null default now(),
 unique(business_id,id), unique(business_id,referred_membership_id), unique(business_id,qualifying_purchase_id),
 foreign key(business_id,referrer_membership_id) references public.memberships(business_id,id),
 foreign key(business_id,referred_membership_id) references public.memberships(business_id,id),
 foreign key(business_id,code_id) references public.referral_codes(business_id,id),
 foreign key(business_id,rule_version_id) references public.referral_rule_versions(business_id,id),
 foreign key(business_id,qualifying_purchase_id) references public.purchases(business_id,id),
 check(referrer_membership_id<>referred_membership_id),
 check(qualifies_until>enrolled_at),
 check((status='pending' and qualifying_purchase_id is null and qualified_at is null and reversed_at is null
   and inviter_awarded_units=0 and friend_awarded_units=0)
  or (status='expired' and qualifying_purchase_id is null and qualified_at is null and reversed_at is null
   and inviter_awarded_units=0 and friend_awarded_units=0)
  or (status='qualified' and qualifying_purchase_id is not null and qualified_at is not null and reversed_at is null
   and friend_awarded_units>0)
  or (status='reversed' and qualifying_purchase_id is not null and qualified_at is not null and reversed_at is not null
   and friend_awarded_units>0)),
 check(friend_awarded_units=0 or inviter_awarded_units>0 or inviter_suppression<>'none')
);
alter table public.ledger_entries add foreign key(business_id,referral_claim_id) references public.referral_claims(business_id,id);
create table public.referral_cap_usage (
 id uuid primary key default gen_random_uuid(), business_id uuid not null,
 referrer_membership_id uuid not null, claim_id uuid not null unique,
 local_month date not null, reversed_at timestamptz, created_at timestamptz not null default now(),
 unique(business_id,id),
 foreign key(business_id,referrer_membership_id) references public.memberships(business_id,id),
 foreign key(business_id,claim_id) references public.referral_claims(business_id,id)
);
create index referral_month_cap on public.referral_cap_usage(business_id,referrer_membership_id,local_month) where reversed_at is null;
create index referral_claim_status on public.referral_claims(business_id,status,enrolled_at desc,id desc);
create index referral_claim_enrolled on public.referral_claims(business_id,enrolled_at desc,id desc);
create table app_private.referral_attribution_grants (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 business_id uuid not null references public.businesses,
 code_id uuid not null, auth_user_id uuid not null, session_id uuid not null,
 seen_at timestamptz not null, expires_at timestamptz not null,
 consumed_at timestamptz, created_at timestamptz not null default now(),
 foreign key(business_id,code_id) references public.referral_codes(business_id,id),
 check(expires_at>created_at)
);
create index referral_grants_expiry on app_private.referral_attribution_grants(expires_at);
alter table app_private.referral_attribution_grants enable row level security;
revoke all on app_private.referral_attribution_grants from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;

create function app_private.immutable_published_promotion() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status='published' and new is distinct from old then raise exception 'published_version_immutable' using errcode='23514'; end if;
 return new;
end $$;
create trigger published_promotion_immutable before update or delete on public.promotion_versions
 for each row execute function app_private.immutable_published_promotion();
create trigger promotion_timezone before insert or update on public.promotion_versions
 for each row execute function app_private.valid_timezone();
create trigger referral_rule_immutable before update or delete on public.referral_rule_versions
 for each row execute function app_private.immutable_event();
create trigger promotion_usage_timezone_lock before insert on public.promotion_usage
 for each row execute function app_private.lock_business_timezone();
create trigger promotion_version_timezone_lock before insert on public.promotion_versions
 for each row execute function app_private.lock_business_timezone();
create trigger referral_claim_timezone_lock before insert on public.referral_claims
 for each row execute function app_private.lock_business_timezone();
create or replace function app_private.lock_business_timezone() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.businesses set timezone_locked_at=clock_timestamp() where id=new.business_id and timezone_locked_at is null;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['earning_promotions','promotion_versions','promotion_branches','promotion_usage',
 'referral_rule_versions','referral_codes','referral_claims','referral_cap_usage'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',t);
 end loop;
end $$;
commit;
