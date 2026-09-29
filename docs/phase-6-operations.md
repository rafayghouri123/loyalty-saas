# Manual WhatsApp operations

Apply migrations 048–050 through the existing isolated-project migration workflow, deploy the updated web application, and run the updated persistent worker. This feature requires no WhatsApp API credentials or account connection. The worker performs content cleanup; it never opens a chat or sends a WhatsApp message.

## Canonical public-offer links

Set `NEXT_PUBLIC_APP_URL` to the deployment's actual HTTPS origin. With matching operator `MIGRATION_DATABASE_URL`, configured Supabase project and verified database TLS, run:

```powershell
.\scripts\run.ps1 setup:whatsapp-origin
```

This stores the canonical origin in `app_private.whatsapp_origin`, which has no browser grants. Request payloads cannot override it. Loopback HTTP is allowed for non-production local testing only. Update the setting when changing deployment origin. If it is absent, templates needing `public_offer_url` fail preview. Other templates continue working. Do not configure example domains in a real deployment.

Offer links point to `/app/offers/<offerId>` and require authenticated customer eligibility. They contain no bearer credential, phone, email or tracking token. Only published, unexpired, non-template all-members offers can be selected. A reward placeholder also requires a real published reward. Both check the member's branch affiliation.

## Staff workflow

1. Use a device already signed into the cafe's WhatsApp account. The application cannot inspect or switch that account.
2. An owner with MFA or a manager with contact permission opens **Manual WhatsApp follow-ups** from the dashboard. Ordinary cashiers have no access. Managers see only customers affiliated with currently assigned active branches.
3. Save a template using only `{{first_name}}`, `{{business_name}}`, `{{reward_name}}` and `{{public_offer_url}}`. Review the rendered preview. Template edits affect future tasks; saved tasks retain their original text/version.
4. Choose an audience and preview. Review every exclusion and recent-contact warning. Inactive means a previous non-reversed qualifying purchase older than the chosen 7–365 days; never-purchased customers are excluded. Reward-ready requires the selected reward. A batch is bounded to 100 candidates; narrow a broader audience. Confirm **Create follow-up tasks**. This sends nothing.
5. Open an assigned or available task. Check current consent, number verification, text and history. Click **Open WhatsApp**, review the correct chat and text, and personally press Send in WhatsApp. Return, check the attestation and confirm **Mark as sent**, or skip with an optional reason.
6. If a customer replies STOP, use **Record opt-out** with the source/note. The application receives no inbound WhatsApp webhook. This action immediately denies that cafe's WhatsApp marketing consent and suppresses unsent tasks, including leased ones. Customers can also turn consent off in their authenticated cafe preferences.

Opening claims/renews a five-minute staff lease. Another staff member cannot take over during it; permitted reassignment is possible after expiry. Stale versions return a refresh conflict. Distinct tasks for the same business/member cannot open within 24 hours of recorded contact; reopening the same assigned task is allowed. The app allows 30 open attempts per staff/business/hour and supplies Retry-After on limits. These controls cannot prevent staff messaging outside the application.

Phone changes invalidate old tasks and reset verification/consent. Refresh or skip and create a new eligible task after the customer supplies fresh consent. Staff cannot grant that consent or edit the number. **Confirm number from customer-initiated chat** records an attested verification fact with a reason; it does not establish consent, account ownership for recovery, or account merging.

## Results, retention and recovery

Task lists paginate 25 rows with bounded date requests of at most 90 calendar days. Counts explicitly distinguish **Opened** from **Staff-marked-sent**. They are direct current database results with a read timestamp, not delivery/read/open rates. Broader reports and exports are Phase 7.

Creation retries keep the same key for the same input; after an uncertain response, retry the unchanged batch rather than starting another batch. The SQL transaction returns the existing result without duplicate tasks. Changing input requires a new key/preview. Current permissions and scope are rechecked on replay.

The worker purges task message bodies, old batch template snapshots, skip notes and event free-text notes after 90 days in bounded batches. Expired unsent content becomes skipped and its lease is cleared; it cannot be reopened. Minimal actor/time/action/version history remains. Saved reusable templates remain until separately managed. Financial/audit retention and backup expiry require the Phase 8 operator policy; the 90-day content default does not purge ledger or payment records.

Schema refinements supporting this behavior: template/task row versions; batch idempotency key/hash and count-only preview snapshot; contact version at task creation; first-open plus latest-contact timestamps; nullable retained content after purge; fixed safe audit fields. There is no phone/message content in task list projections or application tracking URLs.
