// Sends only to Resend's official sandbox recipient. No human inbox is contacted.
import assert from 'node:assert/strict';
import {createServerClient} from '@supabase/ssr';
import {createClient} from '@supabase/supabase-js';
import pg from 'pg';
import {databaseTls} from '../src/lib/db/tls.ts';
import {createGateway} from '../src/lib/db/gateway.ts';
import {parseSecretKey,subjectHmac} from '../src/lib/security/crypto.ts';
import {startWorker} from '../src/worker/runtime.ts';
import {resendAuthEmailSender} from '../src/worker/auth-email.ts';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 assert.equal(process.env.APP_ENV,'staging');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,origin=process.env.PHASE2_TEST_WEB_URL,email='delivered@resend.dev';
 const ref=new URL(url).hostname.split('.')[0],endpoint=`https://api.supabase.com/v1/projects/${ref}/config/auth`;
 const headers={Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'};
 const manage=async(method,body)=>{const r=await fetch(endpoint,{method,headers,body:body?JSON.stringify(body):undefined});assert(r.ok,`Management HTTP ${r.status}`);return r.json();};
 const config=await manage('GET');assert.equal(config.hook_send_email_enabled,true);
 const original=config.uri_allow_list,temporary=`${origin}/auth/callback**`;
 const sql=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL,ssl:databaseTls(true,process.env.DATABASE_CA_CERT_PATH)});
 const gateway=createGateway({connectionString:process.env.WEB_GATEWAY_DATABASE_URL,ssl:true,caPath:process.env.DATABASE_CA_CERT_PATH});
 const admin=createClient(url,process.env.STORAGE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const cookies=new Map(),client=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}});
 let worker,userId,stage='setup';
 try{
  await sql.connect();assert.equal((await sql.query('select count(*) from auth.users where email=$1',[email])).rows[0].count,'0','Sandbox account already exists; preserve it.');
  await manage('PATCH',{uri_allow_list:[original,temporary].filter(Boolean).join(',')});
  stage='direct OTP denial';
  const bypass=await client.auth.signInWithOtp({email,options:{emailRedirectTo:`${origin}/auth/callback?next=%2Fworkspace`}});
  assert(bypass.error,'Direct OTP unexpectedly succeeded');assert.equal(bypass.error.status,403);
  console.log('PASS live Supabase direct OTP without gateway grant rejected');
  stage='granted OTP';
  const key=parseSecretKey(process.env.RATE_LIMIT_HMAC_KEY_BASE64),callback=`${origin}/auth/callback?next=%2Fworkspace`;
  const args=[email,subjectHmac(key,'login-email',email),subjectHmac(key,'login-ip','127.0.0.1'),callback];
  const grant=await gateway.authorizeAuthEmail(...args);assert(grant.allowed&&grant.token,'Shared limiter denied sandbox request');
  const otp=await client.auth.signInWithOtp({email,options:{emailRedirectTo:`${callback}&email_request=${grant.token}`}});
  assert(!otp.error,`Granted OTP failed: ${otp.error?.status}/${otp.error?.code}`);
  userId=(await sql.query('select id from auth.users where email=$1',[email])).rows[0]?.id;assert(userId);
  assert.equal((await gateway.authorizeAuthEmail(...args)).allowed,false);
  console.log('PASS live SQL hook queues granted OTP; shared cooldown enforced');
  stage='Resend queue delivery';
  worker=await startWorker({connectionString:process.env.WORKER_DATABASE_URL,ssl:true,caPath:process.env.DATABASE_CA_CERT_PATH,
   authEmailSender:resendAuthEmailSender({key:process.env.RESEND_API_KEY,from:'Cafe Loyalty <onboarding@resend.dev>',supabaseUrl:url,appOrigin:origin})});
  let job;for(let i=0;i<45;i++){job=(await sql.query('select state,provider_id,payload_ciphertext from app_private.auth_email_grants where id=$1',[grant.grantId])).rows[0];if(job.state==='provider_accepted')break;await pause(2000);}
  assert.equal(job.state,'provider_accepted');assert.equal(job.payload_ciphertext,null);
  let message;for(let i=0;i<15;i++){const r=await fetch(`https://api.resend.com/emails/${job.provider_id}`,{headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`}});assert(r.ok,`Resend receipt HTTP ${r.status}`);message=await r.json();if(message.last_event==='delivered')break;await pause(2000);}
  assert.equal(message.last_event,'delivered');assert.deepEqual(message.to,[email]);
  console.log('PASS real pg-boss worker and Resend sandbox delivery; encrypted payload erased');
  stage='email callback';
  const link=message.text.match(/https:\/\/[^\s]+/u)?.[0];assert(link);assert.equal(new URL(link).origin,new URL(url).origin);
  const verify=await fetch(link,{redirect:'manual'}),location=verify.headers.get('location');assert(location);assert.equal(new URL(location).origin,origin);assert(new URL(location).searchParams.has('code'));
  const response=await fetch(location,{redirect:'manual',headers:{Cookie:[...cookies].map(([name,value])=>`${name}=${value}`).join('; ')}});
  assert.equal(response.status,307);assert.match(response.headers.get('location'),/\/(auth\/complete\?next=%2Fworkspace|workspace)$/u);assert.match(response.headers.get('cache-control'),/no-store/u);
  assert(response.headers.getSetCookie().some(value=>value.includes('auth-token')&&!value.includes('Max-Age=0')));
  const replay=await fetch(link,{redirect:'manual'});assert(new URL(replay.headers.get('location')).hash.includes('error'));
  console.log('PASS delivered magic link, actual Next PKCE callback, safe return context and replay denial');
 }catch(error){console.error(`Email acceptance failed at ${stage}: ${error instanceof assert.AssertionError?error.message:'provider operation failed'}`);process.exitCode=1;}
 finally{
  if(worker)await worker.stop();await gateway.close();
  if(userId){const deleted=await admin.auth.admin.deleteUser(userId);assert(!deleted.error,'Synthetic account cleanup failed');}
  await sql.end();await manage('PATCH',{uri_allow_list:original});
 }
}
await main();
