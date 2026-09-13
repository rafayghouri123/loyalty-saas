# Launch trust boundaries and verification plan

| Boundary | Threat | Required protection and evidence |
| --- | --- | --- |
| Browser → Auth/RPC | User-controlled role, anonymous account, unverified session | Verified Auth identity, permanent account, authoritative staff rows; direct API/RPC denial tests |
| Tenant and branch | Copied UUID, competitor member, mixed-tenant FK | Composite tenant FKs, deny-by-default RLS, narrow projections, assigned-branch authorization |
| Owner/admin | Stale role, missing MFA, old authentication | AAL2 in SQL and UI, current role lock, 15-minute fresh auth for specified actions |
| Checkout | Copied earning QR, expired intent, lookup replay | Hashed session/actor/branch-bound contexts; earning never authorizes redemption |
| Financial writes | Retry, race, stale preview, reversal after spend | Scoped idempotency then sorted membership locks; one SQL calculator; immutable ledger and atomic outbox |
| Promotions/referrals | Cap race/version reset, stale attribution | Stable promotion/member/date cap, stored referral rules, exact canonical random code, unavailable resolver |
| Push | Stolen token, shared installation, revoked consent | Foreground challenge, generation matching, per-send authority/consent/expiry checks; unknown provider outcome retained |
| WhatsApp | Contact leak, changed number, fake send metrics | Explicit contact permission, task lease/version, consent recheck; only manual Open and staff attestation |
| Ingress/limits | Spoofed headers/IP subjects | Controlled Vercel ingress only; strict literal canonicalization; server HMAC; shared PostgreSQL gates |
| Uploads | Malicious/oversized image, public proof | Direct private quarantine, signature/decode/re-encode, 20MP/5MiB limits, private proof renditions |
| Reports/exports | Cross-branch leakage, CSV formula, stale permission | Indexed scoped queries, pre-statement timeout, 90 days/10k rows/3MiB bounds, private download reauthorization |
| Billing | Proof screenshot as payment, duplicate/late reference | Verified operator evidence, immutable exact payment/correction events, fixed calendar coverage |
| Privacy/recovery | Owner orphaning, restored consent/token data | Resumable erasure with tombstones, owner blocker, replay privacy/revocation before restored dispatch |

Secrets, raw IP addresses, phones, birthdays, full auth URLs, push tokens, intent secrets and message bodies must not enter operational logs. External-provider failures remain failures, never fabricated empty/success results.
