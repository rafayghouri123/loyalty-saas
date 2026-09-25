# Migration-to-brief checklist

Required tables from section 24. Fields/constraints, FKs, enums, grants/RLS, generated types and direct database tests must all be checked before a row can be complete. Circular references remain pending until validated FKs exist.

| Table | Migration | Field/constraint match | Tenant FKs | RLS / grants | Generated types | Meaningful tests |
| --- | --- | --- | --- | --- | --- | --- |
| profiles | 202609130001, 202609210008 | Birthday cooldown survives clearing; explicit membership-name sharing | Auth FK | Own read; scoped RPC mutations | Catalog generated | Birthday, identity, sessions, Unicode |
| businesses | 202609130001, 202609210004–009 | Atomic bootstrap; one trial per owner; exact owner; brand/contact bounds | Same-tenant accepted media FKs | Owner/MFA RPC; safe public projection | Catalog generated | Rollback, replay, ownership transfer, isolation |
| branches | 202609130001, 202609210004–008 | Active quota; lifecycle; last-active-branch guard | Business FK + composite unique | Owner/MFA write; assigned staff read | Catalog generated | Cross-tenant scope, limits, stale edits |
| branch_hours | 202609210004–005 | Weekday/time bounds; overlapping intervals denied | Composite branch FK | Scoped branch RPC only | Catalog generated | Overlap and bootstrap rollback |
| business_users | 202609130001, 202609210005–009 | Exactly one active owner; live revocation; cashier grant limits | Composite business/user FKs | Scoped RPC only | Catalog generated | Role/branch edits, revocation, operator transfer |
| branch_assignments | 202609130001 | Initial schema | Composite staff/branch FKs | Deny browser access | Catalog generated | Cross-tenant write denied |
| staff_invitations | 202609210004–005, 202609210009 | Hashed token; 72h expiry; pending reservation; rotation | Business/inviter/acceptor FKs | Owner create; matching verified email accept | Catalog generated | Single use, wrong user, rotation, persisted failed-attempt limiter |
| invitation_branches | 202609210004–005 | Distinct assigned branches required | Composite invitation/branch FKs | Invitation RPC only | Catalog generated | Cross-tenant and branch permission checks |
| media_assets | 202609210007–008 | MIME/size/status; immutable version paths; decoder bounds | Business/uploader FKs; same-tenant branding | Reserved quarantine RLS; narrow worker RPC | Catalog generated | SQL storage isolation + real Sharp; Storage HTTP pending |
| memberships | 202609210004, 202609210006 | Unique business/customer; lifecycle; historic non-anonymized quota | Composite business/branch FKs | Customer own / scoped staff projections | Catalog generated | Five concurrent joins, two cafes, leave/rejoin |
| membership_contacts | 202609210004, 202609210006 | Scoped email/phone; phone reset clears verification and consent | Composite membership FK | Customer mutation; staff contact permission | Catalog generated | Cross-tenant denial, phone reset |
| consent_preferences | 202609210004, 202609210006 | Exact channel/purpose pairs; current published wording | Composite membership + policy evidence | Own consent RPC only | Catalog generated | Dependencies, opt-out, rejoin defaults |
| consent_events | 202609210004, 202609210006 | Append-only versioned evidence | Composite membership; published policy version | No direct browser writes | Catalog generated | Immutable history and atomic preference changes |
| enrollment_acceptances | 202609210004, 202609210006, 202609210009 | Immutable policy/programme acceptance; type validation | Same-tenant membership/programme + document FKs | Enrollment RPC only | Catalog generated | Stale terms and concurrent deduplication |
| membership_handles | Pending | Pending | Pending | Pending | Pending | Pending |
| scanner_codes | Pending | Pending | Pending | Pending | Pending | Pending |
| loyalty_programmes | 202609210004, 202609210006 | One programme per business; initial publication | Same-parent version FK | Owner/MFA initial setup | Catalog generated | Atomic publication; later programme edits in Phase 3 |
| programme_versions | 202609210004, 202609210006 | Stamp/points field consistency; published immutable | Same-business programme FK | Safe public / owner projections | Catalog generated | Published mutation denied; earning invariants Phase 3 |
| rewards | 202609210004, 202609210006 | Initial reward + version pointer | Same-parent version FK | Owner/MFA initial setup | Catalog generated | Atomic publication; lifecycle Phase 3 |
| reward_versions | 202609210004, 202609210006 | Unit/cost bounds; published immutable | Composite reward FK | Public projection excludes merchant costs | Catalog generated | Immutability; redemption sources Phase 3 |
| reward_branches | 202609210004, 202609210009 | Published branch commitment immutable | Same-tenant reward-version/branch FKs | Setup RPC only | Catalog generated | Tenant scope; fulfillment Phase 3 |
| balances | 202609210004, 202609210006 | One initial zero balance; transactional updates Phase 3 | Composite membership FK | Read via own card RPC; no raw writes | Catalog generated | Atomic enrollment; ledger reconciliation Phase 3 |
| purchases | Pending | Pending | Pending | Pending | Pending | Pending |
| purchase_reversals | Pending | Pending | Pending | Pending | Pending | Pending |
| redemption_intents | Pending | Pending | Pending | Pending | Pending | Pending |
| redemptions | Pending | Pending | Pending | Pending | Pending | Pending |
| redemption_reversals | Pending | Pending | Pending | Pending | Pending | Pending |
| adjustments | Pending | Pending | Pending | Pending | Pending | Pending |
| ledger_entries | Pending | Pending | Pending | Pending | Pending | Pending |
| earning_promotions | 202609230026–027, 030–031 | Stable slot identity, status and row version | Business and creator | Owner MFA RPC; no direct browser writes | Catalog generated | Actual-date overlap, pause, version and tenant checks |
| promotion_versions | 202609230026–027 | Immutable published schedule, same-day interval, ISO weekdays, base-only 2x cap | Promotion/business composite keys | Owner MFA save/publish RPC | Catalog generated | Half-open boundary, stale preview, rate-version changes |
| promotion_branches | 202609230026–027 | Versioned eligible branches | Same-business branch/version FKs | Owner RPC only | Catalog generated | Same-branch overlap and different-branch eligibility |
| promotion_usage | 202609230026–028 | One purchase use; stable promotion/member/local-date cap, reversal release | Purchase, promotion, version and membership FKs | Value RPC only | Catalog generated | Concurrent cap, replay, cross-version/branch reversal |
| referral_rule_versions | 202609230026–027 | Enrollment-captured terms and monthly cap | Business/creator FKs | Owner MFA versioned RPC | Catalog generated | Paused rules, old claims and monthly cap races |
| referral_codes | 202609230026–027 | Globally unique canonical 128-bit Base64URL code | Same-business membership FK | Own share RPC; public resolver exposes no inviter | Catalog generated | Format, direct write denial and unavailable resolver |
| referral_claims | 202609230026–029 | One referred membership; qualification/reversal state constraints | Both memberships, code, rule version and purchase | Session-bound enrollment grant; value RPC | Catalog generated | One qualification, inactive inviter, stale attribution, full reversal |
| referral_cap_usage | 202609230026–028 | One inviter/month qualification across rule versions; compensating release | Claim and qualifying purchase FKs | Value RPC only | Catalog generated | Concurrent cap and reversal |
| offers | 202609250036–037, 040, 047 | Draft/publication lifecycle, immutable published terms, accepted image, private generated birthday instances | Business, creator, media, automation run | Scoped staff mutation; eligible customer projection | Catalog generated | Bounds, isolation, publication, birthday and image cases |
| offer_branches | 202609250036–037 | Required branch scope | Business/offer/branch composite FKs | Offer RPC only | Catalog generated | Cross-branch fulfillment denied |
| offer_recipients | 202609250036–037, 040 | Validity-bounded private recipient lists | Business/offer/member/run FKs | No direct browser reads | Catalog generated | Restricted birthday visibility and expiry |
| offer_claims | 202609250036–037, 043–045 | One claim per member/offer; purchase or treat fulfillment reference | Business/offer/member/campaign/run FKs | Own status; staff fulfillment RPC | Catalog generated | Replay, checkout, no-purchase treat, history |
| offer_claim_intents | 202609250036, 042 | Short-lived hashed presentation code | Business/claim FKs | Own creation/cancel; scoped staff resolution | Catalog generated | Branch, expiry, replay and fulfillment |
| campaigns | 202609250036, 038–039 | Draft/scheduled/paused/canceled/completed lifecycle; stable quota use | Business/creator/version FKs | Scoped staff RPC | Catalog generated | Empty snapshot, cancellation and duplicate draft |
| campaign_versions | 202609250036, 038, 047 | Immutable content/audience/timezone and accepted image | Business/campaign/offer/reward/media FKs | No direct browser writes | Catalog generated | Content bounds, media scope, scheduled version |
| campaign_branches | 202609250036, 038 | Recorded affiliation scope | Business/version/branch FKs | Campaign RPC only | Catalog generated | Cross-branch audience exclusion |
| campaign_recipients | 202609250036, 038–039 | Unique member snapshot and suppression state | Business/campaign/member FKs | Worker and staff aggregate only | Catalog generated | Consent withdrawal, cancellation, caps |
| push_devices | Added; rotation pending | Private, no browser reads/writes | Receipt-bound activation | Same-session/rebind tested | Generated | Local tests; provider pending |
| push_test_registrations | 202609250036, 046 | Staff-owned active device registration | Business/staff/device composite FKs | Own staff-only RPC | Catalog generated | Wrong user/device denied; real receipt pending |
| campaign_test_requests | 202609250046 | Five-per-hour staff device tests with accepted/failed/unknown state | Business/campaign/version/staff/device FKs | Staff request; worker result RPC | Catalog generated | Scoped request and test-only dispatch; real receipt pending |
| delivery_attempts | 202609250036, 039, 041 | Per-device accepted/failed/unknown state distinct from observed click | Campaign or automation, recipient and device FKs | Worker RPC; staff aggregates | Catalog generated | Two-device metrics and cancellation |
| automation_rules | 202609250036, 040–041 | Three kinds, versioned templates and scoped settings | Business/reward/offer FKs | Owner/authorized manager RPC | Catalog generated | Version, permission and consent |
| automation_runs | 202609250036, 040–041 | Deduplicated reward episode, inactivity episode and annual birthday | Business/rule/member/offer FKs | Worker RPC; staff aggregate | Catalog generated | Catch-up, crossing and recurrence |
| contact_frequency_reservations | 202609250036, 039, 041 | Serialized business/platform weekly caps | Business/member/campaign/run FKs | Worker RPC only | Catalog generated | Quiet hours, cap and expiry |
| whatsapp_templates | Pending | Pending | Pending | Pending | Pending | Pending |
| followup_batches | Pending | Pending | Pending | Pending | Pending | Pending |
| followup_tasks | Pending | Pending | Pending | Pending | Pending | Pending |
| followup_events | Pending | Pending | Pending | Pending | Pending | Pending |
| plans | 202609210004 | Unique code; published configuration projection | Platform scope | No browser writes | Catalog generated | Local seed/configuration |
| plan_versions | 202609210004 | Published immutable; PKR decimal-string output; quota bounds | Plan FK | Published safe projection | Catalog generated | Immutability and bootstrap selection |
| subscriptions | 202609210004–005 | Trial/period dates; effective grace/cancel checks; billing Phase 8 | Business/plan-version FKs | Owner read; atomic bootstrap | Catalog generated | Expiry without scheduler; trial grace/cancellation |
| invoices | Pending | Pending | Pending | Pending | Pending | Pending |
| payment_submissions | Pending | Pending | Pending | Pending | Pending | Pending |
| payment_events | Pending | Pending | Pending | Pending | Pending | Pending |
| platform_admins | 202609130001, 202609210009 | Active support grant; AAL2/recent authentication | Profile FK | No browser table access; narrow admin RPC | Catalog generated | Unauthorized/stale-AMR denied; owner transfer |
| support_access_grants | Pending | Pending | Pending | Pending | Pending | Pending |
| privacy_requests | Pending | Pending | Pending | Pending | Pending | Pending |
| audit_events | 202609130001 | Append-only; action safe-change schemas pending | Actor/business; support FK pending | No browser/worker table grants | Catalog generated | Immutable and atomic creation passed |
| idempotency_records | Pending | Pending | Pending | Pending | Pending | Pending |
| outbox_events | 202609130001 | Initial versioned event/uniqueness | Optional business FK | Narrow worker functions only | Catalog generated | Atomic enqueue/rollback/recovery passed |
| checkout_contexts | Pending | Pending | Pending | Pending | Pending | Pending |
| push_registration_challenges | Added with candidate/dispatch fields | Private; ack-only browser RPC | 5-minute/replacement/receipt gates | Wrong session/concurrent replay tested | Generated | Local tests; provider pending |
| rate_limit_buckets | Added | No browser grants | Atomic fixed/cooldown gates | Concurrent/direct RPC tested | Generated | Worker cleanup tested; monitoring pending |
| export_requests | Pending | Pending | Pending | Pending | Pending | Pending |
| export_artifacts | Pending | Pending | Pending | Pending | Pending | Pending |
| policy_documents | 202609210004 | Published immutable kind/version/body | Platform scope | Exact published-version public projection | Catalog generated | Stale acceptance and mutation denied |
| referral_visit_events | Pending | Pending | Pending | Pending | Pending | Pending |
| job_effect_receipts | 202609130001 | Initial append-only/dedup constraints | Optional business FK | Narrow worker functions only | Catalog generated | Duplicate processing and bad payload denial passed |
| operational_checks | 202609130001 | Name/status allowlist | Platform-wide | Heartbeat function only | Catalog generated | Worker writes heartbeat; monitoring integration pending |
| platform_settings | Pending | Pending | Pending | Pending | Pending | Pending |

Phase 2 supporting table: `app_private.media_uploads` binds a short-lived original path to its owner, media asset and expiry; browser table access is denied. Generated diagram includes public schema relationships. Later-phase rows remain pending, including financial source invariants; this is not full section-24 acceptance.

Migration `202609220012` adds private `auth_email_key` and `auth_email_grants`: browser/gateway/worker raw access denied, unique hashed grant, recipient/callback binding, encrypted short-lived payload and expiry cleanup. Hook execution is limited to `supabase_auth_admin`; gateway issuance and worker retrieval/completion are separately granted. Three PostgreSQL/worker tests and live direct-OTP denial, Resend sandbox delivery, actual callback and replay tests passed. Public RPC signatures are catalog-generated; private secrets are deliberately absent from browser types.
