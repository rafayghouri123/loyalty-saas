# Launch implementation status

Specification: `LOYALTY_SAAS_IMPLEMENTATION_BRIEF.md`, version 1.6. Read all 1,550 lines on 2026-09-13. This file records evidence, not a declaration of launch readiness.

## Current milestone

Phase 0 engineering acceptance is complete as of 2026-09-15; see [the requirement-by-requirement audit](phase-0-acceptance.md). The original repository contained only the brief and start prompt, both untracked; no application, dependency manifest, migrations, environment files, or commits existed. Original documents are preserved. The runnable foundation now has verified deployed Auth, real atomic profile/outbox processing and a real foreground Firebase challenge/acknowledgement. Phase 1 is now in progress; the application and launch remain incomplete.

| Phase | Required outcome | State | Evidence / remaining work |
| --- | --- | --- | --- |
| 0 | Audit, pinned stack, runnable web, auth/RPC/outbox/worker/push integration slice | Complete within Phase 0 scope | [Acceptance audit](phase-0-acceptance.md): pinned runtime/stack, documented setup/trust/cache boundaries, 22 unit tests, 23 real PostgreSQL/queue checks, fresh production build and 6 browser checks passed. Deployed Google login, real profile/outbox processing and Firebase foreground acknowledgement verified. Later release gates remain below. |
| 1 | Design tokens, accessible primitives, all 43 screen contracts and shells | In progress after Phase 0 acceptance | Shared branded card component now used by the labelled public illustration. Role shells/scanner/forms and remaining screen contracts still required; no customer card persistence is claimed. |
| 2 | Verified auth, MFA, onboarding, tenancy, invitations, enrollment, consent, storage | Foundation only | Own-profile RLS, verified-account SQL checks and composite branch FKs tested. Twelve public tables plus private security records and catalog-generated types exist; full model/roles/MFA/storage still pending. |
| 3 | Transactional earn, secure intents, redemption, ledger, reversals, adjustments | Not started | Worked accounting fixture, concurrent writes and direct RPC tests required. |
| 4 | Double slots and purchase-qualified referrals | Not started | Captured version terms, cap races, boundaries and compensating reversals required. |
| 5 | PWA, challenge-bound push, campaigns, offers, three automations | Early Phase 0 device slice only | Foreground challenge/ack and generation isolation implemented locally. Campaigns/offers/automations remain unimplemented; real provider/device tests are pending. |
| 6 | Manual WhatsApp templates/tasks/leases/consent | Not started | Opened and human-marked-sent remain distinct. |
| 7 | Indexed direct reports and bounded exports | Not started | No report cache, refresh queue, Redis or incremental reporting aggregates. |
| 8 | Billing, admin, privacy, Vercel/worker deployment and runbooks | Not started | Actual payment, recovery and deployment evidence required. |
| 9 | Security, accessibility, load, devices and pilot readiness | Not started | Full acceptance audit, 15-minute load run and external pilot evidence required. |

## Required external inputs

Local engineering proceeds with explicitly labelled fixtures. Missing live inputs must disable dependent live actions. Secrets belong in local environment files or provider secret stores, never this document.

| Input | Required | Configured | Verified |
| --- | --- | --- | --- |
| Product name, HTTPS domain and support contact | Yes | No | No |
| Published privacy/terms/consent wording and versions | Yes | No | No |
| Published plan prices/limits, real bank/provider IDs and payment instructions | Yes | No | No |
| Isolated Supabase projects and Auth/email/OAuth configuration | Yes | Local connection, remote database and Google OAuth enabled | PostgreSQL 17.6 migrations/runtime grants/PostgREST and deployed Google sign-in verified; production isolation, email/invitations and full session/MFA tests remain pending |
| Firebase web/VAPID and worker credentials | Yes | Configured for the tested Vercel origin and local worker | Real FCM foreground receipt, acknowledgement and matching active binding verified for one browser; Android/iPhone and broader device coverage remain pending |
| Persistent worker host, region, SSL/pooling and spend estimate | Yes | No | No |
| Production encryption/HMAC key IDs, rotation, admin bootstrap and MFA recovery | Yes | No | No |
| Financial/audit retention, backup coverage and restore rehearsal | Yes | No | No |
| Monitoring/alert destinations and account budget alerts | Yes | No | No |
| Android and iPhone installation/camera/push/account-switch tests | Yes | No | No |
| Singapore/Mumbai benchmark from Pakistani fixed/mobile networks | Yes | No | No |
| Vercel preview ingress spoofing, CDN expiry and private no-store checks | Yes | No | No |

