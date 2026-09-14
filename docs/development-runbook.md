# Development and database boundaries

Use Node 24.21.0 LTS. The Windows helper `scripts/run.ps1` prepends the workspace runtime to PATH so npm lifecycle scripts cannot accidentally use the machine's older sibling Node executable.

## SQL integration harness

`npm run test:integration` starts real native PostgreSQL in a unique `.local/integration/<uuid>` directory, on a loopback-only ephemeral port, with a randomly generated password. It never connects to DATABASE_URL, a linked project or production. It does not create OS users and leaves local diagnostic database files in place. Stop is awaited in a finally block. Do not delete an active database directory.

The only prerelease package is `embedded-postgres@18.4.0-beta.17`, a development-only process launcher/binary distribution. The registry offers no stable launcher release; Windows has no Docker or installed PostgreSQL. This explicit exception enables native SQL tests while production remains managed Supabase. It is not bundled in web/worker production dependencies. The launched database version is printed by the tests. Supabase uses PostgreSQL 17 in the local configuration, so a full Supabase 17 run remains mandatory before schema acceptance.

The harness creates clearly identified minimal `auth.users`, `auth.sessions`, `auth.uid()` and `auth.jwt()` fixtures to test SQL identity, RLS and RPC behavior. It does not validate real JWT verification, Supabase Auth callbacks, PostgREST, Storage, MFA or provider delivery. Its injected push sender captures only local fixture messages. Those are named pending integration gates. Database tests must never be advertised as full Supabase integration.

## Full local Supabase

Install Docker Desktop with its Linux container engine, then `npm run db:start`. The pinned CLI starts the isolated project `loyalty-saas-local`; `npm run db:reset` is hard-coded to `--local` and applies migrations/seed. It never accepts a production URL. `npm run db:types` regenerates official Supabase public-schema types from the local running stack. Copy only local public URL/key to `.env.local`; use the local email inbox for magic links when that flow is implemented.

Current seed is intentionally empty. The complete two-cafe, branch/role/ledger/referral/push regression fixture is required in Phases 2–4; it is not claimed complete by the foundation tests.

## Worker

For an initially empty isolated remote project, set MIGRATION_DATABASE_URL to the operator connection and DATABASE_CA_CERT_PATH to the official Supabase CA file, then run `npm run db:setup:staging`. The script verifies the project match, refuses initial setup over existing app/Auth data, records each migration atomically, detects history drift and saves generated runtime credentials only in ignored `.env.local`. Subsequent runs preserve existing login passwords. This is not the production migration procedure. The operator credential is never passed to the web or worker runtime.

Supabase's private CA may not be in Node's default trust store. Download it from Database Settings → SSL configuration, as described in [Supabase SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement). The verified initial download used the public URL in [official Studio custom content](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json). Runtime pools always use rejectUnauthorized=true. On a host with a filesystem, set DATABASE_CA_CERT_PATH to that host's local certificate path. On Vercel, do not use the workstation's absolute path; set DATABASE_CA_CERT_PEM to the pasted certificate text, or DATABASE_CA_CERT_BASE64 to the base64-encoded certificate. Do not solve a certificate error by disabling verification.

Migrate with the operator/migration role, then provision a dedicated LOGIN role that inherits `loyalty_worker`, using an independently generated secret. Do not use postgres/service/migration credentials at runtime. `loyalty_worker` has only narrow app RPC execution and its pg-boss schema rights. The queue owns/migrates its schema through the installed pg-boss library.

Set WORKER_DATABASE_URL and WORKER_DB_SSL in the worker secret store. Remote SSL uses certificate verification; only local loopback permits disabled SSL. Start with `npm run worker:dev`; production runs `npm run build` then `npm run worker:start` in a separate persistent supervised host, never Vercel request functions. Live push remains disabled by default. With LIVE_PUSH_ENABLED=true the worker requires its Firebase Admin credential, project ID and the same encryption key/ID as the web gateway. Only registration data challenges are supported; no live campaign sender exists.

The initial `profile.created` consumer validates the persisted outbox record and records a durable processing receipt. It proves queue plumbing, not a welcome message or completed marketing feature. Four consumers process one job each, with bounded database pools. Outbox dispatch runs every 5 seconds, with enqueue and dispatched marking in the same SQL transaction through pg-boss's connection adapter. Unknown event types remain pending with a safe error. SIGINT/SIGTERM wait for dispatch and graceful queue shutdown.

