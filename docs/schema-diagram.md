# Generated database relationships

Generated from the migrated PostgreSQL catalog. Only implemented tables are shown; pending domain tables remain in schema-checklist.md.

```mermaid
erDiagram
  adjustments {
    uuid id
    uuid business_id
    uuid membership_id
    int8 units
    text reason
    uuid actor_user_id
    text idempotency_key
    timestamptz created_at
  }
  audit_events {
    uuid id
    uuid business_id
    uuid actor_user_id
    text action
    text target_type
    uuid target_id
    text reason
    jsonb safe_changes
    text correlation_id
    uuid support_access_grant_id
    timestamptz occurred_at
    timestamptz created_at
  }
  automation_rules {
    uuid id
    uuid business_id
    text kind
    bool enabled
    text title_template
    text body_template
    int4 inactive_days
    uuid reward_version_id
    uuid offer_id
    int4 birthday_validity_days
    int4 version
    timestamptz updated_at
  }
  automation_runs {
    uuid id
    uuid business_id
    uuid rule_id
    int4 rule_version
    uuid membership_id
    text event_key
    text state
    timestamptz scheduled_at
    timestamptz expires_at
    text suppression_reason
    text rendered_title
    text rendered_body
    jsonb rule_snapshot
    uuid source_purchase_id
    uuid source_ledger_entry_id
    int4 birthday_year
    timestamptz created_at
    timestamptz next_attempt_at
    timestamptz observed_clicked_at
  }
  balances {
    uuid membership_id
    uuid business_id
    int8 units
    int8 ledger_version
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  branch_assignments {
    uuid business_id
    uuid business_user_id
    uuid branch_id
    timestamptz created_at
  }
  branch_hours {
    uuid id
    uuid business_id
    uuid branch_id
    int4 weekday
    time opens_at
    time closes_at
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  branches {
    uuid id
    uuid business_id
    text name
    text address
    text city
    text area
    text maps_url
    text phone
    text status
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  business_users {
    uuid id
    uuid business_id
    uuid user_id
    text staff_display_name
    text staff_email
    text role
    text status
    bool can_manage_campaigns
    bool can_contact_customers
    bool can_reverse_transactions
    bool can_export_reports
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  businesses {
    uuid id
    text slug
    text display_name
    text description
    text status
    text timezone
    text currency
    uuid logo_asset_id
    uuid cover_asset_id
    text accent_hex
    text public_contact_phone
    text support_email
    text menu_url
    text review_url
    timestamptz published_at
    uuid created_by
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
    timestamptz timezone_locked_at
  }
  campaign_branches {
    uuid business_id
    uuid campaign_version_id
    uuid branch_id
  }
  campaign_recipients {
    uuid id
    uuid business_id
    uuid campaign_id
    uuid campaign_version_id
    uuid membership_id
    text status
    text suppression_reason
    timestamptz snapshot_at
    timestamptz observed_clicked_at
    timestamptz next_attempt_at
  }
  campaign_test_requests {
    uuid id
    uuid business_id
    uuid campaign_id
    uuid campaign_version_id
    uuid business_user_id
    uuid push_device_id
    text status
    timestamptz created_at
    timestamptz expires_at
    timestamptz attempted_at
    text provider_message_id
    text error_code
  }
  campaign_versions {
    uuid id
    uuid business_id
    uuid campaign_id
    int4 version
    text title
    text body
    uuid image_asset_id
    text destination
    uuid offer_id
    text audience
    int4 inactive_days
    int4 near_reward_units
    uuid target_reward_version_id
    text timezone
    timestamptz expires_at
    timestamptz created_at
  }
  campaigns {
    uuid id
    uuid business_id
    text name
    text status
    uuid current_version_id
    uuid created_by
    timestamptz scheduled_at
    timestamptz started_at
    timestamptz completed_at
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
    uuid snapshot_cursor
  }
  consent_events {
    uuid id
    uuid business_id
    uuid membership_id
    text channel
    text purpose
    bool allowed
    text text_version
    uuid policy_document_id
    text source
    uuid actor_user_id
    timestamptz occurred_at
    timestamptz created_at
  }
  consent_preferences {
    uuid id
    uuid business_id
    uuid membership_id
    text channel
    text purpose
    bool allowed
    text text_version
    uuid policy_document_id
    timestamptz changed_at
    text source
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  contact_frequency_reservations {
    uuid id
    uuid customer_user_id
    uuid business_id
    text event_key
    text kind
    timestamptz business_window_start
    timestamptz global_window_start
    timestamptz reserved_at
    text state
  }
  delivery_attempts {
    uuid id
    uuid business_id
    uuid campaign_recipient_id
    uuid automation_run_id
    uuid push_device_id
    text event_key
    int4 attempt_number
    text state
    text provider_message_id
    text error_code
    timestamptz attempted_at
    timestamptz created_at
  }
  earning_promotions {
    uuid id
    uuid business_id
    text name
    text status
    uuid current_version_id
    int4 row_version
    uuid created_by
    timestamptz created_at
  }
  enrollment_acceptances {
    uuid id
    uuid business_id
    uuid membership_id
    uuid programme_version_id
    uuid platform_terms_document_id
    uuid privacy_document_id
    timestamptz accepted_at
    uuid customer_user_id
    timestamptz created_at
  }
  invitation_branches {
    uuid business_id
    uuid invitation_id
    uuid branch_id
    timestamptz created_at
  }
  job_effect_receipts {
    uuid id
    uuid business_id
    text handler_name
    text event_key
    timestamptz completed_at
    uuid result_reference
    timestamptz created_at
  }
  ledger_entries {
    uuid id
    uuid business_id
    uuid membership_id
    text entry_kind
    int8 units
    uuid purchase_id
    uuid redemption_id
    uuid referral_claim_id
    uuid adjustment_id
    uuid reverses_entry_id
    uuid purchase_reversal_id
    uuid redemption_reversal_id
    timestamptz occurred_at
    uuid actor_user_id
    timestamptz created_at
  }
  loyalty_programmes {
    uuid id
    uuid business_id
    text type
    text status
    text name
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  media_assets {
    uuid id
    uuid business_id
    text storage_path
    text kind
    text mime_type
    int8 bytes
    int4 width
    int4 height
    uuid uploaded_by
    text validation_status
    text visibility
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  membership_contacts {
    uuid membership_id
    uuid business_id
    text phone_e164
    text phone_status
    timestamptz phone_confirmed_at
    uuid phone_confirmed_by
    text shared_email
    timestamptz contact_changed_at
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  membership_handles {
    uuid id
    uuid business_id
    uuid membership_id
    text handle_hash
    text handle_ciphertext
    text encryption_key_id
    text status
    timestamptz revoked_at
    timestamptz created_at
  }
  memberships {
    uuid id
    uuid business_id
    uuid customer_user_id
    text display_name
    timestamptz joined_at
    uuid joined_branch_id
    text status
    timestamptz left_at
    timestamptz last_qualifying_purchase_at
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  offer_branches {
    uuid business_id
    uuid offer_id
    uuid branch_id
  }
  offer_claim_intents {
    uuid id
    uuid business_id
    uuid offer_claim_id
    uuid membership_id
    text token_hash
    timestamptz expires_at
    timestamptz consumed_at
    timestamptz canceled_at
    uuid created_by
    timestamptz created_at
  }
  offer_claims {
    uuid id
    uuid business_id
    uuid offer_id
    uuid membership_id
    uuid campaign_id
    uuid automation_run_id
    text status
    timestamptz claimed_at
    timestamptz fulfilled_at
    uuid fulfilled_by
    uuid branch_id
    uuid purchase_id
    text void_reason
    int8 applied_discount_paisa
    text benefit_description
  }
  offer_recipients {
    uuid business_id
    uuid offer_id
    uuid membership_id
    timestamptz valid_from
    timestamptz valid_until
    uuid automation_run_id
  }
  offers {
    uuid id
    uuid business_id
    text kind
    text title
    text description
    text terms
    uuid image_asset_id
    timestamptz starts_at
    timestamptz expires_at
    text status
    text audience
    bool is_automation_template
    uuid source_template_id
    uuid generated_by_run_id
    int4 discount_percent
    int8 minimum_spend_paisa
    int8 max_discount_paisa
    uuid created_by
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  operational_checks {
    text name
    timestamptz checked_at
    text status
    jsonb safe_details
  }
  outbox_events {
    uuid id
    uuid business_id
    text event_type
    text event_key
    int4 schema_version
    jsonb payload
    text state
    timestamptz dispatched_at
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  plan_versions {
    uuid id
    uuid plan_id
    int4 version
    int8 price_paisa
    text billing_period
    int4 branch_limit
    int4 staff_limit
    int4 member_limit
    int4 monthly_campaign_limit
    int4 trial_days
    text status
    timestamptz published_at
    timestamptz created_at
  }
  plans {
    uuid id
    text code
    text name
    bool active
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  platform_admins {
    uuid user_id
    bool active
    bool can_reconcile_billing
    bool can_manage_support
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  policy_documents {
    uuid id
    uuid business_id
    text kind
    text version
    text body
    timestamptz published_at
    timestamptz created_at
  }
  profiles {
    uuid user_id
    uuid auth_user_id
    text display_name
    text preferred_timezone
    int4 birthday_month
    int4 birthday_day
    timestamptz birthday_changed_at
    timestamptz deletion_requested_at
    timestamptz anonymized_at
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  programme_versions {
    uuid id
    uuid business_id
    uuid programme_id
    int4 version
    text status
    timestamptz effective_at
    timestamptz published_at
    int8 minimum_spend_paisa
    int4 stamps_per_purchase
    int8 spend_step_paisa
    int4 units_per_step
    int4 max_base_units_per_purchase
    text terms
    uuid created_by
    timestamptz created_at
    text name
  }
  promotion_branches {
    uuid business_id
    uuid promotion_version_id
    uuid branch_id
  }
  promotion_usage {
    uuid id
    uuid business_id
    uuid promotion_version_id
    uuid promotion_id
    uuid membership_id
    uuid purchase_id
    date local_date
    int4 bonus_units
    timestamptz reversed_at
    timestamptz created_at
  }
  promotion_versions {
    uuid id
    uuid business_id
    uuid promotion_id
    int4 version
    text status
    date starts_on
    date ends_on
    int4 weekdays
    time starts_at
    time ends_at
    text timezone
    int4 multiplier
    int8 minimum_spend_paisa
    int4 member_daily_cap
    int4 max_bonus_units_per_purchase
    timestamptz effective_at
    timestamptz published_at
    uuid created_by
    timestamptz created_at
  }
  purchase_reversals {
    uuid id
    uuid business_id
    uuid purchase_id
    text reason
    uuid actor_user_id
    timestamptz reversed_at
    text idempotency_key
    timestamptz created_at
  }
  purchases {
    uuid id
    uuid business_id
    uuid branch_id
    uuid membership_id
    uuid programme_version_id
    int8 recorded_bill_paisa
    int8 eligible_spend_paisa
    int4 base_units
    int4 promotion_bonus_units
    uuid promotion_version_id
    text receipt_reference
    bool qualifying_purchase_confirmed
    bool qualifies_for_loyalty
    int8 offer_eligible_before_discount_paisa
    int8 applied_discount_paisa
    uuid primary_offer_claim_id
    text status
    timestamptz occurred_at
    uuid staff_user_id
    text idempotency_key
    text request_hash
    uuid corrects_purchase_id
    timestamptz created_at
  }
  push_devices {
    uuid id
    uuid customer_user_id
    uuid installation_id
    uuid binding_generation
    text token_ciphertext
    text encryption_key_id
    text token_hash
    text status
    timestamptz last_seen_at
    timestamptz revoked_at
    text browser_label
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  push_registration_challenges {
    uuid id
    uuid customer_user_id
    uuid auth_session_id
    uuid installation_id
    uuid push_device_id
    text nonce_hash
    text nonce_ciphertext
    text encryption_key_id
    uuid binding_generation
    timestamptz expires_at
    timestamptz consumed_at
    timestamptz canceled_at
    text dispatch_state
    timestamptz created_at
  }
  push_test_registrations {
    uuid business_id
    uuid business_user_id
    uuid push_device_id
    bool active
    timestamptz created_at
  }
  rate_limit_buckets {
    text subject_hash
    text operation
    timestamptz window_start
    int4 window_seconds
    int4 count
    timestamptz expires_at
  }
  redemption_intents {
    uuid id
    uuid business_id
    uuid membership_id
    uuid reward_version_id
    text token_hash
    timestamptz expires_at
    timestamptz consumed_at
    timestamptz canceled_at
    uuid created_by
    timestamptz created_at
  }
  redemption_reversals {
    uuid id
    uuid business_id
    uuid redemption_id
    text reason
    uuid actor_user_id
    timestamptz reversed_at
    text idempotency_key
    timestamptz created_at
  }
  redemptions {
    uuid id
    uuid business_id
    uuid membership_id
    uuid reward_version_id
    uuid intent_id
    uuid branch_id
    int4 unit_cost
    int8 estimated_cost_paisa
    text status
    timestamptz fulfilled_at
    uuid fulfilled_by
    uuid purchase_id
    text idempotency_key
    timestamptz created_at
  }
  referral_cap_usage {
    uuid id
    uuid business_id
    uuid referrer_membership_id
    uuid claim_id
    date local_month
    timestamptz reversed_at
    timestamptz created_at
  }
  referral_claims {
    uuid id
    uuid business_id
    uuid referrer_membership_id
    uuid referred_membership_id
    uuid code_id
    uuid rule_version_id
    timestamptz enrolled_at
    timestamptz qualifies_until
    text status
    uuid qualifying_purchase_id
    timestamptz qualified_at
    int4 inviter_awarded_units
    int4 friend_awarded_units
    text inviter_suppression
    timestamptz reversed_at
    timestamptz created_at
  }
  referral_codes {
    uuid id
    uuid business_id
    uuid membership_id
    text code
    bool active
    timestamptz created_at
  }
  referral_rule_versions {
    uuid id
    uuid business_id
    int4 version
    timestamptz effective_at
    bool enabled
    int4 inviter_bonus_units
    int4 friend_bonus_units
    int8 minimum_spend_paisa
    int4 monthly_inviter_cap
    int4 attribution_days
    int4 qualification_days
    uuid created_by
    timestamptz created_at
  }
  referral_visit_events {
    uuid id
    uuid business_id
    uuid referral_code_id
    timestamptz occurred_at
  }
  reward_branches {
    uuid business_id
    uuid reward_version_id
    uuid branch_id
    timestamptz created_at
  }
  reward_versions {
    uuid id
    uuid business_id
    uuid reward_id
    int4 version
    int4 unit_cost
    text title
    text description
    text terms
    int8 estimated_cost_paisa
    uuid created_by
    timestamptz created_at
  }
  rewards {
    uuid id
    uuid business_id
    uuid programme_id
    text name
    text status
    uuid published_version_id
    uuid draft_version_id
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  scanner_codes {
    uuid id
    uuid business_id
    uuid membership_id
    text code_hash
    timestamptz expires_at
    timestamptz consumed_at
    text purpose
    uuid redemption_intent_id
    uuid offer_claim_intent_id
    timestamptz created_at
  }
  staff_invitations {
    uuid id
    uuid business_id
    text email
    text role
    text token_hash
    timestamptz expires_at
    text status
    uuid invited_by
    uuid accepted_by
    timestamptz accepted_at
    bool can_manage_campaigns
    bool can_contact_customers
    bool can_reverse_transactions
    bool can_export_reports
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  subscriptions {
    uuid id
    uuid business_id
    uuid plan_version_id
    text status
    timestamptz period_start
    timestamptz period_end
    timestamptz grace_ends_at
    timestamptz billing_anchor_at
    timestamptz canceled_at
    bool cancel_at_period_end
    timestamptz created_at
    timestamptz updated_at
    int4 row_version
  }
  businesses ||--o{ adjustments : "adjustments_business_id_fkey"
  memberships ||--o{ adjustments : "adjustments_business_id_membership_id_fkey"
  profiles ||--o{ adjustments : "adjustments_actor_user_id_fkey"
  businesses ||--o{ audit_events : "audit_events_business_id_fkey"
  profiles ||--o{ audit_events : "audit_events_actor_user_id_fkey"
  businesses ||--o{ automation_rules : "automation_rules_business_id_fkey"
  offers ||--o{ automation_rules : "automation_rules_business_id_offer_id_fkey"
  reward_versions ||--o{ automation_rules : "automation_rules_business_id_reward_version_id_fkey"
  automation_rules ||--o{ automation_runs : "automation_runs_business_id_rule_id_fkey"
  ledger_entries ||--o{ automation_runs : "automation_runs_business_id_source_ledger_entry_id_fkey"
  memberships ||--o{ automation_runs : "automation_runs_business_id_membership_id_fkey"
  purchases ||--o{ automation_runs : "automation_runs_business_id_source_purchase_id_fkey"
  businesses ||--o{ balances : "balances_business_id_fkey"
  memberships ||--o{ balances : "balances_business_id_membership_id_fkey"
  branches ||--o{ branch_assignments : "branch_assignments_business_id_branch_id_fkey"
  business_users ||--o{ branch_assignments : "branch_assignments_business_id_business_user_id_fkey"
  businesses ||--o{ branch_assignments : "branch_assignments_business_id_fkey"
  branches ||--o{ branch_hours : "branch_hours_business_id_branch_id_fkey"
  businesses ||--o{ branch_hours : "branch_hours_business_id_fkey"
  businesses ||--o{ branches : "branches_business_id_fkey"
  businesses ||--o{ business_users : "business_users_business_id_fkey"
  profiles ||--o{ business_users : "business_users_user_id_fkey"
  media_assets ||--o{ businesses : "businesses_id_cover_asset_id_fkey"
  media_assets ||--o{ businesses : "businesses_id_logo_asset_id_fkey"
  profiles ||--o{ businesses : "businesses_created_by_fkey"
  branches ||--o{ campaign_branches : "campaign_branches_business_id_branch_id_fkey"
  campaign_versions ||--o{ campaign_branches : "campaign_branches_business_id_campaign_version_id_fkey"
  campaign_versions ||--o{ campaign_recipients : "campaign_recipients_business_id_campaign_id_campaign_versi_fkey"
  memberships ||--o{ campaign_recipients : "campaign_recipients_business_id_membership_id_fkey"
  business_users ||--o{ campaign_test_requests : "campaign_test_requests_business_id_business_user_id_fkey"
  campaign_versions ||--o{ campaign_test_requests : "campaign_test_requests_business_id_campaign_id_campaign_ve_fkey"
  push_devices ||--o{ campaign_test_requests : "campaign_test_requests_push_device_id_fkey"
  campaigns ||--o{ campaign_versions : "campaign_versions_business_id_campaign_id_fkey"
  media_assets ||--o{ campaign_versions : "campaign_versions_business_id_image_asset_id_fkey"
  offers ||--o{ campaign_versions : "campaign_versions_business_id_offer_id_fkey"
  reward_versions ||--o{ campaign_versions : "campaign_versions_business_id_target_reward_version_id_fkey"
  businesses ||--o{ campaigns : "campaigns_business_id_fkey"
  campaign_versions ||--o{ campaigns : "campaigns_business_id_id_current_version_id_fkey"
  profiles ||--o{ campaigns : "campaigns_created_by_fkey"
  businesses ||--o{ consent_events : "consent_events_business_id_fkey"
  memberships ||--o{ consent_events : "consent_events_business_id_membership_id_fkey"
  policy_documents ||--o{ consent_events : "consent_events_policy_document_id_fkey"
  profiles ||--o{ consent_events : "consent_events_actor_user_id_fkey"
  businesses ||--o{ consent_preferences : "consent_preferences_business_id_fkey"
  memberships ||--o{ consent_preferences : "consent_preferences_business_id_membership_id_fkey"
  policy_documents ||--o{ consent_preferences : "consent_preferences_policy_document_id_fkey"
  businesses ||--o{ contact_frequency_reservations : "contact_frequency_reservations_business_id_fkey"
  profiles ||--o{ contact_frequency_reservations : "contact_frequency_reservations_customer_user_id_fkey"
  automation_runs ||--o{ delivery_attempts : "delivery_attempts_business_id_automation_run_id_fkey"
  campaign_recipients ||--o{ delivery_attempts : "delivery_attempts_business_id_campaign_recipient_id_fkey"
  push_devices ||--o{ delivery_attempts : "delivery_attempts_push_device_id_fkey"
  businesses ||--o{ earning_promotions : "earning_promotions_business_id_fkey"
  profiles ||--o{ earning_promotions : "earning_promotions_created_by_fkey"
  promotion_versions ||--o{ earning_promotions : "earning_promotions_business_id_current_version_id_fkey"
  businesses ||--o{ enrollment_acceptances : "enrollment_acceptances_business_id_fkey"
  memberships ||--o{ enrollment_acceptances : "enrollment_acceptances_business_id_membership_id_fkey"
  policy_documents ||--o{ enrollment_acceptances : "enrollment_acceptances_platform_terms_document_id_fkey"
  policy_documents ||--o{ enrollment_acceptances : "enrollment_acceptances_privacy_document_id_fkey"
  profiles ||--o{ enrollment_acceptances : "enrollment_acceptances_customer_user_id_fkey"
  programme_versions ||--o{ enrollment_acceptances : "enrollment_acceptances_business_id_programme_version_id_fkey"
  branches ||--o{ invitation_branches : "invitation_branches_business_id_branch_id_fkey"
  businesses ||--o{ invitation_branches : "invitation_branches_business_id_fkey"
  staff_invitations ||--o{ invitation_branches : "invitation_branches_business_id_invitation_id_fkey"
  businesses ||--o{ job_effect_receipts : "job_effect_receipts_business_id_fkey"
  adjustments ||--o{ ledger_entries : "ledger_entries_business_id_adjustment_id_fkey"
  businesses ||--o{ ledger_entries : "ledger_entries_business_id_fkey"
  ledger_entries ||--o{ ledger_entries : "ledger_entries_business_id_reverses_entry_id_fkey"
  memberships ||--o{ ledger_entries : "ledger_entries_business_id_membership_id_fkey"
  profiles ||--o{ ledger_entries : "ledger_entries_actor_user_id_fkey"
  purchase_reversals ||--o{ ledger_entries : "ledger_entries_business_id_purchase_reversal_id_fkey"
  purchases ||--o{ ledger_entries : "ledger_entries_business_id_purchase_id_fkey"
  redemption_reversals ||--o{ ledger_entries : "ledger_entries_business_id_redemption_reversal_id_fkey"
  redemptions ||--o{ ledger_entries : "ledger_entries_business_id_redemption_id_fkey"
  referral_claims ||--o{ ledger_entries : "ledger_entries_business_id_referral_claim_id_fkey"
  businesses ||--o{ loyalty_programmes : "loyalty_programmes_business_id_fkey"
  businesses ||--o{ media_assets : "media_assets_business_id_fkey"
  profiles ||--o{ media_assets : "media_assets_uploaded_by_fkey"
  businesses ||--o{ membership_contacts : "membership_contacts_business_id_fkey"
  memberships ||--o{ membership_contacts : "membership_contacts_business_id_membership_id_fkey"
  profiles ||--o{ membership_contacts : "membership_contacts_phone_confirmed_by_fkey"
  businesses ||--o{ membership_handles : "membership_handles_business_id_fkey"
  memberships ||--o{ membership_handles : "membership_handles_business_id_membership_id_fkey"
  branches ||--o{ memberships : "memberships_business_id_joined_branch_id_fkey"
  businesses ||--o{ memberships : "memberships_business_id_fkey"
  profiles ||--o{ memberships : "memberships_customer_user_id_fkey"
  branches ||--o{ offer_branches : "offer_branches_business_id_branch_id_fkey"
  offers ||--o{ offer_branches : "offer_branches_business_id_offer_id_fkey"
  memberships ||--o{ offer_claim_intents : "offer_claim_intents_business_id_membership_id_fkey"
  offer_claims ||--o{ offer_claim_intents : "offer_claim_intents_business_id_offer_claim_id_fkey"
  profiles ||--o{ offer_claim_intents : "offer_claim_intents_created_by_fkey"
  automation_runs ||--o{ offer_claims : "offer_claims_business_id_automation_run_id_fkey"
  branches ||--o{ offer_claims : "offer_claims_business_id_branch_id_fkey"
  campaigns ||--o{ offer_claims : "offer_claims_business_id_campaign_id_fkey"
  memberships ||--o{ offer_claims : "offer_claims_business_id_membership_id_fkey"
  offers ||--o{ offer_claims : "offer_claims_business_id_offer_id_fkey"
  profiles ||--o{ offer_claims : "offer_claims_fulfilled_by_fkey"
  purchases ||--o{ offer_claims : "offer_claims_business_id_purchase_id_fkey"
  automation_runs ||--o{ offer_recipients : "offer_recipients_business_id_automation_run_id_fkey"
  memberships ||--o{ offer_recipients : "offer_recipients_business_id_membership_id_fkey"
  offers ||--o{ offer_recipients : "offer_recipients_business_id_offer_id_fkey"
  automation_runs ||--o{ offers : "offers_business_id_generated_by_run_id_fkey"
  businesses ||--o{ offers : "offers_business_id_fkey"
  media_assets ||--o{ offers : "offers_business_id_image_asset_id_fkey"
  offers ||--o{ offers : "offers_business_id_source_template_id_fkey"
  profiles ||--o{ offers : "offers_created_by_fkey"
  businesses ||--o{ outbox_events : "outbox_events_business_id_fkey"
  plans ||--o{ plan_versions : "plan_versions_plan_id_fkey"
  profiles ||--o{ platform_admins : "platform_admins_user_id_fkey"
  businesses ||--o{ policy_documents : "policy_documents_business_id_fkey"
  users ||--o{ profiles : "profiles_auth_user_id_fkey"
  businesses ||--o{ programme_versions : "programme_versions_business_id_fkey"
  loyalty_programmes ||--o{ programme_versions : "programme_versions_business_id_programme_id_fkey"
  profiles ||--o{ programme_versions : "programme_versions_created_by_fkey"
  branches ||--o{ promotion_branches : "promotion_branches_business_id_branch_id_fkey"
  promotion_versions ||--o{ promotion_branches : "promotion_branches_business_id_promotion_version_id_fkey"
  earning_promotions ||--o{ promotion_usage : "promotion_usage_business_id_promotion_id_fkey"
  memberships ||--o{ promotion_usage : "promotion_usage_business_id_membership_id_fkey"
  promotion_versions ||--o{ promotion_usage : "promotion_usage_business_id_promotion_version_id_fkey"
  purchases ||--o{ promotion_usage : "promotion_usage_business_id_purchase_id_fkey"
  earning_promotions ||--o{ promotion_versions : "promotion_versions_business_id_promotion_id_fkey"
  profiles ||--o{ promotion_versions : "promotion_versions_created_by_fkey"
  businesses ||--o{ purchase_reversals : "purchase_reversals_business_id_fkey"
  profiles ||--o{ purchase_reversals : "purchase_reversals_actor_user_id_fkey"
  purchases ||--o{ purchase_reversals : "purchase_reversals_business_id_purchase_id_fkey"
  branches ||--o{ purchases : "purchases_business_id_branch_id_fkey"
  businesses ||--o{ purchases : "purchases_business_id_fkey"
  memberships ||--o{ purchases : "purchases_business_id_membership_id_fkey"
  offer_claims ||--o{ purchases : "purchases_business_id_primary_offer_claim_id_fkey"
  profiles ||--o{ purchases : "purchases_staff_user_id_fkey"
  programme_versions ||--o{ purchases : "purchases_business_id_programme_version_id_fkey"
  promotion_versions ||--o{ purchases : "purchases_business_id_promotion_version_id_fkey"
  purchases ||--o{ purchases : "purchases_business_id_corrects_purchase_id_fkey"
  profiles ||--o{ push_devices : "push_devices_customer_user_id_fkey"
  push_installations ||--o{ push_devices : "push_devices_installation_id_fkey"
  profiles ||--o{ push_registration_challenges : "push_registration_challenges_customer_user_id_fkey"
  push_devices ||--o{ push_registration_challenges : "push_registration_challenges_push_device_id_fkey"
  push_installations ||--o{ push_registration_challenges : "push_registration_challenges_installation_id_fkey"
  business_users ||--o{ push_test_registrations : "push_test_registrations_business_id_business_user_id_fkey"
  push_devices ||--o{ push_test_registrations : "push_test_registrations_push_device_id_fkey"
  businesses ||--o{ redemption_intents : "redemption_intents_business_id_fkey"
  memberships ||--o{ redemption_intents : "redemption_intents_business_id_membership_id_fkey"
  profiles ||--o{ redemption_intents : "redemption_intents_created_by_fkey"
  reward_versions ||--o{ redemption_intents : "redemption_intents_business_id_reward_version_id_fkey"
  businesses ||--o{ redemption_reversals : "redemption_reversals_business_id_fkey"
  profiles ||--o{ redemption_reversals : "redemption_reversals_actor_user_id_fkey"
  redemptions ||--o{ redemption_reversals : "redemption_reversals_business_id_redemption_id_fkey"
  branches ||--o{ redemptions : "redemptions_business_id_branch_id_fkey"
  businesses ||--o{ redemptions : "redemptions_business_id_fkey"
  memberships ||--o{ redemptions : "redemptions_business_id_membership_id_fkey"
  profiles ||--o{ redemptions : "redemptions_fulfilled_by_fkey"
  purchases ||--o{ redemptions : "redemptions_business_id_purchase_id_fkey"
  redemption_intents ||--o{ redemptions : "redemptions_business_id_intent_id_fkey"
  reward_versions ||--o{ redemptions : "redemptions_business_id_reward_version_id_fkey"
  memberships ||--o{ referral_cap_usage : "referral_cap_usage_business_id_referrer_membership_id_fkey"
  referral_claims ||--o{ referral_cap_usage : "referral_cap_usage_business_id_claim_id_fkey"
  memberships ||--o{ referral_claims : "referral_claims_business_id_referred_membership_id_fkey"
  memberships ||--o{ referral_claims : "referral_claims_business_id_referrer_membership_id_fkey"
  purchases ||--o{ referral_claims : "referral_claims_business_id_qualifying_purchase_id_fkey"
  referral_codes ||--o{ referral_claims : "referral_claims_business_id_code_id_fkey"
  referral_rule_versions ||--o{ referral_claims : "referral_claims_business_id_rule_version_id_fkey"
  memberships ||--o{ referral_codes : "referral_codes_business_id_membership_id_fkey"
  businesses ||--o{ referral_rule_versions : "referral_rule_versions_business_id_fkey"
  profiles ||--o{ referral_rule_versions : "referral_rule_versions_created_by_fkey"
  referral_codes ||--o{ referral_visit_events : "referral_visit_events_business_id_referral_code_id_fkey"
  branches ||--o{ reward_branches : "reward_branches_business_id_branch_id_fkey"
  businesses ||--o{ reward_branches : "reward_branches_business_id_fkey"
  reward_versions ||--o{ reward_branches : "reward_branches_business_id_reward_version_id_fkey"
  businesses ||--o{ reward_versions : "reward_versions_business_id_fkey"
  profiles ||--o{ reward_versions : "reward_versions_created_by_fkey"
  rewards ||--o{ reward_versions : "reward_versions_business_id_reward_id_fkey"
  businesses ||--o{ rewards : "rewards_business_id_fkey"
  loyalty_programmes ||--o{ rewards : "rewards_business_id_programme_id_fkey"
  reward_versions ||--o{ rewards : "rewards_business_id_id_draft_version_id_fkey"
  reward_versions ||--o{ rewards : "rewards_business_id_id_published_version_id_fkey"
  businesses ||--o{ scanner_codes : "scanner_codes_business_id_fkey"
  memberships ||--o{ scanner_codes : "scanner_codes_business_id_membership_id_fkey"
  offer_claim_intents ||--o{ scanner_codes : "scanner_codes_business_id_offer_claim_intent_id_fkey"
  redemption_intents ||--o{ scanner_codes : "scanner_codes_business_id_redemption_intent_id_fkey"
  businesses ||--o{ staff_invitations : "staff_invitations_business_id_fkey"
  profiles ||--o{ staff_invitations : "staff_invitations_accepted_by_fkey"
  profiles ||--o{ staff_invitations : "staff_invitations_invited_by_fkey"
  businesses ||--o{ subscriptions : "subscriptions_business_id_fkey"
  plan_versions ||--o{ subscriptions : "subscriptions_plan_version_id_fkey"
```
