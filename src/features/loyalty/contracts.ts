import { z } from 'zod';

const uuid = z.uuid();
const money = z.string().regex(/^(0|[1-9][0-9]{0,8})$/u).refine(v => BigInt(v) <= 100000000n);
const units = z.string().regex(/^-?(0|[1-9][0-9]{0,5})$/u).refine(v => BigInt(v) >= -100000n && BigInt(v) <= 100000n && v !== '0' && v !== '-0');
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const key = z.string().min(8).max(128);
const context = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);
const reason = z.string().trim().min(10).max(500);
const version = z.string().regex(/^(0|[1-9][0-9]{0,14})$/u);
const receipt = z.string().trim().max(80).optional();

export const card = z.strictObject({ membershipId: uuid });
export const ownerMember = z.strictObject({ businessId: uuid, membershipId: uuid });
export const handle = card.extend({ rotate: z.boolean().default(false) });
export const scannerCode = card.extend({ purpose: z.enum(['membership_lookup', 'redemption_lookup','offer_lookup']), intentId: uuid.optional() });
export const resolve = z.strictObject({ businessId: uuid, branchId: uuid, kind: z.enum(['earningHandle', 'redemptionIntent', 'offerIntent','typedCode']), rawValue: z.string().min(8).max(512) });
export const purchaseFields = z.strictObject({ recordedBillPaisa: money, eligibleSpendPaisa: money, qualifyingPurchaseConfirmed: z.boolean(), receiptReference: receipt, correctsPurchaseId: uuid.optional(),offerEligibleBeforeDiscountPaisa:money.optional() })
  .refine(v => BigInt(v.eligibleSpendPaisa) <= BigInt(v.recordedBillPaisa));
export const purchasePreview = purchaseFields.safeExtend({ checkoutContext: context });
export const purchaseCommit = purchasePreview.safeExtend({ expectedEffectHash: hash, idempotencyKey: key });
export const intent = card.extend({ rewardVersionId: uuid });
export const cancelIntent = z.strictObject({ intentId: uuid });
export const intentStatus = cancelIntent;
export const redeemPreview = z.strictObject({ checkoutContext: context });
export const redeemCommit = redeemPreview.extend({ expectedEffectHash: hash, idempotencyKey: key });
export const reverse = z.strictObject({ businessId: uuid, sourceId: uuid, reason, expectedLedgerVersion: version, idempotencyKey: key });
export const adjust = z.strictObject({ businessId: uuid, membershipId: uuid, units, reason, expectedLedgerVersion: version, idempotencyKey: key });
export const operationResult = z.strictObject({ businessId: uuid, operation: z.enum(['record_purchase','finalize_redemption','fulfill_offer','reverse_purchase','reverse_redemption','adjust_units']), idempotencyKey: key });
export const activity = z.strictObject({ businessId: uuid, branchId: uuid.nullable(), type: z.enum(['all','purchase','redemption','reversal']), startDate: z.iso.date(), endDate: z.iso.date(), pageSize: z.union([z.literal(25),z.literal(50),z.literal(100)]), page: z.number().int().min(0).max(10000) });
export const activityDetail = z.strictObject({ businessId: uuid, type: z.enum(['purchase','redemption']), id: uuid });
export const reconciliation = z.strictObject({ businessId: uuid });
export const configuration = reconciliation;
export const programmeDraft = z.strictObject({ businessId: uuid, rowVersion: z.number().int().positive(), name: z.string().trim().min(2).max(80),
  type: z.enum(['stamps','points']), minimumSpendPaisa: money, stampsPerPurchase: z.number().int().min(1).max(10).nullable(),
  spendStepPaisa: money.nullable(), unitsPerStep: z.number().int().min(1).max(1000).nullable(), maxBaseUnitsPerPurchase: z.number().int().min(1).max(100000),
  terms: z.string().trim().min(10).max(3000), effectiveAt: z.iso.datetime({ offset: true }) })
  .refine(v => v.type === 'stamps' ? v.stampsPerPurchase !== null && v.stampsPerPurchase <= v.maxBaseUnitsPerPurchase && v.spendStepPaisa === null && v.unitsPerStep === null
    : v.stampsPerPurchase === null && v.spendStepPaisa !== null && BigInt(v.spendStepPaisa) >= 100n && v.unitsPerStep !== null);
