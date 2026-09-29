import { z } from 'zod';
export const kinds = ['overview','customers','rewards','referrals','promotions','campaigns','staff'] as const;
export type ReportKind = typeof kinds[number];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v);
export const filters = z.strictObject({
 reportKind: z.enum([...kinds,'contacts']).default('overview'),preset:z.enum(['today','last7','last30','custom']).default('last30'),
 startDate:date.optional(),endDate:date.optional(),branchIds:z.array(z.uuid()).max(100).default([]),
 programmeVersionId:z.uuid().optional(),rewardVersionId:z.uuid().optional(),promotionId:z.uuid().optional(),campaignId:z.uuid().optional(),
 sort:z.enum(['default','reverse']).default('default'),cursor:z.string().regex(/^(0|[1-9][0-9]{0,5})$/u).default('0').refine(v=>Number(v)<=100000),pageSize:z.union([z.literal(25),z.literal(50),z.literal(100)]).default(25),
}).superRefine((v,ctx)=>{
 if(new Set(v.branchIds).size!==v.branchIds.length)ctx.addIssue({code:'custom',path:['branchIds'],message:'Select each branch once.'});
 if(v.preset==='custom'){
  if(!v.startDate||!v.endDate||Date.parse(v.endDate)<Date.parse(v.startDate)||Date.parse(v.endDate)-Date.parse(v.startDate)>89*86400000)ctx.addIssue({code:'custom',path:['endDate'],message:'Choose 1–90 calendar days.'});
 } else if(v.startDate||v.endDate)ctx.addIssue({code:'custom',path:['startDate'],message:'Dates apply only to Custom.'});
 const allowed:Record<string,readonly string[]>={programmeVersionId:['overview','customers','promotions'],rewardVersionId:['rewards'],promotionId:['promotions'],campaignId:['campaigns']};
 for(const key of Object.keys(allowed) as (keyof typeof v)[])if(v[key]&& !allowed[key]!.includes(v.reportKind))ctx.addIssue({code:'custom',path:[key],message:'This filter does not apply to this tab.'});
});
export type Filters = z.infer<typeof filters>;
export const readInput=z.strictObject({businessId:z.uuid(),filters});
export const exportInput=z.strictObject({businessId:z.uuid(),filters,columns:z.array(z.string().min(1).max(40)).min(1).max(20),idempotencyKey:z.uuid()});
export const exportStatusInput=z.strictObject({businessId:z.uuid(),exportRequestId:z.uuid()});
const option=z.object({id:z.uuid(),name:z.string()});
export const configuration=z.object({businessName:z.string(),timezone:z.string(),role:z.enum(['owner','manager']),canExport:z.boolean(),canExportContacts:z.boolean(),branches:z.array(option),programmes:z.array(option),rewards:z.array(option),promotions:z.array(option),campaigns:z.array(option)});
export type Config=z.infer<typeof configuration>;
export const report=z.object({reportKind:z.enum([...kinds,'contacts']),metrics:z.record(z.string(),z.union([z.string(),z.number(),z.null()])),
 rows:z.array(z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()]))),series:z.array(z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()]))).max(90).optional(),totalRows:z.number().int().nonnegative(),nextCursor:z.string().nullable(),
 appliedFilters:z.object({startDate:date,endDate:date,timezone:z.string(),branchIds:z.array(z.uuid()),allBranches:z.boolean()}).passthrough(),dataAsOf:z.string()});
export type Report=z.infer<typeof report>;
export const columns:Record<ReportKind|'contacts',string[]>={
 overview:['date','recordedSalesPaisa','eligibleSpendPaisa','purchases','reversedPurchases'],customers:['memberId','name','joinedDate','qualifyingPurchases','recordedSalesPaisa','returning'],
 rewards:['sourceId','activityKind','reward','occurredAt','status','units','estimatedCostPaisa'],referrals:['claimId','enrolledAt','status','inviterSuppression','inviterIssuedUnits','friendIssuedUnits','qualifiedAt','reversedAt'],
 promotions:['promotionVersionId','slot','version','purchases','reversals','eligibleSpendPaisa','bonusUnits'],campaigns:['campaignId','campaign','status','uniqueAudience','suppressedMembers','deviceAttempts','providerAcceptedDeviceSends','failedDeviceAttempts','unknownDeviceAttempts','observedClicks','uniqueOfferClaims','fulfilledClaims','associatedPurchases','associatedSalesPaisa'],
 staff:['staffId','staff','purchases','awardedUnits','redemptions','purchaseReversals','redemptionReversals','offerFulfillments','adjustments','adjustmentUnits'],contacts:['memberId','name','phone','sharedEmail'],
};
export function defaultColumns(kind:ReportKind|'contacts'){return columns[kind].filter(v=>!['name','memberId','staffId','staff'].includes(v));}
export function label(key:string){return key.replace(/Paisa$/u,' (Rs)').replace(/([a-z])([A-Z])/gu,'$1 $2').replace(/^./u,c=>c.toUpperCase());}
