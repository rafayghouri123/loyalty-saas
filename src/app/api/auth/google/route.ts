import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getPublicConfig } from '@/lib/config';
import { createUserClient } from '@/lib/db/server';
import { failure, PRIVATE_HEADERS, readSmallJson, safeReturnPath, validMutationOrigin } from '@/lib/security/http';
export async function POST(request: Request) {
  const correlationId=randomUUID(); const config=getPublicConfig();
  if (!config) return failure('temporary_failure','Sign-in is not configured yet.',correlationId);
  if (!validMutationOrigin(request,config.appUrl)) return failure('forbidden','Request origin is not allowed.',correlationId);
  let input;
  try { input=z.strictObject({intent:z.enum(['customer','business']),next:z.string().max(2048).optional()}).parse(await readSmallJson(request)); }
  catch { return failure('invalid_input','Choose a valid sign-in destination.',correlationId); }
  const client=await createUserClient();
  const next=safeReturnPath(input.next,input.intent==='business'?'/workspace':'/app');
  const {data,error}=await client!.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${new URL(config.appUrl).origin}/auth/callback?next=${encodeURIComponent(next)}`,skipBrowserRedirect:true}});
  if(error||!data.url) return failure('temporary_failure','Google sign-in is unavailable. Please try again.',correlationId);
  return Response.json({data:{url:data.url},correlationId},{headers:PRIVATE_HEADERS});
}