## Phase 1 component evidence (2026-09-15)

Started only after the Phase 0 acceptance audit closed. Added `LoyaltyCard` as a reusable presentational component for stamps/points, capped progress graphics with the original balance preserved in text, next reward title, server-controlled eligibility badge, optional logo/action slots and offline last-updated display. Merchant accent inputs are restricted to six-digit hex with a safe fallback, with black/white foreground selected for readable contrast. Stamp costs above 20 use a bounded meter instead of creating unbounded circles. English labels are centralized in `src/lib/copy.ts`.

The public landing illustration uses this component with its existing explicit fixture caption; authenticated memberships remain unimplemented. 24 unit tests pass, including 4,096 sampled RGB combinations with >=4.5 contrast and negative/excess balance handling. Typecheck and lint pass. A fresh production build plus all six Playwright desktop/360px checks passed; both screenshots were reviewed. This does not establish completed C01/C02 persistence, all screen contracts, or full accessibility coverage. The final label extraction into the shared copy file preserved displayed text and passed typecheck.

Added the customer header and shared Cards/Offers/Referrals/Account navigation, with per-route active state, >=44px targets, keyboard operation and bottom safe-area spacing. `/app/offers`, `/app/referrals` and `/app/settings` now have explicit feature-setup screens; each independently checks the verified-user boundary and redirects unauthenticated users when Auth is configured. Navigation is presentation only. The account setup links to the working device settings after authentication. Full field contracts, lists and persistence are still pending. Typecheck/lint and a fresh production build pass. All eight browser tests pass, including the new navigation regression on desktop and 360px; both customer-shell screenshots reviewed.

## Completion rules

Each screen needs layout, persistence, authorization, validation and meaningful tests. Each state transition needs database and API evidence. A build or stub is not feature completion. All phases and section 27.5 release evidence remain in scope. The goal stays active until the complete specification is satisfied or the documented external blockers meet the blocked audit threshold.

## Foundation evidence (2026-09-13)

- `scripts/run.ps1 typecheck` and `lint`: passed.
- `scripts/run.ps1 build`: Next.js production build and independent worker TypeScript compilation passed.
- `scripts/run.ps1 test`: 17 tests passed for exact currency conversion, Unicode/strict inputs, redirect/origin validation, streamed body limits, authenticated encryption, trusted ingress/HMAC subjects, fail-closed limiter behavior, 429 headers and actual service-worker source handling of foreground challenges and mismatched generations.
- `scripts/run.ps1 test:integration`: 23 checks passed on real PostgreSQL 18.4. Includes atomic profile/audit/outbox creation, idempotent replay, five concurrent RPC calls, rollback, unverified/anonymous rejection, own-profile RLS, forbidden direct writes/internal reads, cross-tenant branch FK rejection, cashier flag rejection, immutable audit, forced queue/outbox rollback, recovery and durable consumer deduplication. Added atomic multi-connection rate limits, cooldown/window expiry, direct RPC bypass denial, encrypted push jobs through real pg-boss with a local capture sender, wrong user/session/nonce/installation rejection, concurrent acknowledgement, shared-device rebinding, revocation and expiry. No Firebase request was sent by these tests.
- `scripts/run.ps1 dependencies:check`: 39 direct versions pinned; complete installed tree has no invalid peers. `npm audit fix` resolved the transitive advisory; latest installation audit reported zero vulnerabilities. This is not application security certification.
- Generated `src/lib/db/database.types.ts` from the migrated real PostgreSQL catalog. Official Supabase type generation and complete enum/FK audits remain pending on the full stack.
- Node 24.21.0 downloaded to ignored `.tools`; local encryption/HMAC keys generated into ignored `.env.local` without printing values. Production keys remain unconfigured.
- `scripts/run.ps1 test:e2e`: 6 checks passed on the production build in Chromium desktop and 360px Pixel emulation. Verified public/signup navigation, no horizontal overflow, honest missing-config states including push/logout, private no-store headers, manifest identity, service-worker revalidation and old-account binding removal from real browser IndexedDB. Desktop/mobile screenshots reviewed. Initial dev-mode cache-header assertion failed because Next.js dev overrides page Cache-Control; the unchanged security requirement is now verified against `next start`. Authenticated foreground receipt/device permission behavior still requires the real provider setup.

## Remaining release verification identified during Phase 0

