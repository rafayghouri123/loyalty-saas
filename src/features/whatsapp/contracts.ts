import { z } from 'zod';
import { text, codePointLength } from '../../lib/validation/primitives';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

export const placeholders = ['first_name', 'business_name', 'reward_name', 'public_offer_url'] as const;
export function templateError(value: string) {
  const rest = value.replace(/\{\{(first_name|business_name|reward_name|public_offer_url)\}\}/gu, '');
  return /[{}]/u.test(rest) || /<%|%>|\$\{/u.test(rest)
    ? 'Use only the four supported placeholders with matching double braces.' : undefined;
}
export const templateBody = text(10, 1000).refine(value => !templateError(value), templateError('{$}')!);
export function renderTemplate(body: string, values: Partial<Record<typeof placeholders[number], string>>) {
  if (templateError(body)) return { error: templateError(body)!, body: null };
  const missing = new Set<string>();
  const rendered = body.replace(/\{\{(first_name|business_name|reward_name|public_offer_url)\}\}/gu, (_, key: typeof placeholders[number]) => {
    const value = values[key]; if (!value?.trim()) missing.add(key); return value ?? '';
  }).trim();
  if (missing.size) return { error: `Missing ${[...missing].join(', ')}.`, body: null };
  if (codePointLength(rendered) < 10 || codePointLength(rendered) > 1000) return { error: 'Rendered text must contain 10–1000 characters.', body: null };
  return { error: null, body: rendered };
}
export function whatsappLink(phone: string, body: string) {
  const parsed = parsePhoneNumberFromString(phone, { defaultCountry: 'PK', extract: false });
  if (!parsed?.isValid() || parsed.ext || codePointLength(body.trim()) < 10 || codePointLength(body.trim()) > 1000)
    throw new Error('The phone number or message is unavailable. Refresh or skip this task.');
  return `https://wa.me/${parsed.number.slice(1)}?text=${encodeURIComponent(body)}`;
}
const id = z.uuid(), rowVersion = z.number().int().positive();
export const businessOnly = z.strictObject({ businessId: id });
export const templateInput = z.strictObject({ businessId: id, templateId: id.nullable(), rowVersion: rowVersion.nullable(),
  name: text(2, 80), body: templateBody, active: z.boolean() });
export const batchInput = z.strictObject({ businessId: id, name: text(2, 100), templateId: id, templateVersion: rowVersion,
  audience: z.enum(['selected_members', 'inactive', 'reward_ready']), memberIds: z.array(id).max(100),
  inactiveDays: z.number().int().min(7).max(365).nullable(), targetRewardVersionId: id.nullable(), offerId: id.nullable(),
  assignedBusinessUserId: id.nullable() }).superRefine((v, c) => {
    if ((v.audience === 'selected_members') !== (v.memberIds.length > 0)) c.addIssue({ code: 'custom', message: 'Select members only for the selected-members audience.', path: ['memberIds'] });
    if ((v.audience === 'inactive') !== (v.inactiveDays !== null)) c.addIssue({ code: 'custom', message: 'Set inactive days for the inactive audience.', path: ['inactiveDays'] });
    if (v.audience === 'reward_ready' && !v.targetRewardVersionId) c.addIssue({ code: 'custom', message: 'Choose the target reward.', path: ['targetRewardVersionId'] });
  });
export const batchCreate = batchInput.safeExtend({ idempotencyKey: id });
export const taskOnly = z.strictObject({ businessId: id, taskId: id });
export const taskOpen = taskOnly.extend({ rowVersion });
export const taskAction = taskOpen.extend({ action: z.enum(['mark_sent', 'skip', 'opt_out', 'reassign']),
  attestsSent: z.boolean().default(false), note: text(0, 500).default(''), assignedBusinessUserId: id.nullable().default(null) })
  .superRefine((v, c) => {
    if (v.action === 'mark_sent' && !v.attestsSent) c.addIssue({ code: 'custom', message: 'Confirm you personally sent the message.', path: ['attestsSent'] });
    if (v.action === 'opt_out' && codePointLength(v.note) < 2) c.addIssue({ code: 'custom', message: 'Record the opt-out source or note.', path: ['note'] });
  });
export const taskFilters = z.strictObject({ businessId: id, batchId: id.nullable().default(null),
  state: z.enum(['pending', 'assigned', 'opened', 'staff_marked_sent', 'skipped', 'opted_out']).nullable().default(null),
  assigneeId: id.nullable().default(null), startDate: z.iso.date().nullable().default(null), endDate: z.iso.date().nullable().default(null),
  offset: z.number().int().min(0).max(100000).default(0) });
export const memberOnly = z.strictObject({ businessId: id, membershipId: id });
export const memberContactAction = memberOnly.extend({ action: z.enum(['opt_out', 'confirm_number']), rowVersion,
  note: text(2, 500), attested: z.boolean() });
