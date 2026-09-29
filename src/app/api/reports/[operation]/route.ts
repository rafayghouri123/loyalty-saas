import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {verifiedUser} from '@/lib/db/server';
import {getPublicConfig} from '@/lib/config';
import {failure,PRIVATE_HEADERS,rateLimited,readSmallJson,validMutationOrigin} from '@/lib/security/http';
import {exportInput,exportStatusInput,readInput,report} from '@/features/reports/contracts';
export async function POST(request:Request,{params}:{params:Promise<{operation:string}>}){
 const correlationId=randomUUID(),config=getPublicConfig();
 if(!config)return failure('temporary_failure','Authentication needs setup.',correlationId);
 if(!validMutationOrigin(request,config.appUrl))return failure('forbidden','Request origin is not allowed.',correlationId);
 const {client,user}=await verifiedUser();if(!client||!user)return failure('unauthenticated','Sign in with a verified account.',correlationId);
 try{
  const body=await readSmallJson(request),{operation}=await params;let name:string,args:Record<string,unknown>;
  if(operation==='read'){const v=readInput.parse(body);name='get_report';args={p_business:v.businessId,p_filters:v.filters};}
  else if(operation==='export'){const v=exportInput.parse(body);name='request_report_export';args={p_business:v.businessId,p_filters:v.filters,p_columns:v.columns,p_key:v.idempotencyKey,p_correlation:correlationId};}
  else if(operation==='export-status'){const v=exportStatusInput.parse(body);name='report_export_status';args={p_business:v.businessId,p_export:v.exportRequestId};}
  else return failure('invalid_input','Unknown report operation.',correlationId);
  const {data,error}=await client.rpc(name as never,args as never);
  if(error){
   if(error.code==='42501')return failure('forbidden','Your current permissions do not allow this report or export.',correlationId);
   if(error.code==='P0002')return failure('not_found','This export is unavailable or expired.',correlationId);
   if(error.code==='57014')return failure('temporary_failure','The report took too long. Retry or narrow the date range.',correlationId);
   if(['22023','22P02','22007','22008','23514'].includes(error.code))return failure('invalid_input','Choose permitted filters and at most 90 calendar days.',correlationId);
   if(['40001','23505'].includes(error.code))return failure('conflict','An export is already running or this request changed.',correlationId);
   return failure('temporary_failure','Reports could not be loaded. Retry or narrow the date range.',correlationId);
  }
  const result=data as {error?:{code:string;message?:string;retryAfterSeconds?:number}};
  if(result.error){if(result.error.code==='rate_limited')return rateLimited(result.error.retryAfterSeconds??60,correlationId);return failure('conflict',result.error.message??'One export is already running.',correlationId);}
  return Response.json({data:operation==='read'?report.parse(data):data,correlationId},{headers:PRIVATE_HEADERS});
 }catch(error){if(error instanceof z.ZodError||error instanceof SyntaxError||error instanceof Error&&error.message==='invalid_input')return failure('invalid_input','Check report fields and choose 1–90 calendar days.',correlationId);
  return failure('temporary_failure','The report could not be loaded. Retry.',correlationId);}
}
