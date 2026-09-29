# Phase 9 acceptance — hardening and pilot preparation

Date: 28 September 2026. Scope: Phase 9 and sections 15–17, 20, 22, 26 and 27 of the implementation brief. The user's request accepts Phase 8 as the preceding milestone. Unverified commercial/provider/device release gates remain visible; they are not retroactively claimed as completed.

**Phase 9 engineering and staging verification passed. Full Phase 9 acceptance remains pending external field/pilot evidence and the carried launch gates below.** The user confirmed that no device/network results or pilot cafes have been supplied. There is no invented cafe rollout, device result, paid hosting capacity or production-region decision.

| Phase 9 criterion / deliverable | Implementation and verification | Status |
| --- | --- | --- |
| Mandatory features persist end to end | Existing Phases 2–8 RPCs and real provider acceptance; 159-check PostgreSQL suite; fresh real Auth/report/Storage checks and deployed billing/privacy checks | Passed within documented local/staging boundaries |
| Critical/high security and accounting defects resolved | Per-request CSP, strict script nonces, catalog RLS/privilege audit, role matrix, actual terminated-consumer recovery, known-secret scanning and pinned dependency audit | Automated checks passed; external gates retained |
| Accessibility and responsive checkout | axe-core 4.13.0 WCAG A/AA rules across all 43 layouts plus live controls; 200% text, reduced motion, keyboard focus restoration/wrapping | Automated audit passed; physical assistive technology pending |
| Sustained realistic mixed load | Isolated 10 cafes, 10,000 memberships, 100,000 historical purchases; 5 scanner/preview/commit flows per second, 25 reports/min and actual pg-boss campaign queue for 900 seconds | Local SQL acceptance passed; hosted HTTPS capacity remains unverified |
| Worker recovery | Actual subprocess killed after DB effect and before queue acknowledgement; expired job retried and single receipt retained | Passed in 159-check suite |
| Dependency/license check | 41 exact direct dependencies, valid peer tree; 1,093 lockfile entries inventoried; shipped notices reviewed for missing metadata; npm audit zero vulnerabilities | Passed on audit date |
| Staff/owner handoff and QR print assets | [Pilot guide](phase-9-pilot-guide.md), existing scoped PNG/SVG download, tested QR decoding/XML escaping and [labeled print example](pilot-assets/test-only-signup.svg) | Delivered; real cafe print test pending |
| Pilot metrics dashboard | Existing persisted O02/O15 and admin operational views; `pilot:dashboard` builds an evidence-only local dashboard from validated aggregate observations | Delivered with zero participating cafes; no fabricated metrics |
| Cache/report correctness and isolation | Private no-store, public shell allowlist, account-switch cleanup, fresh indexed source reports, revoked download authority and actual query timeout regressions | Automated and deployed private-header/fixture checks passed |
| Pakistan measurements and region choice | Anonymous workstation probe records HTTPS timing/headers; [field checklist](phase-9-field-checklist.md) separates physical/network coverage and matched region requirements | Workstation probe is not Pakistan field evidence; Singapore remains provisional |
| Pilot with three to five cafes and improve friction | Recruitment, observation procedure, success/stop criteria and aggregate evidence format prepared | **Blocked on participating cafes and observed results** |

## Changes and reproducible checks

- Migration `202609280062_timezone_validation.sql` preserves historical migrations and validates Asia/Karachi once at migration time. Default profile inserts and unchanged timezone updates no longer enumerate the full catalog. Other changed timezone names still use the PostgreSQL catalog; invalid names fail. The first 1,000-profile seed exceeded 120 seconds before the refinement; the full 100,000-purchase fixture now seeds successfully. Applied with exact migration history to the isolated hosted staging project.
- HTML uses dynamic rendering and fresh CSP nonces; incoming nonce/CSP headers cannot select them. Script injection is checked at HTML parser input, not through privileged DevTools evaluation. Inline React styles remain permitted for merchant accents/charts. No customer report or permission decision is cached. Public HTML remains safely uncached because it can contain cookies/session context; hashed static assets retain built-in caching. There is no stacked TTL, Redis or report cache.
- Shared confirmation dialogs now cycle Tab/Shift+Tab within controls, return focus on close and retain cancel-first focus. The full audit found no WCAG-tagged automated violations in the tested states. This does not certify all WCAG requirements or physical screen-reader usability.
- `test:phase9:load` always creates a new loopback database with generated credentials. It never accepts a remote reset/seed target or loads `.env.local`. Test sends do not use Firebase. Synthetic campaign snapshot/queue work is actual PostgreSQL/pg-boss processing; it is not real-device delivery.
- CI adds dependency/license gates and retains browser/security artifacts. The separately dispatched `Phase 9 sustained load` workflow runs the full 15-minute test; ordinary CI retains the full accounting/RLS/browser suite. A hosted GitHub Actions run is not claimed merely because workflow files exist.

