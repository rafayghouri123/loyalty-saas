import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getPublicConfig } from '@/lib/config';
import { verifiedUser } from '@/lib/db/server';
import { failure, PRIVATE_HEADERS, rateLimited, readSmallJson, validMutationOrigin } from '@/lib/security/http';
import * as input from '@/features/whatsapp/contracts';

export async function POST(request: Request, { params }: { params: Promise<{ operation: string }> }) {
  const correlationId = randomUUID(), config = getPublicConfig();
  if (!config) return failure('temporary_failure', 'Authentication needs setup.', correlationId);
  if (!validMutationOrigin(request, config.appUrl)) return failure('forbidden', 'Request origin is not allowed.', correlationId);
  const { client, user } = await verifiedUser();
  if (!client || !user) return failure('unauthenticated', 'Sign in with a verified account.', correlationId);
  try {
    const body = await readSmallJson(request);
    const { operation } = await params;
    let name: string, args: Record<string, unknown>;
    switch (operation) {
      case 'configuration': { const v = input.businessOnly.parse(body); name = 'whatsapp_configuration'; args = { p_business: v.businessId }; break; }
      case 'save-template': { const { businessId, ...v } = input.templateInput.parse(body); name = 'save_whatsapp_template'; args = { p_business: businessId, p_input: v, p_correlation: correlationId }; break; }
      case 'preview-batch': { const { businessId, ...v } = input.batchInput.parse(body); name = 'preview_followup_batch'; args = { p_business: businessId, p_input: v }; break; }
      case 'create-batch': { const { businessId, idempotencyKey, ...v } = input.batchCreate.parse(body); name = 'create_followup_batch'; args = { p_business: businessId, p_input: v, p_key: idempotencyKey, p_correlation: correlationId }; break; }
      case 'members': { const v = z.strictObject({ businessId: z.uuid(), query: z.string().max(80), offset: z.number().int().min(0).max(100000) }).parse(body); name = 'whatsapp_members'; args = { p_business: v.businessId, p_query: v.query, p_offset: v.offset }; break; }
      case 'tasks': { const { businessId, ...v } = input.taskFilters.parse(body); name = 'whatsapp_tasks'; args = { p_business: businessId, p_filters: v }; break; }
      case 'task-detail': { const v = input.taskOnly.parse(body); name = 'whatsapp_task_detail'; args = { p_business: v.businessId, p_task: v.taskId }; break; }
      case 'open-task': { const v = input.taskOpen.parse(body); name = 'open_whatsapp_task'; args = { p_business: v.businessId, p_task: v.taskId, p_row_version: v.rowVersion, p_correlation: correlationId }; break; }
      case 'task-action': { const { businessId, taskId, ...v } = input.taskAction.parse(body); name = 'act_on_followup_task'; args = { p_business: businessId, p_task: taskId, p_input: v, p_correlation: correlationId }; break; }
      case 'member-contact': { const v = input.memberOnly.parse(body); name = 'whatsapp_member_contact'; args = { p_business: v.businessId, p_membership: v.membershipId }; break; }
      case 'member-contact-action': { const { businessId, membershipId, ...v } = input.memberContactAction.parse(body); name = 'act_on_member_contact'; args = { p_business: businessId, p_membership: membershipId, p_input: v, p_correlation: correlationId }; break; }
      default: return failure('invalid_input', 'Unknown operation.', correlationId);
    }
    const { data, error } = await client.rpc(name as never, args as never);
    if (error) {
      if (error.code === '42501') return failure('forbidden', 'Your current permissions or cafe access do not allow this action.', correlationId);
      if (error.code === 'P0002') return failure('not_found', 'This record is unavailable for your account.', correlationId);
      if (['23505', '40001'].includes(error.code)) return failure('conflict', 'This task, contact or template changed. Refresh before continuing.', correlationId);
      if (['22023', '23514', '23502', '23503', '22P02'].includes(error.code)) return failure('invalid_input', error.message === 'narrow_audience_max_100' ? 'Choose a smaller audience: at most 100 tasks per batch.' : 'Check the fields, selected reward or public offer, and current rules.', correlationId);
      return failure('temporary_failure', 'The operation could not be completed. Please retry.', correlationId);
    }
    const result = data as { error?: { code: string; message?: string; retryAfterSeconds?: number }; phone?: string; body?: string };
    if (result.error) {
      if (result.error.code === 'rate_limited') {
        const response = rateLimited(result.error.retryAfterSeconds ?? 60, correlationId);
        if (result.error.message) return Response.json({ error: result.error, correlationId }, { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': String(result.error.retryAfterSeconds ?? 60) } });
        return response;
      }
      const code = z.enum(['conflict', 'forbidden', 'invalid_input', 'not_found']).parse(result.error.code);
      return failure(code, result.error.message ?? 'Refresh this task before continuing.', correlationId);
    }
    // Maintained phone metadata validates the canonical SQL-authorized handoff.
    if (operation === 'open-task') return Response.json({ data: { ...(data as object), url: input.whatsappLink(result.phone!, result.body!) }, correlationId }, { headers: PRIVATE_HEADERS });
    return Response.json({ data, correlationId }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof z.ZodError) return failure('invalid_input', 'Check the highlighted fields.', correlationId, z.flattenError(error).fieldErrors);
    if (error instanceof SyntaxError || error instanceof Error && error.message === 'invalid_input') return failure('invalid_input', 'Check the request format and size.', correlationId);
    return failure('temporary_failure', 'The operation could not be completed. Refresh and retry.', correlationId);
  }
}
