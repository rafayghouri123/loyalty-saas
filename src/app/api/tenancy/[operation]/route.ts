import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPublicConfig } from '@/lib/config';
import { verifiedUser } from '@/lib/db/server';
import { failure, PRIVATE_HEADERS, rateLimited, readSmallJson, validMutationOrigin } from '@/lib/security/http';
import * as contracts from '@/features/tenancy/contracts';
import { REFERRAL_COOKIE, readAttributions, referralCookieOptions, writeAttributions } from '@/lib/security/referral-attribution';
import { randomToken, hashToken } from '@/lib/security/crypto';
import { issueReferralGrant } from '@/lib/security/referral-grant';

export async function POST(request: Request, context: { params: Promise<{ operation: string }> }) {
  const correlationId = randomUUID();
  const config = getPublicConfig();
  if (!config) return failure('temporary_failure', 'Authentication needs setup.', correlationId);
  if (!validMutationOrigin(request, config.appUrl)) return failure('forbidden', 'Request origin is not allowed.', correlationId);
  const { client, user } = await verifiedUser();
  if (!client || !user) return failure('unauthenticated', 'Sign in with a verified account.', correlationId);
  const { operation } = await context.params;
  let body: unknown;
  try { body = await readSmallJson(request); }
  catch { return failure('invalid_input', 'Enter a valid request within the input size limit.', correlationId); }
  try {
    const result = await (async () => {
      switch (operation) {
        case 'check-slug': { const input = z.strictObject({ slug: z.string().min(3).max(50) }).parse(body); return client.rpc('check_slug', { p_slug: input.slug }); }
        case 'bootstrap': return client.rpc('bootstrap_business', { p_input: contracts.bootstrapSchema.parse(body), p_correlation_id: correlationId });
        case 'programme': { const { businessId, ...input } = contracts.initialProgrammeSchema.parse(body); return client.rpc('save_initial_programme', { p_business_id: businessId, p_input: input, p_correlation_id: correlationId }); }
        case 'publish': { const input = contracts.publishSchema.parse(body); return client.rpc('publish_business', { p_business_id: input.businessId, p_row_version: input.rowVersion, p_correlation_id: correlationId }); }
        case 'invite': { const { businessId, ...input } = contracts.inviteSchema.parse(body); return client.rpc('create_staff_invitation', { p_business_id: businessId, p_input: input, p_correlation_id: correlationId }); }
        case 'staff': { const { businessId, ...input } = contracts.staffSchema.parse(body); return client.rpc('manage_staff', { p_business_id: businessId, p_input: input, p_correlation_id: correlationId }); }
        case 'accept-invite': { const input = contracts.tokenSchema.parse(body); return client.rpc('accept_staff_invitation', { p_token: input.token, p_correlation_id: correlationId }); }
        case 'join': {
          const input = contracts.joinSchema.parse(body);
          const rawCookie = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${REFERRAL_COOKIE}=`))?.slice(REFERRAL_COOKIE.length + 1);
          const attribution = readAttributions(rawCookie).find(item => item.businessSlug === input.businessSlug);
          let grantHash = '';
          if (attribution) {
            const { data: claims, error } = await client.auth.getClaims();
            const session = z.uuid().safeParse(claims?.claims.session_id);
            if (error || !session.success || claims?.claims.sub !== user.id) return { data: null, error: { code: '42501', message: '' } };
            const candidate = hashToken(randomToken());
            if (await issueReferralGrant({userId:user.id,sessionId:session.data,businessSlug:input.businessSlug,
              code:attribution.code,seenAt:attribution.seenAt,tokenHash:candidate})) grantHash = candidate;
          }
          return client.rpc('join_business_referral', { p_input: input, p_grant_hash: grantHash, p_correlation_id: correlationId });
        }
        case 'contact': { const { membershipId, ...input } = contracts.contactSchema.parse(body); return client.rpc('save_membership_contact', { p_membership_id: membershipId, p_input: input, p_correlation_id: correlationId }); }
        case 'consent': { const input = contracts.consentSchema.parse(body); return client.rpc('set_consent', { p_membership_id: input.membershipId, p_channel: input.channel, p_purpose: input.purpose, p_allowed: input.allowed, p_text_version: input.textVersion, p_correlation_id: correlationId }); }
        case 'leave': { const input = contracts.memberSchema.parse(body); return client.rpc('leave_membership', { p_membership_id: input.membershipId, p_correlation_id: correlationId }); }
        case 'branch': { const { businessId, ...input } = contracts.branchSchema.parse(body); return client.rpc('save_branch', { p_business_id: businessId, p_input: input, p_correlation_id: correlationId }); }
        case 'settings': { const { businessId, ...input } = contracts.settingsSchema.parse(body); return client.rpc('save_business_settings', { p_business_id: businessId, p_input: input, p_correlation_id: correlationId }); }
        case 'participation': { const input = contracts.participationSchema.parse(body); return client.rpc('set_business_participation', { p_business_id: input.businessId, p_status: input.status, p_row_version: input.rowVersion, p_correlation_id: correlationId }); }
        case 'profile': return client.rpc('update_profile', { p_input: contracts.profileSchema.parse(body), p_correlation_id: correlationId });
        case 'reserve-media': { const input = contracts.mediaSchema.parse(body); return client.rpc('reserve_media', { p_business_id: input.businessId, p_kind: input.kind, p_mime_type: input.mimeType, p_bytes: input.bytes, p_correlation_id: correlationId }); }
        case 'submit-media': { const input = contracts.assetSchema.parse(body); return client.rpc('submit_media', { p_asset_id: input.assetId, p_correlation_id: correlationId }); }
        case 'media-status': { const input = contracts.assetSchema.parse(body); return client.rpc('media_status', { p_asset_id: input.assetId }); }
        case 'attach-media': { const input = contracts.attachMediaSchema.parse(body); return client.rpc('attach_brand_media', { p_business_id: input.businessId, p_asset_id: input.assetId, p_row_version: input.rowVersion, p_correlation_id: correlationId }); }
        case 'resend-invite': { const input = contracts.resendInvitationSchema.parse(body); return client.rpc('resend_staff_invitation', { p_business_id: input.businessId, p_invitation_id: input.invitationId, p_row_version: input.rowVersion, p_correlation_id: correlationId }); }
        default: return null;
      }
    })();
    if (!result) return failure('not_found', 'Operation unavailable.', correlationId);
    const rejected = z.object({ error: z.object({ code: z.literal('request_rejected'), sqlState: z.string() }) }).safeParse(result.data);
    if (result.error || rejected.success) {
      const error = result.error ?? { code: rejected.success ? rejected.data.error.sqlState : '', message: '' };
      if (error.code === 'P0002') return failure('not_found', 'This record is unavailable for your account.', correlationId);
      if (error.code === '42501') return failure('forbidden', error.message === 'mfa_required' ? 'Verify your authenticator at /auth/mfa before continuing.' : 'Your current account or participation status does not permit this action.', correlationId);
      if (['23505', '40001'].includes(error.code)) return failure('conflict', 'This information changed. Reload the current details before trying again.', correlationId);
      if (['22023', '23514', '23502', '23503', '22P02', '22007', '22008'].includes(error.code)) return failure('invalid_input', 'Check the fields, current terms, plan limits and selected branches.', correlationId);
      return failure('temporary_failure', 'The operation could not be completed. Please retry.', correlationId);
    }
    const limited = z.object({ error: z.object({ code: z.literal('rate_limited'), retryAfterSeconds: z.number() }) }).safeParse(result.data);
    if (limited.success) return rateLimited(limited.data.error.retryAfterSeconds, correlationId);
    if (z.object({ error: z.object({ code: z.literal('invitation_unavailable') }) }).safeParse(result.data).success)
      return failure('not_found', 'This invitation is unavailable for your account or current plan. Ask the owner for a new invitation.', correlationId);
    const response = NextResponse.json({ data: result.data, correlationId }, { headers: PRIVATE_HEADERS });
    if (operation === 'join') {
      const slug = (body as { businessSlug?: string }).businessSlug;
      const rawCookie = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${REFERRAL_COOKIE}=`))?.slice(REFERRAL_COOKIE.length + 1);
      const remaining = readAttributions(rawCookie).filter(item => item.businessSlug !== slug);
      if (remaining.length) response.cookies.set(REFERRAL_COOKIE, writeAttributions(remaining), referralCookieOptions(new URL(config.appUrl).protocol==='https:'));
      else response.cookies.delete(REFERRAL_COOKIE);
    }
    return response;
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return failure('invalid_input', 'Check the required fields and input limits.', correlationId);
    return failure('temporary_failure', 'The operation could not be completed. Please retry.', correlationId);
  }
}