1. **Real Supabase integration:** PostgreSQL 17.6 migrations, runtime-role/pooler grants, actual PostgREST readiness and anonymous denial pass. Browser Google sign-in reached the server-verified authenticated app. The existing real profile creation event was processed by the restricted worker and has a durable receipt. Two-account direct PostgREST/RLS and expired/revoked-session tests remain pending.
2. **Real FCM/browser integration:** the live foreground challenge path now passes for one user test browser: Firebase accepted the message, the browser acknowledged it, and the matching device binding is active. Real Android/iPhone installation and shared-device/logout checks remain open; the browser/OS used for this successful test has not been recorded.
3. **Hosted configuration evidence:** the user-provided Vercel deployment now passes database readiness, OAuth initiation/provider redirect and sampled private caching checks (see below). Controlled preview ingress spoofing, separately supervised worker and the remaining environment/runbook evidence are pending. Region benchmarking remains an explicit later release gate.

The local API/worker implementation, shared limiter, browser safeguards and staging runbook are present, and the early live integration slice passes. The full verification groups above remain launch requirements, allocated to the later relevant phases by the brief; they no longer block Phase 0 engineering acceptance. Browser concurrency, complete encryption-key rotation, CSP, shared limiter coverage on all later domain RPCs, and the direct Auth magic-link bypass gate still need the relevant later implementation/release checks.

## Firebase credential verification (2026-09-13)

User supplied local configuration and a service-account JSON file. Without printing keys, tokens, project identifiers or file contents, verified that the file exists and identifies the configured project; the VAPID public key has the expected uncompressed P-256 shape; Google service-account authentication succeeds; Firebase Management returned HTTP 200 and its web API key, app ID and messaging sender ID match the local values. Firebase Admin `send(message, true)` completed successfully using `validate_only`; no message was delivered or queued for customers. The VAPID key's project association and actual browser registration/receipt remain unverified. Both live enable flags were left unchanged. No credentials were added to Git.

## Supabase setup verification (2026-09-14)

Subsequent Google configuration check: after the user saved the provider settings, Auth settings returned Google enabled and the authorization endpoint returned HTTP 302 to accounts.google.com, with a client ID and the matching Supabase provider callback. No user sign-in was completed by this check; Google consent/client configuration, app return URL acceptance and a real authenticated session still require the interactive flow.

The supplied migration URL matches the configured public Supabase project. Initial audit found zero application tables and zero Auth users. PostgreSQL is 17.6. Default Node trust failed with SELF_SIGNED_CERT_IN_CHAIN; downloaded the CA from the HTTPS URL published in Supabase's official Studio source and successfully verified the certificate chain and hostname. TLS verification remains enabled.

Applied all three migrations with an atomic Supabase-compatible migration history record per file. Managed PostgreSQL exposed a missing SET-role grant when creating the worker-owned schema; that first transaction rolled back. Added the explicit operator SET membership before the initial migration was deployed, then all three migrations committed successfully. Generated separate random runtime credentials for loyalty_worker_login and loyalty_web_login and saved their session/transaction pooler URLs only in ignored `.env.local`, together with DATABASE_CA_CERT_PATH.

Verified the web gateway RPC over its transaction pooler, worker startup/pg-boss schema initialization/graceful stop over its session pooler, healthy persisted worker heartbeat, and direct profile-read denial for both logins. Actual PostgREST readiness returned HTTP 200/true, and anonymous push-device reads were denied. No Auth users or loyalty memberships were fabricated; no live push was sent. The worker was stopped after verification. Supabase Auth's settings endpoint reports Google OAuth disabled, so verified-user callback/foreground push tests remain pending.

## Next work, preserving launch scope

### Deployed boundary verification (2026-09-14)

Ran `node scripts/verify-deployment.mjs https://loyalty-saas-three.vercel.app` successfully against the actual user-deployed application. Database readiness returned 200/ok. Both customer and business OAuth initiation returned 200 with the correct canonical app callback; Supabase redirected to Google's authorization endpoint with its own provider callback. Foreign and missing request origins returned 403. Readiness, OAuth responses, `/auth/login` and the unauthenticated `/app` response included private/no-store caching. The previously observed canonical-origin 403 is resolved on this deployment.

The verifier does not follow Google login, print OAuth URLs/cookies, send messages, or create accounts. These checks do not establish an authenticated callback/session, worker processing, device receipt, deployed ingress bucket integrity, or complete cache isolation. Those gates remain open. The current stable testing origin is the `loyalty-saas-three` URL; the older `loyalty-saas-sooty` URL is superseded.