Commands (Windows: prefix package tasks with `scripts/run.ps1`; pinned Node is provided by the documented local wrapper):

```text
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run test:phase9:load
npm run test:phase9:smoke
npm run licenses:check
npm audit --audit-level=high
npm run security:bundles
npm run pilot:dashboard
node scripts/measure-phase9-network.mjs https://STAGING_ORIGIN CITY NETWORK REGION
node scripts/measure-phase9-web.mjs
```

The web measurement script expects a completed production build. It records 360px, 4x CPU, 150ms RTT, 1.6Mbps down/0.75Mbps up, cache-disabled Chromium samples; these are lab measurements, not field p75/INP. Screenshots/traces and raw measurement JSON stay under ignored `.local` / `test-results` directories.

## Recorded engineering results

- 159 PostgreSQL/queue checks and 60 unit tests passed. All 70 existing browser regressions passed; all six final Phase 9 desktop/mobile checks passed. The initial full browser run reported two CSP test-method failures; replacing privileged DevTools injection with parser-input injection fixed the test and proved blocking. This is evidence across the original regression run and the final targeted run, not a claim of one uninterrupted 76-pass run.
- Lint, typecheck, production web/worker build, fixture isolation, exact dependency/peer inspection and known-secret bundle/log scans passed. npm audit reported zero vulnerabilities; 1,093 lockfile entries have resolved license metadata or reviewed notices. Accessibility findings cover the tested states; incomplete axe rules remain manual review items.
- The final 30-second smoke rerun passed the strengthened exact outbox-count and completed campaign-scan assertions and logged completion of worker/database cleanup. Those assertions also passed when evaluated against the saved full-run evidence. The dedicated smoke task avoids PowerShell/npm argument-forwarding ambiguity; it does not replace the 900-second acceptance measurement.
- Full mixed-load evidence: `.local/phase9-load-acceptance.json`, 900 seconds, 4,500 commits and 375 reports, zero request/worker errors, 104,500 final purchases, zero ledger/balance mismatches and exactly 4,500 purchase outbox events. Forty-five sampled replays returned the original receipt. Campaign scans completed 41 queue jobs. The snapshot caught 4,497 completed loyalty-value jobs and three newly committed events awaiting the next dispatch; it is not a claim that the queue was drained.

| Local SQL load metric | Measured p95 | Required p95 | Result |
| --- | ---: | ---: | --- |
| Entire scanner + preview + commit flow | 95.09 ms | <=1,000 ms | Passed |
| Commit RPC alone | 34.38 ms | Included above | Recorded |
| Report RPC | 415.67 ms | <=2,000 ms | Passed |
| Request errors / incorrect accounting effects | 0 / 0 | <1% / 0 | Passed |

The load ran on Windows, Node 24.21.0, Intel i5-1235U (12 logical CPUs), 8 GiB RAM. It exercised real restricted SQL RPCs and pg-boss, but did not measure client HTTPS latency, purchased hosted capacity or FCM transport. The three tail events above have no missing financial effect: financial transactions and their ledger/outbox records committed atomically.

| Throttled browser lab screen (five samples each) | p75 LCP | Maximum CLS | Maximum transferred JavaScript |
| --- | ---: | ---: | ---: |
| Landing | 1,692 ms | 0.00233 | 137,604 bytes |
| Customer card fixture C02 | 1,412 ms | 0.00208 | 290,574 bytes |
| Scanner fixture S01 | 1,448 ms | 0.00129 | 290,574 bytes |

