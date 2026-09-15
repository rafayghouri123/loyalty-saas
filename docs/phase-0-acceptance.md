# Phase 0 acceptance audit

Audit date: 2026-09-15. Outcome: Phase 0 engineering acceptance complete. Scope: the Phase 0 paragraph in section 21 of `LOYALTY_SAAS_IMPLEMENTATION_BRIEF.md` and its section 27.4 phase allocation. This is an engineering foundation audit, not a launch-readiness claim.

## Requirements and evidence

| Phase 0 requirement | Evidence | Scope and result |
| --- | --- | --- |
| Repository inventory and preserved source brief | README, architecture decisions ADR 002, implementation status, Git history | Original brief preserved; initial empty application state and Windows/tooling constraints recorded. |
| Exact runtime/dependency choices | `.nvmrc`, `.node-version`, package.json, package-lock.json, dependency-versions.md | Node 24.21.0 and 39 direct exact package versions; registry/peer verification recorded at setup. Development-only embedded PostgreSQL launcher prerelease exception and TypeScript/ESLint compatibility decisions documented. |
| One-command local web startup and worker startup instructions | `scripts/run.ps1 dev`, package.json, README, development-runbook.md | The web runs independently of the worker. Production build/start is also exercised by the browser suite. |
| Environment example and external dependencies | `.env.example`, deployment-environment.md, implementation-status.md | Web gateway, worker, TLS, Firebase, Auth and key boundaries documented. Live commercial/production inputs remain explicitly pending. |
| Architecture decisions, threat model and tracked tasks | architecture-decisions.md, threat-model.md, screen-checklist.md, schema-checklist.md | Full launch remains tracked across 43 screens and 78 table contracts; these checklists do not claim feature completion. |
| Verified Supabase Auth and RLS boundary | Deployed Google login reached `/app`; verifiedUser uses Auth getUser; actual PostgREST anonymous profile/device reads and complete_profile RPC returned 401 during this audit | Permanent, verified account boundary integrated with the deployed app. Two-customer own-profile RLS and forbidden direct writes are additionally tested in real local PostgreSQL using explicit Auth fixtures. Full two-account hosted PostgREST/session/MFA coverage remains later security evidence. |
| One atomic RPC plus outbox/worker delivery | complete_profile SQL; 23-check integration suite; actual hosted profile/audit/outbox/consumer-receipt join count of one | Local rollback and concurrent replay tests pass. Restricted worker processed the real committed profile event and persisted its receipt. No fabricated customer was created for the hosted audit. |
| FCM foreground registration and coordinated service worker | `/sw.js`, pwa-registration.tsx, actual hosted consumed challenge joined to provider-accepted dispatch and active matching user/installation/generation | One real browser delivery and acknowledgement succeeded; user independently confirmed device connection. The single root registration forwards only foreground challenges. Android/iPhone and real cross-account device coverage remain explicitly pending. |
| Compatibility with selected hosting model | Actual Vercel app registered the challenge using the transaction-pooler gateway and inline CA; separate local Node/pg-boss worker sent through Firebase Admin | The web/DB/worker/provider separation is demonstrated with real services. The bounded verification worker shut down cleanly. Continuous hosted worker supervision remains a Phase 8 deliverable. |
| Cache policy and deployed behavior | ADR 003, next.config.ts, proxy.ts, verify-deployment.mjs; deployed header results below | Current private and public asset boundaries checked on Vercel. Future cafe/pricing projections have documented TTL budgets and remain uncached/unimplemented until their safe projection exists. |
| No committed production credentials | Git tracks only `.env.example` from environment files; current tracked-file scan found zero matches for configured private connection URLs/encryption/HMAC values | `.env.local`, local certificate/credential paths and tool runtime are ignored. This targeted check is not a comprehensive historic secret-scanner certification. |

The hosted database's three recorded migration bodies matched the three repository migration files exactly during this audit. The local TLS adapter also connected using inline PEM while supplied a nonexistent workstation path, exercising the Vercel certificate configuration fix.

## Deployed cache evidence

Observed on `https://loyalty-saas-three.vercel.app` on 2026-09-15 (local date):

| Resource | Observed behavior |
| --- | --- |
| `/`, current configuration-dependent public landing | 200; private/no-cache/no-store; Vercel MISS |
| `/auth/login`, `/app`, readiness and OAuth initiation | Private/no-store, verified by deployment script |
| `/auth/callback` without a code | 307 to login; private/no-store; no-referrer |
| Hashed `/_next/static/…js` | 200; public, max-age=31536000, immutable; CDN HIT on both requests |
| `/privacy`, `/terms` placeholder pages | 200; public, max-age=0, must-revalidate; Vercel PRERENDER; real policy content remains unconfigured |
| `/sw.js`, `/push-protocol.js`, manifest, versioned icon | 200; public, max-age=0, must-revalidate |

Current public application-data cache allowlist is empty. Planned safe cafe projections have a maximum 60-second shared TTL; published marketing/pricing a maximum 300 seconds, without stacked stale windows. Authenticated data remains no-store. These future projection TTLs cannot be tested before their Phase 2 implementation. Full cold/expiry/production CDN measurements belong to the later deployment/release checks.

## Phase allocation and remaining launch gates

Section 27.4 explicitly states: “Phase 0 records region defaults and external worker requirements.” It assigns worker deployment instructions/environment separation to Phase 8 and regional measurements, worker recovery and final production selection to Phase 9. Phase 0 also explicitly permits unavailable external-device evidence to remain a named pending gate. The initial status file mixed these release requirements into Phase 0's open checklist; they are retained in scope here without requiring all later deployment work before foundation acceptance.

Still required for launch: persistent worker host/supervision and monitoring; protected staging/preview isolation and ingress spoofing proof; complete hosted two-account/session/MFA tests; Android/iPhone installation, foreground/background and account-switch tests; Singapore/Mumbai measurements; all Phases 1–9 features and their acceptance tests. The successful challenge does not prove marketing delivery, real-device coverage, or production readiness.

Final browser regressions: all six tests passed on Chromium desktop and 360px mobile against a freshly built production server on 2026-09-15. Tests cover honest public/setup states, private headers, manifest/service-worker caching and clearing a prior device binding from real IndexedDB. They do not simulate successful provider delivery; the separate live challenge supplies that evidence. Phase 1 may now begin after this audit closure, per the user's instruction; no Phase 1 implementation was included in the closure work.