Subsequent interactive verification: clicked Continue with Google in the deployed browser and reached `/app`, whose server checks `getUser()`, confirmed email and non-anonymous identity. The authenticated notifications page initially reported configuration disabled. A read-only aggregate database check found one existing profile and one profile-created outbox event, with zero worker receipts. Started the existing restricted worker without a push sender; verified one dispatched profile event joined to its durable receipt, then awaited graceful shutdown. This proves real persisted profile/outbox processing; it does not prove new profile creation during that particular login, full session/RLS coverage or persistent worker hosting.

After the user enabled registration, they reported the exact server-side registration failure message. That message occurs after browser token acquisition; the cause within the server challenge boundary is not yet established. Added fixed-label, correlation-linked server diagnostics without logging exception messages, SQL, tokens, cookies or paths. Also fixed blank certificate environment variables masking a configured fallback source. Unit tests: 20 passed; typecheck and lint passed. Deployment of these changes and actual error classification remain pending. See `deployment-environment.md` for separate web/worker settings.

Pushed the certificate fallback/diagnostics changes as `ac56c94`; its production web and worker build passed before push. A subsequent rollback-only hosted PostgreSQL check used an existing eligible Auth session, the actual restricted gateway connection, and the existing local encryption key to call `gateway_request_push_challenge`. It returned a challenge successfully; the transaction was rolled back and no push was queued. The first probe used deliberately short fixture ciphertext and correctly failed a check constraint; it was corrected to use the application's encryption function. This establishes that the local credential set can reach the hosted RPC; Vercel environment equivalence remains unverified.

Found and fixed a cached-rejection recovery bug in the gateway's initial role check. A temporary connection failure now permits a fresh role check on the next request, while wrong-role connections remain denied. Added unit regressions for both outcomes; 22 unit tests, typecheck and lint pass. These failure/recovery tests use a controlled pool double and do not establish real Vercel outage recovery.

Reran `scripts/run.ps1 test:integration`: all 23 checks passed against PostgreSQL 18.4, including the real gateway limiter, transactional outbox/pg-boss recovery, encrypted challenge capture, concurrent acknowledgement and shared-installation account rebinding. Provider/device limitations remain unchanged.

User identified the deployed registration failure as a missing certificate file. Supplied the configured public Supabase CA for `DATABASE_CA_CERT_PEM`; subsequently verified an actual restricted gateway TLS connection using inline PEM while passing a nonexistent workstation path. Two real registration challenges then appeared in the hosted database, and the user reported the pending confirmation UI. Started a bounded local worker with the existing Firebase Admin credential and live registration-challenge sender for the user's pending test device. Firebase accepted the unexpired challenge and its database dispatch state became `provider_accepted`. Foreground acknowledgement remains unproven until `consumed_at` and the matching active binding are verified. This temporary local worker is not persistent hosted supervision.

The same live test subsequently completed: observed one consumed challenge, then verified its provider-accepted state joined to an active device with the same customer, installation and binding generation. This is real foreground delivery/acknowledgement evidence, not a capture sender or dry run. Device/browser identity, real account-switch/logout, Android/iPhone installation and persistent worker supervision remain separate pending checks. Local LIVE_PUSH_ENABLED was overridden only in the bounded verification process; the saved environment was not changed.

The user also confirmed the successful device connection. The bounded local worker logged graceful shutdown at 2026-09-14 16:37:13 UTC and exited with code 0. It is no longer running; continuous registration delivery requires a running worker. Phase 1 remains on hold at the user's explicit request until Phase 0 is complete.

1. Phase 0 audit closed on 2026-09-15 after live foreground acknowledgement, deployed cache/anonymous access checks, migration comparison and a fresh six-test browser run. Keep the listed broader hosted/session/device/security gates visible through their assigned phases.
2. Begin Phase 1 controls and all 43 screen contracts, then complete Phase 2 migrations, tenants/branches, immutable policy documents, MFA, onboarding/invitations, memberships/consent and private storage upload grants.
3. Continue Phases 3–9 in order, including all audited accounting, referral/promotion, messaging, reporting, billing/privacy, hosting and pilot requirements.

The current `profile.created` worker event is an internal integration probe with a durable receipt. It does not send a customer message, process a campaign or imply financial features are implemented. Source tables contain no production data. The SQL harness's Auth fixture is explicitly not Supabase JWT/provider verification.