The initial retry policy is pg-boss exponential retry for the internal probe. The exact business dispatch schedule (30s/2m/10m/30m/2h), expiry, terminal suppression, and provider-unknown handling remain Phase 5 work. Do not use the probe consumer for live campaigns.

## Shared limiter

The web gateway login inherits `loyalty_web_gateway`, with narrow limiter/challenge execution and no browser/customer table grants. Configure its TLS URL through WEB_GATEWAY_DATABASE_URL; for Vercel use the provider transaction pooler, max two connections per instance and no prepared statements. The gateway validates its runtime role and refuses remote plaintext or SSL URL overrides. Normal account/tenant operations still use user-scoped Supabase HTTPS RPC.

Magic-link preflight enforces 5/email/hour, 30/trusted-IP/hour, and a sliding 60-second resend cooldown. It passes only domain-separated HMACs to SQL. Database time defines fixed windows; denied results commit their counters. Email sign-in stays disabled until the direct Supabase Auth endpoint is protected as well as the app route. Do not enable it merely because the preflight passes. Authenticated domain functions use a private helper deriving subjects from auth.uid(); the profile RPC already enforces this and future domain functions must call the helper themselves. Profile writes have an additional 10/user/minute limit; acknowledgement attempts have 30/user/minute, separately from the specified 10 generated intents/challenges/user/minute.

The worker deletes up to 5,000 expired rate buckets every five seconds in a transaction independent of outbox dispatch. Alert on worker downtime or oldest expired bucket approaching 24 hours. External retention monitoring is a release gate; no claim is made that a stopped worker can meet retention. Production ingress uses only Vercel server metadata and x-vercel-forwarded-for. Local fixtures inject the adapter server-side; do not set fake VERCEL variables to make local headers trusted.

## Push staging verification (required, not yet run)

Before interactive testing, run `node scripts/verify-deployment.mjs https://YOUR-DEPLOYMENT.vercel.app` using the pinned Node runtime. This checks database readiness, selected private cache headers, canonical/foreign/missing origins, both OAuth destinations, and the Supabase redirect to Google without logging authentication URLs or cookies. It intentionally stops before user login. Set Vercel's `NEXT_PUBLIC_APP_URL` to the stable testing origin and redeploy when it changes; the app enforces that origin for mutations. This check does not replace the authenticated/device steps below or prove ingress header spoofing resistance.

1. Apply all migrations to an isolated Supabase project, provision the two dedicated runtime logins, configure verified Google Auth and the exact HTTPS callback. Run own-profile RPC/RLS and challenge acknowledgement tests through actual PostgREST with two verified accounts and separate sessions. Confirm missing/deleted sessions are denied.
2. Configure the isolated Firebase web project/API key, app ID, sender ID and VAPID public key. Put the Admin service-account file on the worker host and reference it through GOOGLE_APPLICATION_CREDENTIALS. Supply the same encryption key/ID to web and worker, without printing them. Enable the two push flags only for this isolated environment.
3. Start the worker separately. Sign in, complete the profile, open `/app/notifications`, and explicitly enable notifications. Keep the page visible. Verify a challenge outbox event becomes provider_accepted and only the foreground acknowledgement activates the device. The HTTP registration result must contain no nonce or token. Provider acceptance alone is not receipt.
4. Repeat with the page hidden, a wrong user/session/installation, an expired challenge, a replaced challenge and a second account on the same installation. Background challenges must not activate/display; old generations must be dropped. Sign out while a challenge/notification is pending; verify DB revocation, local IndexedDB clearing, displayed-notification clearing where supported, and a new challenge on the next account. Test real Android Chrome and an iPhone Home Screen installation; emulation is insufficient.
5. Verify Vercel preview header spoofing cannot choose the ingress bucket, private pages/API/SW responses have the intended caching, and missing gateway/worker/provider configuration fails honestly. Keep raw IPs, email addresses, auth data and provider tokens out of evidence logs.

Current worker key loading supports one active encryption key ID. Old-key lookup, rotation/re-encryption and recovery rehearsal are required before production rotation. Existing ciphertext is never silently overwritten merely to accommodate an unavailable key. These limitations are recorded as release gates.
