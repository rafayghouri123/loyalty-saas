import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {verifiedUser} from '@/lib/db/server';
import {failure,PRIVATE_HEADERS} from '@/lib/security/http';
import {openSecret,parseSecretKey} from '@/lib/security/crypto';
import {MAX_EXPORT_BYTES} from '@/features/reports/csv';
export async function GET(request:Request){
 const correlationId=randomUUID();const {client,user}=await verifiedUser();if(!client||!user)return failure('unauthenticated','Sign in to download this export.',correlationId);
 try{
  const params=new URL(request.url).searchParams;const businessId=z.uuid().parse(params.get('businessId')),id=z.uuid().parse(params.get('exportRequestId'));
  const {data,error}=await client.rpc('report_export_status',{p_business:businessId,p_export:id,p_download:true,p_correlation:correlationId});
  if(error)return failure(error.code==='42501'?'forbidden':'not_found','This export is unavailable, expired or no longer permitted.',correlationId);
  const v=z.object({artifactId:z.uuid(),ciphertext:z.string(),keyId:z.string(),bytes:z.string(),mimeType:z.literal('text/csv')}).parse(data);
  if(v.keyId!==process.env.ENCRYPTION_KEY_ID)throw new Error('key_unavailable');
  const url=new URL(openSecret(v.ciphertext,{id:v.keyId,bytes:parseSecretKey(process.env.ENCRYPTION_KEY_BASE64??'')},`export:${v.artifactId}`));
  const base=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if(url.origin!==base.origin||!url.pathname.startsWith('/storage/v1/object/sign/loyalty-exports/'))throw new Error('invalid_storage');
  const response=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(7000)});
  if(!response.ok||!response.body)throw new Error('storage_unavailable');
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_EXPORT_BYTES){await reader.cancel();throw new Error('oversized_artifact');}parts.push(value);}}finally{reader.releaseLock();}
  if(BigInt(size)!==BigInt(v.bytes))throw new Error('invalid_artifact');
  // Authorization is checked again after the bounded network fetch, before bytes leave the server.
  const recheck=await client.rpc('report_export_status',{p_business:businessId,p_export:id,p_download:true,p_correlation:correlationId});
  if(recheck.error)return failure('forbidden','Export permission changed. Download blocked.',correlationId);
  return new Response(Buffer.concat(parts),{headers:{...PRIVATE_HEADERS,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="loyalty-report-${id}.csv"`,'X-Content-Type-Options':'nosniff'}});
 }catch(error){if(error instanceof z.ZodError)return failure('invalid_input','Invalid export reference.',correlationId);return failure('temporary_failure','The private export could not be downloaded. Retry.',correlationId);}
}
