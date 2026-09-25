begin;

-- Lock order for value writes: idempotency, business, staff/branch, balance,
-- checkout context or intent, source row. Referral parties join this order in Phase 4.
create table public.membership_handles (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 membership_id uuid not null, handle_hash text not null unique check(handle_hash ~ '^[a-f0-9]{64}$'),
 handle_ciphertext text not null, encryption_key_id text not null,
 status text not null default 'active' check(status in ('active','revoked')), revoked_at timestamptz,
 created_at timestamptz not null default now(), unique(business_id,id),
 foreign key(business_id,membership_id) references public.memberships(business_id,id),
 check((status='revoked')=(revoked_at is not null))
);
create unique index membership_active_handle on public.membership_handles(business_id,membership_id) where status='active';
create table public.scanner_codes (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 membership_id uuid not null, code_hash text not null unique check(code_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null, consumed_at timestamptz,
 purpose text not null check(purpose in ('membership_lookup','redemption_lookup','offer_lookup')),
 redemption_intent_id uuid, offer_claim_intent_id uuid, created_at timestamptz not null default now(),
 unique(business_id,id), foreign key(business_id,membership_id) references public.memberships(business_id,id),
 check((purpose='membership_lookup' and redemption_intent_id is null and offer_claim_intent_id is null)
 or (purpose='redemption_lookup' and redemption_intent_id is not null and offer_claim_intent_id is null)
 or (purpose='offer_lookup' and redemption_intent_id is null and offer_claim_intent_id is not null))
);
create index scanner_codes_expiry on public.scanner_codes(expires_at) where consumed_at is null;
create table app_private.checkout_contexts (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 branch_id uuid not null, membership_id uuid not null, staff_user_id uuid not null references public.profiles(user_id),
 session_id uuid not null, token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 kind text not null check(kind in ('earning','redemption')), redemption_intent_id uuid,
 expires_at timestamptz not null, consumed_at timestamptz, created_at timestamptz not null default now(),
 foreign key(business_id,branch_id) references public.branches(business_id,id),
 foreign key(business_id,membership_id) references public.memberships(business_id,id),
 check((kind='earning')=(redemption_intent_id is null))
);
create index checkout_context_expiry on app_private.checkout_contexts(expires_at) where consumed_at is null;
create table public.purchases (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 branch_id uuid not null, membership_id uuid not null, programme_version_id uuid not null,
 recorded_bill_paisa bigint not null check(recorded_bill_paisa between 0 and 100000000),
 eligible_spend_paisa bigint not null check(eligible_spend_paisa between 0 and recorded_bill_paisa),
 base_units integer not null check(base_units between 0 and 100000),
 promotion_bonus_units integer not null default 0 check(promotion_bonus_units between 0 and 100000),
 promotion_version_id uuid, receipt_reference text check(char_length(receipt_reference)<=80),
 qualifying_purchase_confirmed boolean not null default false, qualifies_for_loyalty boolean not null,
 offer_eligible_before_discount_paisa bigint, applied_discount_paisa bigint, primary_offer_claim_id uuid,
 status text not null default 'committed' check(status in ('committed','reversed')),
 occurred_at timestamptz not null default now(), staff_user_id uuid not null references public.profiles(user_id),
 idempotency_key text not null, request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 corrects_purchase_id uuid, created_at timestamptz not null default now(), unique(business_id,id),
 unique(business_id,idempotency_key), foreign key(business_id,branch_id) references public.branches(business_id,id),
 foreign key(business_id,membership_id) references public.memberships(business_id,id),
 foreign key(business_id,programme_version_id) references public.programme_versions(business_id,id),
 foreign key(business_id,corrects_purchase_id) references public.purchases(business_id,id),
 check((offer_eligible_before_discount_paisa is null and applied_discount_paisa is null and primary_offer_claim_id is null)
 or (offer_eligible_before_discount_paisa is not null and applied_discount_paisa is not null and primary_offer_claim_id is not null))
);
create index purchases_member_activity on public.purchases(business_id,membership_id,occurred_at desc,id desc);
create index purchases_branch_activity on public.purchases(business_id,branch_id,occurred_at desc,id desc);
create unique index one_active_correction on public.purchases(business_id,corrects_purchase_id) where corrects_purchase_id is not null and status='committed';
create table public.purchase_reversals (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 purchase_id uuid not null, reason text not null check(char_length(btrim(reason)) between 10 and 500),
 actor_user_id uuid not null references public.profiles(user_id), reversed_at timestamptz not null default now(),
 idempotency_key text not null, created_at timestamptz not null default now(), unique(business_id,id),
 unique(business_id,purchase_id), foreign key(business_id,purchase_id) references public.purchases(business_id,id)
);
create index purchase_reversals_activity on public.purchase_reversals(business_id,reversed_at desc,id desc);
create table public.redemption_intents (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 membership_id uuid not null, reward_version_id uuid not null, token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null, consumed_at timestamptz, canceled_at timestamptz,
 created_by uuid not null references public.profiles(user_id), created_at timestamptz not null default now(),
 unique(business_id,id), foreign key(business_id,membership_id) references public.memberships(business_id,id),
 foreign key(business_id,reward_version_id) references public.reward_versions(business_id,id),
 check(consumed_at is null or canceled_at is null)
);
alter table public.scanner_codes add foreign key(business_id,redemption_intent_id) references public.redemption_intents(business_id,id);
alter table app_private.checkout_contexts add foreign key(business_id,redemption_intent_id) references public.redemption_intents(business_id,id);
create index redemption_intents_member on public.redemption_intents(business_id,membership_id,reward_version_id,expires_at desc);
create table public.redemptions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 membership_id uuid not null, reward_version_id uuid not null, intent_id uuid not null,
 branch_id uuid not null, unit_cost integer not null check(unit_cost between 1 and 1000000),
 estimated_cost_paisa bigint, status text not null default 'fulfilled' check(status in ('fulfilled','reversed')),
 fulfilled_at timestamptz not null default now(), fulfilled_by uuid not null references public.profiles(user_id),
 purchase_id uuid, idempotency_key text not null, created_at timestamptz not null default now(),
 unique(business_id,id), unique(business_id,intent_id),
 foreign key(business_id,membership_id) references public.memberships(business_id,id),
 foreign key(business_id,reward_version_id) references public.reward_versions(business_id,id),
 foreign key(business_id,intent_id) references public.redemption_intents(business_id,id),
 foreign key(business_id,branch_id) references public.branches(business_id,id),
 foreign key(business_id,purchase_id) references public.purchases(business_id,id)
);
create index redemptions_member_activity on public.redemptions(business_id,membership_id,fulfilled_at desc,id desc);
create table public.redemption_reversals (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 redemption_id uuid not null, reason text not null check(char_length(btrim(reason)) between 10 and 500),
 actor_user_id uuid not null references public.profiles(user_id), reversed_at timestamptz not null default now(),
 idempotency_key text not null, created_at timestamptz not null default now(), unique(business_id,id),
 unique(business_id,redemption_id), foreign key(business_id,redemption_id) references public.redemptions(business_id,id)
);
create index redemption_reversals_activity on public.redemption_reversals(business_id,reversed_at desc,id desc);
create table public.adjustments (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 membership_id uuid not null, units bigint not null check(units<>0 and abs(units)<=100000),
 reason text not null check(char_length(btrim(reason)) between 10 and 500),
 actor_user_id uuid not null references public.profiles(user_id), idempotency_key text not null,
 created_at timestamptz not null default now(), unique(business_id,id),
 foreign key(business_id,membership_id) references public.memberships(business_id,id)
);
create table public.ledger_entries (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 membership_id uuid not null, entry_kind text not null check(entry_kind in ('purchase_base','promotion_bonus','referral_bonus','redemption','adjustment','reversal')),
 units bigint not null check(units<>0 and abs(units)<=9000000000000),
 purchase_id uuid, redemption_id uuid, referral_claim_id uuid, adjustment_id uuid,
 reverses_entry_id uuid, purchase_reversal_id uuid, redemption_reversal_id uuid,
 occurred_at timestamptz not null default now(), actor_user_id uuid references public.profiles(user_id),
 created_at timestamptz not null default now(), unique(business_id,id), unique(reverses_entry_id),
 foreign key(business_id,membership_id) references public.memberships(business_id,id),
 foreign key(business_id,purchase_id) references public.purchases(business_id,id),
 foreign key(business_id,redemption_id) references public.redemptions(business_id,id),
 foreign key(business_id,adjustment_id) references public.adjustments(business_id,id),
 foreign key(business_id,reverses_entry_id) references public.ledger_entries(business_id,id),
 foreign key(business_id,purchase_reversal_id) references public.purchase_reversals(business_id,id),
 foreign key(business_id,redemption_reversal_id) references public.redemption_reversals(business_id,id),
 check((entry_kind='purchase_base' and purchase_id is not null and redemption_id is null and adjustment_id is null and reverses_entry_id is null and purchase_reversal_id is null and redemption_reversal_id is null and units>0)
 or (entry_kind='promotion_bonus' and purchase_id is not null and redemption_id is null and adjustment_id is null and reverses_entry_id is null and purchase_reversal_id is null and redemption_reversal_id is null and units>0)
 or (entry_kind='referral_bonus' and purchase_id is not null and referral_claim_id is not null and redemption_id is null and adjustment_id is null and reverses_entry_id is null and purchase_reversal_id is null and redemption_reversal_id is null and units>0)
 or (entry_kind='redemption' and purchase_id is null and redemption_id is not null and adjustment_id is null and reverses_entry_id is null and purchase_reversal_id is null and redemption_reversal_id is null and units<0)
 or (entry_kind='adjustment' and purchase_id is null and redemption_id is null and adjustment_id is not null and reverses_entry_id is null and purchase_reversal_id is null and redemption_reversal_id is null)
 or (entry_kind='reversal' and reverses_entry_id is not null and adjustment_id is null and ((purchase_reversal_id is not null and redemption_reversal_id is null) or (redemption_reversal_id is not null and purchase_reversal_id is null))))
);
create unique index ledger_purchase_source on public.ledger_entries(business_id,purchase_id,entry_kind,membership_id) where entry_kind in ('purchase_base','promotion_bonus','referral_bonus');
create unique index ledger_redemption_source on public.ledger_entries(business_id,redemption_id) where entry_kind='redemption';
create unique index ledger_adjustment_source on public.ledger_entries(business_id,adjustment_id) where entry_kind='adjustment';
create index ledger_member_activity on public.ledger_entries(business_id,membership_id,occurred_at desc,id desc);
create table app_private.value_requests (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses,
 operation text not null check(operation in ('record_purchase','finalize_redemption','reverse_purchase','reverse_redemption','adjust_units')),
 idempotency_key text not null check(char_length(idempotency_key) between 8 and 128),
 request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 actor_user_id uuid not null references public.profiles(user_id), result jsonb,
 created_at timestamptz not null default now(), unique(business_id,operation,idempotency_key)
);
create index value_requests_actor on app_private.value_requests(actor_user_id,created_at desc);

