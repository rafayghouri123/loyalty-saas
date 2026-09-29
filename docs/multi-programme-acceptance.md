# Multiple loyalty programmes for one cafe — implementation gate

**Product decision (29 September 2026):** A cafe may run separate programmes, such as a stamps card and a points card. Each customer has a distinct card and balance per programme. Staff select the programme for a checkout. Rewards spend only the balance of their own programme.

**Current state:** The live app has one programme per business and links to its earning rules and rewards. A local, unshipped implementation adds separate programmes and cards. No multi-programme migration has been applied to staging. Do not enable creation on staging before the checks below pass.

## Required behavior

1. Backfill every existing membership/card to its current programme without changing balances, ledger history, QR handles, consent, or customer access. The original programme remains the default for old signup links and callbacks.
2. The owner can list programmes, create a separate draft with earning rules and a first reward, edit the draft, and publish it explicitly. A programme belongs to exactly one business; owner MFA, plan access, branch eligibility, and audit rules remain enforced.
3. A cafe's signup page offers its published programmes. A customer can join each separately and sees distinct cards, balances, reward lists, and history. Rejoining one programme does not alter another card or its consent.
4. Staff choose a programme before scanning. The card or code must belong to that programme; changing the choice requires a fresh scan. Checkout shows the programme and its balance before confirmation and uses a fresh preview of its immutable version.
5. Redemption, adjustment, reversal, correction, QR/code resolution, and all ledger writes reject a mismatch between the membership's programme and a programme/reward version. Idempotency and transactional receipt rules remain intact.
6. Customer limits, billing usage, reports, referral/promotion awards, campaign eligibility, and privacy export/deletion remain correct when one person has two cards at the same cafe. Their meaning (people versus cards) must be explicit in the UI.
7. Raw tables and private grants remain inaccessible to browser roles. Cross-programme and cross-cafe access are denied at the database boundary, including stale sessions and concurrent requests.

## Delivery gate

The implementation is in local `supabase/migrations/202609290064` through `202609290069` and app routes, but is **not applied to staging**. Before any staging rollout, complete the direct two-programme SQL tests, desktop/mobile owner and customer journeys, hosted Auth/TOTP/PostgREST checks, ledger reconciliation, migration rehearsal, and review of business-wide reporting, promotions, referrals and privacy behavior. Do not deploy a partial creation flow that would share balances or let rewards cross programmes.
