import { z } from 'zod';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

const text = (min: number, max: number) => z.string().trim().refine(s => [...s].length >= min && [...s].length <= max, `Use ${min}–${max} characters.`);
const optionalText = (max: number) => text(0, max).default('');
const uuid = z.uuid();
const integer = (min: number, max: number) => z.number().int().min(min).max(max);
const units = (max: bigint) => z.string().regex(/^[1-9][0-9]{0,6}$/u).refine(s => BigInt(s) <= max, 'Units exceed the supported limit.');
const amount = z.string().regex(/^(0|[1-9][0-9]{0,8})$/u).refine(s => BigInt(s) <= 100000000n, 'Maximum Rs 1,000,000.');
const https = z.union([z.literal(''), z.url().max(2048).refine(s => new URL(s).protocol === 'https:' && !new URL(s).username && !new URL(s).password)]).default('');
export const phone = z.string().max(30).transform(s => s.trim() ? parsePhoneNumberFromString(s, 'PK') : null)
  .refine(p => p === null || Boolean(p?.isValid()), 'Enter a valid phone number.').transform(p => p?.number ?? '');
export const hours = z.array(z.strictObject({ weekday: integer(1, 7), opensAt: z.string().regex(/^\d{2}:\d{2}(:00)?$/u), closesAt: z.string().regex(/^\d{2}:\d{2}(:00)?$/u) })
  .refine(h => h.opensAt < h.closesAt && Number(h.opensAt.slice(0, 2)) < 24 && (Number(h.closesAt.slice(0, 2)) < 24 || /^24:00(:00)?$/u.test(h.closesAt))
    && Number(h.opensAt.slice(3, 5)) < 60 && Number(h.closesAt.slice(3, 5)) < 60, 'Use a same-day opening interval.')).max(42);
const branchIds = z.array(uuid).min(1).max(100).refine(ids => new Set(ids).size === ids.length, 'Choose each branch once.');
const permissions = { canManageCampaigns: z.boolean().default(false), canContactCustomers: z.boolean().default(false), canReverseTransactions: z.boolean().default(false), canExportReports: z.boolean().default(false) };
export const bootstrapSchema = z.strictObject({ planVersionId: uuid, name: text(2, 80), slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/u),
  description: optionalText(500), accentHex: z.string().regex(/^#[0-9a-fA-F]{6}$/u), branchName: text(2, 80), address: text(5, 300), city: text(2, 80),
  area: optionalText(80), mapsUrl: https, phone: phone.default(''), hours });
export const initialProgrammeSchema = z.strictObject({ businessId: uuid, rowVersion: integer(1, 2147483647), type: z.enum(['stamps', 'points']), name: text(2, 80),
  minimumSpendPaisa: amount, stampsPerPurchase: units(10n).nullable(), spendStepPaisa: amount.nullable(), unitsPerStep: units(1000n).nullable(),
  maxBaseUnitsPerPurchase: units(100000n), terms: text(10, 3000), rewardTitle: text(2, 80), rewardUnitCost: units(1000000n),
  rewardDescription: optionalText(500), rewardTerms: text(10, 2000), rewardBranchIds: branchIds, estimatedCostPaisa: amount.nullable(),
}).refine(v => v.type === 'stamps' ? v.stampsPerPurchase !== null && BigInt(v.stampsPerPurchase) <= BigInt(v.maxBaseUnitsPerPurchase) && v.spendStepPaisa === null && v.unitsPerStep === null
  : v.stampsPerPurchase === null && v.spendStepPaisa !== null && BigInt(v.spendStepPaisa) >= 100n && v.unitsPerStep !== null, 'Check mode-specific earning fields.');
export const inviteSchema = z.strictObject({ businessId: uuid, email: z.email().max(254).transform(s => s.toLowerCase()), role: z.enum(['manager', 'cashier']), branchIds, ...permissions })
  .refine(v => v.role !== 'cashier' || !(v.canManageCampaigns || v.canContactCustomers || v.canReverseTransactions || v.canExportReports), 'Cashiers cannot have manager permissions.');
export const staffSchema = z.strictObject({ businessId: uuid, id: uuid, rowVersion: integer(1, 2147483647), action: z.enum(['revoke', 'revoke_invite', 'edit']),
  role: z.enum(['manager', 'cashier']).optional(), branchIds: branchIds.optional(), ...permissions }).refine(v => v.action !== 'edit' || Boolean(v.role && v.branchIds), 'Choose role and branches.');
export const joinSchema = z.strictObject({ businessSlug: z.string().min(3).max(50), branchId: uuid, displayName: text(1, 80), shareVerifiedEmail: z.boolean(), phone: phone.default(''),
  whatsappMarketingConsent: z.boolean(), acceptedProgrammeVersionId: uuid, platformTermsDocumentId: uuid, privacyDocumentId: uuid, rejoin: z.boolean().default(false) })
  .refine(v => !v.whatsappMarketingConsent || Boolean(v.phone), 'Enter a WhatsApp number first.');
