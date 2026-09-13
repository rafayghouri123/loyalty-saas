import { NextResponse } from 'next/server';
import { createUserClient } from '@/lib/db/server';
import { getPublicConfig } from '@/lib/config';
import { PRIVATE_HEADERS, safeReturnPath } from '@/lib/security/http';
export async function GET(request: Request) {
  const config=getPublicConfig();
  if(!config) return Response.json({error:{code:'temporary_failure',message:'Authentication is not configured.'}},{status:503,headers:PRIVATE_HEADERS});
  const input=new URL(request.url); const code=input.searchParams.get('code');
  const client=await createUserClient();
  if(code&&client) {
    const {error}=await client.auth.exchangeCodeForSession(code);
    if(!error) {
      const {data}=await client.auth.getUser();
      if(data.user&&!data.user.is_anonymous&&data.user.email_confirmed_at) {
        const destination=safeReturnPath(input.searchParams.get('next'));
        const {data:profile,error:profileError}=await client.from('profiles').select('user_id').eq('auth_user_id',data.user.id).maybeSingle();
        if(profileError) return Response.json({error:{code:'temporary_failure',message:'Account setup could not be checked. Please retry.'}},{status:503,headers:PRIVATE_HEADERS});
        const response=NextResponse.redirect(new URL(profile?destination:`/auth/complete?next=${encodeURIComponent(destination)}`,config.appUrl));
        Object.entries(PRIVATE_HEADERS).forEach(([key,value])=>response.headers.set(key,value));
        return response;
      }
    }
  }
  return NextResponse.redirect(new URL('/auth/login?error=invalid_link',config.appUrl),{headers:PRIVATE_HEADERS});
}