export const programmePublish = z.strictObject({ businessId: uuid, programmeVersionId: uuid, rowVersion: z.number().int().positive() });
export const programmeExample = z.strictObject({ businessId: uuid, type: z.enum(['stamps','points']), minimumSpendPaisa: money,
  stampsPerPurchase: z.number().int().min(1).max(10).nullable(), spendStepPaisa: money.nullable(),
  unitsPerStep: z.number().int().min(1).max(1000).nullable(), maxBaseUnitsPerPurchase: z.number().int().min(1).max(100000),
  exampleEligibleSpendPaisa: money }).refine(v => v.type==='stamps'
    ? v.stampsPerPurchase!==null && v.stampsPerPurchase<=v.maxBaseUnitsPerPurchase && v.spendStepPaisa===null && v.unitsPerStep===null
    : v.stampsPerPurchase===null && v.spendStepPaisa!==null && BigInt(v.spendStepPaisa)>=100n && v.unitsPerStep!==null);
export const programmeStatus = z.strictObject({ businessId: uuid, status: z.enum(['published','paused']), rowVersion: z.number().int().positive() });
export const rewardDraft = z.strictObject({ businessId: uuid, rewardId: uuid.optional(), rowVersion: z.number().int().positive().optional(), title: z.string().trim().min(2).max(80),
  unitCost: z.number().int().min(1).max(1000000), description: z.string().trim().max(500).default(''), terms: z.string().trim().min(10).max(2000),
  estimatedCostPaisa: money.nullable(), branchIds: z.array(uuid).min(1).max(100).refine(ids => new Set(ids).size === ids.length) })
  .refine(v => Boolean(v.rewardId) === Boolean(v.rowVersion));
export const rewardPublish = z.strictObject({ businessId: uuid, rewardId: uuid, rowVersion: z.number().int().positive() });

export const purchaseEffect = z.object({ businessId: uuid, branchId: uuid, membershipId: uuid, programmeVersionId: uuid,
  programmeType: z.enum(['stamps','points']), recordedBillPaisa: z.string(), eligibleSpendPaisa: z.string(), baseUnits: z.string(),
  promotionBonusUnits: z.string(), referralBonusUnits: z.string(), qualifiesForLoyalty: z.boolean(), capReduced: z.boolean().nullable(),
  balance: z.string(), ledgerVersion: z.string(), evaluatedAt: z.string(), expectedEffectHash: hash });

const branchIds = z.array(uuid).min(1).max(100).refine(ids => new Set(ids).size === ids.length);
const weekdays = z.array(z.number().int().min(1).max(7)).min(1).max(7).refine(days => new Set(days).size === days.length);
const clockTime = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/u);
export const promotionDraft = z.strictObject({ businessId: uuid, promotionId: uuid.optional(), rowVersion: z.number().int().positive().optional(),
  name: z.string().trim().min(2).max(80), branchIds, startsOn: z.iso.date(), endsOn: z.iso.date(), weekdays,
  startsAt: clockTime, endsAt: clockTime, minimumSpendPaisa: money, memberDailyCap: z.number().int().min(1).max(100).nullable(),
  maxBonusUnitsPerPurchase: z.number().int().min(1).max(100000), effectiveAt: z.iso.datetime({ offset: true }) })
  .refine(v => Boolean(v.promotionId) === Boolean(v.rowVersion) && v.startsOn <= v.endsOn
    && (Date.parse(v.endsOn) - Date.parse(v.startsOn)) <= 365 * 86400000 && v.startsAt < v.endsAt);
export const promotionPublish = z.strictObject({ businessId: uuid, promotionId: uuid, promotionVersionId: uuid,
  rowVersion: z.number().int().positive(), enable: z.boolean() });
export const promotionStatus = z.strictObject({ businessId: uuid, promotionId: uuid, rowVersion: z.number().int().positive(),
  status: z.enum(['enabled', 'paused']) });
export const referralRules = z.strictObject({ businessId: uuid, enabled: z.boolean(), inviterBonusUnits: z.number().int().min(1).max(1000),
  friendBonusUnits: z.number().int().min(1).max(1000), minimumSpendPaisa: money, monthlyInviterCap: z.number().int().min(1).max(1000),
  attributionDays: z.number().int().min(1).max(30), qualificationDays: z.number().int().min(1).max(90) });
export const referralResults = z.strictObject({ businessId: uuid, startDate: z.iso.date(), endDate: z.iso.date(),
  status: z.enum(['all', 'pending', 'qualified', 'expired', 'reversed']), branchId: uuid.nullable(),
  page: z.number().int().min(0).max(10000), pageSize: z.union([z.literal(25),z.literal(50),z.literal(100)]) });
