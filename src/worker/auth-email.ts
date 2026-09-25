import type pg from 'pg';
import { z } from 'zod';
const jobSchema=z.object({id:z.uuid(),email:z.email(),tokenHash:z.string().regex(/^[a-zA-Z0-9_-]{20,200}$/u),action:z.enum(['signup','magiclink']),redirectTo:z.url()});
export type AuthEmailSender={send(input:{id:string;email:string;url:string}):Promise<string>;supabaseUrl:string;appOrigin:string};
export async function sendAuthEmail(pool:Pick<pg.Pool,'query'>,outboxId:string,sender:AuthEmailSender) {
 const row=await pool.query('select public.worker_auth_email_job($1) as job',[outboxId]);if(!row.rows[0]?.job)return;
 const job=jobSchema.parse(row.rows[0].job),redirect=new URL(job.redirectTo);
 if(redirect.origin!==new URL(sender.appOrigin).origin||redirect.pathname!=='/auth/callback')throw new Error('auth_email_origin_mismatch');
 const verify=new URL('/auth/v1/verify',sender.supabaseUrl);
 verify.searchParams.set('token',job.tokenHash);verify.searchParams.set('type',job.action);verify.searchParams.set('redirect_to',job.redirectTo);
 const providerId=await sender.send({id:job.id,email:job.email,url:verify.toString()});
 await pool.query('select public.worker_finish_auth_email($1,$2)',[outboxId,providerId]);
}
export function resendAuthEmailSender(input:{key:string;from:string;supabaseUrl:string;appOrigin:string}):AuthEmailSender {
 return {...input,async send(message){
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${input.key}`,'Content-Type':'application/json','Idempotency-Key':`auth-email/${message.id}`},
   body:JSON.stringify({from:input.from,to:[message.email],subject:'Your cafe loyalty sign-in link',text:`Use this one-time link to sign in:\n\n${message.url}\n\nIf you did not request this, ignore this email. Signing in does not enable marketing.`}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('auth_email_provider_unavailable');
  return z.object({id:z.string().regex(/^[a-zA-Z0-9-]{1,100}$/u)}).parse(await response.json()).id;
 }};
}
