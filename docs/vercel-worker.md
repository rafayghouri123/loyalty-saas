# Vercel worker deployment

The user requested Vercel worker hosting on 27 September 2026. This supersedes the attached specification's separate persistent Node host for this deployment. The queue remains PostgreSQL/pg-boss; Vercel Workflows orchestrates bounded consumers rather than launching the daemon inside a request. No Redis or Inngest was introduced.

`workflow@4.8.9` is pinned to the current stable release. Compatible patched transitive pins (`nanoid@5.1.16`, `undici@7.30.0`) eliminate the SDK's dependency advisories; the full dependency audit reports zero vulnerabilities. The build verifies both worker steps are registered, because successful Next compilation alone did not catch an SDK import-discovery failure. Use extensionless imports between Workflow and step modules. Generated SDK routes are ignored and rebuilt.

## Execution and recovery

Each batch opens the restricted worker session connection, takes a PostgreSQL session advisory lock, and checks the exact generation, deployment, epoch and Workflow run ID. Older deployments, stale generations, orphan child runs and overlapping invocations cannot consume work. All connections and timers close at the end of the invocation. pg-boss's background scheduler, pollers and automatic schema migration are disabled in this mode. Its explicit fetch/complete/fail/supervision APIs preserve stored retry counts, backoff, dead letters and expiration recovery. Existing queue metadata is reused, each claimed job is acknowledged independently, SQL has a 15-second timeout, and bounded Storage cleanup follows consumption with 20-second HTTP timeouts. A broken outbox dispatch or purge cannot prevent consumption of already queued jobs.

Outbox enqueue and marking still share one database transaction. The same business consumers and receipt/lease rules run in both hosting modes. A batch claims at most 50 jobs and starts additional work for at most 20 seconds; an already claimed job can finish within the Function's 300-second limit. A terminated invocation leaves its active pg-boss job for expiration/retry; it cannot acknowledge unfinished work. Account export requests retain their existing 24-hour deadline and retry/part reservation rules. Extremely large exports must be checked against Function limits before launch.

UTC minute/hour/day buckets produce stable pg-boss IDs for scans, hourly billing, daily reconciliation and retention. Missed cleanup periods run on recovery; source timestamps remain authoritative for billing and campaign eligibility. Workflow sleeps for ten seconds between batches without holding a database connection. After 120 batches, a step starts a child pinned to the same deployment while holding the control lock, then commits the child's exact run ID and next epoch. A child started before a failed database commit remains inert. Replayed handoffs cannot advance an already changed epoch.

The authenticated daily Vercel Cron calls `GET /api/worker/control` as a watchdog. It leaves a current fresh controller alone and starts a new generation if stale or from a different deployment. It uses daily cron to remain valid on Hobby. This is a fallback, not an independent alert service; a permanently failed controller can wait until the next daily cron unless an operator restarts it. The user-selected [separate Vercel monitor](vercel-monitor.md) now performs five-minute checks and sends verified Discord alerts. Its own Workflow/role/deployment is separate, while platform/account failures remain shared.

## Server configuration

Configure only the intended Vercel production target (the application is isolated **staging**, `APP_ENV=staging`): `VERCEL_WORKER_ENABLED=true`, `WORKER_DATABASE_URL`, `WORKER_DB_SSL=true`, inline `DATABASE_CA_CERT_PEM`, random `CRON_SECRET` of at least 32 characters, and the existing Storage/encryption keys. The worker connection must use the session pooler on port 5432; transaction pooling cannot hold the controller lock. Never deploy the migration/operator URL or workstation certificate/Firebase paths.

Media processing, report exports and privacy processing are enabled on staging. Live FCM and Auth-email sending remain disabled; hosting does not authorize customer campaigns. If FCM is explicitly enabled later, supply server-only `FIREBASE_SERVICE_ACCOUNT_JSON` with a matching project ID; mounted Windows credential paths cannot work on Vercel. Browser/gateway database roles cannot invoke controller functions or read its table.

The web and worker execute in `sin1`. Stable Workflow 4.x stores its orchestration state in `iad1`; multi-region Workflow state placement is a 5.x beta feature and was not silently enabled. This does not change PostgreSQL or Function placement.

## Control, redeployment and rollback

`node scripts/control-vercel-worker.mjs start` activates the current deployed revision. `ensure` uses the watchdog behavior, and `stop` disables consumption. The tool reads `CRON_SECRET` from the environment or the ignored `.local/vercel-worker-secret` file; it never prints the bearer secret. `WORKER_CONTROL_ORIGIN` may select another HTTPS deployment. After every deployment or rollback, run `start`, then verify the new deployment ID and advancing heartbeat through `worker_vercel_status()` with the restricted worker role. A busy response means a batch holds the lock; retry after it finishes.

The private staging-only `POST /api/worker/control?waves=3` shortens run histories for a real handoff test. The secret is still required, valid bounds are 3–120, and production applications reject this override. Return to the ordinary `start` endpoint after the check. Turning off `VERCEL_WORKER_ENABLED` requires redeployment; `stop` takes effect at the next batch boundary without deleting queued work or financial data. Do not run a separate persistent daemon alongside this controller.

## Capacity gate

The actual project is **Vercel Hobby**. Workflows includes 50,000 events/month on Hobby. Every normal step produces three events and waits also persist transitions; ten-second idle polling produces hundreds of thousands of events/month, exceeding that allowance even without business jobs. Workflows also uses metered Queues and Function compute. This staging deployment is not evidence that the Hobby allowance sustains an always-on launch workload. No plan upgrade or purchase was performed. Establish adequate plan/budget capacity and independent alerts before launch; track usage in the Vercel dashboard.

Provider references: [Workflows](https://vercel.com/docs/workflows), [Workflow pricing and limits](https://vercel.com/docs/workflows/pricing), [Cron plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Next.js SDK setup](https://workflow-sdk.dev/docs/getting-started/next).
