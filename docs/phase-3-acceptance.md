# Phase 3 automated acceptance — 2026-09-23

Scope: transactional loyalty and redemption in brief v1.6, Phase 3.

| Criterion | Evidence |
| --- | --- |
| Real end-to-end earn and redeem | `scripts/verify-phase3-provider.mjs` creates synthetic Supabase Auth accounts and a published business, enrolls a customer, runs the customer card and staff checkout in a production-build browser, decodes the earning QR through a synthetic camera stream, commits a purchase, creates a reward intent, redeems through the typed code fallback, and verifies committed results. It archives the business and removes the synthetic Auth accounts. |
| Replays and concurrency | The provider check replays purchase and redemption requests. `scripts/test-loyalty.mjs` tests concurrent awards and concurrent intent finalizations against PostgreSQL 18.4; one value effect wins in each race. Reusing a key with a different payload conflicts. |
| Refund after spend and ledger equality | The provider check reverses a fully spent purchase, observes a balance of −1, and receives zero reconciliation mismatches. Local PostgreSQL tests cover debt blocking redemption, full reversal, audited adjustments, and scheduled worker reconciliation. |
| Tenant and staff authority | Local PostgreSQL tests deny cross-tenant reads, unassigned branches, revoked staff, and direct table access. The provider flow uses real verified Auth sessions and PostgREST/RPC authorization. |
| Versioning, activity, and outbox | Local PostgreSQL tests cover immutable published versions, a pre-ledger type switch and draft name that preserve live settings until publication, scoped activity, and durable outbox receipts. Migrations 013–025 are applied to the isolated development Supabase project. |
| Customer and owner states | The provider browser check verifies a customer-facing redeemed state, active branch names, a typed fallback, and server-calculated owner draft earning preview. Intent lifetime defaults to 120 seconds and is configurable in private database settings. |

Verification: 66 PostgreSQL integration checks, authenticated provider/browser acceptance, 36 Chromium/mobile regression checks, lint, typecheck, and production web build passed. Phase 3 acceptance is complete. Physical camera/device validation belongs to Phase 9 and remains open; the browser check uses a synthetic camera stream.
