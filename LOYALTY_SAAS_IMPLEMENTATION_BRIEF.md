# Pakistani Cafe Loyalty SaaS — Coding Agent Implementation Brief

Version: 1.6 — audited launch specification  
Prepared: 12 September 2026  
Purpose: Build specification and phased implementation contract. This document specifies work; it does not claim that an application has already been built.

Scope: Implement only the launch described here, in Phases 0–9. Sections 24–25 define database fields and page contracts; section 26 defines simple public caching and direct database reporting; section 27 defines Vercel hosting. Sections 7–14 own domain rules, section 24 owns schema/constraints, section 25 owns UI fields, and sections 26–27 own caching/deployment. Summaries must agree with those contracts. No future-version roadmap is included. Resolve material inconsistencies in a documented decision rather than guessing.

## 1. Mission and agreed product decisions

Build a production-oriented, multi-tenant digital loyalty SaaS for Pakistani cafes and restaurants. Replace paper stamp cards with branded digital loyalty cards, give staff a fast checkout workflow, and help owners encourage repeat purchases affordably.

The customer product is ONE shared Progressive Web App (PWA). Customers can install it once and hold separate cards for multiple businesses. Each business has its own branding, programme, members, transactions, campaigns, staff, and reports. One deployment serves all businesses.

The central customer journey is: scan the cafe's public QR -> join -> show personal loyalty QR -> staff record a purchase -> earn stamps/points -> see an available reward -> redeem through a separate customer-authorized staff action. A new paid purchase is not required merely to redeem a loyalty reward.

### Mandatory launch scope

- Branded business landing pages and loyalty cards.
- Customer accounts and multiple separate business memberships.
- Stamp OR spend-based points programmes, chosen per business.
- Staff camera scanner, purchases, earning, redemption, and reversals.
- Referral links with purchase-qualified rewards for both parties.
- Scheduled double-stamp slots; the equivalent double-points feature for points programmes.
- Owner reporting, including referrals, promotions, campaigns, rewards, and staff activity.
- Installable PWA, automated web push campaigns, and an in-app offer inbox.
- Manual WhatsApp follow-ups using prefilled click-to-chat links. A person presses Send for each customer.
- Reward-available and inactivity reminders; birthday offers with voluntary birthday data.
- English-only UI, responsive layouts, and accessible interaction.
- Business onboarding, roles, basic branch modelling, SaaS invoices, subscription tracking, and platform administration.
- Backups, monitoring, access controls, automated tests, and real-device validation.

Referrals, double-stamp scheduling, and owner reporting are LAUNCH requirements. Do not quietly defer them to a later release.

### Explicitly outside the initial release

- Separate native applications for each cafe, or a shared native app.
- Automatic WhatsApp API sending, unofficial WhatsApp clients, or automated pressing of Send.
- Background location tracking/geofencing through the PWA.
- Rewards for Google reviews or selectively asking only happy customers for public reviews.
- Cross-business points, cash balances, transfers, prepaid wallets, or cash withdrawals.
- POS integration, automated payment gateway collection, Google/Apple Wallet passes, custom merchant domains, marketplace discovery, advanced fraud scoring, and AI campaign writing.
- Offline award/redemption mutation queues.

Do not build a food-delivery service, full POS, inventory system, or restaurant accounting suite.

## 2. Working assumptions and implementation discipline

The behavioral defaults below are implementation requirements. Real commercial values and provider credentials are listed separately in section 27.5; the agent must not invent them.

- Interface language: English only. No language selector, translation framework, translated content variants, or RTL layouts in launch scope. Default timezone: Asia/Karachi; currency: PKR; formatting locale: en-PK.
- Customer login: Google OAuth or verified email magic link through Supabase Auth. Email delivery has operational costs; it is not assumed universally free.
- Name is editable; phone and birthday are optional. No mandatory paid SMS OTP in this release.
- One active earning programme per business. The initial programme type cannot be switched after live ledger activity without a planned migration.
- One launch outlet per entry-level subscription, with branches correctly represented in the schema and scopes. Additional outlets may be enabled by configurable entitlements.
- No earned-point expiry at launch. Campaign offers and redemption intents can expire.
- Monetary values use integer paisa; points/stamps use integer units.
- Pricing, product name, contact details, refund terms, and live billing instructions are configuration, not invented facts.

Coding agent rules:

1. Inspect existing files and applicable repository instructions before edits. Preserve unrelated work.
2. Implement in the phases below. Within a phase, deliver an end-to-end working slice with tests and documentation.
3. Do not stop at a polished prototype with fake production data. Use explicitly labelled fixtures only in development/test environments.
4. Do not introduce dependencies, microservices, or paid services without a clear need. Use this stack unless evidence justifies a documented alternative.
5. Verify current supported stable releases and compatibility at project setup. Pin direct dependencies and commit a lockfile. Do not select beta/canary packages by default.
6. Maintain docs/implementation-status.md with completed work, validation evidence, remaining work, and external setup dependencies.
7. Ask for missing credentials or material product decisions only when needed; continue independent local work. Never request that secrets be pasted into public files or logs.
8. Distinguish local completion, staging validation, and production readiness. Never claim an integration works because a mock passed.
9. Provide a short phase handoff with changes, checks, known limitations, and the next phase. Do not create a user-approval gate after every routine implementation choice.

## 3. Architecture and technology stack

Use a modular monolith with a separate worker process, not microservices.

| Concern | Selected approach | Reason |
|---|---|---|
| Web application | Next.js App Router + React + strict TypeScript | Customer, staff, owner, and admin experiences in one codebase |
| Styling | Tailwind CSS, accessible shadcn/ui components, Lucide icons | Consistent responsive components with controlled merchant branding |
| Forms and validation | React Hook Form + Zod; server validation mandatory | Usable forms and explicit request contracts |
| Database | Supabase-managed PostgreSQL | Relational constraints, transactional loyalty operations, tenant protection |
| Auth | Supabase Auth with maintained SSR integration | Google/email login and server-verified identity |
| File storage | Supabase Storage | Business-owned images with explicit storage policies |
| Database access | Supabase client, generated DB types, versioned SQL migrations/RPCs | Avoid conflicting ORM and database migration systems |
| Push | Firebase Cloud Messaging web SDK + Admin SDK on the worker | No FCM per-message charge; integrated delivery tracking |
| Background work | pg-boss backed by PostgreSQL, separate long-running worker | Scheduling/retries without requiring Redis at launch |
| Caching and reports | Built-in CDN for public assets/data; indexed PostgreSQL report queries on demand | Simple launch setup; no Redis or persistent report cache |
| Copy and formatting | Central English UI copy/constants and Intl formatters | Consistent wording and PKR/date formatting without a translation framework |
| QR generation/scanning | Maintained QR encoder and cross-browser camera decoder | Works beyond browsers with native BarcodeDetector |
| Charts | Recharts, lazy-loaded only on reporting pages | Useful owner charts with accessible table alternatives |
| Unit/integration tests | Vitest; real local PostgreSQL/Supabase for transaction/RLS tests | Validate business invariants rather than mocks alone |
| Browser tests | Playwright | Customer/staff/owner workflows and permission states |
| Operations | Structured logs, error tracker adapter, health checks | Investigate problems without exposing customer data |
| Delivery | Next.js on Vercel + separately hosted persistent Node worker + managed Supabase | Managed web delivery with reliable background scheduling; see section 27 |

Use an active supported Node LTS version compatible with all dependencies. The implementation agent must record exact versions in the README; do not copy time-sensitive version numbers from this brief.

Next.js documents PWA implementation patterns, and Supabase documents SSR identity handling and database authorization. Follow the installed versions' documentation. [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps), [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security).

### Trust boundaries and data flow

Customer/staff browser -> Next.js server authentication and input validation -> domain service -> PostgreSQL transaction/RPC -> ledger + materialized balance + audit event + outbox event committed together.

Outbox dispatcher -> pg-boss jobs -> worker -> FCM -> browser service worker -> notification -> authenticated offer/card screen.

The browser never decides final earning, bonus eligibility, actor permissions, redemption balance, subscription state, or invoice payment status.

Business jobs always carry a validated business identifier and entity references. Re-read authoritative records before actions; never trust an arbitrary job payload as permission to access another tenant.

### Suggested repository layout

```text
src/app/                         Next.js routes/layouts
src/components/ui/               Shared primitives
src/features/auth/
src/features/businesses/
src/features/memberships/
src/features/loyalty/
src/features/promotions/
src/features/referrals/
src/features/campaigns/
src/features/whatsapp/
src/features/reports/
src/features/billing/
src/lib/auth/                    User/session verification helpers
src/lib/db/                      Typed clients and generated schema types
src/lib/security/                Authorization, rate limits, upload validation
src/lib/notifications/           Provider adapter and payload contracts
src/lib/formatting/              English PKR/date/time formatting
src/lib/cache/                   Public-cache allowlist, TTL settings, private no-store helpers
src/worker/                      Scheduler, dispatcher, handlers
supabase/migrations/
supabase/seed.sql
public/                         Manifest icons and safe static assets
tests/unit/
tests/integration/
tests/e2e/
docs/                           ADRs, runbooks, phase status, test evidence
```

Avoid unnecessary workspace/package fragmentation. Extract shared packages only if the web/worker build requires it.

## 4. Roles, tenant separation, and identity

| Role | Allowed | Explicit restrictions |
|---|---|---|
| Visitor | Read published cafe page, rules, and public offer summaries | Cannot enumerate members or change balances |
| Customer | Manage own memberships, consent, cards, referrals, reward intents | Cannot award points, see others' data, or join on another person's behalf |
| Cashier | Scan member, record purchase, finalize authorized redemption within assigned branches | No bulk contacts, exports, campaign creation, role changes, or unrestricted adjustments |
| Manager | Branch operations, permitted campaigns/follow-ups, reports, limited reversals | No ownership transfer, platform billing verification, or unassigned branches |
| Owner | Business settings, staff, programmes, all business reports, exports, subscription invoices | No access to another business |
| Platform administrator | Tenant provisioning, billing reconciliation, platform health, audited support | No routine unrestricted customer browsing; support access must be explicit and audited |