create trigger purchase_timezone_lock before insert on public.purchases for each row execute function app_private.lock_business_timezone();
create trigger redemption_timezone_lock before insert on public.redemptions for each row execute function app_private.lock_business_timezone();
create trigger adjustment_timezone_lock before insert on public.adjustments for each row execute function app_private.lock_business_timezone();
do $$ declare t text; begin
 foreach t in array array['membership_handles','scanner_codes','purchases','purchase_reversals','redemption_intents','redemptions','redemption_reversals','adjustments','ledger_entries'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,loyalty_worker,loyalty_web_gateway',t);
 end loop;
end $$;
alter table app_private.checkout_contexts enable row level security;
alter table app_private.value_requests enable row level security;
revoke all on app_private.checkout_contexts,app_private.value_requests from public,anon,authenticated,loyalty_worker,loyalty_web_gateway;
create trigger ledger_immutable before update or delete on public.ledger_entries for each row execute function app_private.immutable_event();
create trigger purchase_reversal_immutable before update or delete on public.purchase_reversals for each row execute function app_private.immutable_event();
create trigger redemption_reversal_immutable before update or delete on public.redemption_reversals for each row execute function app_private.immutable_event();
create trigger adjustment_immutable before update or delete on public.adjustments for each row execute function app_private.immutable_event();

commit;
