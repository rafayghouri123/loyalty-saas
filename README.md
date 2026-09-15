# Cafe loyalty SaaS

Implementation in progress against `LOYALTY_SAAS_IMPLEMENTATION_BRIEF.md` v1.6. This is an early foundation, **not a completed application or a production-ready service**. Track the entire launch scope in [implementation status](docs/implementation-status.md), [43-screen checklist](docs/screen-checklist.md), and [78-table checklist](docs/schema-checklist.md).

Phase 0 engineering acceptance completed on 2026-09-15. See the [acceptance audit](docs/phase-0-acceptance.md) for exact evidence, including deployed Google login, atomic profile/outbox processing, real Firebase foreground acknowledgement, and the remaining later release gates.

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

The independent worker uses `WORKER_DATABASE_URL`, a dedicated runtime login inheriting `loyalty_worker`, and verified TLS for remote databases. The web secret gateway uses a separate `WEB_GATEWAY_DATABASE_URL` login inheriting only `loyalty_web_gateway`, through the provider transaction pooler on Vercel. Migration/operator credentials must never be runtime credentials. Firebase web configuration and VAPID are public client identifiers; the worker service-account credential is private and referenced through `GOOGLE_APPLICATION_CREDENTIALS`. Both `LIVE_PUSH_ENABLED` (worker) and `PUSH_REGISTRATION_ENABLED` (web) default to false. They enable only the registration challenge slice when deliberately configured; campaigns are not implemented.

`PRODUCT_NAME` and `SUPPORT_EMAIL` are real operator inputs. Missing identity, plans, bank instructions and published policies remain explicit setup gates; no real prices or commercial details are fabricated. `setup:keys` generates local random keys without printing values. Production uses a secret store and a rotation runbook.

## Commands

| Script | Purpose |
| --- | --- |
| `dev` | Start Next.js on loopback port 3000 |
| `worker:dev` | Watch the separately configured persistent worker |
| `build` | Production Next.js build and independent worker compilation |
| `start` | Start the built Next.js app |
| `worker:start` | Start the compiled Node worker |
| `lint` / `typecheck` | Static checks for application and worker |
| `test` | Vitest boundary/rule tests |
| `test:integration` | Real local PostgreSQL/RLS/RPC/pg-boss tests; explicit SQL Auth fixture |
| `test:e2e` | Playwright desktop and 360px mobile browser checks |
| `db:start` / `db:stop` | Full local Supabase; Docker Desktop required |
| `db:reset` | Apply migrations/seed to local Supabase only |
| `db:types` | Generate official Supabase types from the running local stack |
| `db:setup:staging` | Initialize the matching empty isolated Supabase project and create restricted runtime logins |
| `setup:keys` | Generate ignored local security keys |
| `dependencies:check` | Verify exact versions and peer graph; write version inventory |

Install Playwright's Chromium browser with `npx.cmd playwright install chromium` if required. Browser tests are development checks, not proof of real Android/iPhone push or camera behavior.

## What exists now

- Next.js/TypeScript foundation, specified visual tokens, reusable primitives, initial public/auth/setup screens and profile form.
- User-scoped Supabase SSR clients and verified-user boundary, with strict origin/body validation and private response headers.
- Three SQL migrations: private profile, tenant/branch/access foundation, immutable audit, outbox, durable worker receipts, shared rate limits and receipt-bound push devices. Profile creation is atomic and retry-safe.
- A separate pg-boss worker whose durable enqueue and outbox marker use the same PostgreSQL transaction. It validates authoritative event data and restricts runtime database privileges.
- One PWA manifest/registration with generic offline shell; no caching of private responses. Data-only foreground challenges, encrypted token storage, same-session acknowledgements, generation checks and sign-out revocation are implemented. `/app/notifications` is the initial authenticated device settings route. One real FCM foreground registration/acknowledgement is verified; broader device coverage and customer offline summaries remain pending.

The fixture Auth schema in the SQL harness does not prove Supabase JWT handling, Auth, PostgREST or Storage. The full two-cafe accounting seed, all financial features, 43 complete screens, push/WhatsApp, reporting, billing/privacy, deployment and launch hardening are still required. See [development runbook](docs/development-runbook.md) for the precise boundaries and local database strategy.

## Hosting

`vercel.json` specifies the requested provisional Singapore function region (`sin1`). Managed Supabase is provisionally `ap-southeast-1`, with a separately hosted nearby persistent Node worker. This is configuration, not a deployed or benchmarked result. Compare against Mumbai using the required Pakistani network measurements before final production selection. The final deployment, restore, monitoring and real-device gates remain open.
