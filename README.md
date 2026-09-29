# Cafe loyalty SaaS

Implementation against `LOYALTY_SAAS_IMPLEMENTATION_BRIEF.md` v1.6. Phases 0–8 are accepted within their documented scope. Phase 9 hardening, automated checks, sustained local load and staging verification passed; **full Phase 9 acceptance and production launch still require real device/network/pilot evidence and the documented service gates.** Track results in [Phase 9 acceptance](docs/phase-9-acceptance.md), [implementation status](docs/implementation-status.md), [43-screen checklist](docs/screen-checklist.md), and [78-table checklist](docs/schema-checklist.md).

Phase 0 engineering acceptance completed on 2026-09-15. See the [acceptance audit](docs/phase-0-acceptance.md) for exact evidence, including deployed Google login, atomic profile/outbox processing, real Firebase foreground acknowledgement, and the remaining later release gates.
Phase 4 acceptance covers double earn slots and purchase-qualified referrals; see the [requirement audit](docs/phase-4-acceptance.md).
Phase 5 adds scoped offers/claims, push campaigns, reward/inactivity/birthday automations and optional user-scoped offline card summaries. Its [acceptance audit](docs/phase-5-acceptance.md) records the live provider boundary.
Phase 6 adds manual WhatsApp templates, eligible task batches, assignments/leases, contact/consent checks, deliberate chat links and human-attested results. See [acceptance](docs/phase-6-acceptance.md) and [operator/staff instructions](docs/phase-6-operations.md). The application never sends WhatsApp messages automatically.

## Start locally

Use **Node 24.21.0 LTS** and npm. Direct dependency versions are pinned; `package-lock.json` records the full graph. See [exact versions and compatibility decisions](docs/dependency-versions.md).

```powershell
# With Node 24.21.0 selected in your terminal:
npm.cmd ci
npm.cmd run dev
```