- Store roles and branch assignments in authoritative tables. Do not trust role values in request bodies or user-editable auth metadata.
- Verify the session on the server using the current SDK's verified claims/user method. Require a permanent Google/verified-email account; reject anonymous Auth users. Do not authorize solely from an unverified session object.
- Enable row-level security on every exposed table and explicitly revoke default grants before granting the required operations. Protect table columns and views too: use security-invoker views where appropriate, or narrow audited public-projection functions exposing only approved fields. A view must not bypass tenant rules or expose businesses.created_by/private metadata. Worker tables, token ciphertext, outbox payloads, and internal operations have no browser grants. [Supabase RLS and views](https://supabase.com/docs/guides/database/postgres/row-level-security).
- Use composite tenant foreign keys, for example (business_id, membership_id), to stop cross-business references even in privileged code.
- Prefer user-scoped DB calls for normal requests. Supabase service credentials and direct privileged connections bypass protections and must not be used as a generic shortcut.
- Critical loyalty changes go through narrowly scoped transactional RPCs. No direct browser table writes to balances, ledger, invoice payments, or roles.
- If SECURITY DEFINER functions are necessary, set a safe search_path, schema-qualify objects, revoke default public execution, and validate auth.uid(), current role, business, branch, and every target record inside the function. Test against direct RPC calls that bypass Next.js.
- Restrict worker/service functions to dedicated roles and narrow operations. The migration role must not be the runtime role.
- Require MFA for platform administrators and business owners before sensitive production actions. Avoid shared cashier accounts or a universal staff PIN.
- Recheck authoritative permissions after a staff role is revoked, even if their browser still holds an old session.
- Rate-limit login attempts, magic links, scanner lookup, referral claims, redemption tokens, and contact exports. Multi-instance limits must use shared storage.

### Exact business permission boundaries

Owners alone edit business/branch settings, programmes, rewards, referral rules, automations, staff, plans, adjustments, and membership suspension. Managers can operate checkout and read branch-scoped reports; they may create/edit/pause double slots only when every affected branch is assigned to them. Campaign/offer controls require can_manage_campaigns, manual follow-ups require can_contact_customers, reversals require can_reverse_transactions, and report exports require can_export_reports. Contact exports require BOTH export and contact permission. Cashiers cannot receive these manager grants or manual follow-up assignments. Publishing/resuming/versioning an existing multi-branch object requires authority over its entire branch set, not just one intersecting branch.

A member is affiliated with a branch if joined there or has a non-reversed qualifying purchase there. This defines campaign/customer-list selection, not access to all their transactions. Managers see transaction history only for assigned branches. Authorized checkout may show the member's business-wide balance and usable rewards because those units are shared within that business. Do not expose unrelated-branch receipts, contacts, or another referral party's private records. Customer-supplied membership IDs never replace scanner authorization.

Require verified Supabase AAL2 for every owner business mutation, owner contact export, and all admin actions; enforce it inside privileged RPCs as well as pages. Fresh reauthentication within 15 minutes is additionally required for adjustments of >=1000 units, payment confirmations/corrections, and starting support access. A staff revocation blocks the next operation; a UI-only MFA check is insufficient. [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa).

Customer identity is platform-wide, but business contacts are scoped to the relationship. A cafe must not be able to query the global user table or discover that a customer visits a competitor. Store business-visible contact fields only when deliberately shared with that business. Membership does not imply marketing consent.

## 5. Routes and required screens

| Route family | Screen |
|---|---|
| / | Product landing page with honest product claims and configurable pricing |
| /b/[slug] | Cafe landing page: brand, reward proposition, rules, join button, menu/directions/hours |
| /join/[slug] | Membership enrollment; preserve valid referral attribution through login |
| /r/[code] | Resolve a public referral to the correct business; never auto-enroll on GET |
| /auth/* | Login, email callback, first-name completion, MFA |
| /workspace | Authorized business/customer workspace selector |
| /privacy /terms | Versioned public policy documents |
| /app | Customer's card collection |
| /app/cards/[membershipId] | Personal QR, balance, progress, activity, rewards, consent |
| /app/offers | Active offers from joined businesses |
| /app/referrals | Referral links and status, without exposing friends' private contact details |
| /app/settings | Profile, notification/contact preferences, account export/deletion |
| /staff/[businessId] | Branch selection and scan-first checkout |
| /staff/[businessId]/activity | Staff's permitted activity and transaction detail |
| /dashboard/[businessId]/* | Overview, customers, programme, rewards, promotions, referrals, campaigns, WhatsApp, reports, staff, settings, billing |
| /admin/* | Tenants, subscription invoices, jobs, operational incidents, audited support |

Path IDs and slugs are selectors, not authorization. Redirect to the correct authenticated view when permitted; return safe forbidden/not-found states otherwise. Preserve the routes in section 25 unless an implementation constraint requires a documented change; internal route groups must not change public URL behavior.

## 6. Product journeys and edge states

### Business onboarding

Owner signs in -> creates business -> enters brand/contact/hours/timezone -> adds initial branch -> selects programme -> defines reward and terms -> previews customer card -> invites staff -> downloads printable signup QR -> performs a demo purchase in a clearly separate test environment -> publishes.

Validate readable brand contrast, complete reward terms, valid business URL, and timezone before publishing. Do not publish fabricated business addresses, Google reviews, logos, or customer testimonials.

### Customer enrollment

Show value before asking for an account. Offer Google or email login; keep the visit context across the callback. Joining creates exactly one membership per customer/business. Returning members get their existing card. Existing members cannot be made new again to obtain referral rewards.

Ask for installation and notification permission after the card is visible, through an explicit user action. Declining either must not block loyalty participation. Phone and birthday must remain optional; collect only month/day for birthday campaigns, not birth year.

### Checkout

Select branch -> request camera permission when Scan is tapped -> scan -> validate membership and display minimal identity/card details -> enter paid bill and eligible spend -> preview server-computed awards and current multiplier -> confirm -> show resulting balance and transaction receipt reference.

Support permission-denied guidance and a typed one-time customer code as a camera fallback. Do not allow unrestricted phone-number search for cashiers. A session must not award to another tenant's membership.

### Reward redemption

Customer selects an available reward and generates a short-lived single-use intent. Staff scan the customer's redemption intent or its typed fallback; scanning an earning card alone cannot reveal or select a pending redemption intent. Server validates current balance, tenant/branch, reward version, intent expiry, and staff authority; atomically debit the balance, consume the intent, and record redemption.

Intents expire after a configurable short interval (initial default: 120 seconds) and never reserve or debit units until finalization. Concurrent finalizations must permit only one success. An earning QR is never a redemption credential.

### Required UI states

Loading, no memberships, no customers, empty reports, first campaign, denied camera, denied notifications, unsupported browser, offline, expired intent, stale balance, invalid QR, already-processed request, revoked staff access, rate-limited request, paused campaign, and external provider unavailable.

No success toast until the server commits. After an uncertain timeout, query by idempotency key before allowing a retry as a new transaction.

## 7. Loyalty calculation rules — authoritative launch behavior

### Programmes and reward versions

- One published programme type per business: stamps or points. Programme versions are immutable once referenced by a purchase.
- Earning rate changes apply to future purchases at an explicit effective time. Capture the applicable version on every purchase.
- Initial stamp mode: configurable integer stamps per qualifying purchase, default 1, gated by minimum eligible spend. Do not imply item-level verification without a POS integration. The cafe can set qualifying-item terms, with cashier attestation.
- Points mode: raw_base_units = floor(eligible_spend_paisa / spend_step_paisa) * units_per_step; base_units = min(raw_base_units, max_base_units_per_purchase). The step, units, and cap must be positive integers. Preview explicitly shows when the programme cap reduces earning.
- Eligible spend is the amount actually paid for eligible goods after discounts, excluding tax, tips, and excluded items; staff enter it separately from the recorded bill total. Document this limitation until a POS integration exists.
- Reject negative, invalid, excessive, or fractional-unit inputs. Calculate with integers/decimal-safe SQL, never floating-point currency arithmetic.
- Reward definitions contain unit cost, customer-facing terms, applicable branches, optional estimated merchant fulfillment cost, and immutable versions.
- Existing published reward commitments cannot silently become more expensive. Reject increasing the unit cost or deleting an earned programme's published reward in ordinary settings. New rewards must be additive.
- Rewards are programme benefits, not cash. Do not display points as withdrawable rupees.

### Purchase qualification and discount contract

Every recorded purchase has server-derived qualifies_for_loyalty. It is true only when bill and eligible spend are both positive, the programme minimum is met, and stamp-mode staff attestation is true. Points purchases can qualify with zero base units when spend is below one step. Zero-value and nonqualifying purchases may be recorded for offer fulfillment/history, but award no base/promotion/referral units and do not reset inactivity. Insert no zero-unit ledger entries. Referral qualification additionally requires its captured minimum spend. Promotion bonus = min(base_units, configured max_bonus_units_per_purchase) when all slot conditions/caps pass, otherwise zero; the 2x label is qualified by the disclosed bonus cap. Enforce cap use per stable promotion/member/local date across version edits and branches; count only purchases with a positive bonus. Full reversal releases that usage once.

For a discount offer, S02 additionally collects offer_eligible_before_discount_paisa: eligible goods after other discounts but before this offer, excluding tax/tips. The offer minimum is checked against this amount. Applied discount = min(floor(before * percent / 100), max_discount when present); eligible_spend_paisa must equal before minus that discount. Show the calculated discount and require staff attestation that it was applied in the cafe's payment process. The actual paid bill must be >= eligible spend. Store the before amount and discount on the purchase/claim; an estimate alone never proves payment. Without a discount claim these two fields are null. Treat offers check their minimum against post-discount eligible spend, record a textual benefit, and do not reduce units. Informational offers cannot be claimed. Only one offer claim may attach to a purchase; reward redemption is a separate operation. A 100% discount may produce zero earning.

### Ledger and balances

Append-only ledger entries record purchase earn, promotion bonus, referral bonus, redemption debit, adjustment, and reversal. Every entry carries business, membership, source, units, actor/reason, timestamp, and related transaction IDs.

Maintain a balance row for fast reads. Update it under a row lock in the same transaction as the ledger. Reconcile materialized balances against ledger sums on a scheduled job. No silent balance edits or ledger deletion.

Use a business-scoped idempotency key and request hash for every award/redemption/refund. Reusing the same key and payload returns the existing result; reusing it with different input returns a conflict. Deduplicate business events in the outbox as well.

For every value operation, acquire the scoped idempotency reservation first, then all affected membership/balance locks sorted by UUID (including both referral parties), then claim/intent/source rows and usage records in a documented consistent order. Revalidate discovered relationships after locking; retry the transaction if its lock set changed. Serialize schedule edits and purchase schedule selection consistently, and hold permissions/status rows with a compatible lock until the write commits. Cap counts and source writes use the same transaction. Retry serialization/deadlock failures at most three times with jitter and the same idempotency key; never call FCM or another network service while holding these locks.

Bound all unit balances/adjustments to absolute 9,000,000,000,000 and perform intermediate arithmetic in bigint/numeric SQL before checked casts. Owner adjustments accept nonzero integers with absolute value <=100,000; normal negative adjustments cannot take a balance below zero. Only authorized compensating reversals may create debt. Adjustment reasons are 10–500 characters, and there is no second-approver workflow at launch.

### Refunds and mistakes

For launch, support a FULL reversal of an original recorded purchase, followed by an optional corrected purchase linked to it. Do not implement ambiguous proportional partial-refund math. Mark the original as reversed; keep the original ledger and append compensating entries for its earn/bonus effects exactly once.

If the original purchase qualified a referral, reverse the related referral bonuses exactly once too. If units have already been spent, the ledger may become negative: show the adjustment transparently, disable further redemption until sufficient balance is earned, and never erase the debt or revoke an already-fulfilled physical item automatically.

Undoing a redemption is a separate audited manager action only when fulfillment did not occur; restore exactly the original debit once. Redemption cancellation does not silently refund a recorded purchase. A purchase reversal retains any already-fulfilled offer claim and applied-benefit history, does not make that offer reusable, and nets associated sales back to zero. There is no independent offer-fulfillment reversal at launch.

## 8. Double-stamp and double-points slots — launch feature

Promotion fields: business, name, eligible branches, date range, local weekdays, start time, end time, timezone, status, multiplier fixed at 2 for launch, minimum eligible spend, optional per-member usage cap, and maximum promotional bonus units per purchase.

- Apply 2x to base purchase units only. Referral bonuses and adjustments are never multiplied.
- For points, round base points down FIRST, then multiply. Example: spend_step = Rs 100, units_per_step = 1, eligible spend = Rs 250 gives base 2, bonus 2, total 4 during a slot.
- For stamps, a qualifying purchase earning base 1 gives bonus 1, total 2.
- After acquiring transaction locks, capture one database clock_timestamp() as occurred_at immediately before final eligibility evaluation. Use it consistently for earning versions, slots, caps, and referral deadlines. Do not claim to know the eventual COMMIT timestamp or reuse transaction-start now() after a long lock wait. Ordinary cashiers cannot backdate. [PostgreSQL time functions](https://www.postgresql.org/docs/current/functions-datetime.html).
- Use a half-open interval [start, end). At exactly 3 pm a 3–6 pm slot qualifies; at exactly 6 pm it does not.
- Reject overlapping enabled slots within the same business/branch. Do not accidentally apply 4x.
- Launch UI supports same-day windows only. Overnight offers must be explicitly split into two dated/weekday intervals; explain this in the editor.
- Store UTC timestamps for events and the IANA timezone for schedule interpretation. Use tested timezone utilities, not string comparisons.
- Preview is non-binding. Confirmation supplies the preview's expected effect hash; recompute after locking. If units, rule versions, offer effect, or resulting balance differ, return conflict with a fresh preview and write nothing. Require the staff member to confirm again.
- Persist promotion ID/version and base/bonus units on the purchase. Editing a future slot never alters historical awards.
- Slot caps must be enforced atomically under concurrency. At an exhausted per-member cap, award base units and explain why no bonus applied.
- Promotion editor shows customer card preview and a sample eligible/non-eligible transaction.

Required tests: before/start/inside/end/after boundaries, different branches, overlaps, cap race, retry, reversal, wrong client clock, rate-version changes, and the Rs 250 example above.

## 9. Referral system — launch feature

Each membership has a shareable referral code for THAT business: generate 16 bytes with a cryptographically secure random generator (128 bits), encode as canonical unpadded Base64URL, exactly 22 case-sensitive ASCII characters. Do not derive it from IDs, names, timestamps, or a short random alphabet string. Enforce global uniqueness in SQL and regenerate on collision. Validate the canonical encoding/length before lookup; never lowercase a code. Visiting /r/[code] resolves to the cafe's landing page and stores bounded attribution through authentication. It does not reveal the referrer's contact details or create a membership automatically.

The referral resolver accepts only an active code/referrer, active business, published earning programme, and currently enabled new-referral rules. For a draft/paused/archived business, paused/unpublished programme, disabled code/rules, inactive referrer, or invalid code, return the same generic 404/unavailable page used for invalid referral destinations. Do not store attribution or count a referral visit. Recheck these conditions at enrollment; discard stale attribution if eligibility changed, without silently attaching another referrer. Existing enrolled claims keep the separately defined qualification/suspension rules.

Default proposed rules:

- Attribution lasts seven days. First valid referral wins for a not-yet-enrolled customer; allow them to clear attribution before joining. Display that a referral benefit applies.
- Reject self-referrals and referral claims by anyone already enrolled in that business.
- One referrer per referred membership, enforced by a database uniqueness constraint. An old/deactivated membership cannot rejoin as new for another reward.
- Owner configures fixed bonus units for inviter and friend, minimum first-purchase spend, and a per-referrer monthly reward cap. Default cap may be 10; store it as configuration.
- Only the first recorded qualifying purchase after enrollment earns the bonuses. A lower-value purchase does not qualify; the first later purchase meeting the threshold can qualify once.
- Referral claim records the rules version at enrollment. Existing claims retain those agreed rules through their defined qualification period (initial default: 30 days after enrollment).
- Qualification locks the claim and memberships and commits both bonuses with the purchase in one transaction. Retried workers cannot award again.
- If the purchase is fully reversed, reverse both bonuses and mark the claim reversed. It cannot automatically qualify again; the owner may make an explicit audited adjustment for an erroneous correction, but there is no manual requalification workflow.
- If a cap is reached, do not promise a reward to the inviter. The friend benefit policy must be explicit: launch default honors the friend's configured reward while suppressing the capped inviter bonus, and records the reason.

Show referral link/copy/share, total referred signups, qualified referrals, earned bonus units, and pending/expired/reversed counts. Use anonymized friend labels or aggregate results rather than exposing identities without consent.

Abuse controls: authenticated enrollment, action rate limits, no bonus on signup alone, owner/manager audit view, and checks for known duplicate accounts. IP/device similarity is at most a review signal; do not auto-ban families on shared Wi-Fi or promise Sybil-proof identity without verification. An unverified phone number is neither authentication nor reliable anti-fraud proof.

## 10. Push campaigns, automations, and offer inbox

### Subscriptions and consent

- Device push subscription is associated with the current authenticated customer and browser installation. Store tokens securely server-side with created/updated/last-seen/revoked status. Registration must prove receipt at the submitted token before activation: send a short-lived random data challenge while the subscribing page is foreground, and accept its acknowledgement only from the same authenticated user/session/installation. Do not return the challenge through the ordinary registration response. A valid-format FCM token alone is not proof of ownership. Cap challenge requests and expire unconfirmed rows after 5 minutes.
- Business-specific consent is separate from browser-level permission. Both must allow a marketing send.
- Never subscribe everyone to a global public FCM business topic and trust topic membership as authorization. Select eligible customer devices on the server.
- On logout/shared-device account change, revoke the server device binding, delete the browser FCM token where supported, and clear local state. Bind a new account only after a new registration challenge. Include an opaque installation binding generation in push data; service worker/client drops mismatched generations. Clear displayed notifications on logout where supported. Provider-accepted notifications cannot be recalled reliably; use minimal previews and never promise cancellation of already-sent messages.
- Refresh changed tokens, revoke invalid tokens, and support more than one legitimate device per customer.

### Campaign model

Draft -> scheduled -> processing -> completed/completed_with_errors, with pause/cancel and explicit terminal failure states. Store campaign versions; modifications to already processed content create a new version/campaign.

Fields: business, English title (3–80 characters), body (10–500 characters), safe optional image, internal destination, audience rule, chosen branches, scheduled time/timezone, offer validity, and creator. Trim leading/trailing whitespace and count Unicode code points consistently in UI/API/SQL; emoji must not create conflicting JavaScript and database limits. Apply the same bounds to automation templates and final rendered push text, rejecting invalid content before dispatch. Browser notification previews may truncate visually; retain full text in the authorized destination and never promise every character appears in the OS notification. Card-only campaigns default to expiry 24 hours after scheduled_at; maximum send window is 7 days. Offer destinations additionally cap expiry to the offer's expiry. Audience supports all opted-in members, inactive members, reward-ready members, and members close to the configured reward threshold. Branch audience means recorded membership/purchase affiliation, not live physical location.

At launch of a scheduled campaign, snapshot eligible membership IDs for reproducibility. Before each actual send, recheck consent, device ownership, exclusions, campaign status, expiry, and frequency limits. A withdrawn consent must win over an old snapshot. Prevent sending expired time-limited offers after a prolonged outage.

Launch limits: two marketing events per business per member per week, five across the platform per member per week, and quiet hours 9 pm–9 am in the member's selected timezone (fallback Asia/Karachi). The dispatch defaults below define exact event classes, reward-update limits, deferral, and deduplication.

FCM has no per-message charge, but workers, storage, and database operations can cost money. [Firebase pricing](https://firebase.google.com/pricing). Use the documented supported-browser checks and service-worker setup. [FCM web setup](https://firebase.google.com/docs/cloud-messaging/web/get-started).

### Reliability and reporting

Write events to an outbox in the originating transaction. A dispatcher schedules deduplicated jobs; handlers tolerate repeats, use exponential backoff for transient errors, and expose dead-letter failures. External push delivery cannot be made absolutely exactly-once: a provider timeout may be ambiguous. Use notification tags/event IDs and client deduplication where possible, and do not overclaim guarantees.

Statuses distinguish eligible audience, suppressed, attempted, provider accepted, failed, and observed clicked. Provider acceptance is NOT verified display or reading. One customer with two devices counts as one audience member but two delivery attempts. Keep membership-level and device-level metrics separate.

Offer inbox is database-backed and remains useful without push permission. Push deep links contain no sensitive bearer credentials and must resolve to an authorized, unexpired screen.

### Dispatch and automation defaults

Zero eligible recipients is a normal no-op for both campaigns and automation scans. Complete that batch/scan successfully with zero counts; do not raise an error, retry the same scan, reserve contact allowance, or create dummy member runs. The next normally scheduled automation scan still occurs so newly eligible members can be discovered. A previously created member run that becomes ineligible is terminally suppressed with its reason. No push-capable device does not prevent an otherwise eligible birthday inbox offer from being created; push attempts are simply zero. Distinguish an actual recipient-query/provider failure from a successful empty result.

Membership branch affiliation is joined_branch_id OR a non-reversed qualifying purchase at a selected branch. Snapshot the union once, deduplicated by membership; recheck actor/branch authority, active business/member, destination eligibility, consent, frequency allowance, and expiry before dispatch. Disabling a creator's campaign permission pauses their unsent campaigns for owner review. Paused campaigns resume only through an authorized Resume action before expiry, with the same recipient snapshot/content; they do not replay attempted recipients. Scheduled-content edits require cancel/duplicate; draft saves alone never schedule work.

Marketing campaigns, inactivity messages, and birthday pushes share the existing 2-per-business/5-global weekly marketing limits. Reward-available pushes require push/reward_updates consent and have separate limits of 1 per business and 3 globally per local calendar day. All use 21:00–09:00 quiet hours in the customer's timezone. Reserve allowance atomically per logical event, not per device; no double charge for retries. At a cap or during quiet hours, defer to the next eligible boundary only if before expires_at; otherwise record suppressed. Disabling a rule/campaign or withdrawing consent stops unsent work, but cannot recall provider-accepted messages. Already-issued benefits remain valid under their terms.

Manual WhatsApp tasks do not consume automated-push allowance. Allow at most one task open per business/member in 24 hours, with an owner-visible recent-contact warning; reopening the SAME assigned task is allowed. Enforce the gate server-side when opening, without claiming it prevents staff messaging outside this application.

Worker starts with concurrency 4, FCM batches <=100 device tokens, and one claimed job per logical event. Dispatch outbox every 5 seconds; scan due campaigns/automation eligibility every minute in bounded 100-member pages; reconcile balances, expire stale records, and process retention daily. Use a durable job/event key and idempotent handler receipt. Retry transient failures at 30s, 2m, 10m, 30m, and 2h, always respecting validity; terminal errors go to failed/dead-letter state. No automatic retry of an FCM outcome marked unknown: record it as potentially accepted and require explicit admin review. For background data messages, the service worker owns display once; avoid a simultaneous SDK auto-display payload. Foreground messages show an in-app banner. Notification deep links carry only safe identifiers and reauthorize on open. [FCM foreground/background handling](https://firebase.google.com/docs/cloud-messaging/web/receive-messages).

Outbox enqueue and dispatched status must be atomic in PostgreSQL when supported by the selected pg-boss adapter; otherwise enqueue first, then mark, and tolerate a crash/re-enqueue through durable consumer deduplication. Never mark dispatched before a durable enqueue succeeds. Keep database transaction work separate from external delivery. Provider acceptance and DB recording still have an unavoidable unknown window; test it explicitly.

### Automation details

- Reward available: for the configured reward, trigger only when a positive committed earning event crosses from insufficient to sufficient. Rule activation/editing and owner adjustments do not retroactively trigger it. Deduplicate by business/member/reward/source event; a new crossing after redemption can create a new event, subject to daily limits. Expiry is 24 hours after crossing; recheck balance/reward eligibility before send.
- Inactivity: based on last non-reversed qualifying purchase. Never-purchased members are excluded. Send once per inactivity episode keyed by business/member/last non-reversed qualifying purchase ID, independent of rule version. Initial eligibility is last_purchase_at + inactive_days; expiry is 72 hours after first eligibility. Reversing a reset purchase restores prior history without resending an already-processed episode. If an attached offer is expired, ineligible, or already fulfilled, suppress the message.
- Birthday: explicit optional month/day and inbox/birthday consent; one offer per business/member/business-local calendar year, across rule/template edits. February 29 maps to February 28 in non-leap years. Require birthday and consent to have been saved before that day's start; no same-day edit/opt-in creates a retroactive gift. Generate during the birthday date, with catch-up after an outage only while the original validity window remains open. No age inference.
- A birthday rule references a published automation template, which is never directly claimable or listed as a public offer. In one transaction, create/deduplicate the annual automation run, clone one immutable recipient-restricted offer with source_template_id and generated_by_run_id, and create its offer_recipients row for that member. The generated offer has its own ID each year, so UNIQUE(offer_id,membership_id) does not block next year's gift. Keep template eligibility dates and the calculated original birthday window; a late job cannot extend validity. Store rule/template/content snapshots on the run. Inbox creation does not require an active push token; the optional push requires push/birthday consent and consumes marketing allowance.
- Birthday discounts/treats use one-time offer-claim records and staff-confirmed fulfillment. They never create spendable ledger units.

## 11. Manual WhatsApp workflow

Create a business-scoped follow-up task list, not an automated outbound messaging engine.

Owner/authorized manager writes a template with a body of 10–1000 Unicode code points after trimming. The complete placeholder allowlist is {{first_name}}, {{business_name}}, {{reward_name}}, and {{public_offer_url}}; reject unknown names, malformed/unmatched braces, nested expressions, and executable template syntax at save time. Do not silently preserve or remove an unknown token. The system generates a preview for each consenting customer. Staff press Open WhatsApp -> correct chat opens with prefilled text -> staff review and press Send -> return and manually mark sent or skip.

Render with literal safe substitution only. first_name is the first whitespace-delimited part of the shared display name; business_name is the business display name. reward_name requires a selected target reward and public_offer_url requires a selected non-template all-members offer, linked to its authenticated detail route without bearer credentials. If a required value is unavailable or rendered text is outside 10–1000 code points, block task creation for that member and show the exact preview exclusion; never invent data or truncate. Validate rendered length again before opening a task. UI/API/database use the same Unicode counting rule.

Use the documented wa.me format with normalized international digits and URL-encoded text. A Pakistani number beginning 03... becomes 923... after validation; support other valid countries with a maintained phone parser. Keep contact details out of tracking URLs and logs. [WhatsApp click-to-chat](https://faq.whatsapp.com/5913398998672934).

Task states: pending, assigned, opened, staff_marked_sent, skipped, opted_out. Store actor, time, template version, and a minimal message snapshot or safe rendered content under a defined retention policy. Record the difference between opened and sent prominently in reports.

- Clicking a link is never recorded as automatic sending, delivery, or reading.
- No background WhatsApp sessions, QR-linked bots, bulk auto-clicking, or Meta API integration.
- The staff device must already use the cafe's WhatsApp account; our application cannot enforce or inspect which WhatsApp account is currently logged in.
- Require explicit permission for contact access; ordinary scanning cashiers do not automatically receive contact lists.
- Recheck WhatsApp consent and contact availability before rendering a send link. Opted-out users are suppressed.
- Suppress duplicates for the same campaign/member; support assigned-task locking and a visible recent-contact history.
- If a customer replies STOP, staff must record the opt-out manually; there is no inbound-message webhook in this approach. Also provide an authenticated in-app preference switch.
- Phone ownership is not automatically verified. Show verification status to authorized staff, and never use a typed number to recover or merge an account. Manual confirmation can be recorded when staff have actually verified a customer-initiated chat.
- Do not generate enormous one-click bulk lists and imply that consent alone eliminates messaging limits. Position this as occasional customer follow-up.

## 12. Database design and key constraints

Use UUIDs for entities and high-entropy random values for public referral/QR handles. UUIDs are not access control. Use timestamptz for event timestamps and CHECK constraints for valid amounts/statuses. Every tenant-owned row must include business_id or a demonstrably enforced parent relationship.

| Tables | Key fields and constraints |
|---|---|
| profiles | stable user_id, nullable unique auth_user_id -> auth identity, display name, timezone; private platform identity |
| businesses | owner relationship, slug UNIQUE, branding, status, timezone, currency, published_at |
| branches | business_id, name, address, hours, status; UNIQUE(business_id, id) for composite references |
| business_users / branch_assignments | business_id, user_id, role, active; scoped branch relationships |
| memberships | business_id, customer_id, joined_at, status, shared contact fields; UNIQUE(business_id, customer_id) |
| consent_events / consent_preferences | membership, channel, purpose, version, status, timestamp; preserve change history |
| loyalty_programmes / programme_versions | business, immutable earning config, effective_at, programme type |
| reward_versions | business, programme, unit cost, terms, validity, estimated fulfillment cost if provided |
| balances | business, membership, integer balance, version; one row per membership |
| purchases | business, branch, membership, eligible/bill totals, base/bonus units, rule versions, status, actor, idempotency key/hash |
| ledger_entries | immutable signed units, source type/id, original/reversal relationships; source uniqueness |
| redemption_intents / redemptions | hashed secret, expiry, reward version, customer, staff, consumed/fulfilled/reversed timestamps |
| earning_promotions / promotion_usage | slot/rules version, branch bindings, cap counters, purchase attribution |
| referral_codes / referral_claims | referrer, referred member UNIQUE per business, rules snapshot, qualifying purchase, bonus/reversal states |
| offers / offer_claims | business, content, dates, eligibility, per-member claim constraint and fulfillment |
| push_devices | customer, token/installation binding, state, last seen; no public exposure |
| campaigns / campaign_recipients / delivery_attempts | content version, audience snapshot, eligibility/suppression, device attempts, provider IDs |
| automation_rules / automation_runs | business, trigger, rules version, deduplication key, processing status |
| whatsapp_templates / followup_tasks | consent-scoped contact, campaign/member uniqueness, assignment, manual action history |
| subscriptions / invoices / payment_events | business, configurable plan/entitlements, period, amount, reconciliation actor, unique payment reference |
| idempotency_records / outbox_events | scoped operation key, request hash, result reference, event deduplication |
| audit_events | actor, tenant, action, target, reason, before/after safe fields, request correlation ID |

Add composite foreign keys to prevent cross-tenant joins, foreign-key indexes, and indexes for business/date, membership/date, pending job status, campaign/member, and referral qualification. Enforce uniqueness in SQL, not only an application pre-check.

Protect referral qualification, cap counters, redemption consumption, ledger/balance changes, and payment reconciliation with transactions/locking. Counters are not authoritative unless reconciled with immutable source records.

Migration practices: version-controlled SQL, generated types refreshed after migration, repeatable development seed, separate test/staging/prod datasets, and additive/backward-compatible changes where possible. Never run a destructive schema reset against production. Include migration validation and a restore/roll-forward plan.

## 13. Server operations and API contracts

Transport paths and internal function names are implementation choices; the following domain operations, payload fields, authorization, and results are required:

| Operation | Authorization / validation | Result |
|---|---|---|
| joinBusiness | Authenticated customer, published business, valid scoped referral | Existing or new membership, never duplicates |
| previewPurchase | Authorized staff/branch, member tenant, bounded amounts | Server-calculated base/bonus/rules summary |
| recordPurchase | Same checks repeated, idempotency, current rules, DB transaction | Committed purchase and updated balance |
| createRedemptionIntent | Customer owns member/reward eligibility | Short-lived intent; no debit yet |
| finalizeRedemption | Staff branch scope, intent/customer/business match, lock balance | Exactly one redemption and debit |
| reversePurchase / reverseRedemption | Manager authority, reason, unprocessed reversal | Compensating entries and updated history |
| createPromotion | Owner/manager scope, non-overlap and date/cap rules | Versioned schedule |
| scheduleCampaign | Campaign rights, input limits, entitlement, time/offer validity | Scheduled job and versioned campaign |
| updateConsent | Customer relationship ownership, channel/purpose/version | Preference and event; suppress future work |
| openWhatsAppTask | Assigned/permitted staff, current consent | Sanitized prefilled link; status only 'opened' |
| markFollowupSent | Permitted staff, current task/version | Human-attested status |
| getReport / exportReport | Business/branch/report permission, bounded date range | Defined metrics with data timestamp |
| reconcilePayment | Platform billing role, reference uniqueness, verified evidence | Audited payment/subscription extension |

Use typed request/response schemas and predictable errors: unauthenticated, forbidden, invalid_input, conflict, expired, insufficient_balance, rate_limited, temporary_failure. Return useful user messages without SQL/provider internals. A financial/configuration mutation is never performed by GET. Auth callbacks and referral cookie resolution are controlled protocol exceptions; they never enroll a customer, award units, or consent to marketing.

All important operations have correlation IDs and idempotency where retries could change value. SQL transactions are the final authority; TypeScript can provide previews but cannot be a second inconsistent accounting implementation.

### Critical request and response contracts

All mutation bodies use strict typed schemas and reject unknown fields. IDs are UUIDs, money/units travel as decimal integer strings, times are ISO UTC strings. Actor/tenant permissions and calculated values come from the server. Common response: success {data, correlationId}; failure {error: {code, message, fieldErrors?, retryAfterSeconds?}, correlationId}. HTTP mapping: 401 unauthenticated, 403 forbidden, 404 inaccessible/missing object without enumeration, 409 conflict/insufficient_balance, 410 expired, 422 invalid_input, 429 rate_limited, 503 temporary_failure. Never return provider/SQL secrets.

| Operation | Accepted product inputs | Required response / effect |
|---|---|---|
| joinBusiness | businessSlug, active branchId, displayName, shareVerifiedEmail, optional phone, whatsappMarketingConsent, acceptedProgrammeVersionId, platformTermsDocumentId, privacyDocumentId, rejoin boolean=false; server-held referral attribution | Membership ID, created/existing/reactivated, card route. Stale terms return conflict before creating anything. Existing active membership returns its card without overwriting contacts/consent. Explicit rejoin reactivates only a left membership, preserves joined_at/branch/history and balances, records current terms, and leaves marketing off; contacts are edited separately in Preferences. Suspended/anonymized rows cannot be reactivated by this operation. |
| resolveScanner | businessId, branchId, kind earningHandle/typedCode/redemptionIntent/offerIntent, rawValue | Minimal member/benefit preview and opaque checkout context, expiresAt. Authorize staff first; consume typed lookup code atomically. |
| previewPurchase | checkoutContext, recordedBillPaisa, eligibleSpendPaisa, qualifyingPurchaseConfirmed, receiptReference?, correctsPurchaseId?, offerClaimContext?, offerEligibleBeforeDiscountPaisa? | Current rule IDs, base/promotion/referral effects, cap/suppression reasons, discount, balance, evaluatedAt and expectedEffectHash. No writes to balances/claims. |
| recordPurchase | Same purchase fields + expectedEffectHash + idempotencyKey | Purchase ID, immutable effect breakdown, balanceAfterAtCommit, ledgerVersion, replayed. Atomically consume relevant checkout/offer context and intent with value changes. |
| createRedemptionIntent / createOfferIntent | Own membershipId and rewardVersionId or offerClaimId | Intent ID, raw token once, expiry and units/benefit. Replacement cancels old active intent. On refresh/lost response, generate a replacement; never store raw secret in replay JSON. |
| claimOffer | offerId, optional server-validated campaign attribution context | Existing/new claim ID and validity; no fulfillment or debit. Reject templates/informational/unauthorized offers. |
| finalizeRedemption / fulfillOffer | Valid intent checkoutContext, expectedEffectHash, idempotencyKey; standalone offer only if conditions need no purchase | Fulfillment reference, committed status and balance. Spend-dependent offer fulfillment goes through recordPurchase, not a second transaction. |
| reversePurchase / reverseRedemption / adjustUnits | Source ID or membershipId, signed adjustment units only for adjustment, reason, expected row version/effect hash, idempotencyKey | Compensating entry IDs and balances; fresh authorization/MFA; no client-supplied reversal math. |
| getOperationResult | businessId, operation, idempotencyKey | Authorized original result or not-found/pending retry guidance; current balance fetched separately. A replay must not relabel an old balanceAfterAtCommit as live. |
| getReport / exportReport | reportKind, businessId, allowed branchIds, startDate, endDate, tab-specific filter IDs, allowed sort, cursor/pageSize for reads, approved column IDs for export | Typed metrics/rows, appliedFilters, dataAsOf, pagination or export request ID. Reject arbitrary SQL/column names. |
| scheduleCampaign | Draft campaign ID, expected rowVersion, scheduledAt, expiresAt, idempotencyKey | Immutable scheduled version/job reference and state; a zero eligible audience completes with zero counts, never substitutes all members. |
| setConsent | Own membershipId, valid channel/purpose, allowed, displayed policy version | Current preference plus matching immutable consent event. Staff endpoint only records denial with reason. |
| openWhatsAppTask / markFollowupSent | taskId, expected rowVersion; mark additionally attests sent | Open returns current authorized link and lease; mark records human attestation, never provider delivery. |
| reconcilePayment | invoiceId, submissionId?, verifiedAmountPaisa, method, canonical provider, reference, decision, reason when rejecting/correcting, idempotencyKey | Invoice/payment event/coverage state; all computed in one transaction. |

CRUD editors use the field names and limits in sections 24–25, row_version on edits, and explicit Publish/Enable actions. Body/schema ownership is shared between web and worker; use one authoritative SQL calculation for previews and final commits.

Scanner payloads use bounded versioned formats: LOYALTY:EARN:v1:<random>, LOYALTY:REDEEM:v1:<random>, LOYALTY:OFFER:v1:<random>. Raw handles/intents have at least 128 bits of cryptographic entropy; typed codes have 8 unambiguous random characters with the separate strict rate limit. Reject payloads >512 characters and unknown kinds; never navigate to arbitrary scanned URLs. Contexts are random secrets hashed server-side, expire after 5 minutes or their parent intent (whichever is sooner), and bind business/member/branch/staff user/verified auth session. A raw membership ID is insufficient for checkout. Switching branch or selecting Scan next creates/requires a new context. Lookup contexts do not grant contact access.

## 14. Owner reporting — launch feature and metric definitions

Reports filter by business, permitted branch, date interval, and relevant programme/campaign. Group dates in business timezone; query UTC boundaries with half-open intervals. Show the data-through timestamp. All charts have accessible tables and meaningful empty states.

| Metric | Required definition |
|---|---|
| New members | Memberships created during selected period |
| Purchasing members | Distinct members with at least one non-reversed qualifying purchase in period |
| Returning purchasing members | Purchasing members who had a qualifying purchase before the period started |
| Returning share | Returning purchasing members / purchasing members; show N/A when denominator is zero |
| Repeat within period | Members with at least two qualifying purchases in the period; label distinctly from returning share |
| Recorded loyalty sales | Sum of recorded net bill totals, with explicit refunds treatment; never label total restaurant revenue |
| Eligible loyalty spend | Sum of eligible spend used for earning; separate from recorded bill total |
| Average recorded bill | Net recorded sales / non-reversed purchase count with defined zero handling |
| Units earned / redeemed | Net source-cohort units for sources occurring in the selected interval, adjusted for their recorded reversals; split base/promotion/referral/redemption. Separate activity rows show reversals at their processing date. |
| Outstanding units | Current business-wide SUM(max(balance,0)); show negative balances separately as adjustment debt. Owner-only with All branches selected, independent of date filter and labelled Current. Shared units are not allocated to an arbitrary branch. |
| Rewards fulfilled | Committed redemptions excluding canceled fulfillment |
| Estimated reward cost | Merchant-provided estimated unit fulfillment cost at redemption; unknown values stay unknown, not zero |
| Referral funnel | Link visits (approximate), enrolled claims, qualified, capped, expired, reversed; bonuses issued |
| Double-slot performance | Purchases/eligible spend/bonus units attributed to each stored promotion version |
| Campaign performance | Unique eligible members, suppressions, provider-accepted device sends, observed clicks, unique offer claims, fulfilled claims |
| Manual WhatsApp activity | Opened tasks versus staff-marked-sent tasks; no invented delivery/open rate |
| Staff activity | Purchases, awards, reversals, fulfillment, and adjustments per permitted staff/branch |

For launch sales reporting, attribute full reversals back to the original purchase for net cohort totals and clearly state that historical totals may change. Also show reversal activity by processing date for operations. Do not mix these definitions silently.

Branch reports: new members use joined_branch_id; purchases/redemptions use their actual branch; referrals use the qualifying purchase branch, or referred join branch while pending. Returning-member classification may check prior business-wide purchase existence without revealing other-branch receipts. Hide outstanding/debt tiles for managers and branch-filtered views, rather than returning zero. Recorded sales and average-bill denominator use all non-reversed recorded purchases; purchasing/returning metrics use qualifies_for_loyalty. Keep cash amounts and unit flows separate.

Campaign attribution uses a unique membership-linked offer claim; fulfillment can attach to a purchase. A purchase has at most one primary campaign claim in launch analytics to prevent double-counted associated sales. An offer claim generated from a click is not a fulfilled redemption. Do not present associated sales as proven incremental revenue. Record observed clicks through an authenticated, deduplicated client event matching the campaign recipient/member; a guessed query parameter or crawler GET cannot add clicks or attach attribution. Referral link analytics labels approximate visits and the 90-day coverage window.

Reports read indexed source tables on demand using section 26's date limits, pagination, and timeout rules. Exports require elevated business permissions, audit entries, bounded size, and CSV formula-injection escaping. Do not include phone/email in ordinary exports by default.

## 15. Design specification

Design for affordable Android phones, iPhones, busy cashiers, and owners checking results on mobile. The aesthetic should feel polished and calm, with clear rewards and strong hierarchy, rather than a generic enterprise dashboard or flashy crypto wallet.

### Visual language

- Platform tokens: background #FAFAF7, surface #FFFFFF, primary #166534 with white text, text #111827, muted text #4B5563, border #D1D5DB, warning #B45309, error #B91C1C. Verify contrast for actual combinations; warnings/errors include text/icons. Self-hosted Inter with system sans-serif fallback, 16px base text, 24px page titles, 8px control corners, 16px card corners. Layout breakpoints 640px/1024px; 16px phone gutters, desktop content max-width 1280px.
- Merchant logo/accent can customise card surfaces, not every button/layout. Validate contrast and derive readable text colors. QR codes always retain a high-contrast quiet zone.
- Use one clean self-hosted English UI font with comfortable line height. Confirm its license; avoid adding translation/font dependencies for unrequested languages.
- Consistent spacing scale (4/8/12/16/24/32), rounded cards, restrained shadows, clear borders, and minimal motion. Respect reduced-motion settings.
- Show amounts as Rs with en-PK formatting and explicit business-local dates/times; use left-to-right English layouts throughout.

### Customer interface

Mobile bottom navigation: Cards, Offers, Referrals, Account. Card detail prioritises brand, current progress, next reward, large readable QR, and one main action. Display terms and recent activity below the primary content.

Use visual stamp circles for stamp programmes and an explicit progress meter for points. Also provide text such as '6 of 8 stamps' for screen readers. Avoid implying that a reward was redeemed just because a customer opened its screen.

### Staff interface

Scan-first home, large touch targets, visible selected branch, minimal required typing, useful number keypad, clear confirmation, and a short recent-transactions list. Keep Scan/Award/Redeem distinct. Use optional feedback sound/vibration only where supported and user-controlled.

Prevent destructive tap proximity. On network failure, preserve form input and show whether the server result is unknown or definitively rejected. Do not use optimistic final balances for value-changing transactions.

### Owner interface

Desktop sidebar; mobile drawer/navigation. Overview leads with members, purchasing members, recorded sales, and reward usage, followed by one useful trend chart and outstanding actions. Put programme/promotion controls near clear previews. Tables support search, pagination, scoped filters, and export permissions.

Campaign composer shows message preview, audience count, consent-based exclusions, schedule, quiet hours, and offer expiry. Manual WhatsApp screens must visibly say staff must press Send in WhatsApp.

### Accessibility and quality targets

- Aim for WCAG 2.2 AA: keyboard access, visible focus, form labels, readable contrast, correct dialog behavior, and accessible status announcements.
- Minimum practical touch targets around 44 CSS pixels; do not rely on color alone.
- Responsive widths from 360 px phones through desktop; test long English content and large text scaling.
- Target p75 LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1 after field data exists. In development, use realistic throttled-device checks and record conditions rather than claiming field performance.
- Lazy-load camera decoder and chart libraries. Avoid loading owner dashboards into the customer card bundle.
- Empty states provide the next action, not fake charts. Production screenshots/testimonials must be real or clearly labelled examples.

## 16. PWA and service-worker behavior

- One manifest ID, one app installation identity, root customer start route, proper icons/maskable icons, theme colors, and a controlled service-worker scope.
- Feature-detect install prompts and notifications; show browser-specific instructions only where relevant. Embedded Instagram/WhatsApp browsers may require 'Open in browser'.
- Android: support install and notification permission paths. iPhone: Add to Home Screen before requesting supported web push. [Apple web push documentation](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
- Use one coordinated service worker for PWA caching and FCM; do not register competing workers at the same scope.
- Cache versioned static assets and a minimal offline shell. NEVER indiscriminately cache authenticated HTML, staff reports, contact lists, auth callbacks, API responses, or ledger mutations. Follow section 26's public-data allowlist; reports use authenticated no-store responses.
- Optional offline card snapshot: store only explicitly selected own-card display data in a user-scoped IndexedDB store; show last-updated time. Treat it as untrusted display data, not an authorization source.
- An opaque earning handle may be displayed offline; it identifies a membership to authorized staff only. It cannot reveal private data publicly or authorize redemption. Provide handle revocation/rotation if exposed.
- Clear local user state and device token bindings on logout. Test shared phones and account switches explicitly.
- Use network-only mutations. Offline awards/redemptions are disabled with clear instructions.
- PWA updates should prompt a safe refresh; do not replace code in the middle of checkout. Ensure a cache migration does not expose the previous user's data.
- Clicking a push focuses/opens the appropriate authorized route. Stale/expired offers show a useful expired state, not a blank page.
- Do not request location permission for ordinary campaigns. Campaign branch targeting is based on recorded affiliation, not a person's current position.

## 17. Security and privacy requirements

Apply security throughout phases, not as an end-of-project patch. Authorization should deny by default and be checked on every operation. [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

### Shared limits and sensitive-operation defaults

Use PostgreSQL rate_limit_buckets through a narrow atomic operation, not per-process memory or Redis. Fixed windows use database time and server-derived HMAC subject keys; retain expired buckets at most 24 hours. Initial limits: magic-link request 5/email/hour and 30/trusted-IP/hour with 60-second resend cooldown; staff lookup 60/user/business/minute plus 5 failed typed codes/user/5 minutes; intent/challenge generation 10/user/minute; purchase/redemption 60/staff/business/minute; report reads 30/user/business/minute; exports 3/user/hour and one running/user; campaign test sends 5/user/hour; manual-task opens 30/staff/business/hour plus the member contact gate. Return 429 with Retry-After. Protect direct RPC paths too; auth-provider controls are additional to these app limits. If the shared limiter is unavailable, fail closed for sensitive mutations/exports and return temporary_failure.

Trusted-IP means the address supplied by Vercel's ingress for a request received through the configured Vercel deployment, not an arbitrary request-header value. The production adapter reads Vercel's platform-set x-vercel-forwarded-for; the launch topology has no additional proxy. Ignore caller-supplied Forwarded, X-Forwarded-For, X-Real-IP, CF-Connecting-IP, body/query IP fields, and client-supplied subject hashes. Trust derives from the controlled ingress, not the header name: the same header on a direct/local/non-Vercel server is untrusted. Vercel documents its forwarding-header behavior and IP-spoofing protection. [Vercel request headers](https://vercel.com/docs/headers/request-headers).

Validate one IPv4/IPv6 literal, reject duplicate/list/malformed values, and canonicalize equivalent addresses including IPv4-mapped IPv6. Before passing an IP-derived key to PostgreSQL, compute HMAC-SHA-256 with a server-only key and domain separator; never persist/log the raw address or use an unkeyed IPv4 hash. Missing/untrusted IP returns temporary_failure for operations requiring an IP gate rather than skipping the gate. Local tests use an explicitly injected server-side adapter/loopback fixture, never a production header-trust bypass. The protected server adapter supplies IP bucket keys through a server-only operation; direct authenticated RPC limits derive user IDs from verified auth context and never accept client-defined rate-limit subjects. Prove on a deployed preview that changing spoofed forwarding headers cannot change the limiter bucket; keep raw addresses out of test logs too.

Login starts a verified Google/magic-link session; create the private profile idempotently, with a first-login name form when the provider supplies none. No password reset UI. Reauthentication means a newly verified provider login or MFA challenge, with a server-checked recent authentication timestamp; refreshing a token alone does not count. Bootstrap the first platform admin through a documented operator command against an existing verified user, never a public route.

### Application and infrastructure

- HTTPS in production, secure session-cookie configuration compatible with the chosen Auth SDK, SameSite behavior, correct expiry/refresh, and exact auth redirect allowlists. Use HttpOnly for server-only cookies; do not break the auth SDK by blindly changing required cookie behavior.
- Origin/CSRF protection for cookie-authenticated mutations; authenticate Server Actions/RPC endpoints individually. Never assume hidden UI or a route guard protects an API.
- Deploy CSP with the minimum required script/connect/image/worker origins. Avoid unsafe HTML injection and arbitrary merchant CSS/JS. Test OAuth, FCM, and service-worker behavior with the policy. [CSP reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).
- Strict input size/range validation, parameterized queries, and no sensitive details in error messages.
- Uploaded logos/campaign images: restrict MIME and file size, verify file signatures/dimensions, re-encode accepted raster images, and reject executable content. Do not accept unsanitized SVG/HTML. Storage access and signed URLs follow tenant permissions.
- Avoid fetching arbitrary merchant-provided URLs server-side. Menu/maps links are validated outbound HTTPS links; enforce redirect allowlists and do not fetch remote link previews.
- Secrets only in server environment/secret stores. Public Supabase identifiers and Firebase web configuration are not admin secrets, but their rules must still be secure. Never ship service-role keys, database passwords, FCM server credentials, or job secrets to browsers.
- Runtime credentials least-privileged; production/staging credentials and databases separate. Rotate credentials after exposure and document revocation procedures.
- Dependency/license review, lockfile, secret scanning, security update routine, and protected CI credentials.

### Data handling

- Collect only necessary profile/contact data. Separate loyalty enrollment from optional marketing consent by channel and business; record consent text/version/time/source.
- Never place phone numbers, birthdays, push tokens, redemption secrets, or auth tokens in analytics events or logs. Authorized wa.me handoff necessarily contains the selected phone; generate it only on explicit task open and never track the full URL. Auth/invite protocol URLs are redacted/no-referrer exceptions; private application routes contain no bearer secret.
- Generic push preview default: 'Your reward is ready at Cafe A'; sensitive balances/details belong behind login. Let users control preferences.
- Owners may export only their business relationship data. Audit exports and use short-lived authenticated downloads with formula-safe CSV output.
- Provide membership opt-out, contact deletion, and whole-account deletion/export workflows. Revoking consent cancels/suppresses queued messages. Do not keep inactive device bindings indefinitely.
- Retention policy must be documented before production. Suggested configurable operational defaults: notification attempts 90 days, manual-message content 90 days, operational logs 30 days; retain minimal audit/accounting records for a separately reviewed policy. These are product defaults, not a claim of Pakistani legal requirements.
- Pseudonymize retained ledger/audit references when an account is deleted where appropriate; document unavoidable retention and backup expiry. Do not simply hard-delete rows and corrupt balances or financial records.
- Platform support access: no silent impersonation. Log actor, tenant, reason, start/end, and actions; restrict production access to the minimum support function.

### Privacy and export completion rules

Leave membership preserves its account link, ledger, and balance while turning off consent. Delete membership additionally clears shared contacts/display name, revokes handles/intents and unsent tasks, and pseudonymizes message content. Retain the private account-to-membership link only for the disclosed history/rejoin purpose; rejoin cannot obtain another referral. Do not call this deletion of all accounting records.

Whole-account deletion requires recent reauthentication. If the user is an active business owner, mark the request blocked and direct them to operator support to resolve ownership/closure first; never orphan the business. Otherwise revoke sessions/device bindings, active staff access, marketing, and intents; clear global/contact/birthday data; null memberships.customer_user_id; pseudonymize history; delete the Auth identity. profiles.user_id remains a tombstone and auth_user_id becomes null, preserving FKs without login rights. Worker steps are idempotent and resumable. A recreated account cannot reliably be recognized without retained identifiers; do not promise identity-proof referral abuse prevention.

Never purge ledger/payments on an arbitrary timer. Operator-supplied financial/audit retention policy and actual backup expiry coverage are required before production; display retained categories. After a restore, replay completed privacy requests and consent/device revocations before enabling messaging. Operational defaults: notification attempts/manual message bodies 90 days, logs 30 days, referral visits 90 days, inactive device bindings revoked after 90 days, temporary uploads/exports 24 hours.

Report/contact exports are asynchronous, maximum 10,000 rows and 3 MiB; exceeding a limit fails with Narrow filters, never truncates silently. Account exports include all in-scope personal data, split into numbered <=3 MiB artifacts plus a manifest if needed. Use export_artifacts, private storage, 24-hour expiry, and current authorization on every download through a no-store endpoint. C06 shows each part/status. Bound worker memory and never include another cafe's private business data.

### Threat cases to test

Cross-tenant object IDs, modified business_id payloads, direct calls to privileged RPCs, public storage enumeration, copied referral links, replayed redemption tokens, simultaneous redemptions, stale staff sessions, duplicate award retries, refund-after-spend, malicious uploaded images, CSV formulas, fabricated billing screenshots, shared-device push leakage, and job payload tenant mismatch.

## 18. Billing, administration, and operating model

Store plan features and limits as configuration with versioned subscriptions. Do not hard-code speculative prices. At launch, every offered plan that claims the agreed complete product must include referrals, double slots, and reporting; differentiate limits, branches, and service/support rather than silently withholding accepted launch functionality.

States: trial, active, past_due, suspended, canceled. Generate invoices with PKR amounts and unique references; authorized platform staff reconcile payment against actual bank/merchant records. Uploaded payment proof is evidence to review, not payment confirmation. One full exact payment settles one invoice; no partial allocations. Invoice periods are fixed calendar intervals from subscriptions.billing_anchor_at in Asia/Karachi (month-end clamping uses the original anchor, including leap years). Use unique subscription/period_start/period_end keys. Trial conversion starts the first paid interval at trial end; renewal invoices are issued 7 days before coverage starts and due at coverage start. Late payment covers the invoice's recorded interval, never adds a fresh interval from the payment date. Derive current access from paid coverage, preventing duplicate/out-of-order payments from extending it twice.

Payment correction is an append-only compensating event for exactly one confirmed payment, with UNIQUE(corrects_event_id), original positive amount and reason; accounting treats correction as subtraction. The original payment is not edited or deleted. Recompute invoice state and current coverage; later valid paid intervals remain intact. Uniqueness of bank/provider/reference applies to confirmed events only. Reject a second confirmation on an already-paid invoice; correction permits a separately verified replacement payment. Published paid plans require a positive price; free trial access is modeled by trial_days, not fictitious bank payments.

### Access state contract

Trial and active subscriptions permit enabled launch features within limits. Default trial is 14 days from successful business bootstrap; default past-due grace is 7 days after period_end. Within grace, normal operations continue with an owner billing banner. At grace expiry, set suspended; cancellation takes effect at paid/trial period_end without another grace period. Check effective time/status in each operation, not only the daily status job.

Subscription-suspended/canceled businesses retain owner billing/export, customer cards/history, staff fulfillment of already-issued rewards/offers, and audited reversals. Block new enrollment, purchases/earning, referral claims, campaign sends, new automation offers, and manual WhatsApp opens. Stop already-queued sends as well. Reinstatement restores access without resetting balances or referral history. Positive discretionary adjustments are blocked during suspension; reversals remain available.

An owner-paused business or programme blocks new enrollment/earning/claims and marketing but preserves earned reward fulfillment/history; resume is explicit. Archived businesses and inactive branches cannot transact. Membership left disables earning, intents, new referrals, and marketing but retains balance/history; explicit rejoin reactivates the same row and starts with marketing off. Suspended membership cannot transact until the owner reactivates it; required audited reversals still work. Financial reversals do not require an active customer account. If the referrer has left or is suspended, suspend new referral qualification while preserving the original deadline; if that deadline expires, the claim expires. An anonymized/deleted referrer suppresses their bonus permanently while the friend's captured benefit can still qualify; record suppression member_unavailable. Never grant new units to an anonymized membership.

These rules are visible in enrollment terms, owner billing, pause/cancel dialogs, and customer unavailable states; no balance erasure follows nonpayment.

Admins can provision/suspend tenants, view plan usage and invoice status, inspect job health, retry safe failed jobs, and view aggregate operational metrics. High-impact actions require reauthentication/MFA and audit reasons.

Separate the SaaS subscription ledger from cafe customer loyalty units. No customer payment handling or stored value in this release.

Plan limits: count active business_users including the owner, plus pending unexpired invitations reserved against staff_limit; prevent acceptance races. branch_limit counts active branches, member_limit counts all non-anonymized historical memberships (including left/suspended), and monthly_campaign_limit counts scheduled campaigns by scheduled_at business-local month, even if canceled, to prevent quota recycling. Existing records are not deleted or silently revoked on downgrade; block additions until within limits. Check all quotas atomically at creation/activation; one trial per owner account by default, with audited operator provisioning for additional businesses.

## 19. Deployment, costs, and operations

Local: Next.js + worker + local Supabase/Docker where available; explicitly document Windows-compatible commands. Staging: isolated Vercel deployment, worker, and Supabase project with synthetic customers. Production: Next.js on Vercel, a separately hosted persistent Node worker, managed PostgreSQL/Auth/Storage, HTTPS domain, configured email sender, and FCM credentials. Follow section 27 for regional placement and environment isolation.

Do not deploy the worker as a never-ending task inside a normal web request or assume a serverless process will survive. pg-boss is PostgreSQL-based; choose a compatible connection mode and test reconnects, pool limits, job migration privileges, and worker shutdown. [pg-boss project](https://github.com/timgit/pg-boss).

Required environmental configuration includes public app URL, Supabase URL/public key, server-only database/worker credentials, Google OAuth setup, email delivery configuration, FCM public configuration/VAPID public key, server-only FCM credentials, monitoring configuration, and business-billing contact details. Create .env.example with placeholders only; validate environment at startup. Developer mode must never silently send real campaigns.

Operations:

- Separate liveness and readiness checks; readiness includes database access, while dependency degradation should be reported accurately.
- Structured logs with correlation IDs and redacted fields. Alert on ledger reconciliation mismatches, worker heartbeat loss, queue backlog, repeated provider failures, auth spikes, and failed backups.
- Automated backups with monitored completion, documented recovery objectives, and a staging restore rehearsal. Confirm purchased backup coverage instead of assuming all managed plans include it.
- Staged migrations and application rollout. Record recovery/rollback steps; restore only through a controlled incident procedure.
- Stop campaign dispatch during incidents without disabling customer card access unnecessarily.
- Cost sheet tracks web compute, database, worker, storage/egress, email, monitoring, domain, and support time. Free FCM does not make the whole service free. Record actual supplier quotes before committing to a live hosting budget.
- Performance test scanning and reports with realistic synthetic volume; pagination and bounded report windows from the start. Scale workers within DB connection limits before adding more services.

## 20. Test strategy and realistic fixture data

Use automated tests for value-changing and authorization logic, with targeted UI tests. Avoid meaningless tests that merely repeat implementation details or require constant snapshot updates.

Seed at least two clearly fictional businesses, multiple branches, owner/manager/cashier roles, customers with cards at both businesses, a customer without marketing consent, revoked staff, ordinary purchases, double-slot purchases, referral-qualified purchases, redeemed rewards, a refund-after-spend case, empty reports, and failed notification attempts. Mark seed/demo environments visibly.

Essential suites:

1. Unit/property-style rules: rounding, caps, schedule boundaries, attribution validity, locale formatting, birthday recurrence, and invalid inputs.
2. Database integration: ledger/balance atomicity, composite tenant FK rejection, direct-RPC permissions, idempotency, two concurrent redemptions, referral double-qualification, cap races, and reversals.
3. RLS matrix: visitor/customer/cashier/manager/owner/admin across two businesses; direct database API reads/writes and storage policies.
4. Queue integration: outbox commit/rollback, worker crash/restart, retry and expiry, revoked consent, campaign cancellation mid-batch, invalid device tokens, and provider-timeout ambiguity.
5. Playwright: enroll, existing member, scan fallback, record purchase, redeem, reverse, schedule double slot, referral enrollment, campaign preview, manual WhatsApp link correctness, report reconciliation, owner invoice view.
6. Accessibility/layout: keyboard flow, mobile viewport, long English labels, large font, dialogs, form errors, and chart table alternatives.
7. Real devices: Android Chrome and iPhone Safari/Home Screen. Validate camera, install, push receive/click, denied permission, logout/account switch, bad network, and stale app update.

Automated browser emulation does not prove real mobile push delivery or camera behavior. Record model/OS/browser and date of real-device verification. If devices or provider credentials are unavailable, report those checks as pending launch gates rather than passed.

### Worked accounting fixture

Create a fictional stamp programme with one base stamp per qualifying purchase, a four-stamp reward, an active 2x slot, an inviter bonus of three stamps, and a referred-member bonus of two stamps. Both members initially have zero balance. The referred member's first purchase meets every minimum-spend condition and all caps are available.

| Event | Referred member balance | Inviter balance | Expected persisted facts |
|---|---:|---:|---|
| Purchase committed in slot | 4 | 3 | Friend: +1 base, +1 promotion, +2 referral; inviter: +3 referral |
| Identical request retried | 4 | 3 | Existing result; no new ledger/outbox entries |
| Friend redeems four-stamp reward | 0 | 3 | One -4 redemption debit; intent consumed |
| Same intent replayed | 0 | 3 | No second redemption/debit |
| Manager reverses original purchase | -4 | 0 | Friend: -1 base, -1 promotion, -2 referral; inviter: -3 referral |
| Same reversal retried | -4 | 0 | No duplicate compensating entries |

The fulfilled reward remains recorded. The referred member cannot redeem again while insufficient, and subsequent legitimate earning first offsets the negative balance. Reports must show the original award and reversal history, zero net purchase/referral earnings from this transaction, and the still-fulfilled reward. Cafe B must be unable to read any of these records.

### Additional audit regression cases

- Spoofed forwarding headers/body IPs cannot select rate-limit buckets; missing/malformed ingress metadata fails closed, equivalent IPv4/IPv6 forms normalize consistently, and stored keys contain no raw IP.
- Referral generation uses 16 random bytes and canonical 22-character encoding; forced collisions retry safely. Invalid/inactive business/code destinations store no attribution, including a business paused between link visit and enrollment.
- Campaign title/body boundaries 3/80 and 10/500, WhatsApp body boundaries 10/1000, Unicode code points, unknown/malformed placeholders, missing values, and render expansion agree across UI/API/SQL.
- Empty automation scans complete normally without retries/allowance reservations; later scheduled scans still discover new eligibility. Recipient-query failures never become false empty successes.
- S04 rejects 91-day ranges and page sizes above 100 through direct requests; pagination cannot cross business/branch/actor scope.
- A report cannot request 91 days through either UI or direct RPC; all presets resolve identically.
- Two owner/manager sessions editing overlapping slots cannot race; changing a promotion version does not reset member usage.
- A slot ending while a purchase waits for a lock returns a fresh preview/conflict and no write; confirming again applies current rules.
- Zero-unit points purchases produce no zero ledger row; a 100% discount gives no artificial stamps/referral qualification.
- The same birthday member can receive a separate offer next year, but not a second one after rule/template changes in the same year; inbox benefit works without push permission.
- A copied earning QR or guessed membership ID cannot finalize redemption or an offer; consumed lookup retries cannot leak an intent.
- Token registration without receiving the foreground challenge cannot bind another device. Shared-device generation mismatch drops a pending notification.
- Branch managers cannot edit other-branch objects or read other-branch receipts/contacts through direct APIs/views.
- Pending/expired subscription transitions, late/out-of-order payment, duplicate reference, and payment correction preserve exact coverage and balances.
- Whole-account deletion removes Auth identity while retaining pseudonymized ledger references; an owner blocker is displayed honestly. Role revocation during an export prevents its download.
- A 5 MiB image uploads directly to private staging storage, is validated before publication, and never depends on a larger-than-supported Vercel request body.

### Required developer commands

Provide documented package scripts for dev, worker:dev, build, start, worker:start, lint, typecheck, test, test:integration, test:e2e, db:types, and a safe local migration/seed workflow. Scripts must work in the declared development environment; explain Docker/CLI prerequisites. A production database must never be the default target of a reset or seed command.

CI must run lint/typecheck, a production build, meaningful unit tests, real-database integration/RLS tests, and the critical browser flow. Tests must fail when production code bypasses tenant checks or ledger invariants; do not mask provider/configuration failures as success. Separate external-device/provider checks from deterministic CI and retain their explicit launch status.

## 21. Launch implementation phases

Phases are dependency-ordered implementation milestones, not permission gates. Referrals, double slots, owner reporting, and communication remain mandatory before launch. Estimates should be produced after the repository/environment audit; no fixed completion date is promised here.

### Phase 0 — Repository audit and implementation decisions

Deliver: repository inventory, exact dependency/runtime choices, local run strategy, env example, architecture decision notes, threat model, and tracked task list. Prove an early vertical slice of Supabase verified auth/RLS, one atomic RPC, worker/outbox delivery, FCM foreground registration challenge, and coordinated service-worker setup before investing in all screens. External-device proof stays a named pending gate when credentials/devices are unavailable; it is never replaced with a mock success. Document any deviation from this brief with reasoning. Confirm the chosen Supabase/FCM/worker combination works in the target hosting model.

Caching work: document Vercel/CDN behavior and the installed Next.js cache model. Record the public route allowlist, TTLs, and private no-store policy; verify deployed behavior rather than assuming defaults.

Acceptance: one command starts the local web app, worker startup is documented, no production credentials are committed, and known external setup dependencies are listed without blocking unrelated development.

### Phase 1 — Design system and English-only route skeleton

Deliver: platform design tokens, accessible primitives, centralized English UI copy, customer/staff/owner/admin shells, branded card component, scanner shell, form/error/loading/empty states, public cafe page, and clearly labelled development fixtures. Implement the field/action contracts in section 25 rather than inventing page content.

Acceptance: core screens work at 360 px/mobile and desktop; keyboard navigation and English layouts are usable; primary flows are represented without pretending fixture actions persist. Required fields, validation, conditional controls, and role restrictions match section 25.

### Phase 2 — Authentication, tenancy, onboarding, and staff permissions

Deliver: verified customer/owner login, callbacks, MFA for privileged roles, business creation, branch records, staff invitations, role assignments, membership join, scoped contacts/consent, RLS and storage policies, seed data, and access-control tests. Translate the data model in section 24 into versioned SQL migrations with constraints, indexes, generated types, and tested policies.

Caching work: add protected-route no-store behavior, safe public projection, versioned media paths, and cross-user cache-isolation tests before using authenticated production data.

Acceptance: a customer can join two cafes but each owner sees only their own relationship; cashier branch restrictions and revoked-role access are enforced at RPC/database boundaries, not just UI.

### Phase 3 — Transactional loyalty and redemption

Deliver: programme/reward versions, immutable ledger, balances, QR handles/scanner, purchase previews and commits, idempotency, customer activity, redemption intents/finalization, full reversals, audited adjustments, and outbox events.

Caching work: mutations remain uncached and authoritative. Return fresh committed results to the acting client; do not enqueue report refreshes. Preserve transactional outbox events for agreed business operations.

Acceptance: end-to-end earn/redeem works with real persistence; concurrent/replayed requests cannot double-award or double-redeem; refund-after-spend has defined behavior; customer balances reconcile to the ledger.

### Phase 4 — Double-stamp slots and referral rewards

Deliver: owner promotion calendar/editor, non-overlap checks, timezone-based multiplier application, cap counters, promotion history; referral code/share flow, auth callback attribution, qualified purchase rewards, caps, fraud review signals, reversal handling, and customer referral status.

Acceptance: scheduled bonus is calculated automatically by the server; overlapping slots cannot multiply unexpectedly; first qualifying purchase rewards each referral party once; refunds reverse the correct bonuses; all edge-case tests in sections 8–9 pass.

### Phase 5 — PWA, push campaigns, offers, and automations

Deliver: manifest/icons/service worker, safe caching, install guidance, supported-browser checks, device subscriptions, per-business preferences, offer inbox/claims, campaign composer/audiences/scheduling, worker/outbox processing, quiet hours, caps, and reward/inactivity/birthday automations.

Caching work: implement the static/offline allowlist, service-worker update behavior, bounded user-scoped optional card snapshots, and logout/account-switch cleanup from section 26.

Acceptance: supported devices can receive and open a real staging notification with credentials configured; declined permission leaves loyalty usable; no cross-user token leakage; canceled/expired/unsubscribed sends are suppressed; campaign metrics distinguish acceptance from display/clicks.

### Phase 6 — Manual WhatsApp follow-ups

Deliver: templates, task generation from eligible members, assignments, correct number formatting/URL encoding, message preview, open/mark-sent/skip actions, consent checks, contact permissions, and opt-out handling.

Acceptance: link opens the intended chat with the right text; the app never sends automatically; reports never treat an opened link as a confirmed message; staff without contact permissions cannot extract numbers.

### Phase 7 — Owner reporting and operational dashboards

Deliver: overview, repeat-member and sales metrics, reward usage/cost fields, referral funnel, double-slot analysis, campaign/WhatsApp results, staff activity, filters, pagination, accessible charts, CSV exports, and reconciliation queries.

Reporting work: implement indexed, permission-scoped database queries with section 26's date limits, pagination, timeout, Updated timestamp, Refresh action, and loading/error states. No persistent report cache or report-refresh jobs.

Acceptance: metrics match hand-calculated fixture cases, including reversals, two-device push sends, capped/refunded referrals, no-data ranges, and business timezone boundaries. Reports do not claim whole-restaurant revenue or causal campaign uplift.

### Phase 8 — SaaS billing, administration, privacy, and deployment

Deliver: configurable plans/entitlements, invoices, verified manual payment reconciliation, subscription lifecycle, admin tenant/job tools, audit support workflow, account export/deletion, retention jobs, Vercel web configuration and a separate worker container, monitoring, backup/restore runbook, and CI.

Acceptance: payment screenshots alone cannot activate subscriptions; customer balances survive subscription changes; admin actions are audited; staging deployment and a backup restore rehearsal succeed; no secret leakage in bundles/logs.

### Phase 9 — Hardening and pilot launch readiness

Deliver: complete end-to-end test run, security matrix evidence, real-device checklist, accessibility/performance checks, worker recovery drills, dependency/license check, staff training guide, owner onboarding guide, QR print assets, pilot metrics dashboard, and launch checklist.

Caching/reporting work: verify section 26's public expiry, private no-store, cross-user isolation, direct-report correctness, permission revocation, and logout behavior. Measure report queries and checkout under campaign traffic.

Acceptance: all mandatory features work with persisted data; critical/high security defects and value-accounting defects are resolved; pending external-device/provider checks are explicitly identified. Pilot with three to five cafes; improve checkout and signup friction before wider rollout.

## 22. Definition of done and final coding-agent handoff

The product is ready for the agreed pilot only when:

- Every launch feature is backed by real database operations and correctly scoped access.
- Referrals, double-stamp slots, and owner reporting are implemented and tested.
- Value-changing operations are transactionally correct under retries, concurrency, reversals, and permission changes.
- Customer installation/consent flows work; manual WhatsApp limitations are honestly represented.
- English-only customer/staff mobile layouts are usable, with the defined fields/actions and no unwanted language selector.
- Monitoring, backup recovery, migration, and incident runbooks exist.
- Deployment/provider configuration and real-device verification are documented accurately.
- Section 26's public-cache expiry, private-data isolation, and direct-report correctness checks pass. Checkout remains authoritative; no Redis or persistent report cache is required.
- There are no production secrets, fabricated business facts, misleading analytics, or hidden mock success paths.

Final handoff must include README setup commands, env variable descriptions, migration/seed instructions, exact versions, architecture decisions, a role/permission matrix, meaningful test results, real-device evidence, operational runbooks, and any unresolved launch requirements.

The most important product acceptance scenario is:

> A customer joins Cafe A through a referral, makes a qualifying purchase during a double-stamp slot, receives the correct base and promotional units, and both referral parties receive their configured bonuses once. The owner sees those events correctly in reports. The customer later redeems a reward through staff confirmation. A subsequent purchase reversal produces the documented compensating ledger entries. A Cafe B owner cannot access any of these records. Campaign push uses Cafe A consent only, and a WhatsApp follow-up still requires a staff member to press Send.

## 23. Official implementation references

Verify documentation against installed versions before copying APIs. These references inform platform behavior; all product-specific defaults and formulas in this brief are proposed implementation decisions.

- [Next.js PWA implementation](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [Supabase SSR authentication](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database functions and function security](https://supabase.com/docs/guides/database/functions)
- [Firebase web messaging setup](https://firebase.google.com/docs/cloud-messaging/web/get-started)
- [Firebase background message handling](https://firebase.google.com/docs/cloud-messaging/web/receive-messages)
- [Firebase pricing](https://firebase.google.com/pricing)
- [Apple Home Screen web push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [WhatsApp click-to-chat](https://faq.whatsapp.com/5913398998672934)
- [Web geolocation specification](https://www.w3.org/TR/geolocation/)
- [Google incentivized-review policy](https://support.google.com/contributionpolicy/answer/16597558)
- [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [Content Security Policy reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)
- [pg-boss PostgreSQL job queue](https://github.com/timgit/pg-boss)

## 24. Field-level database blueprint

This is the required logical/physical model for launch, not executable SQL or an assertion that migrations have been validated. The coding agent must turn it into migration SQL, indexes, policies, transactional functions, generated TypeScript types, and integration tests. Reasonable index or internal join-table refinements are allowed; changing customer fields, financial semantics, or tenant boundaries requires an explicit documented decision.

### 24.1 Schema notation and universal rules

- `uuid`, `text`, `integer`, `bigint`, `boolean`, `date`, `time`, `timestamptz`, and `jsonb` refer to PostgreSQL types. `?` means nullable; all other listed fields are NOT NULL. `= value` denotes a default.
- Unless a table explicitly specifies another primary key, it has `id uuid PK default gen_random_uuid()` and `created_at timestamptz = now()`. Mutable configuration/status rows additionally have `updated_at timestamptz = now()` and `row_version integer = 1` for optimistic edits. Immutable versions/events do not have editable updated_at.
- Every tenant-owned table includes `business_id uuid -> businesses.id`. Add `UNIQUE(business_id, id)` on tenant entities referenced through composite foreign keys. All tenant children refer to both business_id and parent ID, not parent ID alone.
- Fields identified as enum use CHECK-constrained text or PostgreSQL enum with generated TS unions. The exact values listed below are the API contract; do not invent free-form statuses.
- Monetary columns ending `_paisa` use bigint, bounds checked to the supported range. Request/JSON contracts transmit monetary/unit quantities as decimal integer strings with no precision loss; counts/percentages within their small bounds use integers. Initial maximum per bill: Rs 1,000,000 (100,000,000 paisa), configurable only through audited platform settings.
- All event times are server-assigned unless the field is an explicit future schedule. Local schedule dates/times are interpreted with the stored IANA timezone. Birthdays are month/day integers with real-calendar validation and no year.
- Foreign-key deletion uses RESTRICT for business/membership/history references. Account erasure pseudonymizes retained data through a controlled workflow, not broad cascading deletion of loyalty history.
- Server-generated immutable values, actor IDs, tenant ownership, balances, verification flags, and reconciled payment state are never trusted from forms. Clients may send business/branch selectors, which the server authorizes before use.
- Unless explicitly specified otherwise, actor/customer/staff user fields reference profiles.user_id; business staff-assignment fields reference same-tenant business_users.id. Platform tables (profiles, plans, plan_versions, platform_admins, push_devices, rate_limit_buckets, provider configuration) do not acquire an invented business_id. Nullable business_id is allowed only where explicitly listed. Required content/status checks apply in SQL, not just forms.
- IDs/token hashes are not secrets by themselves, but raw single-use tokens are. Use a cryptographic random token, hash for lookup, and enforce expiry/consumption. Do not put customer PII into a QR.
- Financial writes always use the transactional functions described earlier. A raw balance/ledger insert endpoint must not exist.

### 24.2 Identity, business, branches, and access

| Table | Product columns beyond common fields | Constraints / ownership |
|---|---|---|
| profiles | `user_id uuid PK`, `auth_user_id uuid? UNIQUE -> auth.users.id ON DELETE SET NULL`, `display_name text`, `preferred_timezone text = 'Asia/Karachi'`, `birthday_month integer?`, `birthday_day integer?`, `birthday_changed_at timestamptz?`, `deletion_requested_at timestamptz?`, `anonymized_at timestamptz?` | No extra id PK; user_id initially equals verified auth user UUID and remains as a retained tombstone identifier after erasure. Resolve live identity via auth_user_id; null means no login rights. Name 1–80 characters. Month/day both null or a valid pair. Private customer profile; no global merchant reads. Auth provider owns email and MFA, not editable mirrors here. |
| businesses | `slug text`, `display_name text`, `description text?`, `status enum{draft,active,paused,archived} = draft`, `timezone text = 'Asia/Karachi'`, `currency text = 'PKR'`, `logo_asset_id uuid?`, `cover_asset_id uuid?`, `accent_hex text = '#166534'`, `public_contact_phone text?`, `support_email text?`, `menu_url text?`, `review_url text?`, `published_at timestamptz?`, `created_by uuid -> profiles.user_id` | Slug unique case-insensitively, 3–50 lowercase letters/digits/hyphens with reserved-word blocklist. Name 2–80, description <=500. PKR only at launch. Public fields exposed by safe view; creator is not an authorization shortcut. |
| branches | `business_id`, `name text`, `address text`, `city text`, `area text?`, `maps_url text?`, `phone text?`, `status enum{active,inactive}=active` | Name 2–80; address 5–300; city 2–80; area <=80. Same timezone as business at launch. Do not store background customer location. |
| branch_hours | `business_id`, `branch_id uuid`, `weekday integer`, `opens_at time`, `closes_at time` | Weekday ISO 1–7. Each row is an opening interval with opens_at < closes_at; no row means closed. Multiple same-day intervals permitted but cannot overlap. Overnight hours split explicitly. |
| business_users | `business_id`, `user_id uuid -> profiles.user_id`, `staff_display_name text`, `staff_email text`, `role enum{owner,manager,cashier}`, `status enum{active,revoked}=active`, `can_manage_campaigns boolean=false`, `can_contact_customers boolean=false`, `can_reverse_transactions boolean=false`, `can_export_reports boolean=false` | Staff name/email captured from verified acceptance/bootstrap identity for this business, not unrestricted reads of global profiles/Auth. UNIQUE(business_id,user_id). Exactly one active owner for a non-archived business through bootstrap/transfer RPC, with a partial unique index preventing two. Archival may revoke the final owner through the audited operator workflow. Owners have full business rights; manager flags only add rights within assigned branches. Flags cannot give cashier an owner capability. |
| branch_assignments | `business_id`, `business_user_id uuid`, `branch_id uuid` | Composite PK(business_id,business_user_id,branch_id), no extra id. Owner sees all branches; manager/cashier require assignment. |
| staff_invitations | `business_id`, `email text`, `role enum{manager,cashier}`, `token_hash text`, `expires_at timestamptz`, `status enum{pending,accepted,revoked,expired}=pending`, `invited_by uuid`, `accepted_by uuid?`, `accepted_at timestamptz?`, `can_manage_campaigns boolean=false`, `can_contact_customers boolean=false`, `can_reverse_transactions boolean=false`, `can_export_reports boolean=false` | Token hash unique. Only verified matching-email account accepts. Initial expiry 72 hours. One pending invite per normalized email/business. Never grant platform admin here. |
| invitation_branches | `business_id`, `invitation_id uuid`, `branch_id uuid` | Composite PK, scoped FKs; transferred to assignments atomically on acceptance. |
| media_assets | `business_id`, `storage_path text`, `kind enum{logo,cover,offer,payment_proof}`, `mime_type text`, `bytes bigint`, `width integer?`, `height integer?`, `uploaded_by uuid`, `validation_status enum{pending,accepted,rejected}`, `visibility enum{public_brand,private}` | Unique storage path. Payment evidence always private. Business assets cannot reference another business's files. Publication requires accepted asset. |

Campaign images use the `offer` media kind at launch; a campaign does not introduce a different upload security policy. Default upload limit: 5 MiB; accept JPEG/PNG/WebP, decode and re-encode, reject excessive dimensions/decompression ratios (initial maximum 20 megapixels), and generate appropriately sized public renditions. Upload bytes directly to private Supabase quarantine under a server-authorized tenant/path grant; the Vercel route issues metadata/grants only. The worker validates/re-encodes before publishing accepted public assets at new paths. Proof images never enter public buckets; accepted private renditions are <=3 MiB for protected downloads. Unclaimed/rejected originals expire after 24 hours. UI states Uploading / Processing / Accepted / Rejected precede publication. Do not proxy the 5 MiB upload through Vercel's smaller function payload limit. [Vercel payload limits](https://vercel.com/docs/functions/limitations). Branding QR SVG/PDF files are server-generated assets, not arbitrary merchant-uploaded SVG/PDF content.

At onboarding Step 2 completion, bootstrap creates business, first owner, complete first branch, and selected trial subscription atomically. Step 1 is a browser-session draft, not a partially valid database business; a slug availability check is advisory until the transaction wins its unique constraint. Ownership transfer is excluded from self-service UI. Supply an operator runbook/transaction taking business, current owner, verified accepting replacement owner, and reason; validate active admin/MFA and change both assignments atomically without zero owners. Archiving a closed business may revoke its final owner after explicitly recording closure; history remains protected.

### 24.3 Memberships, customer contact, consent, and QR handles

| Table | Columns | Constraints / behavior |
|---|---|---|
| memberships | `business_id`, `customer_user_id uuid? -> profiles.user_id`, `display_name text`, `joined_at timestamptz=now()`, `joined_branch_id uuid?`, `status enum{active,left,suspended,anonymized}=active`, `left_at timestamptz?`, `last_qualifying_purchase_at timestamptz?` | UNIQUE(business_id,customer_user_id) for present users; retained membership reused on rejoin. User ID becomes null only through authorized anonymization. Last purchase time is a reconciled cache. |
| membership_contacts | `business_id`, `membership_id uuid PK`, `phone_e164 text?`, `phone_status enum{unverified,staff_confirmed}=unverified`, `phone_confirmed_at timestamptz?`, `phone_confirmed_by uuid?`, `shared_email text?`, `contact_changed_at timestamptz=now()` | One contact record per membership; hidden from ordinary cashier access. Shared email stored only with explicit disclosure to business, not copied automatically from Auth. Phone changes clear verification and revoke/reset WhatsApp consent. |
| consent_preferences | `business_id`, `membership_id uuid`, `channel enum{push,whatsapp,inbox}`, `purpose enum{marketing,reward_updates,birthday}`, `allowed boolean=false`, `text_version text`, `changed_at timestamptz`, `source enum{customer_settings,enrollment,staff_recorded_optout}` | UNIQUE(business_id,membership_id,channel,purpose). Only push/marketing, push/reward_updates, push/birthday, whatsapp/marketing, and inbox/birthday are valid pairs. Absence means deny. Staff may record denial only, not opt a customer in. WhatsApp launch marketing consent is required for any manual promotional follow-up. |
| consent_events | `business_id`, `membership_id uuid`, `channel enum{push,whatsapp,inbox}`, `purpose enum{marketing,reward_updates,birthday}`, `allowed boolean`, `text_version text`, `source enum{customer_settings,enrollment,staff_recorded_optout}`, `actor_user_id uuid?`, `occurred_at timestamptz=now()` | Append-only; the transactional preference update writes its matching event. |
| enrollment_acceptances | `business_id`, `membership_id uuid`, `programme_version_id uuid`, `platform_terms_document_id uuid`, `privacy_document_id uuid`, `accepted_at timestamptz`, `customer_user_id uuid?` | Initial programme/platform notices accepted explicitly; separate from optional marketing consent. Minimal retained proof after anonymization. |
| membership_handles | `business_id`, `membership_id uuid`, `handle_hash text`, `handle_ciphertext text`, `encryption_key_id text`, `status enum{active,revoked}`, `revoked_at timestamptz?` | Stable high-entropy earning handle; raw value delivered only to its owner over authenticated HTTPS. Server encryption allows redisplay across the owner's devices. Partial unique active handle per membership. Never authenticate/redemption-authorize with it. |
| scanner_codes | `business_id`, `membership_id uuid`, `code_hash text`, `expires_at timestamptz`, `consumed_at timestamptz?`, `purpose enum{membership_lookup,redemption_lookup,offer_lookup}`, `redemption_intent_id uuid?`, `offer_claim_intent_id uuid?` | Unique hash, human-enterable random code, default 8 unambiguous characters. Membership lookup expires in five minutes; intent lookup expires at the earlier of five minutes or parent intent expiry. CHECK purpose against exactly the relevant parent FK. Staff-scoped/rate-limited; consumes lookup code, not loyalty units. |

Birthday value remains private in profiles. Owner reports never expose full birthdays; a privileged system job evaluates explicit business birthday consent and creates an offer. Joining a cafe does not automatically share the auth email, phone, birthday, or visits elsewhere.

Encrypted handles/push tokens use authenticated encryption through a maintained implementation or managed key service, with key IDs for rotation and server-only keys. Do not invent a cipher. Decrypt only at the authenticated owner-display/provider-send boundary and never log plaintext. A rotating/compromised handle revokes the old active row and issues a replacement without changing membership history.

### 24.4 Loyalty and immutable financial records

| Table | Columns | Constraints / behavior |
|---|---|---|
| loyalty_programmes | `business_id`, `type enum{stamps,points}`, `status enum{draft,published,paused}`, `name text` | One programme per business at launch; mode locked after first ledger activity. |
| programme_versions | `business_id`, `programme_id uuid`, `version integer`, `status enum{draft,published}=draft`, `effective_at timestamptz`, `published_at timestamptz?`, `minimum_spend_paisa bigint=0`, `stamps_per_purchase integer?`, `spend_step_paisa bigint?`, `units_per_step integer?`, `max_base_units_per_purchase integer=1000`, `terms text`, `created_by uuid` | Separate UNIQUE(programme_id,version) and published UNIQUE(programme_id,effective_at). Only published versions are eligible for calculations. Type-specific values required and other-mode fields null. Stamps 1–10, points units 1–1000, spend step >=100 paisa, cap 1–100000 and >=configured stamp award. Terms 10–3000. Immutable after publishing. |
| rewards | `business_id`, `programme_id uuid`, `name text`, `status enum{draft,published}`, `published_version_id uuid?`, `draft_version_id uuid?` | Both pointers reference versions of this same reward/business. Published status requires a published_version_id; publishing is atomic. Published rewards cannot be retired or economically edited at launch. |
| reward_versions | `business_id`, `reward_id uuid`, `version integer`, `unit_cost integer`, `title text`, `description text`, `terms text`, `estimated_cost_paisa bigint?`, `created_by uuid` | unit_cost 1–1,000,000; title 2–80, description <=500, terms 10–2000. UNIQUE(reward_id,version). Cost is optional merchant estimate, not retail price. |
| reward_branches | `business_id`, `reward_version_id uuid`, `branch_id uuid` | Composite PK; editor selects explicit branches. |
| balances | `business_id`, `membership_id uuid PK`, `units bigint=0`, `ledger_version bigint=0` | Negative units allowed only via valid compensating adjustments; no browser writes. |
| purchases | `business_id`, `branch_id uuid`, `membership_id uuid`, `programme_version_id uuid`, `recorded_bill_paisa bigint`, `eligible_spend_paisa bigint`, `base_units integer`, `promotion_bonus_units integer=0`, `promotion_version_id uuid?`, `receipt_reference text?`, `qualifying_purchase_confirmed boolean=false`, `qualifies_for_loyalty boolean`, `offer_eligible_before_discount_paisa bigint?`, `applied_discount_paisa bigint?`, `primary_offer_claim_id uuid?`, `status enum{committed,reversed}=committed`, `occurred_at timestamptz`, `staff_user_id uuid`, `idempotency_key text`, `request_hash text`, `corrects_purchase_id uuid?` | eligible <= bill, both within bounds; awards computed server-side. Receipt <=80, optional. Key unique per business/operation. Corrected purchase must reference a reversed purchase of the same business/member/branch; at most one direct correction per original. Reversing the correction permits another linked correction, preserving the chain. Section 7 defines the discount/qualification fields. |
| purchase_reversals | `business_id`, `purchase_id uuid`, `reason text`, `actor_user_id uuid`, `reversed_at timestamptz`, `idempotency_key text` | UNIQUE(business_id,purchase_id). Reason 10–500. Original purchase retained. |
| redemption_intents | `business_id`, `membership_id uuid`, `reward_version_id uuid`, `token_hash text`, `expires_at timestamptz`, `consumed_at timestamptz?`, `canceled_at timestamptz?`, `created_by uuid` | token_hash unique. One active intent per member/reward by transactional creation; expired status derived from time, never use now() in a partial-index predicate. |
| redemptions | `business_id`, `membership_id uuid`, `reward_version_id uuid`, `intent_id uuid`, `branch_id uuid`, `unit_cost integer`, `estimated_cost_paisa bigint?`, `status enum{fulfilled,reversed}=fulfilled`, `fulfilled_at timestamptz`, `fulfilled_by uuid`, `purchase_id uuid?`, `idempotency_key text` | intent_id unique. Cost snapshotted; physical fulfillment confirmed by staff. Associated purchase must match membership/business/branch. |
| redemption_reversals | `business_id`, `redemption_id uuid`, `reason text`, `actor_user_id uuid`, `reversed_at timestamptz`, `idempotency_key text` | Unique redemption reference; only for documented non-fulfillment, not an automatic consequence of a purchase refund. |
| adjustments | `business_id`, `membership_id uuid`, `units bigint`, `reason text`, `actor_user_id uuid`, `idempotency_key text` | Nonzero signed units; owner-only at launch. Bounds and >=1000-unit fresh-reauth threshold are fixed by section 7; ordinary adjustments cannot introduce debt. No editable arbitrary balance field. |
| ledger_entries | `business_id`, `membership_id uuid`, `entry_kind enum{purchase_base,promotion_bonus,referral_bonus,redemption,adjustment,reversal}`, `units bigint`, `purchase_id uuid?`, `redemption_id uuid?`, `referral_claim_id uuid?`, `adjustment_id uuid?`, `reverses_entry_id uuid?`, `purchase_reversal_id uuid?`, `redemption_reversal_id uuid?`, `occurred_at timestamptz`, `actor_user_id uuid?` | Typed same-tenant FKs and CHECKs for each entry kind; nonzero units. Every reversal targets one original entry, with UNIQUE(reverses_entry_id). Original source entries unique by source + kind + member. No unchecked polymorphic source IDs. |

Ledger kind rules: purchase_base/promotion_bonus reference their purchase; referral_bonus references claim and qualifying purchase; redemption references redemption; adjustment references adjustment. Reversal references the original entry and its authorized reversal operation. SQL functions enforce exact opposite units, source membership, and same business. Source-reference CHECKs must prohibit irrelevant/fabricated combinations; add uniqueness so one qualifying referral cannot credit the same party twice.

### 24.5 Promotions and referrals

| Table | Columns | Constraints / behavior |
|---|---|---|
| earning_promotions | `business_id`, `name text`, `status enum{draft,enabled,paused,ended}`, `current_version_id uuid?`, `created_by uuid` | Editable container; version history immutable. |
| promotion_versions | `business_id`, `promotion_id uuid`, `version integer`, `starts_on date`, `ends_on date`, `weekdays integer[]`, `starts_at time`, `ends_at time`, `timezone text`, `multiplier integer=2`, `minimum_spend_paisa bigint=0`, `member_daily_cap integer?`, `max_bonus_units_per_purchase integer=1000`, `effective_at timestamptz` | Dates inclusive, ends_on >= starts_on, window <=366 days at launch, nonempty unique ISO weekdays, same-day start<end. UNIQUE(promotion_id,version); bonus cap 1–100000. Multiplier CHECK=2. member_daily_cap null means no per-day cap; otherwise 1–100. Earlier generic per-member cap means this explicit per-local-day cap. |
| promotion_branches | `business_id`, `promotion_version_id uuid`, `branch_id uuid` | Composite PK; overlap validation serializes edits per business and checks intersecting dates/weekdays/times/branches. |
| promotion_usage | `business_id`, `promotion_version_id uuid`, `membership_id uuid`, `purchase_id uuid`, `local_date date`, `bonus_units integer`, `reversed_at timestamptz?` | UNIQUE(purchase_id), FK purchase. One usage per purchase; cap counter or locked parent record prevents races. A full reversal releases that purchase's cap use, recorded once. |
| referral_rule_versions | `business_id`, `version integer`, `effective_at timestamptz`, `enabled boolean=true`, `inviter_bonus_units integer`, `friend_bonus_units integer`, `minimum_spend_paisa bigint`, `monthly_inviter_cap integer=10`, `attribution_days integer=7`, `qualification_days integer=30`, `created_by uuid` | Bonuses 1–1000; monthly cap 1–1000; attribution 1–30; qualification 1–90. Immutable version captured when referral is enrolled. |
| referral_codes | `business_id`, `membership_id uuid`, `code text COLLATE "C"`, `active boolean=true` | Code is 16 random bytes encoded as 22-character canonical unpadded Base64URL, globally UNIQUE and case-sensitive; CHECK canonical alphabet/length, including final-character padding bits. Regenerate on collision. UNIQUE(business_id,membership_id) for active code via partial unique index. Public code does not expose PII. |
| referral_claims | `business_id`, `referrer_membership_id uuid`, `referred_membership_id uuid`, `code_id uuid`, `rule_version_id uuid`, `enrolled_at timestamptz`, `qualifies_until timestamptz`, `status enum{pending,qualified,expired,reversed}`, `qualifying_purchase_id uuid?`, `qualified_at timestamptz?`, `inviter_awarded_units integer=0`, `friend_awarded_units integer=0`, `inviter_suppression enum{none,monthly_cap,member_unavailable}=none`, `reversed_at timestamptz?` | UNIQUE(business_id,referred_membership_id), distinct parties, same-tenant FKs. A referred member with an existing historical membership cannot create a claim. |
| referral_cap_usage | `business_id`, `referrer_membership_id uuid`, `claim_id uuid`, `local_month date`, `reversed_at timestamptz?` | UNIQUE(claim_id). One row per inviter award; month = business-local first day. All inviters' monthly caps use one locked counter/aggregate transaction per member/month even across rule versions. Full reversal releases cap use, with history retained. |

Add promotion_versions.status enum{draft,published}=draft and published_at timestamptz?; require publication time when published, immutable thereafter. An enabled promotion selects its latest published version with effective_at <= the captured purchase time, never an unpublished draft or not-yet-effective version. A newly published future version does not replace today's active version early. current_version_id is a convenience reference, not the eligibility authority. Overlap validation considers each version's effective interval until the next published version plus its dates/weekdays/times/branches, serialized with competing publications. Rules apply across versions without resetting usage caps. Add UNIQUE(business_id,version) and UNIQUE(business_id,effective_at) to referral_rule_versions; Save new rules publishes immediately, with effective_at assigned by the database.

Attribution before enrollment uses an expiring signed cookie/server session keyed to business, containing code and attribution time only. A durable claim is created only with membership enrollment. Do not trust an editable client timestamp. A link visitor is an approximate analytics event, not a confirmed new customer.

### 24.6 Offers, campaigns, push, and automations

| Table | Columns | Constraints / behavior |
|---|---|---|
| offers | `business_id`, `kind enum{informational,discount,treat}`, `title text`, `description text`, `terms text`, `image_asset_id uuid?`, `starts_at timestamptz`, `expires_at timestamptz`, `status enum{draft,published,paused,expired}`, `audience enum{all_members,recipient_list}`, `is_automation_template boolean=false`, `source_template_id uuid?`, `generated_by_run_id uuid? UNIQUE`, `discount_percent integer?`, `minimum_spend_paisa bigint=0`, `max_discount_paisa bigint?`, `created_by uuid` | One English content variant; title 2–80, description 1–1000. starts_at < expires_at; claimable terms 10–2000, informational terms <=2000 and may be empty. Templates must be recipient_list; generated instances reference same-business template/run and cannot be templates. Discount percent 1–100 only for discount; monetary cap optional; description <=1000, terms <=2000. Loyalty app records benefit, not payment processing. Published/claimed economic terms cannot be edited in place; clone for material changes. |
| offer_branches | `business_id`, `offer_id uuid`, `branch_id uuid` | Composite PK; permissions constrain selectable branches. |
| offer_recipients | `business_id`, `offer_id uuid`, `membership_id uuid`, `valid_from timestamptz`, `valid_until timestamptz`, `automation_run_id uuid?` | UNIQUE(offer_id,membership_id). All-members offers do not require rows; recipient_list offers do. Birthday rows belong to the generated annual offer, not the reusable template. valid_from < valid_until and within the generated offer interval. |
| offer_claims | `business_id`, `offer_id uuid`, `membership_id uuid`, `campaign_id uuid?`, `automation_run_id uuid?`, `status enum{claimed,fulfilled,expired,voided}`, `claimed_at timestamptz`, `fulfilled_at timestamptz?`, `fulfilled_by uuid?`, `branch_id uuid?`, `purchase_id uuid?`, `void_reason text?`, `applied_discount_paisa bigint?`, `benefit_description text?` | UNIQUE(offer_id,membership_id); unique linked purchase when present at launch. Expiry evaluated again at fulfillment; same-tenant/member purchase references. Claim ID alone cannot authorize fulfillment. |
| offer_claim_intents | `business_id`, `offer_claim_id uuid`, `membership_id uuid`, `token_hash text`, `expires_at timestamptz`, `consumed_at timestamptz?`, `canceled_at timestamptz?`, `created_by uuid` | Unique token hash; default 120 seconds, no longer than claim validity. Claim/member match enforced. Creating replacement invalidates prior active intent atomically; fulfillment consumes once. |
| campaigns | `business_id`, `name text`, `status enum{draft,scheduled,processing,paused,canceled,completed,completed_with_errors,failed}`, `current_version_id uuid?`, `created_by uuid`, `scheduled_at timestamptz?`, `started_at timestamptz?`, `completed_at timestamptz?` | Name 2–100. Pausing stops new attempts, not already-delivered notifications. |
| campaign_versions | `business_id`, `campaign_id uuid`, `version integer`, `title text`, `body text`, `image_asset_id uuid?`, `destination enum{card,offer}`, `offer_id uuid?`, `audience enum{all_opted_in,inactive,reward_ready,near_reward}`, `inactive_days integer?`, `near_reward_units integer?`, `target_reward_version_id uuid?`, `timezone text`, `expires_at timestamptz` | Title 3–80, body 10–500 Unicode code points after trim; SQL CHECKs match API/UI. No HTML. Required conditional audience fields, units 1–1000/days 7–365. Near/reward-ready audiences require explicit reward version. Immutable when scheduled. |
| campaign_branches | `business_id`, `campaign_version_id uuid`, `branch_id uuid` | Composite PK; recorded branch affiliation only. |
| campaign_recipients | `business_id`, `campaign_id uuid`, `campaign_version_id uuid`, `membership_id uuid`, `status enum{pending,suppressed,processing,attempted,failed}`, `suppression_reason text?`, `snapshot_at timestamptz`, `observed_clicked_at timestamptz?` | UNIQUE(campaign_id,membership_id); content version must belong to campaign. |
| push_devices | `customer_user_id uuid -> profiles.user_id`, `installation_id uuid`, `binding_generation uuid`, `token_ciphertext text`, `encryption_key_id text`, `token_hash text`, `status enum{pending,active,revoked,invalid}`, `last_seen_at timestamptz`, `revoked_at timestamptz?`, `browser_label text?` | Platform-private table, not tenant-visible. token_hash UNIQUE; cryptographic server-side encryption for raw token. One active binding per installation; token ownership/rebind requires the foreground receipt challenge in section 10, not token shape or an editable installation UUID. |
| push_test_registrations | `business_id`, `business_user_id uuid`, `push_device_id uuid`, `active boolean=true` | Unique business/staff/device binding; device user must equal staff user. Only explicit test sends use it; customer campaigns still require separate valid membership and consent. Tests excluded from member campaign statistics. |
| delivery_attempts | `business_id`, `campaign_recipient_id uuid?`, `automation_run_id uuid?`, `push_device_id uuid`, `event_key text`, `attempt_number integer`, `state enum{pending,provider_accepted,failed,unknown}`, `provider_message_id text?`, `error_code text?`, `attempted_at timestamptz?` | Exactly one originating recipient/run. Unique origin/device/event/attempt. Never expose devices or provider tokens to cafe owners. |
| automation_rules | `business_id`, `kind enum{reward_available,inactivity,birthday}`, `enabled boolean=false`, `title_template text`, `body_template text`, `inactive_days integer?`, `reward_version_id uuid?`, `offer_id uuid?`, `birthday_validity_days integer?`, `version integer` | Title template 3–80, body template 10–500 Unicode code points; rendered text uses the same bounds. Invalid rendering is a terminal configuration error, not a transient retry or zero-recipient success. One rule of each kind per business. Birthday requires recipient-list offer template; inactivity optional offer; reward trigger requires reward. Version every semantic edit. |
| automation_runs | `business_id`, `rule_id uuid`, `rule_version integer`, `membership_id uuid`, `event_key text`, `state enum{pending,suppressed,processing,completed,failed}`, `scheduled_at timestamptz`, `expires_at timestamptz`, `suppression_reason text?`, `rendered_title text`, `rendered_body text`, `rule_snapshot jsonb`, `source_purchase_id uuid?`, `source_ledger_entry_id uuid?`, `birthday_year integer?` | UNIQUE(business_id,membership_id,event_key), independent of rule versions. Birthday also has partial UNIQUE(business_id,membership_id,birthday_year) when birthday_year is present. Same-tenant source FKs: inactivity source_purchase_id; reward crossing source_ledger_entry_id. Fields are immutable after job creation; use section 10 event semantics. |
| contact_frequency_reservations | `customer_user_id uuid`, `business_id uuid`, `event_key text`, `kind enum{marketing,reward_update}`, `business_window_start timestamptz`, `global_window_start timestamptz`, `reserved_at timestamptz`, `state enum{reserved,attempted,released}` | UNIQUE(customer_user_id,business_id,event_key). One reservation per logical event/customer, not per device. Locks enforce business and global weekly caps atomically. Terminal no-attempt failures may release reservations; provider-unknown attempts retain them. |

Campaign attribution: `purchases.primary_offer_claim_id uuid?` identifies at most one same-member fulfilled claim; add a reciprocal consistency check/transaction with offer_claims.purchase_id. A purchase can be associated with a benefit only at staff confirmation, not through arbitrary client query parameters. This is association, not proof of causality.

### 24.7 Manual messaging, billing, administration, and operational records

| Table | Columns | Constraints / behavior |
|---|---|---|
| whatsapp_templates | `business_id`, `name text`, `body text`, `version integer`, `active boolean=true`, `created_by uuid` | Name 2–80; body 10–1000 Unicode code points after trim, enforced in SQL/API/UI. Section 11's complete placeholder grammar/allowlist is validated on save. Versioned snapshot on tasks. |
| followup_batches | `business_id`, `name text`, `template_id uuid`, `template_version integer`, `offer_id uuid?`, `audience enum{selected_members,inactive,reward_ready}`, `inactive_days integer?`, `target_reward_version_id uuid?`, `created_by uuid` | Target reward required for reward-ready audience or reward_name placeholder; offer required for public_offer_url placeholder. Saved audience snapshot. Creating tasks never sends messages. |
| followup_tasks | `business_id`, `batch_id uuid`, `membership_id uuid`, `assigned_business_user_id uuid?`, `state enum{pending,assigned,opened,staff_marked_sent,skipped,opted_out}`, `rendered_body text`, `opened_at timestamptz?`, `marked_sent_at timestamptz?`, `marked_sent_by uuid?`, `skip_reason text?`, `last_contact_checked_at timestamptz?`, `contact_version_at_creation integer`, `lease_owner_business_user_id uuid?`, `lease_expires_at timestamptz?` | UNIQUE(batch_id,membership_id). Generate contact link just-in-time from current contact/consent; do not persist raw prefilled URL in analytics. Assignment change audited. A task open acquires a 5-minute renewable lease; a different staff user cannot open/mark it during that lease. Contact version changes make the task stale; skip/recreate, never silently retarget. |
| followup_events | `business_id`, `task_id uuid`, `action enum{assigned,opened,marked_sent,skipped,opted_out,reassigned}`, `actor_user_id uuid`, `occurred_at timestamptz`, `note text?` | Append-only; no delivery/read action values. |
| plans | `code text`, `name text`, `active boolean=true` | Platform-managed config; code unique, name 2–80. Public pricing reads only published active versions through a safe view. |
| plan_versions | `plan_id uuid`, `version integer`, `price_paisa bigint`, `billing_period enum{monthly,annual}`, `branch_limit integer`, `staff_limit integer`, `member_limit integer?`, `monthly_campaign_limit integer?`, `trial_days integer=14`, `status enum{draft,published}=draft`, `published_at timestamptz?` | UNIQUE(plan_id,version); positive price, positive explicit limits, trial 0–30. Blank optional limits mean plan-unlimited with system safeguards. Published version immutable; all advertised launch features included. |
| subscriptions | `business_id`, `plan_version_id uuid`, `status enum{trial,active,past_due,suspended,canceled}`, `period_start timestamptz`, `period_end timestamptz`, `grace_ends_at timestamptz?`, `billing_anchor_at timestamptz`, `canceled_at timestamptz?`, `cancel_at_period_end boolean=false` | One current subscription per business. Amount/entitlements snapshotted through plan version. |
| invoices | `business_id`, `subscription_id uuid`, `reference text`, `amount_paisa bigint`, `currency text='PKR'`, `period_start timestamptz`, `period_end timestamptz`, `due_at timestamptz`, `status enum{draft,issued,paid,void,overdue}`, `issued_at timestamptz?`, `paid_at timestamptz?` | Unique reference. Paid immutable except explicit audited correction workflow. Reject zero/negative billing periods and duplicate period invoices. |
| payment_submissions | `business_id`, `invoice_id uuid`, `claimed_amount_paisa bigint`, `method enum{bank_transfer,merchant_wallet}`, `claimed_reference text`, `proof_asset_id uuid?`, `submitted_by uuid`, `status enum{pending_review,accepted,rejected}`, `review_note text?` | Upload alone does not change invoice/subscription. Private asset FK, amount bounds. |
| payment_events | `business_id`, `invoice_id uuid`, `submission_id uuid?`, `verified_amount_paisa bigint`, `method enum{bank_transfer,merchant_wallet}`, `provider_or_bank text`, `external_reference text`, `verified_at timestamptz`, `verified_by uuid`, `event enum{confirmed,correction}`, `corrects_event_id uuid?`, `reason text?` | Confirmed references UNIQUE(method,provider_or_bank,external_reference) under normalized provider identifiers; UNIQUE(corrects_event_id) for corrections with required reason 10–500. One full invoice payment at launch, no partial allocation UI. Confirmed amount must match invoice; mismatch requires documented admin resolution, never silent extension. |
| platform_admins | `user_id uuid PK`, `active boolean`, `can_reconcile_billing boolean`, `can_manage_support boolean` | Privileged controlled provisioning only. Never self-signup/metadata elevation. |
| support_access_grants | `business_id`, `admin_user_id uuid`, `reason text`, `starts_at timestamptz`, `expires_at timestamptz`, `revoked_at timestamptz?`, `scope enum{configuration,transaction_support}` | Time-bounded, MFA gated, narrowly scoped and audited; does not grant bulk contact export. |
| privacy_requests | `customer_user_id uuid?`, `membership_id uuid?`, `business_id uuid?`, `kind enum{export,delete_membership,delete_account}`, `status enum{pending,processing,blocked,completed,failed}`, `requested_at timestamptz`, `completed_at timestamptz?`, `result_storage_path text?`, `result_expires_at timestamptz?`, `error_code text?`, `retained_categories jsonb` | Customer-owned or audited operator processing; private expiring export download. Section 17 defines owner-account blockers and retained profile/history handling. |
| audit_events | `business_id uuid?`, `actor_user_id uuid?`, `action text`, `target_type text`, `target_id uuid?`, `reason text?`, `safe_changes jsonb`, `correlation_id text`, `support_access_grant_id uuid?`, `occurred_at timestamptz` | Append-only platform/tenant scope, allowlisted redacted change schema; no tokens/contact-message blobs. |
| idempotency_records | `business_id`, `operation text`, `key text`, `request_hash text`, `actor_user_id uuid`, `result_type text`, `result_id uuid`, `safe_result jsonb`, `completed_at timestamptz` | UNIQUE(business_id,operation,key). Insert/complete this record inside the same transaction as the financial write; conflicts wait for the winner or roll back. Current authorization and initiating actor must still permit reading a replay result. safe_result contains no bearer secret; transaction uniqueness remains permanently on source records. |
| outbox_events | `business_id uuid?`, `event_type text`, `event_key text`, `schema_version integer`, `payload jsonb`, `state enum{pending,dispatched,failed}`, `dispatched_at timestamptz?` | UNIQUE(event_type,event_key), allowlisted versioned payload schemas; write in same transaction as source. |

pg-boss owns its own queue schema/migrations; do not recreate its internal tables manually. Use a separate platform configuration table for validated global numeric limits/retention defaults; constrain each supported key, type, and allowed range. Optional notes cannot become an arbitrary executable settings channel.

### 24.8 Required supporting records

These records implement already-required launch behavior; they are not optional infrastructure or reporting caches.

| Table | Required fields beyond common fields | Constraints / purpose |
|---|---|---|
| checkout_contexts | business_id, membership_id uuid, branch_id uuid, staff_user_id uuid, auth_session_id uuid, secret_hash text, purpose enum{purchase,redemption,offer}, redemption_intent_id uuid?, offer_claim_intent_id uuid?, expires_at timestamptz, consumed_at timestamptz? | Unique secret hash; purpose/parent CHECK; current permissions and exact auth session checked on use. Source relationships same tenant/member. Retain expired contexts 24h then remove. |
| push_registration_challenges | customer_user_id uuid, auth_session_id uuid, installation_id uuid, push_device_id uuid, nonce_hash text, expires_at timestamptz, consumed_at timestamptz? | Platform-private; at most one active challenge per installation/session, 5-minute expiry; only same-session acknowledgement activates binding. No customer/merchant reads of nonce hashes or other tokens. |
| rate_limit_buckets | subject_hash text, operation text, window_start timestamptz, window_seconds integer, count integer, expires_at timestamptz | Composite PK(subject_hash,operation,window_start), no extra id. Atomic increment-and-check; subjects derived server-side. No raw IP/email; no browser grants. |
| export_requests | business_id uuid?, requested_by uuid, kind enum{report,contacts,account}, filters jsonb, columns jsonb, status enum{pending,processing,completed,failed,expired}, expires_at timestamptz?, row_count integer?, error_code text? | Validated fixed filters/columns; account export has null business and a privacy request link. Recheck permissions at execution/download. |
| export_artifacts | export_request_id uuid, part_number integer, storage_path text, bytes bigint, mime_type text, expires_at timestamptz | UNIQUE(export_request_id,part_number); positive part number, bytes <=3 MiB; inherits protected request scope. No browser storage enumeration. |
| policy_documents | business_id uuid?, kind enum{platform_terms,privacy,push_marketing,push_reward,push_birthday,inbox_birthday,whatsapp_marketing}, version text, body text, published_at timestamptz? | Immutable published content; unique kind/version/scope, including explicit partial uniqueness for null business. Terms/privacy are platform scoped; per-business consent uses published platform wording with business identity rendered safely. |
| referral_visit_events | business_id, referral_code_id uuid, occurred_at timestamptz | Approximate raw link visits, no customer identity/IP. At most one event/code/browser/day via a bounded signed first-party cookie; links can be copied and counts are not unique people. Retain 90 days and expose only covered-period totals. |
| job_effect_receipts | business_id uuid?, handler_name text, event_key text, completed_at timestamptz, result_reference uuid? | UNIQUE(handler_name,event_key). Same transaction as a handler's DB side effect. Not a claim of exactly-once external sending. No secret/message payload. |
| operational_checks | name text PK, checked_at timestamptz, status enum{ok,degraded,failed,unknown}, safe_details jsonb | No extra id; allowlisted names worker_heartbeat, db_readiness, backup, restore_rehearsal, ledger_reconciliation. Worker/operator updates real evidence; null/missing means Unknown. |
| platform_settings | key text PK, value jsonb, updated_at timestamptz, updated_by uuid? | No extra id; no arbitrary keys/secrets. Allowlisted numeric limits in this brief, grace_days default7, retention settings, published brand/support configuration and canonical bank/provider identifiers. Only privileged audited updates; published pricing stays in plan_versions. |

Add privacy_requests.export_request_id uuid? -> export_requests.id and payment_events.idempotency_key text with business/operation uniqueness. consent_preferences.text_version and consent_events.text_version must resolve to an immutable policy document of the exact allowed channel/purpose; use document IDs internally if needed, preserving the displayed version. Fields in these supporting rows use the same actor/tenant FK, nullability, status, RLS, and immutability conventions as the rest of section 24. Platform-wide support tables have no browser grants; worker inserts also validate any business/parent pairing. Null-business export rows are account-owned, not globally readable.

### 24.9 Relationships and migration acceptance

Relationship summary: Auth user -> private profile -> many business memberships; business -> many branches/staff/memberships; programme -> many immutable versions/rewards; membership -> one balance and many ledger entries; purchase -> programme version and optional promotion version; referral claim -> two memberships and at most one qualifying purchase; redemption -> one intent/member/reward; campaign -> recipients -> device attempts; invoice -> reviewed submission -> verified payment event.

Migration order: identity/business -> branches/access -> memberships/consent -> programme/rewards -> promotions/referral rules -> purchase/redemption/claim records -> ledger/FKs -> communication -> billing/operations. Create circular-reference columns first and add validated FKs in a subsequent migration step. Never drop referential integrity merely to get a seed script working.

Before Phase 2/3 completion, produce a generated schema diagram, migration-to-brief checklist, and database tests proving nullability, ranges, uniqueness, tenant foreign keys, RLS, and financial source invariants. Reject invalid database writes even if the request did not pass through the UI. Final SQL remains the coding agent's deliverable, reviewed against this blueprint rather than guessed from screen designs.

## 25. Page-by-page UI field and action contracts

These specifications define product content; the agent should not invent extra inputs, dashboard metrics, or hidden workflows. The agent owns component composition, responsive implementation, testability, and small visual refinements. Maintain a screen-to-route-to-operation checklist during implementation. Every field below maps to section 24 directly or to a server-derived calculation. If a screen genuinely needs another stored field, update the schema contract and explain why before adding it.

### 25.1 Shared page conventions

- English-only UI and messages. No language selector, locale URL prefix, multilingual campaign inputs, or translation package.
- `R` means required; `O` means optional; `RO` means read-only/server-computed. Required fields have visible labels and associated errors, not placeholder-only labels. The bounds in section 24 apply server-side and client-side.
- Money input shows `Rs`, accepts at most two decimal places, converts to integer paisa on submission, and never stores a floating-point amount. Integer fields reject decimals.
- Dates display `12 Sep 2026`; time inputs use a consistent 12-hour presentation with AM/PM or explicit 24-hour helper. Always show `Asia/Karachi` or the actual business timezone beside schedules.
- Lists default to 25 rows, with 25/50/100 choices, server-side pagination, server-applied search, clear filters, and accurate total counts only when available. Do not download all customers to filter in the browser.
- Role restrictions hide unavailable actions for usability AND enforce them on the server. Disabled controls explain whether the reason is permission, invalid state, or incomplete data.
- Mutations have pending state, duplicate-click protection, useful error recovery, and success only after commit. Preserve user input after validation/network errors. Stale configuration edits use row_version and ask the user to reload/review differences.
- Confirm reversals, opt-outs, suspensions, and financial changes with a descriptive modal. Simple draft saves do not need repeated confirmation.
- All reports use Today / Last 7 days / Last 30 days / Custom, default Last 30 days including today; maximum request/export range 90 calendar days. Branch filters are restricted to permitted branches. Section 26 defines the common query behavior.
- No fabricated reviews or performance counters on public pages. No live controls backed by demo-only data outside demo mode.
- Back navigation preserves safe filter/form state, not redemption secrets in URLs. Page errors include retry/help where useful; empty tables explain how to create the first record.

### 25.2 Public website and account access

**P01 — Product landing page: `/`**

- Hero: concise loyalty proposition, screenshot/mockup explicitly labelled when illustrative, primary `Start your cafe trial`, secondary `See how it works`.
- Sections: customer scan/earn/redeem sequence; owner benefits; launch feature comparison; configurable pricing; FAQ explaining PWA installation and manual WhatsApp limitations.
- Pricing cards read published plan configuration, show PKR/billing period/limits, and include referrals, double slots, reporting, and manual WhatsApp. If prices are unconfigured, display `Contact us for pricing`, not invented rates.
- Header/footer: product wordmark, How it works, Features, Pricing anchors, `Business sign in`, support link, Privacy, Terms. No checkout/order-delivery navigation.
- `Start your cafe trial` enters `/auth/login?intent=business`; no account/business is created by GET.

**P02 — Cafe page: `/b/[slug]`**

- RO content: business logo/cover/name, description, reward headline, active programme type, next reward's unit requirement, qualifying-purchase terms, active public offers, branch names/addresses/hours.
- Primary button: `Join loyalty programme`; for existing member, `Open my card`. Secondary: `View menu`, `Directions`, optional `Contact cafe`. Omit unavailable links rather than empty buttons.
- Branch selector appears for multiple active branches; preserve chosen branch through enrollment. Single branch is preselected.
- Referral entry banner: `Join through a friend's referral. Your first qualifying purchase can earn [X] bonus stamps/points.` Link to terms; optional `Remove referral` before enrollment. Do not expose referrer's full name or phone.
- Published/active businesses only. Paused business shows factual participation status; old members retain the defined account/history access. Missing slug shows branded not-found, not another cafe's data.

**P03 — Login: `/auth/login`**

| Field/control | Requirement | Behavior |
|---|---|---|
| Email address | R for email method | Valid email, <=254 characters; no account-enumeration errors |
| Continue with Google | Alternative | Provider flow with safe callback/intent context |
| Send sign-in link | Primary email action | Rate-limited; display neutral confirmation and resend cooldown |
| Customer/business intent | RO context | Explains destination; cannot grant role |

- No password fields, mandatory phone OTP, or birthday on login. Magic link success does not silently opt the user into marketing.
- States: email sent, cooldown, provider unavailable, invalid/expired link, retry. In development, email testing uses local inbox/provider sandbox; production is not falsely marked configured.

**P04 — Auth callback, invitation acceptance, and MFA**

- `/auth/callback`: loading -> validated provider result -> allowlisted internal destination. Invalid/expired state has `Request a new link`. If no display name exists, show R name 1–80 and Save before entering the destination. Resolve business intent through P06; preserve validated join/invite context. Never accept an arbitrary external return URL.
- `/invite/[token]`: RO business name, inviter context, proposed role, permitted branches, expiry. Action `Accept invitation` requires the signed-in verified email to match; otherwise `Switch account`. Accept consumes token once. A role listed in query parameters does not override stored invitation.
- `/auth/mfa`: `Set up authenticator`, QR/manual setup key, R six-digit verification code, `Verify and continue`. Recovery flow follows provider capabilities and does not expose a bypass. MFA methods supported by the provider must be tested; no fake recovery codes.

**P05 — Enrollment: `/join/[slug]`**

| Field | Requirement/default | Mapping / rules |
|---|---|---|
| Display name | R; prefill profile name | memberships.display_name; 1–80 |
| Branch | R when business has >1; otherwise preset | joined_branch_id; active branches only |
| Share my email with this cafe | O; unchecked | If selected, disclose verified auth email to membership_contacts.shared_email |
| WhatsApp number | O; blank | phone_e164; helper `Only needed if you want WhatsApp follow-ups` |
| Receive WhatsApp offers from this cafe | O; unchecked | Enabled only with valid phone; explicit marketing consent |
| Programme terms acceptance | R; unchecked | enrollment_acceptances with actual version |

- Show programme/reward summary, subscription/pause access policy link, and qualifying referral rules above form. `Join and view my card` atomically enrolls and returns existing membership on duplicate submission. For a left membership, show `Rejoin programme` with the preserved balance/history and required current terms acceptance; hide new-contact/referral inputs and submit rejoin=true. Marketing stays off until changed in Preferences.
- No browser push prompt on initial page load. No required install, birthday, profile photo, gender, age, or location access.
- Account profile timezone/birthday can be configured later. A phone entered here remains unverified.

**P06 — Workspace selection: `/workspace`**

After login, preserve a valid join/invite destination first. Customer intent otherwise opens /app. Business intent opens this selector: list only the user's active businesses with name, role, and branch summary; actions Open dashboard for owner/manager or Open scanner for cashier. Show My loyalty cards, Create business, Sign out, and Admin only for verified platform admins. If no business exists, offer onboarding; do not invent an ownership role. A user can be both customer and business staff. Revoked memberships never appear as active workspaces.

**P07 — Policies: `/privacy`, `/terms`**

Public read-only pages render the configured published policy document, version, effective date, and support contact. No editor or invented legal claims. Enrollment links to the exact accepted versions; missing production terms/privacy blocks live enrollment and business publication while development uses visibly labelled draft fixtures.

### 25.3 Customer PWA screens

**C01 — Card collection: `/app`**

- Header: product name, account button. Bottom navigation: Cards / Offers / Referrals / Account.
- Each card tile: cafe logo/name, stamp or point progress, next reward title, `Reward available` badge only when server-eligible, last-updated indicator when offline. Action `Open card`.
- Optional search by own joined cafe names; no global customer/business marketplace search at launch.
- Empty state: `Your loyalty cards will appear here. Scan a cafe's QR code to join.` Explain camera/QR use without enrolling in random businesses.
- Install banner shown after first card: `Keep your cards handy` + platform-appropriate action, `Not now`. Suppress repeated nagging after dismissal.

**C02 — Card detail: `/app/cards/[membershipId]`**

- Top: cafe logo/name, branch context if relevant, large high-contrast personal earning QR and helper `Show this at checkout`.
- `Replace checkout QR` in the card safety menu requires online confirmation, rotates the earning handle, and explains that saved screenshots stop working.
- RO balance and progress text, reward title/cost, currently active double-slot banner with exact hours/branches, terms link, latest ten ledger activities with date/type/signed units.
- Buttons: `View rewards`, `Get checkout code` (one-time typed lookup fallback), `Refer a friend`, `Offer inbox`, `Notification preferences`.
- `Enable reward reminders` appears only when appropriate; button first explains browser consent/business purpose, then prompts on user action. Statuses: enabled, permission denied, unsupported, installation required on supported iPhone path.
- Negative balance copy: `An adjustment changed your balance to -4 stamps. New stamps will offset this before your next reward.` Link to transaction history; no misleading zero-clamp hiding debt.
- Cached state disables generating new redeem/lookup tokens and shows last-updated time; earning QR may remain visible under the offline policy.

**C03 — Rewards and redemption intent: `/app/cards/[membershipId]/rewards`**

- Reward tiles: title, description, required units, eligible branches, terms, availability. Button `Use this reward` only when online and currently sufficient.
- Intent screen: reward name, units to be used, short-lived QR/code, countdown, `Show this to staff`, `Cancel`. Display `No points deducted yet` until staff fulfillment commits.
- Success: redeemed timestamp, cafe/branch, debited units, new balance. Expired: `Code expired` + `Generate a new code` after revalidation. Insufficient/stale balance: show updated balance and return to rewards.
- UI never treats tapping Use as physical fulfillment. Generating a new intent invalidates the previous active intent for that member/reward.

**C04 — Offers: `/app/offers` and `/app/offers/[offerId]`**

- List filters: All my cafes / selected joined cafe; Active default. Tiles: image if available, cafe name, offer title, validity end, qualification summary.
- Detail: description, terms, dates/times/timezone, eligible branches, minimum spend, discount/cap or treat description. RO eligibility when recipient-restricted.
- Informational offer action `Open my card`; claimable offer action `Claim offer`. Claim confirmation does not mean fulfillment.
- Claimed view: `Show at checkout`, generate short-lived claim presentation intent, status/cancellation guidance. Staff must validate member, branch, dates, and purchase conditions to fulfill.
- Expired/paused/already fulfilled views are explicit. Never show another customer's birthday offer via guessed ID.

**C05 — Referrals: `/app/referrals`**

- R selector: one of customer's joined cafes, default current context/first card.
- RO reward explanation: inviter bonus, friend's bonus, minimum first qualifying spend, qualification deadline, inviter monthly cap and current usage, friend-benefit behavior when cap is reached.
- Controls: `Copy referral link`, `Share` (native Web Share when supported), fallback copy; no auto-send to contacts.
- Summary counters: referred signups, pending, qualified, earned inviter units, reversed/expired. Status list uses privacy-preserving labels and dates, not friends' email/phone/full profile.
- Disabled-programme state: explanation and no new referral-share CTA; historical results stay visible.

**C06 — Account: `/app/settings`**

| Field/control | Requirement | Behavior |
|---|---|---|
| Display name | R | Profile value; explicit choice to update own business display names, not silent bulk contact edits |
| Account email | RO | Provider-verified identity; changing requires provider-supported verified flow, not raw DB edit |
| Timezone | R, Asia/Karachi default | IANA selector for notification quiet hours |
| Birthday month/day | O, both blank by default | Valid pair; helper explains optional offers and edit limits |
| Save profile | Action | Does not subscribe any business to birthday marketing |
| Manage cafe preferences | Action | Opens per-business list |
| Download my data | Action | Reauth -> asynchronous private export with status |
| Delete my account | Action | Reauth + explicit confirmation + retention explanation |
| Keep my cards available offline | O, off | Browser-local opt-in under section 26 |
| Clear offline card data | Action | Removes only this installation's saved summaries |
| Sign out | Action | Clears user snapshots and unbinds device tokens |

- Birthday changes: allow once every 365 days after the first saved date; clearing is allowed for privacy, but re-adding does not reset the reward cooldown. Explain restrictions before Save.
- Data export/deletion status shows requested/completed dates, numbered export-part downloads when present, retained categories, and safe retry/help. A blocked owner deletion explains Contact support to resolve ownership; never offers a bypass. No public permanent download links.

**C07 — Per-cafe preferences: `/app/cards/[membershipId]/preferences`**

- RO cafe identity and membership join date.
- Toggles: `Promotional push notifications`, `Reward update notifications`, `Birthday offers`, and conditional `Birthday push notifications`. Birthday offers requires a saved date but not browser push support; it maps to inbox/birthday consent. Birthday push requires inbox/birthday consent plus push/birthday consent and browser permission for actual delivery. Enabling never shares the date with owners.
- Optional WhatsApp number, verification status RO, `Allow WhatsApp offers from this cafe`; phone change resets related consent and verification, requiring a fresh explicit opt-in.
- Optional `Share my verified email with this cafe`; show exact disclosed email and support clearing it.
- `Save preferences`, `Leave this loyalty programme`, and `Delete my data at this cafe`. Leave confirms retained balance/history and marketing opt-out. Delete additionally explains contact erasure and retained private history link, requires recent reauthentication, creates privacy_requests.delete_membership, and shows status. Rejoining restores the same membership without another referral reward.

### 25.4 Staff checkout screens

**S01 — Scan home: `/staff/[businessId]`**

- RO business/staff identity; R branch selector from authorized active branches, remembered per session and prominently displayed.
- Primary `Scan customer QR` starts camera; `Enter customer code` opens R 8-character input. No customer phone/email search by default.
- Navigation: Scan / Recent activity / Account. Staff with separate contact/campaign permission can navigate to that tool, not infer rights from having scan access.
- Camera failure states: permission denied with instructions, no camera, browser unavailable; code fallback remains online. Offline state disables award/redeem actions.

**S02 — Purchase form: `/staff/[businessId]/checkout`**

Entered only after an authorized membership lookup; no secret token in URL. Server-session/short-lived context selects the member and branch.

| Field | Requirement/default | Behavior |
|---|---|---|
| Customer/card | RO | Minimal display name, current units, cafe |
| Branch | RO with Change link | Change revalidates member/promotion/permissions |
| Bill total paid (Rs) | R, blank | recorded_bill_paisa, after discounts; label actual paid bill |
| Eligible spend (Rs) | R, blank | eligible_spend_paisa; excludes tax/tips/ineligible items, <= bill |
| Use bill amount | Explicit optional action | Copies bill after staff confirms entire amount is eligible; not automatic |
| Receipt reference | O, <=80 | Helpful for audit/dedup review; not mandatory POS integration |
| Qualifying purchase confirmed | R for stamp programme | Staff confirms programme terms; server still applies spend threshold |
| Associated claimed offer | O selector | Only this member's valid claims; revalidate branch/conditions |
| Eligible goods before this offer (Rs) | R only for discount claim | offer_eligible_before_discount_paisa; after other discounts, excluding tax/tips |
| Discount applied (Rs) | RO for discount | Server formula from section 7; staff confirms it was actually applied |

- Preview panel is server-derived: base units, double-slot bonus with promotion name, referral bonus for this customer, inviter credit summary without private details, resulting balance, and any exhausted cap.
- `Review purchase` -> confirmation sheet -> `Confirm and award`. A selected offer can be fulfilled atomically with purchase if its conditions are satisfied and the proper customer confirmation exists; no future unqualified claim attachment.
- The other action `Redeem a reward` opens S03 and is not an invisible side effect of entering a purchase. Confirmation shows all linked effects before commit.
- Selecting a claim also requires scanning its active customer intent before final confirmation; selecting a database ID alone is insufficient. Show the validated intent countdown and revalidate it in the purchase/claim transaction. Staff apply a discount in the cafe's existing checkout/payment process and enter the actual paid/eligible amounts here; this app does not alter a POS bill or charge a payment.
- Success provides receipt reference, units granted, balance, and `Scan next customer`; retain only an authorized recent transaction link.

**S03 — Reward/offer fulfillment: `/staff/[businessId]/redeem`**

- Inputs: scan active customer redemption/offer-claim intent OR R short code that resolves only to a still-active intent. RO customer, reward/offer, branch, expiry, current balance, and units to deduct if relevant.
- Reward button `Confirm reward given`; offer button `Confirm offer applied`. For spend-dependent offers, require a linked validated purchase through S02; a treat with no minimum can be fulfilled without a bill.
- Confirmation clearly states what physical benefit staff are giving and what digital balance changes. If conditions changed, require a fresh preview instead of honoring stale client values.
- Error states: wrong cafe/branch, expired, already consumed, insufficient units, unavailable offer, unauthorized staff, offline. Do not reveal membership details before scope validation.

**S04 — Recent activity and detail: `/staff/[businessId]/activity`, `/staff/[businessId]/transactions/[id]`**

- Filters: Today / Last 7 days / Last 30 days / Custom (default Last 30 days), assigned branch, type (purchase/redemption/reversal). Maximum 90 calendar days per request. Server-side pagination defaults to 25 rows, allows 25/50/100, and rejects page sizes above 100. Apply the same date-boundary validation as section 26. Cashier sees own permitted transactions; manager can see assigned-branch activity. Use stable ordering by occurred_at and ID so pagination is deterministic.
- Columns: time, receipt/reference, customer display name, type, recorded amount where applicable, signed units, status, staff.
- Detail: original inputs, immutable programme/promotion/referral effects, ledger entries, linked fulfillment, reversal history. No full contact details by default.
- `Reverse purchase` / `Undo unfulfilled redemption` shown only for permitted manager/owner, not already reversed; R reason 10–500 characters. Confirmation shows exact compensating units and affected referral parties using minimal identifiers. Network retries reuse idempotency key.

### 25.5 Owner onboarding and everyday operations

**O01 — Onboarding wizard: `/dashboard/onboarding`**

Step 1 Business: R published plan selection (prefill from pricing link, server verifies version/availability), trial duration/start explanation, R name, R slug with live availability check, O description, O logo/cover uploads, R accent color default platform green. Step 2 Branch: R name/address/city, O area/maps link/phone, opening-hour intervals. Step 3 Programme: R mode, R earning settings and terms (see O05). Step 4 Reward: R reward title/cost/terms/branches (O06). Step 5 Staff: optional invitation with email/role/branches (O16). Step 6 Preview/publish: RO card/QR/customer journey, completeness checklist, `Publish programme` and `Download QR stand`.

- Persist Step 1 in sessionStorage for this browser session; no auth secrets or personal customer data. Completing Step 2 atomically bootstraps the business/owner/branch/subscription and starts its trial; subsequent steps save authenticated database drafts. Before bootstrap, upload controls are disabled with Save branch details first; after Step 2, revisit branding to upload into the created tenant. Do not invent a temporary-owner upload model. Back retains values. Publish business/programme/reward pointers in one transaction after all required rows/assets/policies and entitlement checks pass. If no published plan exists, show configured Contact support; never invent a free subscription.
- Test transactions occur only in a labelled demo/sandbox environment; publishing must not carry fake customer transactions into real reports.

**O02 — Overview: `/dashboard/[businessId]`**

- Filters: common date range and permitted branch. Cards: New members, Purchasing members, Returning share, Recorded loyalty sales. Secondary row: rewards fulfilled, outstanding units, push-enabled members.
- Charts: daily recorded loyalty sales and qualifying purchase counts; referral and double-slot summaries link to detailed reports.
- Actions: `Open scanner`, `Create campaign`, `Schedule double stamps/points`, `Download signup QR`. Label matches current programme mode.
- Operational list: draft setup tasks, offers expiring within 48 hours, failed campaigns, invoice due, and reversal warnings (>=3 purchase reversals by a staff user in one business-local day). Warnings prompt review and never automatically punish staff or imply proven fraud. Show only real recorded issues within the viewer's scope.
- `Recorded loyalty sales` includes helper explaining it is not total restaurant revenue.

**O03 — Customer list: `/dashboard/[businessId]/customers`**

- Filters: search display name; membership status; activity (all/purchased/never purchased/inactive); branch; reward-ready; push/WhatsApp consent. Contact search only with contact permission, rate limits, and audit.
- Columns: name, join date, last qualifying purchase, current units, qualifying purchase count, recorded spend, contact-channel eligibility badges, membership status.
- Row actions: `View customer`; authorized `Create follow-up` only with consent/contact availability. Bulk action can create a draft follow-up batch, never sends messages.
- Contact export is separate elevated action, excluded by default; cashier cannot access this list merely through scan rights.

**O04 — Customer detail: `/dashboard/[businessId]/customers/[membershipId]`**

- Summary: business-shared display name, join branch/date, units, latest activity, next reward. Tabs: Transactions / Rewards / Referrals / Communication history.
- Contacts shown only with permission: disclosed email, WhatsApp number, phone verification status, channel consent and changed time. No global account email/birthday/competitor activity.
- Actions: `Create manual follow-up`, `Record WhatsApp opt-out`, optional `Confirm number from customer-initiated chat` (R attestation/reason). Staff cannot opt the customer in or silently replace the number.
- Owner-only `Adjust units`: R signed integer, R reason, RO resulting balance, reauth for high-value adjustment. No direct editable balance field. Membership suspend/reactivate uses clear reason/audit; do not call suspension deletion.
- List entry should show referral status/bonus amounts without expanding a friend's private contact profile.

**O05 — Programme settings: `/dashboard/[businessId]/programme`**

| Input | Requirement | Behavior |
|---|---|---|
| Programme name | R, 2–80 | Internal/customer label |
| Programme type | R, Stamps or Points | Locked after first ledger entry |
| Minimum eligible spend (Rs) | R, default 0 | Threshold for any earn |
| Stamps per qualifying purchase | R for stamps, default 1 | Integer 1–10 |
| Spend step (Rs) | R for points, default 100 | At least Rs 1 |
| Points per step | R for points, default 1 | Integer 1–1000 |
| Maximum base units per purchase | R, default 1000 | Bounded anti-mistake guard |
| Programme terms | R, 10–3000 | Customer-visible qualification details |
| Effective date/time | R for changed rules | Future/server-current activation; immutable history |

- Live preview: type in example eligible spend and see base earning with formula explanation. Server repeats calculation.
- Buttons `Save draft` before publish, `Publish new earning rules` for changes, and owner-only `Pause earning` / `Resume earning` with section 18's impact explanation. Change confirmation states future purchases only. No point-expiry or cross-business-transfer field.

**O06 — Rewards: `/dashboard/[businessId]/rewards`, `/dashboard/[businessId]/rewards/new`, `/dashboard/[businessId]/rewards/[id]`**

- List columns: title, required units, programme, eligible branches, publication status, fulfillment count. Actions View / Add reward / Edit draft; no destructive delete for referenced rewards.
- Editor: R title 2–80, R required units 1–1,000,000, O description <=500, R terms 10–2000, R eligible branches (>=1), O estimated fulfillment cost Rs (nonnegative, blank means unknown).
- Preview: customer reward tile and progress example. Buttons `Save draft`, `Publish reward`. Existing published economic terms are protected as described in section 7; edit UI must explain why unit cost cannot simply be increased.
- No field asking to sell/redeem units for cash.

**O07 — Double slots: `/dashboard/[businessId]/promotions` and `/promotions/[id]`**

List/calendar toggle with columns name, dates, weekdays, local times, branches, status, attributed purchases, bonus units. Actions `Create slot`, View, Pause/resume; version edits apply prospectively.

| Editor field | Requirement/default | Validation |
|---|---|---|
| Promotion name | R, 2–80 | Example placeholder `Afternoon double stamps` |
| Branches | R, >=1 | Authorized active branches |
| Start/end date | R | Inclusive date range, <=366 days |
| Weekdays | R, >=1 | ISO weekdays, selected explicitly |
| Start/end time | R | Same day, start < end; timezone RO |
| Multiplier | RO | 2x; no arbitrary stacking selector |
| Minimum eligible spend (Rs) | R, default 0 | In addition to programme threshold |
| Max uses per member per day | O | Blank = no per-day cap, otherwise 1–100 |
| Maximum bonus units per purchase | R, default 1000 | Integer 1–100000; capped 2x behavior explained |

- Summary sentence: `Double stamps on Tue–Thu, 3:00–6:00 pm, at Gulberg, from ... to ...`.
- Validate overlaps before enabling, showing exact conflicting slot/branch; DB still enforces serialization. Example purchase calculator shows base/bonus/total and cap effect.
- Buttons `Save draft`, `Enable slot`, `Pause`. Editing future dates/terms creates a version; no changes to historical awards.

**O08 — Referrals: `/dashboard/[businessId]/referrals`**

- Tabs Rules / Results. Rules fields: Enable referrals; R inviter bonus units, friend bonus units, minimum qualifying spend Rs; R inviter monthly cap default 10; R attribution days default 7; R qualification days default 30.
- RO explanatory rule: both users benefit after the first qualifying purchase; existing/self referrals excluded; friend benefit remains when inviter cap is reached; full reversal reverses both awards.
- `Save new rules` displays version/effective time and clarifies existing claims retain enrolled rules. `Pause new referrals` stops new claims; existing valid claims retain agreed eligibility unless a separately documented abuse action applies.
- Results: date/branch/status filters; counters signup claims/qualified/expired/reversed/inviter units/friend units; table enrollment date, privacy-limited parties, qualifying receipt, status, awarded units, suppression reason. Link to scoped transaction detail.
- No manual `Approve all referrals` shortcut that bypasses purchase qualification.

### 25.6 Owner communication and reports

**O09 — Campaign list: `/dashboard/[businessId]/campaigns`**

- Filters status/date/branch. Columns name, status, scheduled time/timezone, unique audience size, provider-accepted device sends, failures, observed clicks, fulfilled offer claims.
- Actions `Create campaign`, View report, Edit draft, Pause, Resume before expiry, Cancel, Duplicate. Duplicate creates a new draft; it does not immediately resend.
- A campaign with zero consent-eligible users displays zero and an explanation; do not substitute total members as reachable audience.

**O10 — Campaign editor: `/dashboard/[businessId]/campaigns/new` or `/campaigns/[id]/edit`**

| Field | Requirement | Behavior |
|---|---|---|
| Internal campaign name | R, 2–100 | Owner list label |
| Notification title | R, 3–80 | English text, no HTML; trimmed Unicode code-point count |
| Notification message | R, 10–500 | English text; trimmed Unicode code-point count visible; OS preview may truncate |
| Image | O | Validated campaign/offer image |
| Destination | R, My loyalty card / Offer | Offer selection required for Offer |
| Audience | R | All opted in / Inactive / Reward ready / Near reward |
| Inactive days | Conditional R | 7–365; default 30 |
| Target reward | Conditional R | Required for ready/near audiences |
| Units away from reward | Conditional R | 1–1000 for Near reward |
| Branches | R, >=1 | Recorded affiliation, explicit helper says not live location |
| Send time | R, Now / Schedule | Schedule requires future date/time; timezone shown |
| Stop sending after | R | Defaults no later than associated offer expiry; explicit for card-only messages |

- Preview panel: device notification and destination screen. Audience estimate: eligible members, subscribed devices, exclusions (consent/invalid token/cap/branch). Estimates marked estimates until snapshot.
- Read-only guardrails: quiet hours, per-cafe/platform caps, expiry handling. Campaign cannot silently bypass these through an advanced setting.
- Buttons `Save draft`, `Preview audience`, `Send test to my registered test device` (never customer list), `Review and schedule/send`. Confirmation shows business, audience, content, and time.
- `Register this browser as my test device` shows install/support/permission guidance, starts section 10's foreground challenge, and displays Pending / Registered / Failed with Retry/Remove device. Only the authenticated staff member's own device can register. Provider-accepted test means accepted, not delivered/read.

**O11 — Offer editor: `/dashboard/[businessId]/offers` and `/offers/[id]`**

- List: title, kind, validity, branches, status, claim/fulfillment count; actions create/view/edit draft/pause.
- Fields: R title 2–80, R kind Informational / Discount / Treat, R description 1–1000, R terms 10–2000 for claimable offers (optional <=2000 for informational), O image, R branches, R start/end date-time, R audience All members / Specific recipients, R minimum eligible spend default 0. Specific recipients requires an authorized member selector (maximum 1000 per offer); resolved recipient rows use offer validity. Birthday template creation from O12 sets recipient-list/template mode and hides manual member selection.
- Discount only: R percent 1–100, O max discount Rs; calculated estimate does not charge/refund money. Treat only: description must state the physical benefit. Informational only: no claim button.
- O12's Create birthday template opens this editor with is_automation_template=true. Templates are labelled Template, not publicly listed/claimable. Generated annual instances are read-only in the editor and cannot be manually reassigned. Owners never browse global birthdays.
- `Publish offer` validates future validity and branch scope. Published/claimed monetary/benefit terms cannot be quietly changed; use Duplicate.

**O12 — Automations: `/dashboard/[businessId]/automations`**

- Three cards: Reward available / Inactivity / Birthday. Each has Enabled toggle, last run, suppressed/failed count, and Configure.
- Reward settings: R target reward, R title/message with supported placeholders; trigger explanation and duplicate suppression shown.
- Inactivity settings: R days 7–365 default 30, O published offer, R title/message; RO rule `After last qualifying purchase; once until next purchase`.
- Birthday settings: R recipient-list treat/discount offer template, R validity days 1–30 default 7, R title/message; explicit customer inbox/birthday consent. Each eligible business/member/year gets a separate generated offer instance under section 10. Birthday validity uses the business timezone: [start of birthday, start + configured calendar days), bounded by template availability. Push uses the separate push/birthday preference.
- Shared: title/template 3–80 and body/template 10–500 Unicode code points after trim; enforce the same bounds on rendered preview/send text. Quiet-hour/cap policy displayed; `Preview sample`, `Save`, `Disable`. Never let owner toggle customer consent. Zero eligible recipients shows No eligible recipients, without an error or retry button for that successful scan.
- Automation run history: timestamp, kind, status, suppression/error summary; member detail only through normal scoped permission.

**O13 — WhatsApp templates and follow-up creation: `/dashboard/[businessId]/whatsapp/templates` and `/whatsapp/new`**

- Template editor: R name 2–80, R body 10–1000 Unicode code points after trim; live count and placeholder buttons First name / Cafe name / Reward name / Public offer link. Unknown/malformed tokens block Save with an inline field error using section 11's exact grammar. Rendered preview identifies missing values and overlength content before task generation.
- Batch form: R batch name, R template, R audience Selected members / Inactive / Reward ready, conditional days/member selector, target reward required for reward-ready audience or reward_name token, offer required for public_offer_url token (otherwise optional), O assigned permitted staff member. Show eligibility/validation exclusions explicitly; never silently truncate rendered text.
- Preview shows consent-eligible contacts, exclusions, recent-contact warnings, example rendered message, and total manual tasks. Button `Create follow-up tasks`, never `Send to all`.
- Per-business contact permission required for this page. Only owner/authorized manager can create/edit templates or execute assigned tasks; cashier assignment is rejected.

**O14 — WhatsApp task list: `/dashboard/[businessId]/whatsapp` and `/whatsapp/tasks/[id]`**

- Banner `Messages are sent manually. Open each chat, review the text, and press Send in the cafe's WhatsApp account.`
- Filters batch/status/assignee/date. Columns customer display name, reason/batch, assigned staff, last contact, status. Full phone visible only on authorized task detail; do not leak via page HTML for unauthorized roles.
- Detail: message preview, current consent, masked/full authorized number with verification status, recent communication history. Actions `Open WhatsApp`, `Mark as sent`, `Skip`, `Record opt-out`, permitted Reassign.
- Mark sent requires explicit human confirmation; can mark after already-sent manual work without pretending the app observed it. Skip has O reason; opt-out has R source/note and immediately suppresses pending tasks.
- Stale task/changed number/revoked consent blocks link generation; user is told to refresh or skip, not silently sent to old number.

**O15 — Reports: `/dashboard/[businessId]/reports`**

- Tabs Overview / Customers / Rewards / Referrals / Double slots / Campaigns / Staff.
- Shared filters date range, branch, optional programme/reward/promotion/campaign selector relevant to tab. Default Last 30 days; presets Today / Last 7 days / Last 30 days / Custom, maximum 90 days. Show Updated timestamp, metric definitions link, and Refresh action. Fetch only the active tab using section 26's direct-query and loading/error rules; disable Refresh while loading.
- Overview: daily net recorded sales and purchase count, new/purchasing/returning member counts, average recorded bill. Customers: repeat counts, never-purchased/inactive segments. Rewards: base/promotion/referral units, fulfilled rewards, reversals, outstanding units, estimated cost coverage.
- Referrals: enrolled/qualified/capped/expired/reversed claims and bonuses. Double slots: slot name/version, purchases, eligible spend, bonus units, reversals. Campaigns: unique audience vs device attempts vs clicks vs fulfilled claims/associated purchases. Staff: scoped purchases, awards, redemptions, reversals.
- Table values reconcile with section 14; unknown cost/zero-denominator is N/A, not fabricated zero. Manual WhatsApp has opened/staff-marked-sent metrics only.
- `Export CSV` opens confirmation of selected report/date/branch/columns. Default excludes PII. Contact export is owner/authorized elevated flow, separately audited with sanitized spreadsheet cells and private expiring download.

### 25.7 Owner staff, branches, settings, and billing

**O16 — Staff: `/dashboard/[businessId]/staff`**

- Active list columns name/email as staff identity, role, assigned branches, enabled manager permissions, status, last relevant activity. Pending invite list shows email, role, branches, expiry, status.
- Invite form: R email, R role Manager/Cashier, R branches >=1, manager-only permission toggles Campaign management / Customer follow-ups / Transaction reversals / Report exports, default off. Owner can grant only defined capabilities; cashier options cannot gain manager authority.
- Actions `Invite staff`, Resend pending invite (rate-limited), Revoke invite, Edit assignment, Revoke access. No owner self-demotion/delete or ownership transfer control at launch.
- Permission changes take effect on next server operation. Do not display a PIN shared by all employees.

**O17 — Branches: `/dashboard/[businessId]/branches` and `/branches/[id]`**

- Fields: R branch name/address/city, O area/maps HTTPS URL/phone, R status, weekly opening interval editor (day, closed toggle, opening/closing time, Add interval). Timezone inherited/RO.
- Show staff assignment count, programme/reward/promotion usage, and public page preview.
- `Save`, `Deactivate branch` with impact explanation. Prevent deactivating the only active branch while programme is publicly active without pausing enrollment first. Historical reports/ledger remain attached to the branch.
- Adding beyond plan limit routes to billing/contact; server rejects the extra branch even if UI is bypassed.

**O18 — Business branding/settings and QR assets: `/dashboard/[businessId]/settings`**

- Business fields: R display name, RO slug after publishing, O description/logo/cover, R accent color, O public phone/support email/menu URL/neutral review URL. No published-slug rename control.
- Currency PKR RO after setup. Timezone defaults Asia/Karachi; locked after live scheduled/financial activity.
- Consent/terms display: current versions and public previews, no custom executable HTML or scripts. Programme terms edited through Programme screen.
- QR section: branch selector, public destination preview, `Download PNG`, `Download printable PDF/SVG` as generated safe assets. Include cafe name, reward proposition, scan instructions, and readable short URL; never personal member QR/secret in signage.
- Review link, if present, is the same neutral request for all customers and never awards points.
- `Save settings` validates accepted image type and contrast; public page uses last valid published values. Owner-only `Pause participation` / `Resume participation` confirms section 18's access consequences. QR/NFC help states that a standard NFC tag may store the same public business/branch signup URL; no special NFC reader or hardware integration is required.

**O19 — Billing: `/dashboard/[businessId]/billing` and `/billing/invoices/[id]`**

- Current plan card: plan/version, monthly or annual price, subscription state, billing period, due/grace date, branch/staff/member/campaign usage and limits.
- Invoice table: reference, covered period, amount, due date, status, View/download. Payment instructions from real configured merchant/bank details; do not display invented account numbers.
- Submit evidence fields: R claimed amount, R method Bank transfer/Merchant wallet, R transfer reference, O proof file if accepted by operator. `Submit for review`; helper `Your plan updates after payment is verified`.
- Status pending review/accepted/rejected with reason. No paid success until verified payment event exists. A paid invoice is not user-editable.
- `Request plan change` can create a support request via configured support channel at launch; it does not silently alter entitlement or charge a card. `Cancel renewal` requires confirmation and states access/balance policy.

### 25.8 Platform administration screens

**A01 — Admin overview: `/admin`**

- MFA required. RO cards: active/trial/past-due businesses, reviewed/unreviewed invoices, job backlog/oldest job, recent failed campaigns, ledger reconciliation status, last successful backup/restore rehearsal.
- Counters are sourced from actual records/health checks. No unrestricted global customer list. Links Tenants / Billing / Plans / Jobs / Audit / Privacy requests.

**A02 — Tenants: `/admin/businesses` and `/admin/businesses/[id]`**

- Filters status/plan/subscription; columns business name/slug, owner business account, branches, subscription state, created date, operational flags.
- Detail: configuration/usage/invoices and limited operational history. Actions Pause publishing/Resume, Change permitted plan after billing verification, Suspend with R reason and displayed customer-access consequences.
- `Start support session`: R reason 10–500, R scope Configuration/Transaction support, R duration 15/30/60 minutes; MFA/permission checked and grant recorded. Do not silently impersonate customer/owner or expose contact exports.

**A03 — Plans: `/admin/plans`**

- Fields: R code/name, R billing interval Monthly/Annual, R price Rs >0, R branch/staff limits, O member/monthly campaign limits (blank explicitly unlimited by plan), R trial days 0–30 default14, R active flag. Limits are validated positive integers; no silent change to published versions.
- Core launch feature display RO included; do not add a flag accidentally disabling agreed referral/double/reporting functionality. Publish new version affects new subscriptions/explicit changes, not old invoices.
- `Save draft` / `Publish plan version`; protect historical versions.

**A04 — Billing review: `/admin/billing` and `/admin/billing/[invoiceId]`**

- Queue columns business, invoice reference, claimed amount, expected amount, submitted date, method, review state. Detail includes private proof under authenticated URL and existing payment references.
- Review fields: R verified amount, R bank/provider name, R external reference, R Confirm/Reject decision, R review note on reject/mismatch. Confirmation attests actual reconciliation, not mere screenshot inspection.
- `Confirm payment` creates a payment event, marks the invoice paid, and recomputes coverage exactly once. Duplicate external reference/conflicting amount is blocked. `Correct verified payment` appears only for a confirmed, uncorrected event and authorized billing admin; R reason 10–500, RO original amount/invoice, fresh MFA, and confirmation of the projected invoice/access effect. Creates section 18's compensating event; no arbitrary edit of paid history.

**A05 — Jobs and incidents: `/admin/jobs`**

- Filters job/event type, state, business, time. Columns event key, safe entity reference, attempts, next attempt, age, error code, status.
- Detail shows redacted logs and source/campaign status; no raw auth/push tokens/customer message dumps.
- `Retry` only for retryable, still-valid jobs; confirmation warns a provider-unknown send might have been accepted and requires dedup policy. `Cancel dispatch` pauses future processing; retrying must not override consent/expiry.
- Worker heartbeat/database readiness/provider failure/backup status displayed separately, not a single fake green indicator.

**A06 — Audit and privacy operations: `/admin/audit`, `/admin/privacy`**

- Audit filters actor/business/action/date/support session; columns timestamp, actor, action, tenant, target, reason, correlation ID. Append-only records have no Edit/Delete buttons.
- Privacy request queue: request reference, type, requested date, status, authorized subject context, completion/error. Actions execute approved export/anonymization workflows; do not download all account data into a public admin browser by default.
- Export download expires and is restricted to the requester or a narrowly authorized support procedure. Failed deletion displays remaining retained categories and recovery action rather than claiming complete erasure.

### 25.9 Field-to-operation contract and final UI acceptance

For every screen, implementation must include:

1. Typed form/input schema matching the database bounds and enum values.
2. Server operation with authenticated role, business, branch, and record checks.
3. A persisted table/column or documented computed field for each displayed value.
4. Explicit default, required/optional status, conditionally visible fields, and stale-state behavior.
5. Loading, empty, validation, forbidden, offline (where applicable), and success states.
6. Tests for at least one happy path and the material negative/permission path; financial screens also cover retries and concurrent updates.

Phase 1 creates these controls/layouts; later phases connect their actual operations. A page is not done because it looks correct. Update a route checklist with `layout`, `persistence`, `authorization`, `validation`, and `tested` columns for each P/C/S/O/A screen ID.

### 25.10 Clarifications that remove remaining product ambiguity

- English only includes every customer, staff, owner, admin, email, notification, and default message template surface. Cafe-authored free text is stored as Unicode, but no automatic translation or second-language workflow is implemented.
- Promotional weekly caps use calendar weeks beginning Monday: cafe cap in business timezone, global customer cap in preferred customer timezone. A timezone change cannot reset a consumed allowance; keep UTC events and conservatively count the overlapping previous/current window until the next full week. Daily promotion caps use business-local calendar date.
- Initial manager permission set defaults to operations/report viewing within assigned branches; campaign/contact/reversal/export capabilities require explicit grants. Cashier has none of those grants.
- Referrals paused in owner Rules prevents NEW claims; existing pending claims retain captured rules. Left/suspended/anonymized members are suppressed from marketing. Financial qualification/reversal follows stored claim terms and section 18's suspension rules, not a new rules toggle.
- Per-cafe Birthday offers consent governs creation of personal inbox offers and does not require push support. A separate Birthday push notifications consent governs notifying about them. Manual WhatsApp uses its own marketing consent; there is no automatic WhatsApp birthday sender.
- Offer claim finalization and reward redemption both need a valid short-lived intent, with typed fallback expiry never exceeding its parent intent. A five-minute lookup code must not extend a two-minute redemption intent.
- Support inquiries/plan change requests can use configured email/contact links; do not add a complete ticketing system without separate scope. Do not invent a 'request saved' success unless a real record was created or external client explicitly opened.
- Test push devices use a separately authorized staff-test registration, with the same token privacy/shared-device rules. They are excluded from member reach metrics and live customer audience selection.
- Published reward versions are immutable and selected only through rewards.published_version_id. Draft editing cannot change that pointer. After publication, economic changes require adding a separate reward; do not retire or replace an earned programme's published commitment. Published/claimed offer terms also remain stable.
- Birthdays, contact consent, and phone verification cannot be added to owner report columns just because those fields exist in the database.

For optional content fields stored NOT NULL (such as reward description), normalize omitted values to empty strings; optional numeric/foreign-key fields remain null. Trim required text before validation. Require nonempty branch sets at publication and same-parent version pointers. Container actions use explicit state transitions, and time-derived expiry blocks actions before a scheduler updates stored status. Paused offers stop new claims/sends but existing claims remain fulfillable until original expiry; templates are never claimable. Informational offers have no claim/discount inputs and store minimum_spend_paisa=0.

The agent should implement these contracts and make small technical decisions independently. It must not decide new product fields or contradict this document merely to speed up development.

## 26. Simple launch caching and direct reporting

### 26.1 Public assets and pages

Use Vercel's built-in CDN and the installed Next.js version's supported cache settings. No Redis, separate CDN, report cache tables, or report-refresh jobs. pg-boss remains responsible for campaigns, reminders, exports where required, and operational jobs.

| Data | Launch behavior |
|---|---|
| Content-hashed scripts, styles, fonts, and public images | Cache immutable versions for up to one year; publish changed content under a new URL |
| Sanitized public cafe information | One public cache layer with a maximum 60-second age; no extra stale-serving window |
| Public marketing/pricing information | Maximum 300-second age; billing uses the authoritative plan version |
| Customer cards, owner reports, contacts, staff/admin pages, private downloads | Authenticated network responses with `Cache-Control: private, no-store`; bypass service-worker caching |
| Award, redeem, reversal, permissions, consent, subscription enforcement | Authoritative database operations; never use cached decisions |
| Generic offline shell | Versioned static service-worker cache containing no personal data |
| Service-worker script and web manifest | Revalidate for updates; do not mark immutable |

Cache only public data that is identical for anonymous and signed-in visitors. Keep personal membership controls, referral context, cookies, balances, and contact data outside that boundary. If a page cannot separate these safely, leave its response uncached.

Use one freshness budget rather than stacking independent framework and CDN TTLs. Expiry is sufficient for launch; do not build an external cache-purge service. Public editors show committed changes immediately and explain that public visibility may take up to the TTL. Enrollment, earning, and offer validation always enforce current database rules despite an older public display.

### 26.2 Owner reporting without a persistent cache

Query indexed PostgreSQL source tables on demand using the metrics in section 14. No incremental report aggregates or stored report payloads. Existing transactional balance rows and audit/content snapshots remain part of the domain model, not reporting caches.

- Resolve the current user, business permission, and allowed branches on every request. Reject unauthorized filters before executing the query.
- Default to the last 30 calendar days including today in Asia/Karachi; offer Today, Last 7 days, Last 30 days, and Custom. Limit each request/export to 90 calendar days. Convert to half-open UTC intervals.
- Paginate detailed lists: 25 rows by default, maximum 100. Use bounded database aggregation for charts; never fetch the entire ledger into browser or function memory.
- Add indexes for actual tenant/branch/date access patterns and inspect representative query plans. Include cross-period membership history where a metric requires it; the selected period does not redefine returning customers.
- Fetch only the active report tab. Use one consistent database read for related metric totals, or a read-only repeatable-read transaction where multiple queries are needed.
- Apply a report query timeout, initially 5 seconds, enforced at the database role/transaction boundary before the report statement starts, with an actual timeout integration test. Setting a value inside an already-running RPC alone is insufficient. Return a clear retry/narrow-date-range error on timeout.
- Use the existing authenticated endpoint rate limits. Disable duplicate in-flight refreshes; no automatic polling or background report-refresh queue.
- Return `data_as_of` with the response, representing the database read time. The UI shows `Updated [time]` and a `Refresh` button that reruns the query.
- A filter change shows loading for the new selection; do not relabel old values as the new result. Failed requests show an error and Retry, never fabricated zeros. Clear previous results on a failed explicit refresh rather than implementing stale-cache fallback.
- Exports obey the same scope/date limits, existing export size limits, audit requirements, and CSV escaping. Large exports may use the existing export worker; they do not populate a report cache.

Purchases and reversals return their committed result immediately. They do not create report invalidation or refresh events. The next report request reads committed source data. Retain the transactional outbox events needed for notifications and other agreed business operations.

### 26.3 PWA and private-data cleanup

Cache only versioned public assets and the generic offline shell in the service worker. Preserve the optional own-card offline display from section 16: explicit browser-local opt-in, default off, maximum 20 cards/1 MiB and 24 hours since fetch. Store only own-card display summaries, timestamps, public logo references, and an optional opaque earning handle; never contacts, reports, secrets, or redemption tokens. Show an offline/stale label and disallow offline value-changing actions.

Customer Account includes `Keep my cards available offline` and `Clear offline card data`. Opting out, logout, or account switch clears that user's saved summaries. Cancel old account requests so late responses cannot repopulate another account's screen. Activate service-worker updates safely outside an active checkout.

### 26.4 Launch verification

Verify deployed public-cache expiry and private no-store headers. Test two customers, two businesses, different branch scopes, revoked permissions, and logout/account switching. Check that fresh report requests reflect purchases/reversals and match section 14's fixtures. Exercise empty ranges, query timeouts, concurrent refresh clicks, and date-boundary validation.

Measure indexed report latency alongside checkout and campaign traffic with realistic synthetic volume. Record results and address slow queries; do not add infrastructure simply to satisfy a hypothetical user count. Public-cache or worker failures must not authorize or duplicate loyalty mutations.

## 27. Vercel hosting and performance for Pakistan

### 27.1 Selected deployment topology

| Component | Launch deployment contract |
|---|---|
| Next.js pages, route handlers, server actions | Vercel; use supported Node runtime for database-backed server work |
| Public static assets and eligible public responses | Vercel managed CDN under section 26's cache rules |
| Database, authentication, uploaded assets | Supabase; choose an explicit supported project region |
| Outbox dispatcher, pg-boss consumers/schedules, FCM sends, exports and operational jobs | Separate persistent Node worker, preferably in the database region; worker host remains to be selected based on availability and cost |
| Owner reporting | Indexed PostgreSQL queries on demand; no persistent report cache |

Vercel's CDN routes requests through its global infrastructure; choosing a function region does not pin CDN delivery to Pakistan. The current compute-region list includes Mumbai (bom1), Dubai (dxb1), and Singapore (sin1), but no Pakistan compute region. Do not invent a Pakistan deployment code or promise a specific Pakistani point of presence. [Vercel network and regions](https://vercel.com/docs/regions).

Use Singapore as the provisional planning default: Vercel sin1 with Supabase ap-southeast-1 and a nearby worker. This is a starting configuration, not a measured claim that Singapore is fastest. Compare against a matched Mumbai deployment, bom1/ap-south-1, before provisioning the production database. Supabase lists both regions; confirm capacity at setup. [Supabase regions](https://supabase.com/docs/guides/platform/regions).

Set the Vercel function region explicitly in supported project configuration, redeploy, and verify the deployed region. Place functions close to the database; do not accidentally retain a US default with an Asian database. Avoid multiple write regions at launch with one primary database. [Vercel function-region configuration](https://vercel.com/docs/functions/configuring-functions/region).

### 27.2 Worker and connection requirements

Vercel request functions have finite execution limits. The selected long-running pg-boss worker must not run inside a route handler, build script, or an unawaited promise after a response. Keep pg-boss; do not silently substitute Inngest or redesign the queue merely because the web host changed. [Vercel function limits](https://vercel.com/docs/functions/limitations).

- Run a supervised worker with restart policy, heartbeat monitoring, graceful shutdown, bounded concurrency, and compatible pg-boss PostgreSQL connections. Queue/outbox state survives web and worker deployments.
- Default application database access remains Supabase HTTPS client/RPC. If direct SQL is introduced in Vercel functions, use a serverless-compatible pooled connection mode and bounded connections; never create one unlimited pool per invocation. Validate worker pooling separately against the installed pg-boss requirements.
- Keep FCM Admin credentials and worker database credentials server-only. Browser bundles and preview builds must never inherit production worker secrets.
- The checkout transaction commits its ledger and outbox atomically; notifications happen asynchronously. Reports query committed source data on demand. Do not wait for the worker to finish before confirming a committed purchase.
- Include persistent worker hosting in the cost sheet. Vercel web hosting does not remove that infrastructure requirement from this architecture.

### 27.3 CDN and cache integration

Use Vercel's managed framework/cache integration for explicitly public data and static output. Section 26 remains authoritative for tenant isolation, freshness, and no-store responses. Uploaded assets served directly from Supabase use that service's delivery path; do not assume all storage traffic passes through Vercel.

Use one documented freshness budget across framework and CDN caches. Verify deployed headers, cold/warm behavior, and TTL expiry. A local development test does not establish CDN behavior. Reports query PostgreSQL directly and return private no-store responses. No external worker cache-purge endpoint is required.

Do not add a second CDN or a Pakistan-only reverse proxy. CDN placement does not establish Pakistan-only data residency.

### 27.4 Pakistan performance validation and release checks

Before production region selection, compare equivalent regional test stacks using synthetic data. Measure from Karachi, Lahore, and Islamabad where testers are available, covering fixed broadband and mobile networks. Record test date/network, region, sample count, p50/p95 latency, and errors. Geography alone is insufficient to select the fastest route.

Measure public landing-page cold/warm load separately from sign-in, card retrieval, staff scan lookup, purchase commit, redemption, and owner reports. Include representative indexed database volume, direct report requests, and campaign jobs running alongside checkout. Track server-to-database time separately from browser-to-server time. Reuse the brief's performance targets; document unavailable test coverage rather than inventing results.

Keep mobile bundles small, defer charts/admin dependencies outside checkout, size/compress merchant images, and use versioned assets. Public caching reduces page-load work; live balances and redemption decisions still require authoritative database transactions.

Separate production, staging, and preview environment variables. Preview deployments use isolated test data and disabled live messaging; they never dispatch production outbox jobs. Configure OAuth redirects and the canonical PWA/service-worker origin deliberately. Apply migrations through a controlled release step, not every preview build. Protect staging and run real-device install/push checks on a stable HTTPS staging origin.

Phase 0 records region defaults and external worker requirements. Phase 8 supplies Vercel configuration, worker deployment instructions, environment separation, and rollback/runbooks. Phase 9 records Pakistan network measurements, deployed cache verification, worker recovery, and the final production region decision. No hosting account purchase or production deployment is implied by this specification.

### 27.5 Required configuration and release evidence

The coding agent owns migrations, component/library selection, exact supported versions, implementation details, and the tests proving this specification. Real commercial/provider information is not a coding guess. Track the following as Required / Configured / Verified in docs/implementation-status.md; local work proceeds with labelled fixtures while missing live values remain explicit release gates.

| Input | Required live evidence |
|---|---|
| Product identity/domain/support | Actual name, HTTPS production domain, support email/link; published privacy/terms and consent text/version |
| Pricing/billing | Published plan price/limits/trial, actual bank/merchant instructions and canonical provider IDs, operator access to verify payments |
| Auth/email | Supabase projects, verified Google OAuth callbacks, configured production email sender and successful magic-link/invitation tests |
| Push | Firebase project/web config/VAPID, worker Admin credential, foreground challenge and real Android/iPhone install/receive/click tests |
| Worker | Selected persistent host/region, DB role/pool/SSL settings, restart/heartbeat, queue recovery and spend estimate |
| Security | Server-generated encryption/HMAC keys with key IDs and rotation runbook, admin bootstrap, tested MFA and recovery procedure |
| Retention/recovery | Operator-approved financial/audit retention, actual backup/storage coverage, restore test evidence; target RPO <=24h and RTO <=4h validated against purchased services |
| Monitoring | Real error/health destinations, alerts for stopped worker, backlog, failed backup and ledger mismatch; budget alerts from actual hosting accounts |

Local key generation is documented and automatic where safe; production secrets use secret stores and never enter the brief/repo. No hard-coded live product name, price, bank account, or credential is fabricated. Missing configuration produces an explicit setup screen or disabled dependent action, not a success simulation.

Use one stable launch origin with manifest id '/', start_url '/app', scope '/', standalone display, 192px/512px normal and maskable icons, and a single coordinated service-worker registration. Auth callbacks, invite routes, and private pages are no-store; redact invite/intent secrets from logging and use no-referrer on secret-bearing flows. Follow the shared source of UI/API schemas, pin dependencies, and run migration/RLS/critical workflow checks in CI.

Performance evidence uses at least 10 synthetic cafes, 10,000 memberships total, and 100,000 purchases distributed realistically. Run 5 checkout mutations/second alongside 25 report requests/minute and a campaign queue for 15 minutes. Initial targets: server-side p95 checkout <=1s, report <=2s, error rate <1%, and zero incorrect/duplicate financial effects; separately measure mobile network latency and section 15's web targets. These are validation targets, not a guaranteed user capacity. Index/tune before adding infrastructure. Do not conceal failed targets; record the bottleneck and resolve checkout correctness before pilot.

Before final handoff, produce a traceability checklist linking every P/C/S/O/A screen to operation, tables, permissions, and test evidence. Check all state transitions in sections 7–18 against schema enums and UI actions. Successful compilation alone does not establish launch readiness. The final report lists verified results and only concrete unresolved launch gates, with no future-version feature roadmap.
