// Real hosted staging queue evidence: this script never starts a local worker.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import pg from 'pg';
import {databaseTls} from '../src/lib/db/tls.ts';

const origin='https://loyalty-saas-three.vercel.app';
const secret=readFileSync('.local/vercel-worker-secret','utf8').trim();
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.STORAGE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const url=new URL(process.env.MIGRATION_DATABASE_URL);for(const key of [...url.searchParams.keys()])if(key.toLowerCase().startsWith('ssl'))url.searchParams.delete(key);
const sql=new pg.Client({connectionString:url.toString(),ssl:databaseTls(true,process.env.DATABASE_CA_CERT_PATH),statement_timeout:10000});
let userId;let stage='connect';const cookies=new Map();let exportId;
const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>{for(const item of values)cookies.set(item.name,item.value);}}});
const rpc=async(name,args)=>{const result=await client.rpc(name,args);assert(!result.error,`${name} denied: ${result.error?.code??''}`);return result.data;};
async function startController(path='/api/worker/control'){
 for(let attempt=0;attempt<20;attempt++){
  const result=await fetch(`${origin}${path}`,{method:'POST',headers:{authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(60000)});
  if(result.status!==409){assert.equal(result.status,200);return result.json();}
  await new Promise(resolve=>setTimeout(resolve,3000));
 }
 throw new Error('worker_control_busy');
}
async function wait(query,values,check,timeout=240000){const end=Date.now()+timeout;while(Date.now()<end){const data=(await sql.query(query,values)).rows; if(check(data))return data;await new Promise(resolve=>setTimeout(resolve,3000));}throw new Error('hosted_job_timeout');}
try{
 await sql.connect();
 stage='protected control endpoint';
 const denied=await fetch(`${origin}/api/worker/control`,{method:'POST'});assert.equal(denied.status,401);assert.match(denied.headers.get('cache-control')??'',/no-store/u);
 const started=await startController('/api/worker/control?waves=3');assert.equal(started.state,'started');
 console.log(JSON.stringify({check:'hosted_workflow_started',runId:started.runId}));
 stage='synthetic verified Auth/profile';
 const email=`vercel-worker-${randomUUID()}@example.invalid`;
 const created=await admin.auth.admin.createUser({email,email_confirm:true});assert(!created.error);userId=created.data.user.id;
 const link=await admin.auth.admin.generateLink({type:'magiclink',email});assert(!link.error);
 const verified=await client.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});assert(!verified.error);
 await rpc('complete_profile',{p_display_name:'Vercel worker acceptance',p_correlation_id:randomUUID()});
 stage='hosted outbox/pg-boss consumption';
 const rows=await wait("select o.id,o.state,j.state job_state from public.outbox_events o left join pgboss.job j on j.id=o.id where o.event_type='profile.created' and o.event_key=$1",[userId],rows=>rows[0]?.state==='dispatched'&&rows[0]?.job_state==='completed');
 assert.equal((await sql.query("select count(*) from public.job_effect_receipts where handler_name='profile.created' and event_key=$1",[userId])).rows[0].count,'1');
 console.log('PASS hosted transactional outbox, pg-boss completion and durable receipt');
 stage='hosted private account export';
 const requested=await rpc('request_privacy',{p_kind:'export',p_membership:null,p_key:randomUUID(),p_correlation:randomUUID()});
 const requests=await wait('select status,export_request_id from public.privacy_requests where id=$1',[requested.requestId??requested.id],rows=>rows[0]?.status==='completed');
 exportId=requests[0].export_request_id;
 const state=await rpc('my_privacy_requests',{});const exported=state.requests.find(item=>item.exportRequestId===exportId);assert(exported?.parts.length>=2);
 const cookie=[...cookies].map(([name,value])=>`${name}=${value}`).join('; ');
 const download=await fetch(`${origin}/api/privacy/download?artifactId=${exported.parts.find(part=>part.part===1).id}`,{headers:{cookie}});assert.equal(download.status,200);assert.match(download.headers.get('cache-control')??'',/private, no-store/u);
 const manifest=await download.json();assert.equal(manifest.counts.profile,1);
 console.log('PASS hosted privacy consumer, real private Storage manifest and requester download');
 stage='independent heartbeat continuity';
 const before=(await sql.query("select checked_at from public.operational_checks where name='worker_heartbeat'")).rows[0].checked_at;
 await new Promise(resolve=>setTimeout(resolve,35000));
 const after=(await sql.query("select checked_at from public.operational_checks where name='worker_heartbeat'")).rows[0].checked_at;assert(after>before);
 const control=(await sql.query('select public.worker_vercel_status() status')).rows[0].status;assert(control.enabled&&control.fresh);
 console.log(JSON.stringify({check:'hosted_heartbeat_continues',runId:control.runId,deploymentId:control.deploymentId,epoch:control.epoch}));
 stage='durable run handoff';
 const next=await wait('select public.worker_vercel_status() status',[],rows=>rows[0]?.status.epoch>0&&rows[0]?.status.runId!==started.runId&&rows[0]?.status.fresh);
 console.log(JSON.stringify({check:'hosted_durable_run_handoff',runId:next[0].status.runId,epoch:next[0].status.epoch}));
 const steady=await startController();
 console.log(JSON.stringify({check:'steady_worker_started',runId:steady.runId}));
 assert(rows[0].id);
}catch{console.error(`Hosted worker acceptance failed at ${stage}`);process.exitCode=1;}
finally{
 if(userId){
  if(exportId){const paths=(await sql.query('select path from app_private.export_uploads where export_request_id=$1',[exportId])).rows.map(row=>row.path);if(paths.length)await admin.storage.from('loyalty-exports').remove(paths);}
  // Synthetic identity only. Retain audit/receipt evidence, revoke its sessions.
  await admin.auth.admin.deleteUser(userId);
  await sql.query("update public.profiles set display_name='Deleted user',birthday_month=null,birthday_day=null,auth_user_id=null,anonymized_at=clock_timestamp(),updated_at=clock_timestamp(),row_version=row_version+1 where user_id=$1",[userId]);
 }
 await sql.end();
}
