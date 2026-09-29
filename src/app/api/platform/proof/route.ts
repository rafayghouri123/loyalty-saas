import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {verifiedUser} from '@/lib/db/server';
import {failure,PRIVATE_HEADERS} from '@/lib/security/http';
export async function GET(request:Request){
 const correlation=randomUUID(),{client,user}=await verifiedUser();if(!client||!user)return failure('unauthenticated','Sign in to review proof.',correlation);
 try{
  const id=z.uuid().parse(new URL(request.url).searchParams.get('assetId'));
  const check=()=>client.rpc('payment_proof_access' as never,{p_asset:id,p_correlation:correlation} as never);
  const result=await check();if(result.error)return failure('forbidden','Current permissions do not allow this proof.',correlation);
  const a=z.object({path:z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/v1\.webp$/iu),bytes:z.string(),mimeType:z.literal('image/webp')}).parse(result.data);
  const base=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);const response=await fetch(new URL(`/storage/v1/object/loyalty-private/${a.path}`,base),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(7000),headers:{apikey:process.env.STORAGE_SERVICE_ROLE_KEY??'',Authorization:`Bearer ${process.env.STORAGE_SERVICE_ROLE_KEY??''}`}});
  if(!response.ok||!response.body)throw new Error('storage_unavailable');const reader=response.body.getReader(),parts:Uint8Array[]=[];let bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>3145728){await reader.cancel();throw new Error('oversized_proof');}parts.push(value);}}finally{reader.releaseLock();}
  if(BigInt(bytes)!==BigInt(a.bytes))throw new Error('invalid_proof');if((await check()).error)return failure('forbidden','Permission changed. Proof blocked.',correlation);
  return new Response(Buffer.concat(parts),{headers:{...PRIVATE_HEADERS,'Content-Type':'image/webp','Content-Disposition':'inline; filename="private-proof.webp"'}});
 }catch{return failure('temporary_failure','Proof could not be loaded. Retry.',correlation);}
}
