# Development and database boundaries

Use Node 24.21.0 LTS. The Windows helper `scripts/run.ps1` prepends the workspace runtime to PATH so npm lifecycle scripts cannot accidentally use the machine's older sibling Node executable.

## SQL integration harness

`npm run test:integration` starts real native PostgreSQL in a unique `.local/integration/<uuid>` directory, on a loopback-only ephemeral port, with a randomly generated password. It never connects to DATABASE_URL, a linked project or production. It does not create OS users and leaves local diagnostic database files in place. Stop is awaited in a finally block. Do not delete an active database directory.

The only prerelease package is `embedded-postgres@18.4.0-beta.17`, a development-only process launcher/binary distribution. The registry offers no stable launcher release; Windows has no Docker or installed PostgreSQL. This explicit exception enables native SQL tests while production remains managed Supabase. It is not bundled in web/worker production dependencies. The launched database version is printed by the tests. Supabase uses PostgreSQL 17 in the local configuration, so a full Supabase 17 run remains mandatory before schema acceptance.

The harness creates a clearly identified minimal `auth.users` and `auth.uid()` fixture to test SQL identity, RLS and RPC behavior. It does not validate real JWT verification, Supabase Auth callbacks, PostgREST, Storage, MFA or provider delivery. Those are named pending integration gates. Database tests must never be advertised as full Supabase integration.

## Full local Supabase

Install Docker Desktop with its Linux container engine, then `npm run db:start`. The pinned CLI starts the isolated project `loyalty-saas-local`; `npm run db:reset` is hard-coded to `--local` and applies migrations/seed. It never accepts a production URL. `npm run db:types` regenerates official Supabase public-schema types from the local running stack. Copy only local public URL/key to `.env.local`; use the local email inbox for magic links when that flow is implemented.

Current seed is intentionally empty. The complete two-cafe, branch/role/ledger/referral/push regression fixture is required in Phases 2–4; it is not claimed complete by the foundation tests.

## Worker

Migrate with the operator/migration role, then provision a dedicated LOGIN role that inherits `loyalty_worker`, using an independently generated secret. Do not use postgres/service/migration credentials at runtime. `loyalty_worker` has only narrow app RPC execution and its pg-boss schema rights. The queue owns/migrates its schema through the installed pg-boss library.

Set WORKER_DATABASE_URL and WORKER_DB_SSL in the worker secret store. Remote SSL uses certificate verification; only local loopback permits disabled SSL. Start with `npm run worker:dev`; production runs `npm run build` then `npm run worker:start` in a separate persistent supervised host, never Vercel request functions. Live push remains disabled and enabling it currently fails startup explicitly because the delivery slice is not implemented.

The initial `profile.created` consumer validates the persisted outbox record and records a durable processing receipt. It proves queue plumbing, not a welcome message or completed marketing feature. Four consumers process one job each, with bounded database pools. Outbox dispatch runs every 5 seconds, with enqueue and dispatched marking in the same SQL transaction through pg-boss's connection adapter. Unknown event types remain pending with a safe error. SIGINT/SIGTERM wait for dispatch and graceful queue shutdown.

The initial retry policy is pg-boss exponential retry for the internal probe. The exact business dispatch schedule (30s/2m/10m/30m/2h), expiry, terminal suppression, and provider-unknown handling remain Phase 5 work. Do not use the probe consumer for live campaigns.
