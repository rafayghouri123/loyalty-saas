import { z } from 'zod';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { codePointLength, rupeesToPaisa } from '../../lib/validation/primitives';
import { allowed, visible, type Access, type Field, type Screen, type Section } from './contracts';

export type Values = Record<string, string>;
export function initialValues(screen: Screen): Values {
  return Object.fromEntries(screen.sections.flatMap(section => section.fields ?? []).map(field => [field.id, field.initial ?? (field.kind === 'checkbox' ? 'false' : '')]));
}
export function validPhone(value: string) {
  return Boolean(parsePhoneNumberFromString(value, 'PK')?.isValid());
}
export function templateError(value: string) {
  const remainder = value.replace(/\{\{(first_name|business_name|reward_name|public_offer_url)\}\}/gu, '');
  return /[{}]/u.test(remainder) ? 'Use only the four supported placeholders with matching double braces.' : undefined;
}
export function fieldSchema(field: Field) {
  return z.string().superRefine((raw, context) => {
    const value = raw.trim();
    const fail = (message: string) => context.addIssue({ code: 'custom', message });
    if (field.kind === 'checkbox') { if (field.required && value !== 'true') fail('Please confirm this field.'); return; }
    if (!value) { if (field.required) fail('This field is required.'); return; }
    if (field.kind === 'money') {
      try { const paisa = BigInt(rupeesToPaisa(value)); if (field.min !== undefined && paisa < BigInt(Math.round(field.min * 100))) fail(`Enter at least Rs ${field.min}.`); }
      catch { fail('Enter 0–1,000,000 rupees with at most two decimal places.'); }
      return;
    }
    if (field.kind === 'integer') {
      if (!/^-?(0|[1-9][0-9]*)$/u.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < (field.min ?? 0) || Number(value) > (field.max ?? 2147483647)) fail(`Enter a whole number from ${field.min ?? 0} to ${field.max ?? 2147483647}.`);
      return;
    }
    if (field.kind === 'select' && !field.options?.includes(value)) fail('Choose an available option.');
    if (field.kind === 'multi') {
      const choices = value.split('|');
      if (new Set(choices).size !== choices.length || choices.some(choice => !field.options?.includes(choice)) || choices.length > (field.max ?? 1000)) fail('Choose valid, distinct options within the allowed limit.');
      return;
    }
    if (field.kind === 'email' && !z.email().safeParse(value).success) fail('Enter a valid email address.');
    if (field.kind === 'url') { try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) fail('Enter an HTTPS URL without embedded credentials.'); } catch { fail('Enter an HTTPS URL.'); } }
    if (field.kind === 'phone' && !validPhone(value)) fail('Enter a valid international or Pakistani phone number.');
    if (field.kind === 'file') {
      const [, bytes, mime] = value.split('|');
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime ?? '') || !Number.isFinite(Number(bytes)) || Number(bytes) > 5 * 1024 * 1024 || Number(bytes) <= 0) fail('Choose a JPEG, PNG or WebP image up to 5 MiB. Server decoding is required before publication.');
    }
    if (field.kind === 'color' && !/^#[0-9a-f]{6}$/iu.test(value)) fail('Enter a six-digit hex color.');
    if (field.kind === 'code' && !(field.id === 'mfa' ? /^\d{6}$/u : /^[A-Za-z0-9]{8}$/u).test(value)) fail(field.id === 'mfa' ? 'Enter six digits.' : 'Enter the eight-character customer code.');
    if (field.kind === 'date' && !validDate(value)) fail('Enter a valid calendar date.');
    if (field.kind === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/u.test(value)) fail('Use a valid 24-hour time.');
    if (field.kind === 'datetime-local' && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value) || !validDate(value.slice(0, 10)) || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(value.slice(11)))) fail('Enter a valid date and 24-hour time.');
    if (['text', 'textarea', 'email', 'code'].includes(field.kind ?? 'text')) {
      if (codePointLength(value) < (field.min ?? 0) || codePointLength(value) > (field.max ?? 10000)) fail(`Enter ${field.min ?? 0}–${field.max ?? 10000} characters.`);
    }
  });
}
export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function rangeError(start: string, end: string, maximum = 90) {
  if (!validDate(start) || !validDate(end)) return 'Choose a valid start and end date.';
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  return days < 1 || days > maximum ? `Choose an inclusive date range of 1–${maximum} days.` : undefined;
}
export function validateSections(screen: Screen, values: Values, access: Access, sections: Section[] = screen.sections): Values {
  const errors: Values = {};
  const fields = sections.filter(section => allowed(access, section.roles, section.capability) && visible(section.when, values)).flatMap(section => section.fields ?? []).filter(field => allowed(access, field.roles) && visible(field.when, values) && !field.disabled);
  const has = (id: string) => fields.some(field => field.id === id);
  for (const field of fields) {
    const result = fieldSchema(field).safeParse(values[field.id] ?? '');
    if (!result.success) errors[field.id] = result.error.issues[0]!.message;
  }
  if (has('slug') && values.slug && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(values.slug) || ['app', 'admin', 'auth', 'api', 'dashboard', 'staff', 'www', 'support', 'privacy', 'terms'].includes(values.slug))) errors.slug = 'Use an available lowercase slug, with single hyphens between words.';
  if (has('timezone')) { try { new Intl.DateTimeFormat('en-PK', { timeZone: values.timezone }).format(); } catch { errors.timezone = 'Choose a valid IANA timezone.'; } }
  if (has('birthdayMonth') && (values.birthdayMonth || values.birthdayDay)) {
    const month = Number(values.birthdayMonth), day = Number(values.birthdayDay);
    const date = new Date(Date.UTC(2000, month - 1, day));
    if (!month || !day || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) errors.birthdayDay = 'Enter a valid month/day pair, or clear both fields.';
  }
  if (has('whatsapp') && values.whatsapp === 'true' && !validPhone(values.phone ?? '')) errors.phone = 'A valid phone number is required for WhatsApp consent.';
  if (has('eligible') && !errors.bill && !errors.eligible && values.bill && values.eligible && BigInt(rupeesToPaisa(values.eligible)) > BigInt(rupeesToPaisa(values.bill))) errors.eligible = 'Eligible spend cannot exceed the actual paid bill.';
  if (has('adjustment') && Number(values.adjustment) === 0) errors.adjustment = 'Enter a nonzero adjustment.';
  if (has('baseCap') && values.mode === 'Stamps' && Number(values.baseCap) < Number(values.stamps)) errors.baseCap = 'The base cap must be at least the configured stamp award.';
  if (has('startDate') && values.startDate && values.endDate) { const error = rangeError(values.startDate, values.endDate, 366); if (error) errors.endDate = error; }
  if (has('startTime') && values.startTime && values.endTime && values.startTime >= values.endTime) errors.endTime = 'End time must be later on the same day. Split overnight windows.';
  if (has('startsAt') && values.startsAt && values.expiresAt && values.startsAt >= values.expiresAt) errors.expiresAt = 'End must be later than start.';
  if (has('scheduledAt') && values.sendTime === 'Schedule' && values.scheduledAt && Date.parse(`${values.scheduledAt}:00+05:00`) <= Date.now()) errors.scheduledAt = 'Choose a future time in Asia/Karachi.';
  if (screen.id === 'O10' && has('expiresAt') && values.expiresAt) {
    const start = values.sendTime === 'Schedule' ? Date.parse(`${values.scheduledAt}:00+05:00`) : Date.now();
    const end = Date.parse(`${values.expiresAt}:00+05:00`);
    if (!(end > start && end - start <= 7 * 86400000)) errors.expiresAt = 'The send window must end after send time and within seven days.';
  }
  if (screen.id === 'O11' && has('terms') && values.kind !== 'Informational' && codePointLength((values.terms ?? '').trim()) < 10) errors.terms = 'Claimable offers need 10–2000 characters of terms.';
  if (has('templateBody')) { const error = templateError(values.templateBody ?? ''); if (error) errors.templateBody = error; }
  if (screen.id === 'O13' && has('targetReward')) {
    if ((values.audience === 'Reward ready' || values.templateBody?.includes('{{reward_name}}')) && !values.targetReward) errors.targetReward = 'Select a target reward for this audience or placeholder.';
    if (values.templateBody?.includes('{{public_offer_url}}') && !values.offer) errors.offer = 'Select a published all-members offer for this placeholder.';
  }
  if (screen.id === 'A04' && has('reviewNote') && values.decision === 'Reject' && !values.reviewNote?.trim()) errors.reviewNote = 'Explain the rejection.';
  if (['O10', 'O12'].includes(screen.id)) for (const id of ['title', 'body']) if (has(id) && /<[^>]*>/u.test(values[id] ?? '')) errors[id] = 'Use plain notification text, without HTML.';
  return errors;
}