Open [local development](http://127.0.0.1:3000). Authentication and account actions show setup states while provider configuration is missing. The public card is explicitly illustrative.

On this workstation the project-local runtime is in `.tools/node-v24.21.0-win-x64`. Use the wrapper to avoid the machine's older Node executable:

```powershell
.\scripts\run.ps1 dev
.\scripts\run.ps1 test
.\scripts\run.ps1 test:integration
```

On another Windows machine, install the official Node 24.21.0 runtime or extract its official archive into that same `.tools` directory. `.tools`, `.local`, environment files and credentials are ignored by Git.

## Configuration

Copy `.env.example` to `.env.local` and fill values from an isolated test environment. Do not commit secrets or paste them in logs. Set `NEXT_PUBLIC_APP_URL` to the exact app origin. Supabase URL/publishable key identify the test Auth/database; OAuth callbacks must allow that origin's `/auth/callback`. Production/preview credentials and data must be separate.

The independent worker uses `WORKER_DATABASE_URL`, a dedicated runtime login inheriting `loyalty_worker`, and verified TLS for remote databases. The web secret gateway uses a separate `WEB_GATEWAY_DATABASE_URL` login inheriting only `loyalty_web_gateway`, through the provider transaction pooler on Vercel. Migration/operator credentials must never be runtime credentials. Firebase web configuration and VAPID are public client identifiers; the worker service-account credential is private and referenced through `GOOGLE_APPLICATION_CREDENTIALS`. Both `LIVE_PUSH_ENABLED` (worker) and `PUSH_REGISTRATION_ENABLED` (web) default to false. When deliberately enabled in staging, they support receipt-bound device registration and consent-scoped campaign/automation messages.

`PRODUCT_NAME` and `SUPPORT_EMAIL` are real operator inputs. Missing identity, plans, bank instructions and published policies remain explicit setup gates; no real prices or commercial details are fabricated. `setup:keys` generates local random keys without printing values. Production uses a secret store and a rotation runbook.

## Commands

| Script | Purpose |
| --- | --- |
| `dev` | Start Next.js on loopback port 3000 |
| `preview:screens` | Local Phase 1 gallery with Auth/push disabled for that process; environment files unchanged |
| `worker:dev` | Watch the separately configured persistent worker |
| `build` | Production Next.js build and independent worker compilation |
| `start` | Start the built Next.js app |
| `worker:start` | Start the compiled Node worker |
| `lint` / `typecheck` | Static checks for application and worker |
| `test` | Vitest boundary/rule tests |
| `test:integration` | Real local PostgreSQL/RLS/RPC/pg-boss tests; explicit SQL Auth fixture |
| `test:e2e` | Playwright desktop and 360px mobile browser checks |
| `test:phase6:provider` | Operator-only synthetic staging Auth/PostgREST/API/browser verification; intercepts WhatsApp links and cleans up accounts |
| `test:phase7:provider` | Synthetic staging Auth/PostgREST/private Storage and persisted reporting checks; cleans up accounts/artifacts |
| `test:phase7:browser` | Targeted desktop/360px reporting controls, failures and private API checks |
| `setup:whatsapp-origin` | Operator-only canonical deployment origin for authenticated public-offer placeholders |
| `db:start` / `db:stop` | Full local Supabase; Docker Desktop required |
| `db:reset` | Apply migrations/seed to local Supabase only |
| `db:types` | Generate official Supabase types from the running local stack |
| `db:setup:staging` | Initialize the matching empty isolated Supabase project and create restricted runtime logins |
| `setup:keys` | Generate ignored local security keys |
| `dependencies:check` | Verify exact versions and peer graph; write version inventory |

Install Playwright's Chromium browser with `npx.cmd playwright install chromium` if required. Browser tests are development checks, not proof of real Android/iPhone push or camera behavior.

## What exists now

- Next.js/TypeScript foundation, specified visual tokens, accessible form/dialog/table primitives, public/auth/profile screens and Phase 1 layouts for all 43 launch contracts. Customer/staff/owner/admin review shells and conditional controls are available at `/ui-fixtures/screens` in local development/test only. See [Phase 1 acceptance](docs/phase-1-acceptance.md).
- User-scoped Supabase SSR clients and verified-user boundary, with strict origin/body validation and private response headers.
- Additive SQL migrations: private profile, tenant/branch/access foundation, immutable audit, outbox, durable worker receipts, shared rate limits, receipt-bound push devices, transactional loyalty, campaigns/manual follow-ups and reporting/private exports. Profile creation is atomic and retry-safe.
- A separate pg-boss worker whose durable enqueue and outbox marker use the same PostgreSQL transaction. It validates authoritative event data and restricts runtime database privileges.
- One PWA manifest/registration with a public-only offline cache and optional bounded, user-scoped local card summaries. Data-only foreground challenges, encrypted token storage, same-session acknowledgements, generation checks and sign-out revocation are implemented. `/app/notifications` is the authenticated device settings route. Campaigns, offers and the three automations are persisted and worker-driven; real staging campaign receipt is audited separately.

The fixture Auth schema in the SQL harness does not itself prove Supabase JWT handling, Auth, PostgREST or Storage; the hosted checks in the phase audits cover the tested provider boundaries. Full launch still requires the two-cafe accounting seed, Phase 8 hosted worker/recovery evidence and Phase 9 launch hardening. See [development runbook](docs/development-runbook.md) for the precise boundaries and local database strategy.

## Hosting

`vercel.json` specifies the provisional Singapore Function region (`sin1`), verified on deployed staging. Supabase is provisionally `ap-southeast-1`. The user's Vercel worker request now uses bounded pg-boss consumers orchestrated by Workflows; see [hosting and capacity](docs/vercel-worker.md). Compare against Mumbai using Pakistani network measurements before production selection. Restore, monitoring, real-device and hosting capacity gates remain open.

## Phase 1 local review

Run `./scripts/run.ps1 preview:screens` and open `/ui-fixtures/screens`. Every fixture is labelled and unavailable on Vercel or in production mode. UI review never sends campaigns, uploads files, charges money, awards units, or writes tenant data. Real route skeletons stay unavailable until their authenticated operations are connected.

After building, run `.\.tools\node-v24.21.0-win-x64\node.exe scripts/verify-fixture-isolation.mjs` to verify fixture 404/no-store behavior in production and hosted-preview configurations. Run Next type generation/typecheck and the production build sequentially: both write `.next/types`, so parallel runs can race.
## Phase 7 reports

The owner/manager overview and `/dashboard/[businessId]/reports` now read indexed source data with current tenant/branch permissions. Seven tabs, business-timezone presets, bounded pagination, accessible chart/table, Updated time, explicit Refresh, timeout/error states and formula-safe private exports are implemented. No report cache/refresh queue exists. See [acceptance](docs/phase-7-acceptance.md) and [operations](docs/phase-7-operations.md) for definitions and verification.

Enable `EXPORT_PROCESSING_ENABLED=true` on the separate worker with its existing Storage/encryption settings to process CSV exports; this does not enable push or WhatsApp sending. Report/account exports do not need a web Storage service credential; the guarded Phase 8 payment-proof proxy does. Exports require current elevated permission, max 10,000 rows/3 MiB and 24-hour private downloads. `test:phase7:browser` runs targeted desktop/mobile controls; `test:phase7:provider` runs isolated synthetic staging Auth/PostgREST/Storage checks. Production worker hosting and Phases 8–9 release gates remain open.

## Phase 8 billing, privacy and deployment

Owner billing and platform administration now use persisted plans/invoices/manual reconciliation, audited scoped support and safe job recovery. Customer settings support private multi-part account exports and resumable ownership-blocked deletion, with explicit retained categories. See [acceptance](docs/phase-8-acceptance.md) and [operations](docs/phase-8-operations.md).

Use `test:phase8`, `test:restore`, `test:phase8:browser`, `test:phase8:provider` and `security:bundles` for targeted evidence. [Vercel worker operations](docs/vercel-worker.md) describe the deployed bounded consumers and controller; `scripts/verify-vercel-worker.mjs` checks real hosted queue/Storage processing and run handoff without a local worker. `Dockerfile.worker` and `compose.worker.yml` remain an alternative daemon/monitor setup. Privacy processing does not enable push/email. The web proof proxy needs its server-only Storage credential.

The user-selected [separate Vercel monitor](docs/vercel-monitor.md) runs in its own project with a health-only DB login, five-minute durable Workflow checks, daily watchdog and verified Discord delivery. Use `monitor:test`, `monitor:build`, and `scripts/control-vercel-monitor.mjs ensure`; install its pinned dependencies with `npm ci --prefix monitoring/vercel`. Both projects share Vercel platform/account risk, and their combined Hobby capacity remains a launch gate.
## Phase 9 hardening and pilot handoff

See [acceptance and launch gates](docs/phase-9-acceptance.md), [security matrix](docs/phase-9-security-matrix.md), [owner/staff guide](docs/phase-9-pilot-guide.md) and [physical-device/network checklist](docs/phase-9-field-checklist.md). These distinguish reproducible engineering checks from actual pilot evidence. No participating cafes/device results have been supplied.

Run `scripts/run.ps1 test:phase9:load` for the full 15-minute mixed-load test on a newly created loopback PostgreSQL database (10 cafes, 10,000 memberships, 100,000 purchases). `scripts/run.ps1 test:phase9:smoke` is a 30-second harness check, not acceptance; both commands also need fixture setup time. No remote database URL or live messaging credentials are loaded. The ordinary integration suite includes actual consumer termination/retry and the database security inventory.

Run `scripts/run.ps1 test:phase9:browser`, `scripts/run.ps1 licenses:check`, and `scripts/run.ps1 pilot:dashboard`. Add only observed aggregate cafe metrics and evidence references to `config/pilot-evidence.json`; the generated local HTML dashboard shows missing data explicitly. Real QR stands come from the owner Settings page; `docs/pilot-assets/` contains visibly labeled demonstration PNG/SVG files, not live cafe assets.

Migration `202609280062_timezone_validation.sql` is additive and has been applied to isolated staging. Production rollout still follows the existing migration/deployment/restore runbook and required external gates. HTML CSP uses per-request nonces and no-store; hashed static assets retain normal immutable delivery. Keep `.env.local`, `.local` test credentials/evidence and browser traces out of Git.
