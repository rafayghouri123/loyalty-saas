# Screen traceability

43 required screen contracts from section 25. Not started means no completion claim. Shared routes do not reduce the field/action scope. Every screen must eventually link its operations, tables, permissions and positive/negative tests.

| ID | Screen and routes | Layout | Persistence | Authorization | Validation | Tested | Operations / tables / evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P01 | Product landing page: `/` | Initial layout | Pricing not connected | Public only | Config fallbacks | Desktop/360px checks passed | `src/app/page.tsx`; published plans/policies pending |
| P02 | Cafe page: `/b/[slug]` | Not started | Not started | Not started | Not started | Not started | Pending |
| P03 | Login: `/auth/login` | Initial layout | OAuth boundary; email pending | Server origin checks; shared limiter boundary exists | Strict intent; previous device state cleared | Local storage clearing passed; provider tests pending | `/api/auth/google`; email action remains disabled until direct Auth bypass and sender configured |
| P04 | Auth callback, invitation acceptance, and MFA | Name form only | `complete_profile` atomic | Own-profile RLS; verified Auth row | Unicode name + safe return path | SQL tests passed; real callback/MFA pending | profiles, audit_events, outbox_events; invite/MFA absent |
| P05 | Enrollment: `/join/[slug]` | Not started | Not started | Not started | Not started | Not started | Pending |
| P06 | Workspace selection: `/workspace` | Setup state only | Pending | Verified user boundary only | Pending | Pending | Workspaces/roles/onboarding pending |
| P07 | Policies: `/privacy`, `/terms` | Missing-config state | Pending | Public only | Pending | Pending | Operator policy text and publication required |
| C01 | Card collection: `/app` | Setup state only | Pending | Verified user boundary only | Pending | Production no-store check passed | No fabricated memberships; real collection pending |
| C02 | Card detail: `/app/cards/[membershipId]` | Not started | Not started | Not started | Not started | Not started | Pending |
| C03 | Rewards and redemption intent: `/app/cards/[membershipId]/rewards` | Not started | Not started | Not started | Not started | Not started | Pending |
| C04 | Offers: `/app/offers` and `/app/offers/[offerId]` | Not started | Not started | Not started | Not started | Not started | Pending |
| C05 | Referrals: `/app/referrals` | Not started | Not started | Not started | Not started | Not started | Pending |
| C06 | Account: `/app/settings` | Initial device settings at `/app/notifications`; full account pending | Push challenge/ack/revoke only | Same verified session | Strict device payloads; generation isolation | SQL/worker/clear-state checks passed; devices pending | push_devices, push_registration_challenges; birthday/preferences/export/deletion still pending |
| C07 | Per-cafe preferences: `/app/cards/[membershipId]/preferences` | Not started | Not started | Not started | Not started | Not started | Pending |
| S01 | Scan home: `/staff/[businessId]` | Not started | Not started | Not started | Not started | Not started | Pending |
| S02 | Purchase form: `/staff/[businessId]/checkout` | Not started | Not started | Not started | Not started | Not started | Pending |
| S03 | Reward/offer fulfillment: `/staff/[businessId]/redeem` | Not started | Not started | Not started | Not started | Not started | Pending |
| S04 | Recent activity and detail: `/staff/[businessId]/activity`, `/staff/[businessId]/transactions/[id]` | Not started | Not started | Not started | Not started | Not started | Pending |
| O01 | Onboarding wizard: `/dashboard/onboarding` | Not started | Not started | Not started | Not started | Not started | Pending |
| O02 | Overview: `/dashboard/[businessId]` | Not started | Not started | Not started | Not started | Not started | Pending |
| O03 | Customer list: `/dashboard/[businessId]/customers` | Not started | Not started | Not started | Not started | Not started | Pending |
| O04 | Customer detail: `/dashboard/[businessId]/customers/[membershipId]` | Not started | Not started | Not started | Not started | Not started | Pending |
| O05 | Programme settings: `/dashboard/[businessId]/programme` | Not started | Not started | Not started | Not started | Not started | Pending |
| O06 | Rewards: `/dashboard/[businessId]/rewards`, `/dashboard/[businessId]/rewards/new`, `/dashboard/[businessId]/rewards/[id]` | Not started | Not started | Not started | Not started | Not started | Pending |
| O07 | Double slots: `/dashboard/[businessId]/promotions` and `/promotions/[id]` | Not started | Not started | Not started | Not started | Not started | Pending |
| O08 | Referrals: `/dashboard/[businessId]/referrals` | Not started | Not started | Not started | Not started | Not started | Pending |
| O09 | Campaign list: `/dashboard/[businessId]/campaigns` | Not started | Not started | Not started | Not started | Not started | Pending |
| O10 | Campaign editor: `/dashboard/[businessId]/campaigns/new` or `/campaigns/[id]/edit` | Not started | Not started | Not started | Not started | Not started | Pending |
| O11 | Offer editor: `/dashboard/[businessId]/offers` and `/offers/[id]` | Not started | Not started | Not started | Not started | Not started | Pending |
| O12 | Automations: `/dashboard/[businessId]/automations` | Not started | Not started | Not started | Not started | Not started | Pending |
| O13 | WhatsApp templates and follow-up creation: `/dashboard/[businessId]/whatsapp/templates` and `/whatsapp/new` | Not started | Not started | Not started | Not started | Not started | Pending |
| O14 | WhatsApp task list: `/dashboard/[businessId]/whatsapp` and `/whatsapp/tasks/[id]` | Not started | Not started | Not started | Not started | Not started | Pending |
| O15 | Reports: `/dashboard/[businessId]/reports` | Not started | Not started | Not started | Not started | Not started | Pending |
| O16 | Staff: `/dashboard/[businessId]/staff` | Not started | Not started | Not started | Not started | Not started | Pending |
| O17 | Branches: `/dashboard/[businessId]/branches` and `/branches/[id]` | Not started | Not started | Not started | Not started | Not started | Pending |
| O18 | Business branding/settings and QR assets: `/dashboard/[businessId]/settings` | Not started | Not started | Not started | Not started | Not started | Pending |
| O19 | Billing: `/dashboard/[businessId]/billing` and `/billing/invoices/[id]` | Not started | Not started | Not started | Not started | Not started | Pending |
| A01 | Admin overview: `/admin` | Not started | Not started | Not started | Not started | Not started | Pending |
| A02 | Tenants: `/admin/businesses` and `/admin/businesses/[id]` | Not started | Not started | Not started | Not started | Not started | Pending |
| A03 | Plans: `/admin/plans` | Not started | Not started | Not started | Not started | Not started | Pending |
| A04 | Billing review: `/admin/billing` and `/admin/billing/[invoiceId]` | Not started | Not started | Not started | Not started | Not started | Pending |
| A05 | Jobs and incidents: `/admin/jobs` | Not started | Not started | Not started | Not started | Not started | Pending |
| A06 | Audit and privacy operations: `/admin/audit`, `/admin/privacy` | Not started | Not started | Not started | Not started | Not started | Pending |
