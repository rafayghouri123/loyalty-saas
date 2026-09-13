import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { getPublicConfig } from '@/lib/config';
import { verifiedUser } from '@/lib/db/server';
import { failure, PRIVATE_HEADERS, readSmallJson, validMutationOrigin } from '@/lib/security/http';

export async function POST(request:Request) {
  const correlationId=randomUUID(),config=getPublicConfig();
  if(!config)return failure('temporary_failure','Device settings are unavailable.',correlationId);
  if(!validMutationOrigin(request,config.appUrl))return failure('forbidden','Request origin is not allowed.',correlationId);
  const {user,client}=await verifiedUser();
  if(!user||!client)return failure('unauthenticated','Sign in to revoke this device.',correlationId);
  try {z.strictObject({}).parse(await readSmallJson(request));}catch{return failure('invalid_input','The device request is invalid.',correlationId);}
  const installation=z.uuid().safeParse((await cookies()).get('loyalty-installation')?.value.split('.')[0]);
  if(installation.success){
    const {error}=await client.rpc('revoke_push_installation',{p_installation_id:installation.data});
    if(error)return failure('temporary_failure','Device revocation could not be completed. Please retry.',correlationId);
  }
  return Response.json({data:{status:'revoked'},correlationId},{headers:PRIVATE_HEADERS});
}