export const consentSchema = z.strictObject({ membershipId: uuid, channel: z.enum(['push', 'whatsapp', 'inbox']), purpose: z.enum(['marketing', 'reward_updates', 'birthday']), allowed: z.boolean(), textVersion: text(1, 80) })
  .refine(v => v.channel === 'push' || v.channel === 'whatsapp' && v.purpose === 'marketing' || v.channel === 'inbox' && v.purpose === 'birthday', 'Choose a supported consent preference.');
export const contactSchema = z.strictObject({ membershipId: uuid, phone, shareVerifiedEmail: z.boolean(), rowVersion: integer(1, 2147483647) });
export const tokenSchema = z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u) });
export const memberSchema = z.strictObject({ membershipId: uuid });
export const publishSchema = z.strictObject({ businessId: uuid, rowVersion: integer(1, 2147483647) });
export const branchSchema = z.strictObject({ businessId: uuid, id: uuid.nullable(), rowVersion: integer(1, 2147483647).nullable(), name: text(2, 80), address: text(5, 300), city: text(2, 80), area: optionalText(80), mapsUrl: https, phone, status: z.enum(['active', 'inactive']), hours });
const timezone = z.string().max(100).refine(s => { try { new Intl.DateTimeFormat('en', { timeZone: s }); return true; } catch { return false; } }, 'Choose a valid timezone.');
export const settingsSchema = z.strictObject({ businessId: uuid, rowVersion: integer(1, 2147483647), name: text(2, 80), timezone, description: optionalText(500), accentHex: z.string().regex(/^#[0-9a-fA-F]{6}$/u), phone, supportEmail: z.union([z.literal(''), z.email().max(254)]), menuUrl: https, reviewUrl: https });
export const participationSchema = publishSchema.extend({ status: z.enum(['active', 'paused']) });
export const mediaSchema = z.strictObject({ businessId: uuid, kind: z.enum(['logo', 'cover', 'offer', 'payment_proof']), mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']), bytes: integer(1, 5242880) });
export const assetSchema = z.strictObject({ assetId: uuid });
export const attachMediaSchema = publishSchema.extend({ assetId: uuid });
export const resendInvitationSchema = publishSchema.extend({ invitationId: uuid });
export const profileSchema = z.strictObject({ displayName: text(1, 80), timezone: z.string().max(100).refine(s => { try { new Intl.DateTimeFormat('en', { timeZone: s }); return true; } catch { return false; } }), birthdayMonth: integer(1, 12).nullable(), birthdayDay: integer(1, 31).nullable(), updateMembershipNames: z.boolean(), rowVersion: integer(1, 2147483647) })
  .refine(v => v.birthdayMonth === null && v.birthdayDay === null || v.birthdayMonth !== null && v.birthdayDay !== null && v.birthdayDay <= new Date(Date.UTC(2000, v.birthdayMonth, 0)).getUTCDate(), 'Use a valid birthday month and day.');

export const policySchema = z.object({ id: uuid, kind: z.string(), version: z.string(), body: z.string(), publishedAt: z.string() });
export const configurationSchema = z.object({ plans: z.array(z.object({ id: uuid, name: z.string(), pricePaisa: z.string(), billingPeriod: z.string(), trialDays: z.number(), branchLimit: z.number(), staffLimit: z.number() })), policies: z.array(policySchema) });
export const cafeSchema = z.object({ id: uuid, slug: z.string(), name: z.string(), description: z.string().nullable(), accentHex: z.string(), status: z.string(), timezone: z.string(), canJoin: z.boolean(),
  menuUrl: z.string().nullable(), reviewUrl: z.string().nullable(), phone: z.string().nullable(),
  programme: z.object({ id: uuid, type: z.enum(['stamps', 'points']), name: z.string(), terms: z.string(), minimumSpendPaisa: z.string(), stampsPerPurchase: z.string().nullable(), spendStepPaisa: z.string().nullable(), unitsPerStep: z.string().nullable(), maxBaseUnitsPerPurchase: z.string() }),
  branches: z.array(z.object({ id: uuid, name: z.string(), address: z.string(), city: z.string(), mapsUrl: z.string().nullable(), hours: z.array(z.object({ weekday: z.number(), opensAt: z.string(), closesAt: z.string() })) })),
  rewards: z.array(z.object({ id: uuid, title: z.string(), unitCost: z.string(), description: z.string(), terms: z.string(), branchIds: z.array(uuid) })) });
export const membershipSchema = z.object({ id: uuid, businessId: uuid, businessName: z.string(), slug: z.string(), accentHex: z.string(), displayName: z.string(), status: z.string(), joinedAt: z.string(), joinedBranchId: uuid.nullable(), units: z.string(), ledgerVersion: z.string(), programmeType: z.enum(['stamps', 'points']) });
export const workspacesSchema = z.array(z.object({ id: uuid, name: z.string(), role: z.enum(['owner', 'manager', 'cashier']), status: z.string(), branches: z.array(z.object({ id: uuid, name: z.string() })) }));
export type Cafe = z.infer<typeof cafeSchema>;
export type Configuration = z.infer<typeof configurationSchema>;
export type Membership = z.infer<typeof membershipSchema>;
