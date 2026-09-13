# Migration-to-brief checklist

Required tables from section 24. Fields/constraints, FKs, enums, grants/RLS, generated types and direct database tests must all be checked before a row can be complete. Circular references remain pending until validated FKs exist.

| Table | Migration | Field/constraint match | Tenant FKs | RLS / grants | Generated types | Meaningful tests |
| --- | --- | --- | --- | --- | --- | --- |
| profiles | 202609130001 | Initial bounds; birthday mutation rules pending | Auth FK | Own read; RPC-only creation | Catalog generated | Identity, RLS, Unicode, atomicity, concurrency passed |
| businesses | 202609130001 | Partial; public phone/email/asset/ownership validation pending | Creator FK; media FKs pending | Deny browser access | Catalog generated | Fixture FK test only |
| branches | 202609130001 | Initial bounds; lifecycle pending | Business FK + composite unique | Deny browser access | Catalog generated | Cross-tenant assignment denied |
| branch_hours | Pending | Pending | Pending | Pending | Pending | Pending |
| business_users | 202609130001 | Partial; exactly-one-owner lifecycle pending | Composite unique + business/user FKs | Deny browser access | Catalog generated | Cashier extra grant denied |
| branch_assignments | 202609130001 | Initial schema | Composite staff/branch FKs | Deny browser access | Catalog generated | Cross-tenant write denied |
| staff_invitations | Pending | Pending | Pending | Pending | Pending | Pending |
| invitation_branches | Pending | Pending | Pending | Pending | Pending | Pending |
| media_assets | Pending | Pending | Pending | Pending | Pending | Pending |
| memberships | Pending | Pending | Pending | Pending | Pending | Pending |
| membership_contacts | Pending | Pending | Pending | Pending | Pending | Pending |
| consent_preferences | Pending | Pending | Pending | Pending | Pending | Pending |
| consent_events | Pending | Pending | Pending | Pending | Pending | Pending |
| enrollment_acceptances | Pending | Pending | Pending | Pending | Pending | Pending |
| membership_handles | Pending | Pending | Pending | Pending | Pending | Pending |
| scanner_codes | Pending | Pending | Pending | Pending | Pending | Pending |
| loyalty_programmes | Pending | Pending | Pending | Pending | Pending | Pending |
| programme_versions | Pending | Pending | Pending | Pending | Pending | Pending |
| rewards | Pending | Pending | Pending | Pending | Pending | Pending |
| reward_versions | Pending | Pending | Pending | Pending | Pending | Pending |
| reward_branches | Pending | Pending | Pending | Pending | Pending | Pending |
| balances | Pending | Pending | Pending | Pending | Pending | Pending |
| purchases | Pending | Pending | Pending | Pending | Pending | Pending |
| purchase_reversals | Pending | Pending | Pending | Pending | Pending | Pending |
| redemption_intents | Pending | Pending | Pending | Pending | Pending | Pending |
| redemptions | Pending | Pending | Pending | Pending | Pending | Pending |
| redemption_reversals | Pending | Pending | Pending | Pending | Pending | Pending |
| adjustments | Pending | Pending | Pending | Pending | Pending | Pending |
| ledger_entries | Pending | Pending | Pending | Pending | Pending | Pending |
| earning_promotions | Pending | Pending | Pending | Pending | Pending | Pending |
| promotion_versions | Pending | Pending | Pending | Pending | Pending | Pending |
| promotion_branches | Pending | Pending | Pending | Pending | Pending | Pending |
| promotion_usage | Pending | Pending | Pending | Pending | Pending | Pending |
| referral_rule_versions | Pending | Pending | Pending | Pending | Pending | Pending |
| referral_codes | Pending | Pending | Pending | Pending | Pending | Pending |
| referral_claims | Pending | Pending | Pending | Pending | Pending | Pending |
| referral_cap_usage | Pending | Pending | Pending | Pending | Pending | Pending |
| offers | Pending | Pending | Pending | Pending | Pending | Pending |
| offer_branches | Pending | Pending | Pending | Pending | Pending | Pending |
| offer_recipients | Pending | Pending | Pending | Pending | Pending | Pending |
| offer_claims | Pending | Pending | Pending | Pending | Pending | Pending |
| offer_claim_intents | Pending | Pending | Pending | Pending | Pending | Pending |
| campaigns | Pending | Pending | Pending | Pending | Pending | Pending |
| campaign_versions | Pending | Pending | Pending | Pending | Pending | Pending |
| campaign_branches | Pending | Pending | Pending | Pending | Pending | Pending |
| campaign_recipients | Pending | Pending | Pending | Pending | Pending | Pending |
| push_devices | Pending | Pending | Pending | Pending | Pending | Pending |
| push_test_registrations | Pending | Pending | Pending | Pending | Pending | Pending |
| delivery_attempts | Pending | Pending | Pending | Pending | Pending | Pending |
| automation_rules | Pending | Pending | Pending | Pending | Pending | Pending |
| automation_runs | Pending | Pending | Pending | Pending | Pending | Pending |
| contact_frequency_reservations | Pending | Pending | Pending | Pending | Pending | Pending |
| whatsapp_templates | Pending | Pending | Pending | Pending | Pending | Pending |
| followup_batches | Pending | Pending | Pending | Pending | Pending | Pending |
| followup_tasks | Pending | Pending | Pending | Pending | Pending | Pending |
| followup_events | Pending | Pending | Pending | Pending | Pending | Pending |
| plans | Pending | Pending | Pending | Pending | Pending | Pending |
| plan_versions | Pending | Pending | Pending | Pending | Pending | Pending |
| subscriptions | Pending | Pending | Pending | Pending | Pending | Pending |
| invoices | Pending | Pending | Pending | Pending | Pending | Pending |
| payment_submissions | Pending | Pending | Pending | Pending | Pending | Pending |
| payment_events | Pending | Pending | Pending | Pending | Pending | Pending |
| platform_admins | Pending | Pending | Pending | Pending | Pending | Pending |
| support_access_grants | Pending | Pending | Pending | Pending | Pending | Pending |
| privacy_requests | Pending | Pending | Pending | Pending | Pending | Pending |
| audit_events | 202609130001 | Append-only; action safe-change schemas pending | Actor/business; support FK pending | No browser/worker table grants | Catalog generated | Immutable and atomic creation passed |
| idempotency_records | Pending | Pending | Pending | Pending | Pending | Pending |
| outbox_events | 202609130001 | Initial versioned event/uniqueness | Optional business FK | Narrow worker functions only | Catalog generated | Atomic enqueue/rollback/recovery passed |
| checkout_contexts | Pending | Pending | Pending | Pending | Pending | Pending |
| push_registration_challenges | Pending | Pending | Pending | Pending | Pending | Pending |
| rate_limit_buckets | Pending | Pending | Pending | Pending | Pending | Pending |
| export_requests | Pending | Pending | Pending | Pending | Pending | Pending |
| export_artifacts | Pending | Pending | Pending | Pending | Pending | Pending |
| policy_documents | Pending | Pending | Pending | Pending | Pending | Pending |
| referral_visit_events | Pending | Pending | Pending | Pending | Pending | Pending |
| job_effect_receipts | 202609130001 | Initial append-only/dedup constraints | Optional business FK | Narrow worker functions only | Catalog generated | Duplicate processing and bad payload denial passed |
| operational_checks | 202609130001 | Name/status allowlist | Platform-wide | Heartbeat function only | Catalog generated | Worker writes heartbeat; monitoring integration pending |
| platform_settings | Pending | Pending | Pending | Pending | Pending | Pending |
