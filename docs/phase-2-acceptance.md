# Phase 2 acceptance — 2026-09-22

**Phase 2 acceptance is complete within its implementation scope, including live Supabase and Resend sandbox email acceptance. Production launch gates remain explicitly separate below.**

| Contract | Evidence | Result |
| --- | --- | --- |
| Verified account and owner MFA | Actual Supabase verified sessions, TOTP enrollment/challenge, AAL1 bootstrap denial | Passed |
| Verified email token | Actual generated magic-link token exchange; replay rejected | Passed; sandbox delivery and actual Next PKCE callback also verified |
| Business onboarding/publication | Hosted atomic bootstrap, programme/reward publication; local rollback/replay/quota tests | Passed |
| One customer, two cafes | PostgreSQL concurrent enrollment; real PostgREST separate relationships and owner scope | Passed |
| Scoped contacts/consent | Separate explicit email sharing, immutable consent evidence, phone reset and rejoin tests | Passed |
| Cashier boundaries/revocation | Same-tenant branch restrictions in SQL; actual staff invite/accept/revoke and stale-session denial | Passed |
| Storage and image processing | Actual direct Storage upload, cross-owner denial, restricted worker + Sharp, public branding/private proof isolation | Passed |
| Cross-user caching | Production-mode local Next HTTP requests alternated real authenticated sessions; own cards and no-store headers | Passed; Vercel/CDN verification remains a release gate |
| Seed, types, schema traceability | Two-cafe seed, generated catalog types/diagram, updated table and screen checklists | Passed within Phase 2; later-phase tables explicitly pending |
| QR signage, hours, timezone | PNG/SVG generation and decoded QR; browser reload preserves hours; SQL immutable activity lock | Passed |
| Additional business provisioning | Recent-admin-MFA audited one-use grant; rollback restores grant; owner performs onboarding | Passed |
| Email request implementation | Shared PostgreSQL email/IP limits, cooldown, callback context, neutral response; production enablement remains gated on verified sender/persistent worker | Passed |
| Email delivery and direct Auth bypass controls | Actual SQL Auth hook rejects ungranted OTP; granted request enters pg-boss, Resend sandbox reports delivered, real Next callback establishes session, replay fails | Passed in sandbox; human-inbox delivery remains a production gate |

Local evidence: **47 PostgreSQL/worker checks**, **40 unit tests**, **36 desktop/mobile browser checks**, typecheck, lint, production build and eight fixture-isolation responses passed. The live provider suite is `scripts/verify-phase2-provider.mjs`; `scripts/run-provider-acceptance.mjs` supplies a production-mode local web server. No test double is counted as a provider pass.

Hosted defect found and fixed: PostgREST flushes deferred constraints after the RPC's privileged context ends. The exactly-one-owner trigger originally lacked authority to read protected tenant tables at that point. Migration `202609220011_deferred_owner_authority.sql` fixes the trigger's execution context, without granting browser table access. The local harness now forces deferred constraints while authenticated to cover this behavior.

The configured development project now contains migrations 004–012 and versioned pre-release defaults delegated by the user. Synthetic Auth accounts and test Storage objects are cleaned up; synthetic businesses are archived, preserving audit/history. Existing user data is retained. The standalone worker has not been deployed to a persistent production host, and no new Vercel release is claimed.

Email evidence: `scripts/verify-auth-email-provider.mjs`, run by `scripts/run-provider-acceptance.mjs --email`, exercised the actual configured SQL hook, restricted gateway/worker roles, pg-boss, Resend API, Supabase verification redirect and production-mode Next callback. The sandbox account was removed and temporary callback allow-list entry restored. Encrypted message payload was erased after provider acceptance. No human inbox was contacted. Resend sandbox delivery is provider simulation, not production inbox deliverability. Public email sign-in stays disabled until a verified sender and persistent worker are configured; Google remains available.
