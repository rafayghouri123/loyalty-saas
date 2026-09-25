# Phase 2 operator procedures

These procedures apply to an isolated Supabase environment after the new migrations are reviewed and applied. Migrations 004–011 and delegated pre-release configuration have been applied to the configured development project. No new Vercel deployment or Auth sender configuration was applied. The SQL integration fixture is not Supabase JWT, Storage HTTP or provider verification.

## First platform administrator

The selected operator must first create a permanent verified Google/email account and complete their profile. Confirm their identity through the operator's established channel, enable TOTP, and preserve recovery through Supabase's supported procedures. Never make metadata, an email suffix, or a signup form grant admin access.

Run the following once through an operator-only database connection, replacing the UUID with the independently verified existing account. Do not run it through the web/worker role. The operator records the authorization reference in its deployment/change log. No administrator is seeded by application migrations.

```sql
begin;
insert into public.platform_admins(user_id,active,can_reconcile_billing,can_manage_support)
select p.user_id,true,false,true
from public.profiles p join auth.users u on u.id=p.auth_user_id
where p.user_id = :'verified_profile_uuid'::uuid
  and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
  and u.deleted_at is null and p.anonymized_at is null;
-- Require exactly one inserted row before committing; otherwise rollback.
insert into public.audit_events(actor_user_id,action,target_type,target_id,reason,safe_changes,correlation_id,occurred_at)
select user_id,'admin.operator_bootstrapped','platform_admin',user_id,
       'Operator bootstrap: independently verified identity','{}',gen_random_uuid()::text,clock_timestamp()
from public.platform_admins where user_id=:'verified_profile_uuid'::uuid;
commit;
```

Billing reconciliation is deliberately off until separately authorized. This command cannot be triggered from self-service routes. Keep the migration credential outside web/worker runtime.

## Ownership transfer

1. Confirm the current owner and business. Resolve the transfer with both parties through operator support; record the replacement's explicit acceptance in the support/change reference. The application does not infer acceptance from email ownership.
2. The replacement signs in with their own verified account, completes their profile and accepts an invitation into this exact business. Do not fabricate an acceptance or reuse another tenant's staff assignment.
3. An active admin with `can_manage_support` completes a new provider login/TOTP challenge within 15 minutes. A refreshed access token alone is insufficient.
4. With that admin's ordinary user-scoped authenticated Supabase client, call the operator RPC below. It validates current owner, verified active replacement, admin/MFA/fresh authentication and the entire transaction. The old owner is revoked; exactly one replacement owner remains. There is no owner self-service transfer button.

```ts
await client.rpc('operator_transfer_owner', {
  p_business_id: businessId,
  p_current_owner: currentOwnerProfileId,
  p_replacement_owner: acceptingReplacementProfileId,
  p_reason: 'Transfer approved; replacement acceptance recorded under operator reference …',
  p_correlation_id: crypto.randomUUID(),
});
```

5. Verify the audit event and both users' workspace access. Never print access tokens or use the migration login to impersonate a verified admin. Business closure/archive remains in the administration phase; do not revoke the only active owner to simulate closure.

## Media processing

- Web routes use the verified owner client to reserve one tenant/path. The browser uploads directly into `loyalty-quarantine`; it never sends the file through a Vercel route. Private pending-original reads are permitted only for the exact owner's unsubmitted grant to support Storage's INSERT RETURNING; other tenant reads, overwrites and public listing are denied.
- On the persistent worker, set `MEDIA_PROCESSING_ENABLED=true` and `STORAGE_SERVICE_ROLE_KEY` through its secret store. This credential is used only by the Storage adapter. Application database operations still use the restricted `loyalty_worker` connection and fixed worker RPCs. Never configure this key in `NEXT_PUBLIC_*` or the browser.
- Configure the Supabase Storage endpoint and verify an isolated owner A / owner B / cashier / anonymous upload matrix through the real HTTP service. The local harness models Storage SQL grants, not Storage's HTTP behavior.
- The worker verifies MIME/decoder format, size <=5 MiB, <=20 MP, single-frame input and decoded/compressed ratio <=1000. It strips metadata and writes a new WebP path: logos <=512px, covers/offers <=1600px, private evidence <=2000px, all <=3 MiB. These are technical rendition limits, not new commercial entitlements.
- `loyalty-brand` contains accepted public renditions only; proof images always use `loyalty-private`. Rejected/unclaimed originals expire after 24 hours and the worker removes them. Monitor the worker's heartbeat/dead-letter queue; stopping the worker leaves processing pending rather than falsely accepting uploads.
- Live signup waits for real published plan versions and operator-supplied terms/privacy/consent text. Fixture pricing/policies are explicitly local-only and must never be copied into live configuration.

