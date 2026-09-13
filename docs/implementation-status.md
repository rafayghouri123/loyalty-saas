# Launch implementation status

Specification: `LOYALTY_SAAS_IMPLEMENTATION_BRIEF.md`, version 1.6. Read all 1,550 lines on 2026-09-13. This file records evidence, not a declaration of launch readiness.

## Current milestone

Phase 0 in progress. The original repository contained only the brief and start prompt, both untracked; no application, dependency manifest, migrations, environment files, or commits existed. No existing application behavior was assumed. The original documents are preserved. A runnable Next.js foundation, first SQL migration and real pg-boss processing boundary now exist. This is not feature or phase completion.

| Phase | Required outcome | State | Evidence / remaining work |
| --- | --- | --- | --- |
| 0 | Audit, pinned stack, runnable web, auth/RPC/outbox/worker/push integration slice | Local boundary implemented; external verification pending | Node 24.21.0; 39 exact dependencies; production web+worker build, typecheck, lint, 17 unit tests, 23 real PostgreSQL/queue checks and 6 browser checks passed. Full Supabase/provider challenge slice remains required. |
| 1 | Design tokens, accessible primitives, all 43 screen contracts and shells | Initial primitives only | Public/auth/setup layouts exist. Broad screen work waits for the early integration boundary. No screen is fully complete. |
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
| Isolated Supabase projects and Auth/email/OAuth configuration | Yes | No | No |
| Firebase web/VAPID and worker credentials | Yes | Yes, local test configuration | Google authentication, remote web-config match and FCM validation-only request passed; real device receipt pending |
| Persistent worker host, region, SSL/pooling and spend estimate | Yes | No | No |
| Production encryption/HMAC key IDs, rotation, admin bootstrap and MFA recovery | Yes | No | No |
| Financial/audit retention, backup coverage and restore rehearsal | Yes | No | No |
| Monitoring/alert destinations and account budget alerts | Yes | No | No |
| Android and iPhone installation/camera/push/account-switch tests | Yes | No | No |
| Singapore/Mumbai benchmark from Pakistani fixed/mobile networks | Yes | No | No |
| Vercel preview ingress spoofing, CDN expiry and private no-store checks | Yes | No | No |

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

## Phase 0 remaining verification

1. **Real Supabase integration:** isolated provider Auth/Google callback, PostgREST/JWT/session behavior, migrated Supabase PostgreSQL 17, runtime-role/pooler grants and the atomic RPC/outbox slice. Public Supabase configuration is now present locally but has not been verified; WORKER_DATABASE_URL and WEB_GATEWAY_DATABASE_URL are missing.
2. **Real FCM/browser integration:** Firebase credentials are configured and provider authentication/dry-run authorization passed. Still verify the custom root service-worker foreground receipt path, Android/iPhone installation and shared-device/logout behavior. Local SQL capture, dry-run validation and service-worker tests are not device delivery proof.
3. **Hosted configuration evidence:** controlled Vercel preview ingress spoofing test, private caching, separately supervised worker and final environment/runbook evidence for the Phase 0 slice. Detailed steps are in `docs/development-runbook.md`; hosting has not been provisioned or verified. Region benchmarking remains an explicit later release gate.

The local API/worker implementation, shared limiter, browser safeguards and staging runbook are now present. These three verification groups remain open; Phase 0 is not marked complete. Browser concurrency, complete encryption-key rotation, CSP, shared limiter coverage on all later domain RPCs, and the direct Auth magic-link bypass gate still need the relevant later implementation/release checks.

## Firebase credential verification (2026-09-13)

User supplied local configuration and a service-account JSON file. Without printing keys, tokens, project identifiers or file contents, verified that the file exists and identifies the configured project; the VAPID public key has the expected uncompressed P-256 shape; Google service-account authentication succeeds; Firebase Management returned HTTP 200 and its web API key, app ID and messaging sender ID match the local values. Firebase Admin `send(message, true)` completed successfully using `validate_only`; no message was delivered or queued for customers. The VAPID key's project association and actual browser registration/receipt remain unverified. Both live enable flags were left unchanged. No credentials were added to Git.

## Next work, preserving launch scope

1. Finish the Phase 0 Supabase Auth/PostgREST and foreground FCM challenge boundary. Add direct ingress/rate-limiter and push/session/installation tests; real provider/device proof needs the listed staging inputs.
2. Continue Phase 1 controls and all 43 screen contracts, then complete Phase 2 migrations, tenants/branches, immutable policy documents, MFA, onboarding/invitations, memberships/consent and private storage upload grants.
3. Continue Phases 3–9 in order, including all audited accounting, referral/promotion, messaging, reporting, billing/privacy, hosting and pilot requirements.

The current `profile.created` worker event is an internal integration probe with a durable receipt. It does not send a customer message, process a campaign or imply financial features are implemented. Source tables contain no production data. The SQL harness's Auth fixture is explicitly not Supabase JWT/provider verification.
