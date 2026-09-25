import { randomUUID } from 'node:crypto';
import { hashToken, randomToken } from '@/lib/security/crypto';
import { z } from 'zod';
import { getPublicConfig } from '@/lib/config';
import { verifiedUser } from '@/lib/db/server';
import { failure, PRIVATE_HEADERS, readSmallJson, validMutationOrigin } from '@/lib/security/http';
import * as input from '@/features/communications/contracts';

export async function POST(request:Request,{params}:{params:Promise<{operation:string}>}) {
 const correlationId=randomUUID();
 const config=getPublicConfig();
 if(!config)return failure('temporary_failure','Authentication needs setup.',correlationId);
 if(!validMutationOrigin(request,config.appUrl))return failure('forbidden','Request origin is not allowed.',correlationId);
 const {client,user}=await verifiedUser();
 if(!client||!user)return failure('unauthenticated','Sign in with a verified account.',correlationId);
 let body:unknown;
 try {body=await readSmallJson(request);} catch {return failure('invalid_input','Check the required fields and input size.',correlationId);}
 try {
  let name:string;let args:Record<string,unknown>;
  let rawIntent:string|null=null;
  const {operation}=await params;
  switch(operation){
   case 'offer-configuration': {const v=input.businessOnly.parse(body);name='offer_configuration';args={p_business:v.businessId};break;}
   case 'save-offer': {const {businessId,...v}=input.offerDraft.parse(body);name='save_offer';args={p_business:businessId,p_input:v,p_correlation:correlationId};break;}
   case 'set-offer-status': {const v=input.offerStatus.parse(body);name='set_offer_status';args={p_business:v.businessId,p_offer:v.offerId,
    p_status:v.status,p_row_version:v.rowVersion,p_correlation:correlationId};break;}
   case 'duplicate-offer': {const v=input.offerDuplicate.parse(body);name='duplicate_offer';
    args={p_business:v.businessId,p_offer:v.offerId,p_correlation:correlationId};break;}
   case 'my-offers': {const v=input.offerList.parse(body);name='my_offers';args={p_business:v.businessId};break;}
   case 'offer-detail': {const v=input.idOnly.parse(body);name='offer_detail';args={p_offer:v.id};break;}
   case 'claim-offer': {const v=input.idOnly.parse(body);name='claim_offer';args={p_offer:v.id,p_correlation:correlationId};break;}
   case 'create-offer-intent': {const v=input.offerClaimId.parse(body);rawIntent=`LOYALTY:OFFER:v1:${randomToken()}`;
    name='create_offer_intent';args={p_claim:v.claimId,p_token_hash:hashToken(rawIntent),p_correlation:correlationId};break;}
   case 'cancel-offer-intent': {const v=input.offerIntentId.parse(body);name='cancel_offer_intent';args={p_intent:v.intentId};break;}
   case 'campaign-configuration': {const v=input.businessOnly.parse(body);name='campaign_configuration';args={p_business:v.businessId};break;}
   case 'save-campaign': {const {businessId,...v}=input.campaignDraft.parse(body);name='save_campaign';args={p_business:businessId,p_input:v,p_correlation:correlationId};break;}
   case 'schedule-campaign': {const v=input.campaignSchedule.parse(body);name='schedule_campaign';args={p_business:v.businessId,
    p_campaign:v.campaignId,p_row_version:v.rowVersion,p_scheduled_at:v.scheduledAt,p_key:v.idempotencyKey,p_correlation:correlationId};break;}
   case 'set-campaign-status': {const v=input.campaignStatus.parse(body);name='set_campaign_status';args={p_business:v.businessId,
    p_campaign:v.campaignId,p_action:v.action,p_row_version:v.rowVersion,p_correlation:correlationId};break;}
   case 'duplicate-campaign': {const v=input.campaignDuplicate.parse(body);name='duplicate_campaign';args={p_business:v.businessId,
    p_campaign:v.campaignId,p_correlation:correlationId};break;}
   case 'preview-campaign-audience': {const v=input.campaignPreview.parse(body);name='preview_campaign_audience';
    args={p_business:v.businessId,p_campaign:v.campaignId};break;}
   case 'campaign-test-devices': {const v=input.businessOnly.parse(body);name='campaign_test_devices';args={p_business:v.businessId};break;}
   case 'set-campaign-test-device': {const v=input.testDevice.parse(body);name='set_campaign_test_device';
    args={p_business:v.businessId,p_installation:v.installationId,p_generation:v.bindingGeneration,p_enabled:v.enabled};break;}
   case 'request-campaign-test': {const v=input.campaignTest.parse(body);name='request_campaign_test';
    args={p_business:v.businessId,p_campaign:v.campaignId,p_device:v.deviceId};break;}
   case 'observe-campaign-click': {const v=input.idOnly.parse(body);name='observe_notification_click';args={p_id:v.id};break;}
   case 'automation-configuration': {const v=input.businessOnly.parse(body);name='automation_configuration';args={p_business:v.businessId};break;}
   case 'save-automation-rule': {const {businessId,...v}=input.automationRule.parse(body);name='save_automation_rule';
    args={p_business:businessId,p_input:v,p_correlation:correlationId};break;}
   default:return failure('invalid_input','Unknown operation.',correlationId);
  }
  const {data,error}=await client.rpc(name as never,args as never);
  if(error){
   if(error.code==='42501')return failure(error.message==='unauthenticated'?'unauthenticated':'forbidden','Your account cannot perform this action.',correlationId);
   if(error.code==='P0002')return failure('not_found','This record is unavailable for your account.',correlationId);
   if(error.code==='P0001')return failure('expired','This offer has expired.',correlationId);
   if(['23505','40001'].includes(error.code))return failure('conflict','This record changed. Refresh and try again.',correlationId);
   if(['22023','23514','23502','23503','22P02','22003'].includes(error.code))return failure('invalid_input','Check the values and current rules.',correlationId);
   console.error('communications_rpc_error',operation,error.code,correlationId);
   return failure('temporary_failure','The operation could not be completed. Please retry.',correlationId);
  }
  return Response.json({data:rawIntent?{...(data as object),qrValue:rawIntent}:data,correlationId},{headers:PRIVATE_HEADERS});
 } catch(error){
  if(error instanceof z.ZodError||error instanceof SyntaxError)return failure('invalid_input','Check the required fields and input limits.',correlationId);
  return failure('temporary_failure','The operation could not be completed. Please retry.',correlationId);
 }
}
