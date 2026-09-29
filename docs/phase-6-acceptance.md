# Phase 6 acceptance — manual WhatsApp follow-ups

Date: 26 Sep 2026. Scope: section 11, Phase 6, section 24.7, O13/O14 and the contact/history parts of O04 in `LOYALTY_SAAS_IMPLEMENTATION_BRIEF.md` v1.6. The user's request was to complete Phase 6 after Phase 5. The attached start prompt and brief provided project requirements; they did not expand this request into Phases 7–9.

## Implemented behavior

| Requirement | Implementation and evidence |
| --- | --- |
| Persisted templates | Live O13 editor; exact four-placeholder grammar, 10–1000 trimmed Unicode code points in UI/API/SQL, literal single-pass substitution, versioned edits and stale-edit conflicts. Previously created tasks keep their message snapshot. |
| Eligible task generation | Selected members, inactive and reward-ready audiences; real published reward/offer requirements; consent, membership, phone, branch and rendered-length exclusions. Preview displays exclusions and recent contact. At most 100 candidates; broader audiences fail with a request to narrow selection. Creation rechecks eligibility under member locks, uses an idempotency key and creates one task per batch/member. |
| Correct chat handoff | Explicit Open action requests a fresh authorized link. A maintained phone parser supports Pakistani local numbers and other valid countries, rejects extensions, and constructs `https://wa.me/<international digits>?text=<encoded text>`. Emoji, newlines and punctuation round-trip. No open link is pre-rendered into page HTML. |
| Human workflow | Live O14 list/detail with batch, status, assignee and date filters; current consent, verification status, message, history and authorized number. Open changes only the opened state. Mark as sent requires an explicit human attestation and confirmation; it can record already-completed manual work without claiming the app observed it. Skip accepts an optional reason. |
| Authorization | Owner mutations require AAL2. Managers require current contact permission and assigned-branch member scope. Cashiers and customers cannot use contact operations. Assignments reject cashiers, other tenants and staff outside member scope. Browser raw-table access is denied; SQL RPCs are the final authorization boundary. Revocation is rechecked for every operation. |
| Concurrency and frequency | Row-version checks, serialized member locks and a five-minute staff lease prevent simultaneous takeover. An expired lease permits reassignment. Distinct tasks cannot open for the same business/member within 24 hours; reopening the same assigned task is allowed. A shared database limiter allows 30 open attempts per staff/business/hour, including persisted rejected attempts. Manual activity does not consume automated push allowance. |
| Contact changes and STOP | Current consent and contact version are checked before opening or marking sent. Phone changes reset verification/consent and block old tasks even after a fresh opt-in. Customer opt-out or a staff-recorded STOP immediately suppresses every unsent task and releases leases. Staff cannot opt customers in or replace their phone. Optional number confirmation requires customer-initiated-chat attestation and a reason. |
| Honest results | List counts separately show opened and staff-marked-sent tasks. Follow-up events have no provider delivery/read state. There is no WhatsApp sender, background session, inbound webhook or automated Send action. Broader owner reporting remains Phase 7. |
| Privacy and operations | Verified private POST endpoints enforce origin, bounded JSON and strict fields, with no-store/no-referrer responses. List/preview projections omit phones. Audit fields omit contact/message content. The worker clears message snapshots and free-text event notes after 90 days while preserving minimal action history. Canonical offer origin is configured only by an operator. |

## Verification

- Real PostgreSQL integration harness applies all migrations, regenerates database types/diagram and exercises direct grants/RLS/RPCs, concurrency, rollback, cross-tenant FKs, consent changes, public-offer URL configuration, lease expiry and cleanup. SQL Auth fixtures are explicitly synthetic and do not substitute for provider verification.
- Unit checks cover Unicode bounds, exact grammar, safe literal rendering, missing values, phone validation/encoding and explicit attestation.
- Production-build Playwright checks cover desktop and 360px layouts, save failures, batch preview/exclusions, stale selection, idempotent retry, deliberate chat popup, confirmation, opted-out/stale disabled controls and private endpoint headers. Fixture routes remain gated from hosted/production use.
- Migrations `202609260048`–`202609260050` were applied successfully to the isolated staging Supabase project. Real hosted Auth sessions, owner TOTP/AAL2, PostgREST and the local production web server passed scoped template/task creation, cashier/customer/other-owner denial, raw-table denial and private headers. A persisted 360px task page opened the exact encoded destination; opened and human-attested counts stayed distinct. The 24-hour gate and authenticated customer opt-out suppressed later tasks. Synthetic businesses were archived and test users removed.
- WhatsApp destinations were intercepted in browser/provider tests. No real WhatsApp message was sent. The synthetic sent attestation verifies stored workflow semantics, not provider delivery.

Final verification: 114 PostgreSQL checks and 51 unit tests passed; 48 broad browser checks passed, followed by all 10 final Phase 6 desktop/mobile checks after correcting the new batch test's exact-label selector. Lint, typecheck, production web/worker build and fixture 404/no-store isolation passed. Run `test`, `test:integration`, `test:e2e`, `lint`, `typecheck` and `build` through `scripts/run.ps1`. The operator-only staging test is `test:phase6:provider`; it creates and cleans up synthetic accounts and refuses non-staging configuration.

## Remaining release gates

Physical Android/iPhone/browser-to-native WhatsApp handoff and the staff device's cafe account require Phase 9 device QA. The application cannot inspect which WhatsApp account is logged in. Configure the real deployed HTTPS origin before templates can use `public_offer_url`; a missing origin blocks preview instead of inventing a link. Persistent worker hosting and reviewed financial/audit/backup retention remain Phase 8. Phase 6 is complete within this scope; this is not production launch acceptance.

See [Phase 6 operations](phase-6-operations.md) for setup and staff workflow.
