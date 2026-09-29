import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {verifiedUser} from '@/lib/db/server';
import {getPublicConfig} from '@/lib/config';
import {failure,PRIVATE_HEADERS,rateLimited,readSmallJson,validMutationOrigin} from '@/lib/security/http';
import * as contracts from '@/features/platform/contracts';
export async function POST(request:Request,{params}:{params:Promise<{operation:string}>}){
 const correlationId=randomUUID(),config=getPublicConfig();
 if(!config)return failure('temporary_failure','Authentication needs setup.',correlationId);
 if(!validMutationOrigin(request,config.appUrl))return failure('forbidden','Request origin is not allowed.',correlationId);
 const {client,user}=await verifiedUser();if(!client||!user)return failure('unauthenticated','Sign in with a verified account.',correlationId);
 try{
  const body=await readSmallJson(request),{operation}=await params;let name:string,args:Record<string,unknown>;
  switch(operation){
   case 'billing':{const v=contracts.billingRead.parse(body);name='billing_view';args={p_business:v.businessId,p_invoice:v.invoiceId};break;}
   case 'evidence':{const v=contracts.evidence.parse(body);name='submit_payment_evidence';args={p_business:v.businessId,p_invoice:v.invoiceId,p_input:v.input,p_key:v.idempotencyKey,p_correlation:correlationId};break;}
   case 'reconcile':{const v=contracts.reconciliation.parse(body);name='reconcile_payment';args={p_invoice:v.invoiceId,p_input:v.input,p_key:v.idempotencyKey,p_correlation:correlationId};break;}
   case 'correct':{const v=contracts.correction.parse(body);name='correct_payment';args={p_event:v.paymentEventId,p_reason:v.reason,p_key:v.idempotencyKey,p_correlation:correlationId};break;}
   case 'cancel-renewal':{const v=contracts.cancellation.parse(body);name='cancel_subscription_renewal';args={p_business:v.businessId,p_correlation:correlationId};break;}
   case 'save-plan':{const v=contracts.plan.parse(body);name='save_plan_version';args={p_input:v.input,p_publish:v.publish,p_correlation:correlationId};break;}
   case 'admin-read':{const v=contracts.adminRead.parse(body);name='admin_read';args={p_kind:v.kind,p_filters:v.filters};break;}
   case 'tenant-action':{const v=contracts.tenantAction.parse(body);name='admin_tenant_action';args={p_business:v.businessId,p_action:v.action,p_reason:v.reason,p_correlation:correlationId};break;}
   case 'change-plan':{const v=contracts.planChange.parse(body);name='admin_change_plan';args={p_business:v.businessId,p_plan:v.planVersionId,p_invoice:v.invoiceId,p_reason:v.reason,p_correlation:correlationId};break;}
   case 'support-start':{const v=contracts.supportStart.parse(body);name='start_support_access';args={p_business:v.businessId,p_reason:v.reason,p_scope:v.scope,p_minutes:v.minutes,p_correlation:correlationId};break;}
   case 'support-read':case 'support-end':{const v=contracts.supportGrant.parse(body);name=operation==='support-read'?'support_read':'end_support_access';args={p_grant:v.grantId,p_correlation:correlationId};break;}
   case 'job-action':{const v=contracts.jobAction.parse(body);name='admin_job_action';args={p_event:v.eventId,p_action:v.action,p_reason:v.reason,p_correlation:correlationId};break;}
   case 'setting':{const v=contracts.setting.parse(body);name='update_platform_setting';args={p_key:v.key,p_value:v.value,p_reason:v.reason,p_correlation:correlationId};break;}
   case 'privacy-request':{const v=contracts.privacyRequest.parse(body);name='request_privacy';args={p_kind:v.kind,p_membership:v.membershipId,p_key:v.idempotencyKey,p_correlation:correlationId};break;}
   case 'privacy-status':{contracts.empty.parse(body);name='my_privacy_requests';args={};break;}
   case 'privacy-queue':{const v=contracts.privacyQueue.parse(body);name='admin_privacy_queue';args={p_page:v.page};break;}
   case 'privacy-retry':{const v=contracts.privacyRetry.parse(body);name='admin_retry_privacy';args={p_request:v.requestId,p_reason:v.reason,p_correlation:correlationId};break;}
   default:return failure('invalid_input','Unknown operation.',correlationId);
  }
  const {data,error}=await client.rpc(name as never,args as never);
  if(error){
   if(error.code==='42501')return failure('forbidden','Current permissions, MFA or recent sign-in do not allow this action.',correlationId);
   if(error.code==='P0002')return failure('not_found','This record is unavailable or expired.',correlationId);
   if(['22023','22P02','23514','23502'].includes(error.code))return failure('invalid_input','Check the fields. Payment confirmation requires the exact amount and a configured provider.',correlationId);
   if(['40001','23505'].includes(error.code))return failure('conflict','This request conflicts with an existing payment or operation. Refresh before changing it.',correlationId);
   return failure('temporary_failure','The operation could not complete. Retry.',correlationId);
  }
  const result=data as {error?:{code:string;retryAfterSeconds?:number}};
  if(result?.error){if(result.error.code==='rate_limited')return rateLimited(result.error.retryAfterSeconds??60,correlationId);return failure('conflict','This request could not complete.',correlationId);}
  return Response.json({data,correlationId},{headers:PRIVATE_HEADERS});
 }catch(error){if(error instanceof z.ZodError||error instanceof SyntaxError||error instanceof Error&&error.message==='invalid_input')return failure('invalid_input','Check the required fields and their limits.',correlationId);return failure('temporary_failure','The operation could not complete. Retry.',correlationId);}
}
