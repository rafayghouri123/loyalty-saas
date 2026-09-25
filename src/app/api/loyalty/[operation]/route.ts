import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getPublicConfig } from '@/lib/config';
import { verifiedUser } from '@/lib/db/server';
import { hashToken, openSecret, parseSecretKey, randomToken, sealSecret } from '@/lib/security/crypto';
import { failure, PRIVATE_HEADERS, rateLimited, readSmallJson, validMutationOrigin } from '@/lib/security/http';
import * as contracts from '@/features/loyalty/contracts';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const shortCode = () => Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('');
const encryptionKey = () => ({ id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/u).parse(process.env.ENCRYPTION_KEY_ID),
  bytes: parseSecretKey(process.env.ENCRYPTION_KEY_BASE64 ?? '') });

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
    let rpcName: string;
    let rpcArgs: Record<string, unknown>;
    let privateResult: Record<string, unknown> = {};
    switch (operation) {
      case 'card': {
        const input = contracts.card.parse(body); rpcName = 'customer_card'; rpcArgs = { p_membership: input.membershipId }; break;
      }
      case 'owner-member': {
        const input = contracts.ownerMember.parse(body); rpcName = 'owner_member_financial';
        rpcArgs = { p_business: input.businessId, p_membership: input.membershipId }; break;
      }
      case 'handle': {
        const input = contracts.handle.parse(body); const raw = `LOYALTY:EARN:v1:${randomToken()}`; const key = encryptionKey();
        const sealed = sealSecret(raw, key, `membership-handle:${input.membershipId}`);
        rpcName = 'set_membership_handle'; rpcArgs = { p_member: input.membershipId, p_hash: hashToken(raw), p_ciphertext: sealed.ciphertext,
          p_key_id: key.id, p_rotate: input.rotate, p_correlation_id: correlationId };
        privateResult = { raw, key }; break;
      }
      case 'scanner-code': {
        const input = contracts.scannerCode.parse(body); const raw = shortCode();
        rpcName = 'create_scanner_code'; rpcArgs = { p_member: input.membershipId, p_purpose: input.purpose,
          p_intent: input.intentId ?? null, p_code_hash: hashToken(raw) }; privateResult = { raw }; break;
      }
      case 'resolve': {
        const input = contracts.resolve.parse(body); const raw = randomToken();
        rpcName = 'resolve_scanner'; rpcArgs = { p_business: input.businessId, p_branch: input.branchId,
          p_kind: input.kind, p_raw: input.rawValue, p_context_hash: hashToken(raw) }; privateResult = { raw }; break;
      }
      case 'preview-purchase': {
        const { checkoutContext, ...input } = contracts.purchasePreview.parse(body);
        rpcName = 'preview_purchase'; rpcArgs = { p_context_hash: hashToken(checkoutContext), p_input: input }; break;
      }
      case 'record-purchase': {
        const { checkoutContext, ...input } = contracts.purchaseCommit.parse(body);
        rpcName = 'record_purchase'; rpcArgs = { p_context_hash: hashToken(checkoutContext), p_input: input, p_correlation_id: correlationId }; break;
      }
      case 'create-intent': {
        const input = contracts.intent.parse(body); const raw = `LOYALTY:REDEEM:v1:${randomToken()}`;
        rpcName = 'create_redemption_intent'; rpcArgs = { p_membership: input.membershipId, p_reward_version: input.rewardVersionId,
          p_token_hash: hashToken(raw), p_correlation_id: correlationId }; privateResult = { raw }; break;
      }
      case 'cancel-intent': {
        const input = contracts.cancelIntent.parse(body); rpcName = 'cancel_redemption_intent'; rpcArgs = { p_intent: input.intentId }; break;
      }
      case 'intent-status': {
        const input = contracts.intentStatus.parse(body); rpcName = 'customer_intent_status'; rpcArgs = { p_intent: input.intentId }; break;
      }
      case 'preview-redemption': {
        const input = contracts.redeemPreview.parse(body); rpcName = 'preview_redemption'; rpcArgs = { p_context_hash: hashToken(input.checkoutContext) }; break;
      }
      case 'finalize-redemption': {
        const input = contracts.redeemCommit.parse(body); rpcName = 'finalize_redemption'; rpcArgs = {
          p_context_hash: hashToken(input.checkoutContext), p_expected_hash: input.expectedEffectHash,
          p_key: input.idempotencyKey, p_correlation_id: correlationId }; break;
      }
      case 'preview-offer-fulfillment': {
        const input = contracts.redeemPreview.parse(body); rpcName = 'preview_offer_fulfillment';
        rpcArgs = { p_context_hash: hashToken(input.checkoutContext) }; break;
      }
      case 'fulfill-offer': {
        const input = contracts.redeemCommit.parse(body); rpcName = 'fulfill_offer'; rpcArgs = {
          p_context_hash: hashToken(input.checkoutContext), p_expected_hash: input.expectedEffectHash,
          p_key: input.idempotencyKey, p_correlation: correlationId }; break;
      }
      case 'reverse-purchase': case 'reverse-redemption': {
        const input = contracts.reverse.parse(body); rpcName = operation === 'reverse-purchase' ? 'reverse_purchase' : 'reverse_redemption';
        rpcArgs = { p_business: input.businessId, [operation === 'reverse-purchase' ? 'p_purchase' : 'p_redemption']: input.sourceId,
          p_reason: input.reason, p_expected_version: input.expectedLedgerVersion, p_key: input.idempotencyKey, p_correlation_id: correlationId }; break;
      }
      case 'adjust': {
        const input = contracts.adjust.parse(body); rpcName = 'adjust_units'; rpcArgs = { p_business: input.businessId, p_membership: input.membershipId,
          p_units: input.units, p_reason: input.reason, p_expected_version: input.expectedLedgerVersion,
          p_key: input.idempotencyKey, p_correlation_id: correlationId }; break;
      }
      case 'result': {
        const input = contracts.operationResult.parse(body); rpcName = 'get_value_result'; rpcArgs = { p_business: input.businessId,
          p_operation: input.operation, p_key: input.idempotencyKey }; break;
      }
      case 'reconcile': {
        const input = contracts.reconciliation.parse(body); rpcName = 'reconcile_balances'; rpcArgs = { p_business: input.businessId }; break;
      }
      case 'activity': {
        const input = contracts.activity.parse(body); rpcName = 'staff_activity'; rpcArgs = { p_business: input.businessId, p_branch: input.branchId,p_type:input.type,
          p_start: input.startDate, p_end: input.endDate, p_size: input.pageSize, p_page: input.page }; break;
      }
      case 'staff-context': {
        const input = contracts.configuration.parse(body); rpcName = 'staff_context'; rpcArgs = { p_business: input.businessId }; break;
      }
      case 'activity-detail': {
        const input = contracts.activityDetail.parse(body); rpcName = 'staff_activity_detail';
        rpcArgs = { p_business: input.businessId, p_type: input.type, p_id: input.id }; break;
      }
      case 'configuration': {
        const input = contracts.configuration.parse(body); rpcName = 'loyalty_configuration'; rpcArgs = { p_business: input.businessId }; break;
      }
      case 'save-programme': {
        const { businessId, ...input } = contracts.programmeDraft.parse(body); rpcName = 'save_programme_version';
        rpcArgs = { p_business: businessId, p_input: input, p_correlation: correlationId }; break;
      }
      case 'programme-example': {
        const input = contracts.programmeExample.parse(body);rpcName='preview_programme_example';
        rpcArgs={p_business:input.businessId,p_mode:input.type,p_minimum:input.minimumSpendPaisa,p_stamps:input.stampsPerPurchase,
          p_step:input.spendStepPaisa,p_per_step:input.unitsPerStep,p_cap:input.maxBaseUnitsPerPurchase,p_eligible:input.exampleEligibleSpendPaisa};break;
      }
      case 'publish-programme': {
        const input = contracts.programmePublish.parse(body); rpcName = 'publish_programme_version';
        rpcArgs = { p_business: input.businessId, p_version: input.programmeVersionId, p_row_version: input.rowVersion, p_correlation: correlationId }; break;
      }
      case 'programme-status': {
        const input = contracts.programmeStatus.parse(body); rpcName = 'set_programme_status';
        rpcArgs = { p_business: input.businessId, p_status: input.status, p_row_version: input.rowVersion, p_correlation: correlationId }; break;
      }
      case 'save-reward': {
        const { businessId, ...input } = contracts.rewardDraft.parse(body); rpcName = 'save_reward_draft';
        rpcArgs = { p_business: businessId, p_input: input, p_correlation: correlationId }; break;
      }
      case 'publish-reward': {
        const input = contracts.rewardPublish.parse(body); rpcName = 'publish_reward';
        rpcArgs = { p_business: input.businessId, p_reward: input.rewardId, p_row_version: input.rowVersion, p_correlation: correlationId }; break;
      }
      case 'promotion-configuration': {
        const input = contracts.configuration.parse(body); rpcName = 'promotion_configuration'; rpcArgs = { p_business: input.businessId }; break;
      }
      case 'save-promotion': {
        const { businessId, ...input } = contracts.promotionDraft.parse(body); rpcName = 'save_promotion';
        rpcArgs = { p_business: businessId, p_input: input, p_correlation: correlationId }; break;
      }
      case 'publish-promotion': {
        const input = contracts.promotionPublish.parse(body); rpcName = 'publish_promotion';
        rpcArgs = { p_business: input.businessId, p_promotion: input.promotionId, p_version: input.promotionVersionId,
          p_row_version: input.rowVersion, p_enable: input.enable, p_correlation: correlationId }; break;
      }
      case 'promotion-status': {
        const input = contracts.promotionStatus.parse(body); rpcName = 'set_promotion_status';
        rpcArgs = { p_business: input.businessId, p_promotion: input.promotionId, p_status: input.status,
          p_row_version: input.rowVersion, p_correlation: correlationId }; break;
      }
      case 'save-referral-rules': {
        const { businessId, ...input } = contracts.referralRules.parse(body); rpcName = 'save_referral_rules';
        rpcArgs = { p_business: businessId, p_input: input, p_correlation: correlationId }; break;
      }
      case 'referral-configuration': {
        const input = contracts.referralResults.parse(body); rpcName = 'referral_configuration';
        rpcArgs = { p_business: input.businessId, p_start: input.startDate, p_end: input.endDate, p_status: input.status,
          p_branch: input.branchId, p_page: input.page, p_size: input.pageSize }; break;
      }
      case 'my-referral-code': {
        const input = contracts.card.parse(body); rpcName = 'my_referral_code'; rpcArgs = { p_member: input.membershipId }; break;
      }
      default: return failure('not_found', 'Operation unavailable.', correlationId);
    }
    let response = await client.rpc(rpcName as never, rpcArgs as never);
    if (['record-purchase','finalize-redemption','fulfill-offer','reverse-purchase','reverse-redemption','adjust'].includes(operation)) {
      for (let attempt = 1; attempt < 3 && response.error
        && (response.error.code === '40P01' || response.error.code === '40001' && !['stale_effect','conflict','idempotency_conflict'].includes(response.error.message)); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10 + Math.floor(Math.random() * 30)));
        response = await client.rpc(rpcName as never, rpcArgs as never);
      }
    }
    const { data, error } = response;
    if (error) {
      if (error.code === 'P0002') return failure('not_found', 'This record is unavailable for your account.', correlationId);
      if (error.code === 'P0001') return failure('expired', 'This code expired or was already used.', correlationId);
      if (error.code === 'P0003') return failure('insufficient_balance', 'The current balance is insufficient.', correlationId);
      if (error.code === '42501') return failure('forbidden', error.message === 'mfa_required' || error.message === 'reauthentication_required'
        ? 'Verify your authenticator again before continuing.' : 'Your current account or branch cannot perform this action.', correlationId);
      if (operation === 'record-purchase' && ['40001','23P01'].includes(error.code) && error.message === 'stale_effect') {
        const previewInput = { ...(rpcArgs.p_input as Record<string, unknown>) };
        delete previewInput.expectedEffectHash;
        delete previewInput.idempotencyKey;
        const current = await client.rpc('preview_purchase', { p_context_hash: rpcArgs.p_context_hash as string, p_input: previewInput as never });
        if (!current.error && current.data) return Response.json({ error: { code: 'conflict', message: 'The award changed. Review this fresh preview and confirm again.',
          freshPreview: current.data }, correlationId }, { status: 409, headers: PRIVATE_HEADERS });
        return failure('conflict', 'The award changed. Scan the customer again before confirming.', correlationId);
      }
      if (error.code === '23P01' && error.message === 'promotion_overlap') {
        try {
          const detail = z.strictObject({ promotionName: z.string().max(80), branchName: z.string().max(80) }).parse(JSON.parse(error.details));
          return failure('conflict', `This slot overlaps ${detail.promotionName} at ${detail.branchName}. Choose another time or branch.`, correlationId);
        } catch { return failure('conflict', 'This slot overlaps another enabled slot. Refresh the schedule.', correlationId); }
      }
      if (['23505','23P01','40001'].includes(error.code)) return failure('conflict', 'This information changed. Refresh the current balance and try again.', correlationId);
      if (['22023','23514','23502','23503','22P02','22003'].includes(error.code)) return failure('invalid_input', 'Check the values and current rules.', correlationId);
      console.error('loyalty_rpc_error',operation,error.code,correlationId);
      return failure('temporary_failure', 'The operation could not be completed. Check its result before retrying.', correlationId);
    }
    const limited = z.object({ error: z.object({ code: z.literal('rate_limited'), retryAfterSeconds: z.number() }) }).safeParse(data);
    if (limited.success) return rateLimited(limited.data.error.retryAfterSeconds, correlationId);
    const domainError = z.object({ error: z.object({ code: z.enum(['not_found','expired','invalid_input','conflict','insufficient_balance','forbidden','temporary_failure']) }) }).safeParse(data);
    if (domainError.success) {
      const code = domainError.data.error.code;
      const message = code === 'not_found' ? 'This record is unavailable for your account.' : code === 'expired' ? 'This code expired or was already used.'
        : code === 'insufficient_balance' ? 'The current balance is insufficient.' : code === 'forbidden' ? 'Your current account cannot perform this action.'
        : code === 'conflict' ? 'This information changed. Refresh and try again.' : code === 'invalid_input' ? 'Check the current values and rules.'
        : 'The operation could not be completed.';
      return failure(code, message, correlationId);
    }
    let result: unknown = data;
    if (operation === 'handle') {
      const parsed = z.object({ ciphertext: z.string(), keyId: z.string() }).parse(data);
      const key = privateResult.key as ReturnType<typeof encryptionKey>;
      if (parsed.keyId !== key.id) return failure('temporary_failure', 'The checkout QR key needs rotation.', correlationId);
      result = { ...(data as object), qrValue: openSecret(parsed.ciphertext, key, `membership-handle:${(body as { membershipId: string }).membershipId}`) };
    } else if (operation === 'scanner-code') result = { ...(data as object), code: privateResult.raw };
    else if (operation === 'resolve') result = { ...(data as object), checkoutContext: privateResult.raw };
    else if (operation === 'create-intent') result = { ...(data as object), qrValue: privateResult.raw };
    return Response.json({ data: result, correlationId }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return failure('invalid_input', 'Check the required fields and input limits.', correlationId);
    return failure('temporary_failure', 'The operation could not be completed. Please retry.', correlationId);
  }
}
