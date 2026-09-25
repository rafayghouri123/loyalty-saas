import { z } from 'zod';

export const textCodepoints=(min:number,max:number)=>z.string().transform(value=>value.trim())
  .refine(value=>Array.from(value).length>=min&&Array.from(value).length<=max,
    `Use ${min}–${max} characters.`);
export const id=z.uuid();
export const idOnly=z.strictObject({id});
export const businessOnly=z.strictObject({businessId:id});
export const offerList=z.strictObject({businessId:id.nullable().default(null)});
export const offerDraft=z.strictObject({businessId:id,offerId:id.nullable().default(null),rowVersion:z.number().int().positive().nullable().default(null),
  kind:z.enum(['informational','discount','treat']),title:textCodepoints(2,80),description:textCodepoints(1,1000),
  terms:textCodepoints(0,2000),startsAt:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true}),
  audience:z.enum(['all_members','recipient_list']),branchIds:z.array(id).min(1),recipientIds:z.array(id).max(1000),
  isAutomationTemplate:z.boolean(),imageAssetId:id.nullable().default(null),discountPercent:z.number().int().min(1).max(100).nullable(),
  minimumSpendPaisa:z.string().regex(/^(0|[1-9][0-9]{0,8})$/),
  maxDiscountPaisa:z.string().regex(/^(0|[1-9][0-9]{0,8})$/).nullable()})
  .superRefine((value,context)=>{
    if(Date.parse(value.startsAt)>=Date.parse(value.expiresAt))context.addIssue({code:'custom',message:'The end must be after the start.',path:['expiresAt']});
    if(value.kind==='discount'&&!value.discountPercent)context.addIssue({code:'custom',message:'Set a discount percent.',path:['discountPercent']});
    if(value.kind!=='discount'&&(value.discountPercent!==null||value.maxDiscountPaisa!==null))context.addIssue({code:'custom',message:'Only discounts use these fields.',path:['kind']});
    if(value.kind!=='informational'&&Array.from(value.terms).length<10)context.addIssue({code:'custom',message:'Enter claim terms.',path:['terms']});
    if(value.audience==='all_members'&&value.recipientIds.length)context.addIssue({code:'custom',message:'Use recipient list for selected members.',path:['audience']});
  });
export const offerStatus=z.strictObject({businessId:id,offerId:id,rowVersion:z.number().int().positive(),status:z.enum(['published','paused'])});
export const offerDuplicate=z.strictObject({businessId:id,offerId:id});
export const offerClaimId=z.strictObject({claimId:id});
export const offerIntentId=z.strictObject({intentId:id});
export const campaignDraft=z.strictObject({businessId:id,campaignId:id.nullable().default(null),rowVersion:z.number().int().positive().nullable().default(null),
  name:textCodepoints(2,100),title:textCodepoints(3,80),body:textCodepoints(10,500),destination:z.enum(['card','offer']),
  imageAssetId:id.nullable().default(null),offerId:id.nullable(),audience:z.enum(['all_opted_in','inactive','reward_ready','near_reward']),
  inactiveDays:z.number().int().min(7).max(365).nullable(),nearRewardUnits:z.number().int().min(1).max(1000).nullable(),
  targetRewardVersionId:id.nullable(),branchIds:z.array(id).min(1),expiresAt:z.iso.datetime({offset:true})});
export const campaignSchedule=z.strictObject({businessId:id,campaignId:id,rowVersion:z.number().int().positive(),
  scheduledAt:z.iso.datetime({offset:true}),idempotencyKey:id});
export const campaignStatus=z.strictObject({businessId:id,campaignId:id,rowVersion:z.number().int().positive(),action:z.enum(['pause','resume','cancel'])});
export const campaignDuplicate=z.strictObject({businessId:id,campaignId:id});
export const campaignPreview=z.strictObject({businessId:id,campaignId:id});
export const testDevice=z.strictObject({businessId:id,installationId:id,bindingGeneration:id,enabled:z.boolean()});
export const campaignTest=z.strictObject({businessId:id,campaignId:id,deviceId:id});
export const automationRule=z.strictObject({businessId:id,kind:z.enum(['reward_available','inactivity','birthday']),
 enabled:z.boolean(),titleTemplate:textCodepoints(3,80),bodyTemplate:textCodepoints(10,500),
 inactiveDays:z.number().int().min(7).max(365).nullable(),rewardVersionId:id.nullable(),offerId:id.nullable(),
 birthdayValidityDays:z.number().int().min(1).max(30).nullable(),version:z.number().int().positive().nullable()});
