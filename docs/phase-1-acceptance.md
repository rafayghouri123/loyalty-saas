# Phase 1 — design system and route skeleton

Scope: section 21 Phase 1 and the controls/layouts in section 25 of the v1.6 brief. Phase 1 does **not** complete the persisted features allocated to Phases 2–8. No production deployment or live messages are part of this handoff.

## Review locally

Run `./scripts/run.ps1 preview:screens`, then open `/ui-fixtures/screens`. This command sets fixture mode and disables Auth/push configuration for this process only; it does not edit `.env.local`. Normal `dev` also permits the gallery when `APP_ENV=development` is configured. The index links all 43 P/C/S/O/A contracts. The existing public landing and authenticated profile/device integration remain intact.

The gallery requires `APP_ENV=development` or `test`, and rejects any environment with `VERCEL` or `VERCEL_ENV` set. Gallery pages and the existing form fixture are private/no-store and noindex. The local review link is omitted outside that gate. `node scripts/verify-fixture-isolation.mjs` checks an already-built app in production mode and a deliberately misconfigured hosted-development mode; both must return 404 without fixture data.

Each contract has explicit route, read-only/computed fields, form fields, bounds, optional/default behavior, action labels, prospective operations/tables, and role/capability visibility. See `src/features/screens/{public-customer,staff-owner,operations}.ts` and the [screen checklist](screen-checklist.md). Only the selected contract is serialized to the gallery client; camera UI is lazy-loaded. No camera decoder or reporting chart library is loaded by ordinary customer screens.

Useful review URLs:

- `/ui-fixtures/screens/P02` — public cafe illustration; `?variant=member` shows the existing-member action.
- `/ui-fixtures/screens/P04?variant=mfa` or `?variant=invite` — account access variants.
- `/ui-fixtures/screens/P05?variant=rejoin` — retained membership, current terms, no new contact/referral inputs.
- `/ui-fixtures/screens/C02?state=offline` — stale own-card presentation, no new codes.
- `/ui-fixtures/screens/C03?variant=eligible` — illustrative eligible reward confirmation; no real intent issued.
- `/ui-fixtures/screens/C04?variant=discount` — claimable offer controls; default informational offers omit claim controls.
- `/ui-fixtures/screens/C07?variant=birthday` — preview with the saved-birthday prerequisite satisfied; default disables birthday consent until a date exists.
- `/ui-fixtures/screens/S01` — explicit camera request, denied/unavailable/no-camera guidance and typed fallback.
- `/ui-fixtures/screens/S02?variant=points` — server-context points mode; default stamp mode requires attestation.
- `/ui-fixtures/screens/O04?role=manager` — no contacts or owner adjustment controls.
- `/ui-fixtures/screens/O13?role=manager&grants=contacts` — explicit contact-capability preview. Cashier grants cannot enable manager tools.
- `/ui-fixtures/screens/A04?role=admin&grants=` — billing denied without the explicit capability.

Fixture roles are presentation inputs on this local-only route. They are not sessions, JWTs, authorization, or a production bypass. Ordinary `/staff`, `/dashboard`, `/admin`, member-detail, invitation, MFA and join route skeletons expose no tenant records and no live domain mutations until their authoritative server boundaries are implemented. Unknown cafe/referral destinations return the common 404. Existing verified sign-in/profile/push behavior is preserved.

## Delivered

| Requirement | Evidence |
| --- | --- |
| Platform tokens and responsive type/spacing | Existing specified palette and self-hosted Inter retained; explicit control/card radius tokens, 16px mobile gutters, 1280px maximum layout, reduced motion and focus styles |
| Accessible primitives | Labelled fields and inline descriptions/errors; Unicode character counts; select/multiselect/checkbox/money/date/file controls; keyboard tabs; native modal focus containment, Escape and focus return; status announcements; scrollable labelled tables and 25/50/100 pagination |
| Role shells | Customer bottom navigation, staff scan/activity/account navigation, desktop owner/admin sidebars and mobile expandable navigation; owner-only sections and explicit manager/admin capabilities |
| Cards and public cafe | Shared branded stamp/points card with contrast-safe accent, retained negative balance and offline timestamp; public-cafe layout; non-scannable QR placeholders rather than invented bearer credentials |
| Form behavior | Money-to-paisa validation, bounded integers, Unicode text, conditional programme/offer/audience fields, valid optional birthday pairs, phone-dependent WhatsApp consent, role-change grant clearing, date windows and same-day times, HTTPS URLs, template grammar/dependencies, upload metadata rejection |
| Onboarding | Six steps, safe Step 1 session draft, back retention, disabled pre-bootstrap uploads, optional staff step, sample plan explicitly not a real subscription, branch-hours intervals with overlap checks |
| Primary flow previews | Join/rejoin → card/reward/offer; scan → purchase review → separate fulfillment; programme/reward/promotion editors; campaign/automation/manual follow-up; reporting; billing/admin review |
| Honest mutation boundary | Local validation says nothing was saved/sent. Actual award/fulfillment and unavailable sharing/publication controls remain disabled without authoritative context. No real message, payment or financial request is made by fixtures |
| States | Loading/empty/error/forbidden/offline, expired/stale/invalid/already-processed/revoked/rate-limited, paused/provider failure, notification denied/unsupported/install guidance, uncertain result, neutral email/cooldown, zero audience, upload-processing/rejection and explicitly illustrative committed receipt |
| Traceability | All 43 IDs have route files and catalogue mappings; persistence/authorization/server validation remain separately tracked rather than marked complete from screenshots |

## Verification

Verification is local unless explicitly identified otherwise. Final command results are recorded in `implementation-status.md`.

- Unit suite: exact money/integer/text bounds, calendar limits, conditional fields, optional birthday validation, template grammar/dependencies, upload metadata and fixture/permission gating.
- Playwright: all 43 layouts at desktop and 360px; no browser errors or document overflow; amount validation/focus, modal Escape/focus return, explicit camera permission request and denied fallback, permission visibility, grant clearing, consent reset, campaign conditionals/counts, report range/keyboard tabs, onboarding draft/back behavior, opening-hour overlap feedback, large text, blocked unsafe states and guessed-selector isolation.
- Profile regression: preserves form input and error associations after an asynchronous server failure; prevents duplicate submission while pending.
- Production build includes both web and separately compiled worker. Fixture isolation is exercised against `next start`, not inferred from dev headers.
- Real local PostgreSQL/RPC/RLS/queue regressions preserve the Phase 0 foundation. Their SQL Auth fixture does not prove new Supabase/provider workflows.
- Screenshots reviewed for mobile checkout/scanner, desktop campaign/report and customer large-text layout. Screenshots/traces are generated under ignored `test-results/` and can be reproduced by `test:e2e`.

## Limits and next phase

The gallery uses empty tables, unknown metrics and illustrative card data. It does not simulate a production datastore. Lookup/decoding, financial previews and commits, actual role/MFA/branch authorization, storage validation, policy publication, enrollment, invitations, reports, campaigns, billing and privacy operations connect in their assigned later phases. Fixture field schemas are reusable client validation, not proof of server enforcement. No fabricated QR, signed URL, bank account, price, plan entitlement, provider receipt or report total is presented as real.

Camera error behavior is tested through browser-controlled media responses; no physical Android/iPhone camera, install/push test or WCAG certification is claimed. Field performance targets, database report timeouts, deployed CDN behavior and launch security remain later verification gates.

Next: Phase 2 verified authentication/MFA, tenant bootstrap, onboarding persistence, staff invitations/branch permissions, membership enrollment/consent and storage policies. Preserve the current fail-closed route behavior while connecting those operations.