References consulted: [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa), [JWT authentication-method claims](https://supabase.com/docs/guides/auth/jwt-fields), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control). Actual provider checks remain separate acceptance evidence.


## Delegated defaults and additional businesses

`config/launch-defaults.json` contains the user-delegated, versioned pre-release price, limits and seven policy documents. Publish into a non-production project after migrations with:

```powershell
./.tools/node-v24.21.0-win-x64/node.exe --import tsx --env-file=.env.local scripts/publish-phase2-defaults.mjs
```

A support administrator with AAL2 and authentication within 15 minutes calls `operator_authorize_business(p_owner_id, p_reason, p_correlation_id)`. This creates one private grant expiring after seven days and records the reason in the audit log. The verified owner then uses normal onboarding; the grant is consumed atomically only when additional-business bootstrap succeeds. Failed bootstrap rolls back consumption. The operator does not impersonate the owner, create an invoice payment or bypass owner MFA.

## Provider acceptance

First restore/verify the configured Supabase project. `.env.local` must contain the real worker-only Storage service key, restricted worker database login and migration connection. `PHASE2_TEST_WEB_URL` must point at an isolated deployment of the current code, with its matching Supabase project. The harness rejects production and projects with active non-test businesses. Preserve all secret values outside Git.

```powershell
./.tools/node-v24.21.0-win-x64/node.exe --import tsx --env-file=.env.local scripts/phase2-preflight.mjs
# After applying migrations and publishing pre-release configuration in staging:
$env:APP_ENV = 'staging'
./.tools/node-v24.21.0-win-x64/node.exe --import tsx --env-file=.env.local scripts/verify-phase2-provider.mjs
```

This harness uses admin-created verified synthetic accounts, then actual password-provider sessions and TOTP verification. No password UI is exposed in the product. It proves provider/session/SQL/storage boundaries; it does not prove Google consent or email delivery. Verify those separately using provider sandbox recipients and the app's real callback. Never claim a direct Auth rate-limit bypass is closed merely because the app route is rate-limited. Keep `EMAIL_LOGIN_ENABLED` and `EMAIL_DIRECT_AUTH_LIMITS_VERIFIED` false until the sender and direct `/auth/v1/otp` path have passed the configured shared-limit/bypass checks. The latter flag is an operator deployment gate, not a security control on the provider.

The timezone-lock trigger helper is ready for future financial/scheduling source tables. Their migrations must attach it in the same transaction that introduces those tables; Phase 2 itself has no financial/scheduling writes. Changing a locked timezone or clearing its lock is rejected at the database boundary.


The production-mode local web + real Supabase acceptance command is:

```powershell
./.tools/node-v24.21.0-win-x64/node.exe --env-file=.env.local scripts/run-provider-acceptance.mjs
```

It builds current code, starts a loopback-only Next production server, tests actual provider sessions and requests, and stops the server. It does not certify Vercel CDN behavior. `--skip-build` is only for repeating provider-harness changes against the same already-built application. Email token verification uses generated links without sending email; actual delivery remains a separate gate. Primary references: [Supabase email hooks](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook), [provider rate limits](https://supabase.com/docs/guides/auth/rate-limits), and [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Grant-bound email hook and sandbox acceptance

Apply migration 012, then run `node scripts/configure-auth-email.mjs` with the operator-only `SUPABASE_ACCESS_TOKEN` in `.env.local`. This enables `pg-functions://postgres/public/auth_send_email_hook`. Direct OTP calls without a gateway grant are rejected. The hook replaces SMTP for supported signup/magic-link flows.

Run `node --env-file=.env.local scripts/run-provider-acceptance.mjs --email` with Resend and Supabase test credentials. This sends only to the official `delivered@resend.dev` sandbox using `onboarding@resend.dev`, temporarily adds the loopback callback, verifies actual queue/provider/callback behavior, and restores the callback configuration. The token is never printed. Sandbox delivery passed on 2026-09-22; it is not evidence of human-inbox delivery. See [Resend sandbox recipients](https://resend.com/docs/dashboard/emails/send-test-emails).

Production enablement requires a verified `AUTH_EMAIL_FROM`, worker-only `RESEND_API_KEY`, `AUTH_EMAIL_ENABLED=true` on a persistent worker, and the tested SQL hook. Only then enable the two web email flags with trusted Vercel ingress. Keep management and Storage service keys out of the web runtime. The hook remains enabled on the isolated project; email UI is disabled pending production configuration.
