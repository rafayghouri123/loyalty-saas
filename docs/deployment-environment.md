# Phase 0 deployment settings

Use a dedicated staging Supabase/Firebase environment for verification. The current user-supplied HTTPS testing origin is `https://loyalty-saas-three.vercel.app`. Its Vercel Production deployment target does not establish production readiness. Keep preview deployments isolated from live customer data.

## Vercel web application

Copy values into the selected Vercel environment, then redeploy. Empty placeholders below must be replaced with the configured service values; do not paste this template over existing secrets.

```dotenv
APP_ENV=staging
NEXT_PUBLIC_APP_URL=https://loyalty-saas-three.vercel.app
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
WEB_GATEWAY_DATABASE_URL=
WEB_GATEWAY_DB_SSL=true
DATABASE_CA_CERT_PEM=
PUSH_REGISTRATION_ENABLED=true
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
ENCRYPTION_KEY_ID=
ENCRYPTION_KEY_BASE64=
RATE_LIMIT_HMAC_KEY_BASE64=
```

Use the existing restricted web gateway transaction-pooler URL. `DATABASE_CA_CERT_PEM` contains the actual Supabase CA certificate, including BEGIN/END CERTIFICATE lines. Alternatively use `DATABASE_CA_CERT_BASE64`; leave other certificate sources unset. A Windows path does not point to a file on Vercel. Certificate verification stays enabled.

Firebase web values and VAPID must belong to the same configured project. Copy the existing encryption key and its ID through provider secret stores to both web and worker; independently generating a worker key will prevent it from decrypting web-created challenges. No secret gets a NEXT_PUBLIC prefix. Google client credentials belong in Supabase's Google provider settings.

The notification page requires all its configuration, not just the enable flag. A configuration-enabled button does not prove provider delivery or a running worker.

## Separate persistent Node worker

Select a persistent process host; the worker is not a Vercel function. The host must install the repository's pinned Node version/dependencies, compile the worker, supervise its start command, and restart it after failures.

```dotenv
APP_ENV=staging
WORKER_DATABASE_URL=
WORKER_DB_SSL=true
DATABASE_CA_CERT_PEM=
LIVE_PUSH_ENABLED=true
FIREBASE_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=
ENCRYPTION_KEY_ID=
ENCRYPTION_KEY_BASE64=
```

Use the restricted worker session-pooler URL. Mount the Firebase Admin JSON as a secret file on that host and set `GOOGLE_APPLICATION_CREDENTIALS` to its path there. The Windows file path works only when running the worker on that same Windows machine. The web application does not need this Admin credential or the migration connection.

Install with `npm ci`, compile with `npx tsc -p tsconfig.worker.json`, and start with `npm run worker:start`. For a supervised local verification only, `scripts/run.ps1 worker:dev` uses the existing ignored `.env.local`; keep the terminal running during registration. That temporary process is not evidence of persistent hosted supervision.

Enable live push only in the isolated test environment for an explicitly participating test device. The worker sends registration challenges, staff-only campaign tests and consent-scoped campaign/automation messages. Keep the notifications page visible while confirming the foreground challenge. Provider acceptance is not receipt: the device must acknowledge before activation, and a campaign test still needs an observed browser receipt/open check.

## Verification

If registration fails immediately with “Notifications could not be registered. Please retry.”, inspect the Vercel function log for `push_registration_failed`. Only share its `code` and `correlationId`. Codes identify certificate/TLS, database credentials/connectivity, gateway role/configuration, encryption key format, missing migrations, or session/permission checks. `database_permission_or_session` requires further investigation; do not broaden role grants to suppress it. An `unexpected_failure` needs further diagnosis. A stopped worker instead leaves a successfully registered challenge waiting until confirmation expires.

Run `node scripts/verify-deployment.mjs https://loyalty-saas-three.vercel.app`, sign in through Google, then open `/app/notifications`. Confirm the device after the worker is running. Record actual foreground acknowledgement, hidden-page rejection, logout/account-switch behavior, and Android/iPhone results separately. Do not copy tokens, cookies, private keys or raw provider URLs into evidence.

Persistent host selection/supervision, real foreground receipt, device coverage and ingress spoofing evidence remain open gates. See `development-runbook.md` and `implementation-status.md`.