These sampled LCP/CLS results meet the target ranges under the recorded lab conditions. Physical-device field p75 and INP remain unmeasured.

Staging deployment `dpl_6msEdfpG4GHcbpkuLHpgDGbET8fF` reached READY and serves [the staging application](https://loyalty-saas-three.vercel.app). Deployment configuration was checked as `APP_ENV=staging` before promotion. Deployed readiness, Google OAuth initiation/callback origin, foreign/missing-origin rejection, fresh CSP nonce, spoofed-header overwrite, rendered script nonce and fixture 404/private headers passed. Service-worker/manifest responses require revalidation and the rendered versioned JavaScript has immutable caching, verified over HTTPS. The hosted worker controller was ensured after deployment. The deployment credential was supplied to the deployment process; it was not written into source or an environment file. The final scan checked 207 browser assets/acceptance logs against 18 configured secret values, including that token, with no matches.

Fresh reporting acceptance used real staging Auth/TOTP/PostgREST/private Storage with the current production-mode local web build: persisted totals, actor denials, report timeout, revocation and the 360px report UI passed. Fresh billing/privacy acceptance used the deployed HTTPS application: private proof handling, exact synthetic reconciliation/replay/correction, scoped support, ownership blocker, requester-only multipart download, 360px billing, actual deletion of the synthetic Auth account and stale-session denial passed. No real bank transfer or customer message occurred. An older Phase 4 rerun stopped at its stricter empty-business guard; existing staging data was preserved, and its earlier accepted evidence remains unchanged.

The post-deployment anonymous workstation probe made 60 requests with zero errors. Observed p95 timings: landing 1,191 ms, login 811 ms, readiness 473 ms, app redirect 989 ms, service worker 270 ms and manifest 356 ms. Location/network labels are explicitly unverified workstation observations; they cannot select a Pakistan deployment region or pass mobile-network criteria.

## Launch gates

Manual testing follow-up, 28 September: the user reported mixed business/customer navigation after trial login. Trial entry now preserves the onboarding destination, no-business sessions redirect directly to cafe setup, and the redesigned business picker has no customer-card/device links. Business sign-out retains its login context. Twenty-four focused desktop/mobile regressions and a real staging Auth/browser check passed; deployment `dpl_2WmCH8ZdkubHxUUcZtbDc6U2is2q` supersedes the staging release above. See the business-entry section of [implementation status](implementation-status.md) for exact evidence. External pilot gates remain open.

| Gate | Required | Configured | Verified |
| --- | --- | --- | --- |
| Production identity/domain/support, approved versioned policies | Yes | Staging/delegated fixtures only | No production claim |
| Actual prices/plan limits, bank instructions and reconciliation operator | Yes | Engineering controls and test configuration | Real commercial inputs pending |
| Auth/email and privileged recovery | Yes | Staging Google/TOTP and sandbox email boundaries | Staging evidence in earlier audits; production sender/recovery pending |
| Physical Android and iPhone/Home Screen push/camera/shared-device checks | Yes | Checklists and synthetic provider registration exist | **Pending** |
| Vercel worker/monitor combined capacity and budget | Yes | Hosted staging worker and monitor | Capacity for sustained production remains unverified |
| Purchased database/Storage backup, expiry, approved retention, RPO <=24h / RTO <=4h | Yes | Local real restore/privacy replay; runbooks | Hosted purchased coverage/recovery pending |
| Deployed ingress bucket spoof-resistance | Yes | Strict Vercel ingress/HMAC adapter and local races | Actual deployed shared-bucket test pending; disabled email sending is not bypassed to manufacture evidence |
| Pakistan fixed/mobile measurements and matched Mumbai comparison | Yes | Probe and worksheet | **Pending; sin1 provisional** |
| Three-to-five-cafe pilot and observed friction improvements | Yes | Guide, metrics mapping and empty dashboard | **Pending; no cafes provided** |

No production deployment or hosting purchase is performed to close an evidence gap. A passing compilation, fixture, inventory or checklist does not pass these external gates. See [security matrix](phase-9-security-matrix.md), [Phase 8 operations](phase-8-operations.md), [worker](vercel-worker.md) and [monitor](vercel-monitor.md) for recovery and deployment boundaries.
