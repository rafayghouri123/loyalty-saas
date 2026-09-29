import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {verifiedUser} from '@/lib/db/server';
import {failure,PRIVATE_HEADERS} from '@/lib/security/http';
import {openSecret,parseSecretKey} from '@/lib/security/crypto';
export async function GET(request:Request){
 const correlationId=randomUUID(),{client,user}=await verifiedUser();if(!client||!user)return failure('unauthenticated','Sign in to download your account export.',correlationId);
 try{
  const artifactId=z.uuid().parse(new URL(request.url).searchParams.get('artifactId'));
  const {data,error}=await client.rpc('account_export_access' as never,{p_artifact:artifactId,p_correlation:correlationId} as never);
  if(error)return failure(error.code==='42501'?'forbidden':'not_found','This account export is unavailable or expired.',correlationId);
  const a=z.object({artifactId:z.uuid(),exportRequestId:z.uuid(),ciphertext:z.string(),keyId:z.string(),bytes:z.string(),mimeType:z.literal('application/json'),part:z.number().int().min(1)}).parse(data);
  if(a.keyId!==process.env.ENCRYPTION_KEY_ID)throw new Error('key_unavailable');
  const url=new URL(openSecret(a.ciphertext,{id:a.keyId,bytes:parseSecretKey(process.env.ENCRYPTION_KEY_BASE64??'')},`account-export:${a.exportRequestId}:${a.part}`)),base=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if(url.origin!==base.origin||!url.pathname.startsWith('/storage/v1/object/sign/loyalty-exports/'))throw new Error('invalid_storage');
  const response=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(7000)});if(!response.ok||!response.body)throw new Error('storage_unavailable');
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>3145728){await reader.cancel();throw new Error('oversized_artifact');}parts.push(value);}}finally{reader.releaseLock();}
  if(BigInt(size)!==BigInt(a.bytes))throw new Error('invalid_artifact');
  const check=await client.rpc('account_export_access' as never,{p_artifact:artifactId,p_correlation:correlationId} as never);if(check.error)return failure('forbidden','Account access changed. Download blocked.',correlationId);
  return new Response(Buffer.concat(parts),{headers:{...PRIVATE_HEADERS,'Content-Type':'application/json','Content-Disposition':`attachment; filename="account-${a.part===1?'manifest':`part-${a.part}`}.json"`}});
 }catch(error){if(error instanceof z.ZodError)return failure('invalid_input','Invalid artifact reference.',correlationId);return failure('temporary_failure','Your private export could not be downloaded. Retry.',correlationId);}
}
