# Owner onboarding and staff pilot guide

Use the stable staging origin and synthetic accounts for practice. Real participating cafes have not been supplied. Do not put test purchases into a live cafe or describe this checklist as a completed pilot.

## Owner: prepare a cafe

1. Operator configures the real product identity/support, published policies, prices and payment instructions. Verify Google/email login and enroll the owner in an authenticator; store provider-supported recovery material securely.
2. Select a published plan in onboarding. Enter the cafe name/slug, branch address/hours and branding. Saving branch details creates the business and starts its trial. Upload accepted branding after this step.
3. Choose stamps or points, minimum eligible spend and terms. Define the reward, unit cost, applicable branches and fulfillment terms. Explain to cashiers which goods qualify; this application does not inspect POS line items.
4. Invite separate staff accounts. Cashiers receive assigned branches only. Give managers campaign/contact/reversal/export permissions only as needed. Revoke a test assignment and confirm the next operation fails.
5. Preview and publish. Open the public cafe page and verify every fact. In Settings, choose the branch and download PNG or printable SVG signage. Print at actual proportions on white paper without cropping the QR quiet zone. Scan the print on both test phones and confirm the cafe/branch before placing it at checkout. The generated QR contains only the public signup URL. The printable SVG can be printed to PDF by the operating system.
6. Configure referral bonuses/minimum/cap and a same-day double slot. Verify its timezone, branch and capped bonus explanation. Use the worked 1 base + 1 promotion + 2 friend / 3 inviter scenario in staging, then redeem four units and reverse the purchase; the friend must show -4 and inviter 0.
7. Review Overview and all seven Reports tabs. Confirm the selected date/branch and Updated time. Refresh after a transaction. Contact exports need both permissions and are separate from ordinary CSV. Never interpret recorded loyalty sales as total cafe revenue.

## Cashier: each transaction

Select the actual branch and sign in with your own account. Tap Scan to request the camera. If denied, ask the customer for the eight-character checkout code; there is no phone-number search. An earning QR cannot redeem a reward.

Enter the actual paid bill and eligible goods after discounts, excluding tax/tips. Use bill amount only when the whole bill qualifies. Confirm qualifying-item terms for stamps. Review the server's base, double-slot, referral and balance effects; confirm once. On success give the physical receipt/benefit and select Scan next. On stale preview, review the new effect and confirm again. On uncertain timeout, use the existing transaction's recovery/retry; do not start a new purchase to guess whether it saved. Offline transactions are unavailable.

For rewards, the customer opens Use this reward and presents its short-lived QR/code. Review the reward and press Confirm reward given only when handing it over. No paid purchase is required for reward redemption. For a discount offer, scan the customer's offer intent and enter eligible goods before that offer; apply the displayed discount in the cafe's actual payment process before confirming the paid amount.

A manager with reversal permission can fully reverse a mistaken purchase with a reason. A correction is a new linked purchase. A spent reward is not automatically reclaimed; negative units offset later earnings. Undo a redemption only when fulfillment did not occur. Never edit a balance directly or share an owner login.

## Customer signup and consent

Show the cafe's reward before login. Customer scans the public QR, signs in, reviews terms and joins. Email sharing, phone, birthday, installation and marketing are optional. Explain that each cafe has separate consent. An existing customer gets the existing card; leaving and rejoining does not create another referral. Declining notifications must leave the card usable.

Offer installation after the card is visible. Android uses the browser's install flow; supported iPhones use Add to Home Screen before push. Register notifications while the page is foreground and wait for the receipt challenge to complete. Test physical devices using the companion checklist, including account switch and denied permissions.

## Owner/manager communications

Offers live in the inbox even without push. Review consent-based audience estimates, branches, quiet hours, expiry and caps before scheduling. A zero eligible audience is a successful no-op. Provider accepted means the push provider accepted a device send, not that the person read it. Use only your explicitly registered test device when practicing.

For WhatsApp, prepare a permitted template and consenting task list. Open one task, confirm the cafe's WhatsApp account is active, review the selected number/text and press Send yourself. Return and mark sent only after sending. Opening a chat is not sending. Record STOP manually at once; there is no inbound webhook. A changed number/consent or another staff member's lease can block opening.

## Three-to-five-cafe pilot

Operator first resolves the release gates in the acceptance audit. Recruit 3–5 actual cafes; use internal labels in `config/pilot-evidence.json`, not customer names/numbers. Record date range, named responsible operator in private operations records, device/network conditions, signup attempts/completions and timed signup/checkout observations. Keep personally identifying incident details outside the repository.

Each day owners read their own persisted dashboard/report metrics: new/purchasing members, net recorded sales, rewards, referral outcomes, double-slot effects, and distinct push/WhatsApp statuses. Copy aggregate figures with source/date into the pilot evidence file and run `npm run pilot:dashboard`. Unknown observations remain null. The dashboard refuses malformed data and never fabricates results.

Observe users completing signup and cashier checkout without coaching first. Record the precise step, duration, error and recovery. Review daily with staff, fix demonstrated friction, repeat the affected flow, and retain before/after observations. Stop value-changing pilot operations for any unexplained balance mismatch, cross-tenant exposure or duplicate award; preserve correlation IDs and use the incident runbook. Do not expand beyond five cafes until the security/accounting gates are clear and the observed friction review is complete. No automatic sending or new analytics tracking is added for the pilot.
