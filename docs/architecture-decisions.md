# Implementation decisions

## ADR 001: preserve the specified modular monolith

Next.js App Router, React, strict TypeScript, Supabase Auth/PostgreSQL/Storage, FCM and a separate persistent pg-boss worker remain the architecture. No incompatible existing code exists. No ORM, Redis, Inngest, automated WhatsApp sender, native app or background geofencing is introduced. Vercel is the explicit requested web host; its request functions never start pg-boss.

Normal operations use user-scoped Supabase HTTPS RPC. Every privileged function validates the verified actor, tenant, full affected branch set, role and live state. Runtime roles do not use migration credentials. Worker functions expose narrow operations, not generic SQL access to browsers.

## ADR 002: development and integration evidence

Audited environment: Windows/PowerShell; system Node 22.12.0; bundled Node 24.19.0; npm available. Docker, psql and Supabase CLI absent from PATH. No Supabase/Firebase/database/Vercel environment variable names detected. There is no existing Git commit. Global Codex AGENTS.md exists but is empty; no applicable project/ancestor AGENTS.md found.

During the first `next dev`, Next.js 16.3.5 generated its managed AGENTS.md and CLAUDE.md. The user explicitly supplied the same rules. Read the installed route-handler, proxy, cookies, CDN-caching and PWA guides before subsequent changes, and retain the managed files in the checkpoint. New Next.js changes require the relevant installed guide. In development Next.js overrides page cache headers; release-header tests use a production build/start and keep deployed Vercel verification separate.

Use a pinned Node 24 LTS runtime and npm lockfile. A local real PostgreSQL harness may validate SQL constraints, functions, concurrency and role grants without Docker. Its explicit Auth test adapter cannot establish Supabase GoTrue/PostgREST/Storage behavior; those require the local Supabase Docker stack or isolated staging project. Never relabel database-harness tests as complete Supabase integration.

## ADR 003: cache and deployment boundaries

Provisional Vercel sin1, Supabase ap-southeast-1 and nearby persistent worker. Final production selection requires comparison against bom1/ap-south-1 from Pakistani networks. No Pakistan compute/CDN region is invented.

Private pages, auth/invite callbacks, API operations and downloads are private/no-store. Public sanitized cafe projections may have one CDN TTL of at most 60 seconds; published marketing/pricing at most 300 seconds, without an additional framework TTL or stale window. Leave responses uncached until their public projection is safe. Content-addressed public assets may be immutable for one year. Manifest and service-worker scripts revalidate. Reports query indexed source tables directly with current authority, 90-day limits, pagination and a database statement timeout established before execution.

## ADR 004: integration before broad UI

Phase 0 first proves a small authenticated database operation with atomic audit/outbox effects and a durable worker consumer. Push uses a foreground receipt challenge and one coordinated service worker; unavailable credentials are an explicit pending verification, never simulated delivery. Do not build all 43 screens before this boundary exists. The screen checklist is a traceability ledger, not an assertion that unimplemented routes are finished.

## ADR 005: secret gateway, rate keys and installation possession

Normal mutations retain user-scoped Supabase RPC. A separate `loyalty_web_gateway` role handles only server-derived IP/email subjects and encrypted push challenge creation. A bounded PostgreSQL pool is needed for these server-only operations because granting the publishable-key role a generic limiter or nonce-selection function would let callers select their own subjects or counterfeit receipt proof. No service-role/migration credential is used. The provider transaction pooler and runtime role grants must be verified on Vercel staging.

The database generates a private 256-bit HMAC key for direct authenticated RPC subjects; the web keeps its separate ingress/email key in its secret store. The existing rate_limit_buckets fields implement fixed windows and the separate resend cooldown without another public table. Denials return a typed result so the counted attempt commits; an exception would roll it back. Future failed-code/report/export/financial wrappers must preserve this behavior.

The audited push device/challenge contracts need two private supporting records: the rate key singleton and an installation possession registry. A server-set HTTP-only anonymous cookie contains the installation ID plus a random secret; SQL stores only its hash. This prevents an editable installation UUID from evicting another device. Candidate user/session/generation and encrypted nonce stay on the challenge until receipt is acknowledged. Starting a challenge for an existing token never changes its active owner or generation. Consumed/canceled challenge states, encrypted nonce/key ID and dispatch state are additive supporting fields. A short shared advisory lock serializes binding changes across installations to avoid cross-rebind deadlocks; no provider work runs inside that lock. Load verification of this provisional locking choice remains pending.

