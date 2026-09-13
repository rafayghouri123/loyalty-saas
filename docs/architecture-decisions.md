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
