import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { getPublicConfig } from '@/lib/config';
import { verifiedUser } from '@/lib/db/server';
import { failure, PRIVATE_HEADERS, readSmallJson, validMutationOrigin } from '@/lib/security/http';

export async function POST(request:Request) {
  const correlationId=randomUUID(),config=getPublicConfig();
  if(!config)return failure('temporary_failure','Sign-out is unavailable.',correlationId);
  if(!validMutationOrigin(request,config.appUrl))return failure('forbidden','Request origin is not allowed.',correlationId);
  try {z.strictObject({}).parse(await readSmallJson(request));}catch{return failure('invalid_input','The sign-out request is invalid.',correlationId);}
  const {user,client}=await verifiedUser();
  if(!user||!client)return failure('unauthenticated','Your session has ended. Sign in again if needed.',correlationId);
  const jar=await cookies();
  const installation=z.uuid().safeParse(jar.get('loyalty-installation')?.value.split('.')[0]);
  if(installation.success){
    const {error}=await client.rpc('revoke_push_installation',{p_installation_id:installation.data});
    if(error)return failure('temporary_failure','Sign-out could not finish revoking this device. Please retry.',correlationId);
  }
  const {error}=await client.auth.signOut({scope:'local'});
  if(error)return failure('temporary_failure','Sign-out could not be completed. Please retry.',correlationId);
  // Keep the anonymous possession cookie so future accounts cannot spoof the installation ID.
  return Response.json({data:{signedOut:true},correlationId},{headers:PRIVATE_HEADERS});
}