Registration sends use data-only FCM through the supplied root service-worker registration. The worker decrypts only at provider dispatch; the browser's native push handler relays registration data only to visible windows. A matching same-session nonce acknowledgement is mandatory. Challenge sends get one attempt: ambiguous sends become unknown and require a fresh explicit registration, rather than applying the later campaign retry policy. The local SQL/queue capture and service-worker harness prove boundaries, not Firebase or physical-device delivery.

Sources checked 2026-09-13: [Vercel request headers](https://vercel.com/docs/headers/request-headers), [Supabase session identity and revocation](https://supabase.com/docs/guides/auth/sessions), [FCM web setup](https://firebase.google.com/docs/cloud-messaging/web/get-started), and [FCM web message reception](https://firebase.google.com/docs/cloud-messaging/web/receive-messages). The custom native service-worker receipt adapter specifically requires the listed real-provider verification; documentation alone is not release evidence.

## ADR 006: Phase 1 screen contracts and fail-closed routes

All 43 section-25 layouts use typed, role-grouped presentation contracts and shared accessible controls. The server serializes only the selected screen plus navigation labels into the local gallery. Required/optional fields, conditional selectors, read-only outputs, prospective tables/operations and permission visibility stay explicit. Client validation is reusable but does not substitute for future RPC/database enforcement.

Until Phases 2–8 connect persisted records and authority, newly added actual routes render an unavailable boundary; cafe/referral destinations without an implemented public projection return 404. Fixture role/grant/state parameters exist only behind a server-side local-development/test gate that rejects Vercel environments. No mock role can unlock a live mutation or retrieve tenant data. This deliberately separates design acceptance from persisted feature acceptance under section 25.9.

No new dependencies were added. Native dialog supplies modal focus containment/Escape, and native form controls remain labelled. The camera shell is lazy-loaded, requests permission only after a user action and releases tracks on stop/unmount; Phase 3 supplies actual decoder/authorized lookup. Reporting stays empty until source queries exist; no fake trend or zero metric is introduced.

Installed Next.js 16.3.5 guides consulted for layouts/pages, dynamic routes, forms, server/client boundaries, error retry and Playwright. Error boundaries use the installed stable `retry` prop. Avoid parallel Next build/typegen commands because they mutate the same `.next/types` directory.

## ADR 007: Phase 2 authority, uploads and verification boundaries

Every scoped RPC rechecks the verified retained profile, live Auth session, current business role and branch assignments. Owner mutations require AAL2; operator ownership transfer additionally requires support authority and recent authentication. Deferred database constraints enforce exactly one active owner. Serialized business locks protect invitation reservations, membership quotas and initial publication. Invitation links are manually shared; token hashes are stored, raw tokens are returned only at creation/rotation. Failed acceptance attempts retain their limiter increment outside the rolled-back mutation subtransaction.

Browser uploads go directly to a private Supabase quarantine path reserved for the current owner. A private upload-grant table records path, owner and expiry; it exposes no generic Storage capability. The persistent worker decodes and re-encodes allowed raster media, strips metadata and writes immutable version paths to public branding or private evidence buckets. A worker-only service credential is restricted by application usage to Storage HTTP; database work continues through the restricted worker role and narrow RPCs. Web routes never use that credential. Production secrets and persistent supervision remain deployment gates.

The isolated integration harness runs real PostgreSQL, pg-boss and Sharp. Its Auth/Storage catalog fixtures and captured object transport prove SQL/decoder behavior, not actual Supabase JWT verification or Storage delivery. Browser form failure interception proves request contracts and retained inputs, not server persistence. Live provider MFA, context-preserving callbacks, Storage policies and authenticated cross-user HTTP caching remain separate acceptance gates. Public projections stay uncached until those gates pass.
# ADR 008: Grant-bound Auth email delivery

Supabase's SQL Send Email hook requires a short-lived, one-use grant issued by the restricted web gateway after shared PostgreSQL email/IP limits. Direct provider OTP requests cannot generate grants. The hook binds the recipient and callback, encrypts the temporary message payload in a private table, and writes only a grant ID into the transactional outbox. The persistent pg-boss worker calls Resend with a stable idempotency key and clears ciphertext after provider acceptance; expiry cleanup handles abandoned requests. Only signup/magic-link emails are supported. Google OAuth is unaffected.

The management token is operator-only. The worker uses restricted SQL and the Resend key; the web process receives neither management nor email-provider credentials. Production email enablement also requires trusted Vercel ingress, a verified sender, and an operating persistent worker. Sandbox delivery does not demonstrate human-inbox deliverability.
