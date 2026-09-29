# Phase 9 authorization and security evidence

The real PostgreSQL regression run passed **159 checks** on 28 September 2026. The SQL Auth fixture supplies verified-context claims for boundary tests; prior provider acceptance separately exercises real Supabase Auth/TOTP/PostgREST/Storage. Browser fixture tests prove controls, not persistence. Generated function privilege inventory: `.local/phase9-security-inventory.json` (regenerate with `npm run test:integration`).

| Actor | Permitted boundary | Required denials and actual test source |
| --- | --- | --- |
| Visitor / unverified / anonymous Auth | Sanitized published configuration | All public tables have RLS and zero anonymous table privileges. Unverified/anonymous profile RPC denied. Worker/gateway functions inaccessible. `test-integration.mjs`, `test-phase9-security.mjs` |
| Customer A at cafes A and B | Own memberships, exact consent, card and intent | Owner of cafe A cannot query global profile or cafe B relationship; another account cannot read card/intent/export/birthday offer. `test-tenancy.mjs`, `test-loyalty.mjs`, `test-phase5.mjs`, `test-phase8.mjs` |
| Cashier | Assigned-branch lookup, preview, purchase and intent fulfillment | Other branch/business, arbitrary member ID, customer list/contacts/export, owner mutations, fabricated permissions rejected. `test-tenancy.mjs`, `test-loyalty.mjs`, `test-phase6.mjs`, `test-phase7.mjs` |
| Manager | Assigned branches, separate campaign/contact/reversal/export grants | Multi-branch publication needs all branches; no owner settings; export+contact both needed; revoked grants block the next call and download. `test-phase4.mjs`–`test-phase7.mjs` |
| Owner | Own tenant and all its branches | AAL1 mutation denied; >=1000 adjustment needs fresh auth; cannot access another tenant; cannot delete account and orphan business. `test-loyalty.mjs`, `test-phase8.mjs` |
| Administrator | Active capability, AAL2, audited reason/support grant | Billing and support capabilities independent; stale auth/payment evidence alone denied; no routine global customer browse/export. `test-phase8.mjs` |
| Worker / gateway / monitor | Dedicated narrow operations | No raw profile reads; browser cannot invoke their functions; invalid tenant payload rejected; monitor cannot mutate queue/control. `test-integration.mjs`, `test-vercel-worker.mjs` |

Every application SECURITY DEFINER has an empty fixed search path. Browser roles have no direct INSERT/UPDATE/DELETE/TRUNCATE on application tables. Composite FKs, immutable source records and per-RPC scope checks are tested, not inferred solely from that catalog audit.

| Threat / state transition | Regression evidence |
| --- | --- |
| Earn -> identical retry / changed-payload conflict | Same receipt and no duplicate ledger/outbox; wrong payload fails; `test-loyalty.mjs` |
| Intent -> concurrent finalize / consumed replay / expiry | One debit and fulfillment; earning QR never authorizes redemption; `test-loyalty.mjs`, `test-phase5.mjs` |
| Referral pending -> qualified -> reversed | Single qualification, stable cap, both-party reversal including debt; disabled destinations and captured rules; `test-phase4.mjs` |
| Double slot draft -> enabled -> changed/paused | Non-overlap concurrency, half-open time boundaries, stale preview after lock wait, no version cap reset; `test-phase4.mjs` |
| Consent/device -> revoked / account switch | Challenge ownership, installation generation, no stale-cache/push rebind; SQL and browser tests, physical phones pending |
| Campaign scheduled -> paused/canceled/expired/completed | Fresh consent/authority, zero audience, two devices vs one member, provider unknown outcome, no blind retry; `test-phase5.mjs`, `campaign-dispatch.test.ts` |
| Follow-up assigned -> opened -> human marked / STOP | Lease/version/contact gate; no automatic sent/delivery status; `test-phase6.mjs` |
| Report/export -> timeout / revocation / expiry | Real 5-second DB cancellation, 90-day bound, 10k/3MiB bound, formula escaping, current download permission; `test-phase7.mjs` |
| Invoice -> paid -> corrected; grace -> suspended | Exact amount/reference, anchored coverage, balance preservation; `test-phase8.mjs` |
| Privacy pending -> blocked/processing/failed/completed | Owner blocker, resumable Auth deletion, multipart export, retained ledger, post-backup replay; `test-phase8.mjs`, `rehearse-restore.mjs` |
| Consumer dies after effect, before queue acknowledgement | Actual subprocess termination, pg-boss expiration/retry, exactly one durable receipt; `test-phase9-security.mjs` |
| Script injection / spoofed nonce | Enforced per-request CSP overwrites incoming nonce/CSP, blocks inline injected code, preserves hydrated controls; `phase9.spec.ts` |
| Image/polyglot/secret/CSV boundary | Decode/re-encode private quarantine, oversized payload denial, source/bundle/log scan, escaped spreadsheet cells; tenancy/report/provider tests |

Known policy refinements: HTML is dynamically rendered and no-store so CSP nonces are never shared. Scripts have no production unsafe-eval/unsafe-inline. Styles permit inline React merchant accents and chart layout. Connections allow only same-origin, the configured HTTPS Supabase origin and the three FCM registration/install endpoints; camera is same-origin, location/microphone disabled. This is defense in depth, not a substitute for SQL authorization.

Pending external evidence: physical shared-phone/push/camera behavior, real Pakistan networks/matched region benchmark, deployed ingress spoof-resistance against a common limiter bucket, current provider recovery procedure, hosted backup/Storage restore and purchased capacity. These are not marked passed by catalog or emulated browser checks. Dependency audit is point-in-time; run it and the regression suite for each release. No independent penetration-test certification is claimed.
