// Real staging Auth/RPC/HTTP/browser proof. wa.me navigation is intercepted;
// no outbound WhatsApp message, email, push or payment is generated.
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {chromium} from '@playwright/test';
import pg from 'pg';
import {databaseTls} from '../src/lib/db/tls.ts';

function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=+$/u,''))bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');
 const bytes=Buffer.from(bits.match(/.{8}/gu).map(v=>parseInt(v,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const digest=createHmac('sha1',bytes).update(counter).digest(),offset=digest[19]&15;return ((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');}
async function main(){
 if(process.env.APP_ENV!=='staging')throw new Error('APP_ENV must be staging.');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,origin=process.env.PHASE4_TEST_WEB_URL;
 const admin=createClient(url,process.env.STORAGE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const dbUrl=new URL(process.env.MIGRATION_DATABASE_URL);for(const k of [...dbUrl.searchParams.keys()])if(k.toLowerCase().startsWith('ssl'))dbUrl.searchParams.delete(k);
 const sql=new pg.Client({connectionString:dbUrl.toString(),ssl:databaseTls(true,process.env.DATABASE_CA_CERT_PATH),statement_timeout:10000,connectionTimeoutMillis:10000});
 const run=randomBytes(6).toString('hex'),users=[],businesses=[];let browser,stage='connect',lastCode='none';
 const rpc=async(who,name,args,expected=null)=>{stage=`rpc:${name}`;const r=await who.client.rpc(name,args);lastCode=r.error?.code??r.data?.error?.code??'none';
  if(expected){assert.equal(r.error?.code,expected);return null;}assert(!r.error&&!r.data?.error,`${name} denied (${lastCode})`);return r.data;};
 const api=async(who,operation,input,expected=200)=>{stage=`api:${operation}`;const cookie=[...who.cookies].map(([n,v])=>`${n}=${v}`).join('; ');
  const response=await fetch(new URL(`/api/whatsapp/${operation}`,origin),{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(input)});
  assert.match(response.headers.get('cache-control')??'',/private, no-store/u);assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  const value=await response.json();lastCode=value.error?.code??'none';assert.equal(response.status,expected,`${operation} returned ${response.status} (${lastCode})`);return expected===200?value.data:value.error;};
 try{
  await sql.connect();
  assert.equal((await sql.query("select count(*) from public.businesses b where b.status<>'archived' and (b.status<>'draft' or exists(select from public.memberships m where m.business_id=b.id))")).rows[0].count,'0','Use isolated staging without active customer data.');
  for(let i=0;i<4;i++){
   stage='synthetic Auth user';const email=`phase6-${run}-${i}@example.invalid`,password=randomBytes(32).toString('base64url');
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert(!created.error&&created.data.user);
   const cookies=new Map();const client=createServerClient(url,key,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}});
   const who={id:created.data.user.id,email,client,cookies};users.push(who);assert(!(await client.auth.signInWithPassword({email,password})).error);
   await rpc(who,'complete_profile',{p_display_name:`Phase6 synthetic ${i}`,p_correlation_id:randomUUID()});
  }
  const [owner,member,cashier,ownerB]=users;
  const configuration=await rpc(owner,'public_configuration',{});
  for(const [i,who] of [[0,owner],[1,ownerB]]){
   stage='MFA';const factor=await who.client.auth.mfa.enroll({factorType:'totp',friendlyName:'Phase6 staging test'});assert(!factor.error);
   assert(!(await who.client.auth.mfa.challengeAndVerify({factorId:factor.data.id,code:totp(factor.data.totp.secret)})).error);
   const business=await rpc(who,'bootstrap_business',{p_input:{planVersionId:configuration.plans[0].id,name:`Phase6 synthetic cafe ${i}`,slug:`phase6-provider-${run}-${i}`,
    accentHex:'#166534',branchName:'Synthetic branch',address:'Synthetic staging address',city:'Lahore',hours:[]},p_correlation_id:randomUUID()});businesses.push(business);
  }
  const business=businesses[0],businessId=business.businessId;
  await rpc(owner,'save_initial_programme',{p_business_id:businessId,p_input:{rowVersion:1,type:'stamps',name:'Synthetic programme',minimumSpendPaisa:'100',stampsPerPurchase:'1',spendStepPaisa:null,unitsPerStep:null,maxBaseUnitsPerPurchase:'10',
   terms:'Synthetic paid-visit test terms.',rewardTitle:'Synthetic coffee',rewardUnitCost:'2',rewardDescription:'',rewardTerms:'Synthetic reward test conditions.',rewardBranchIds:[business.branchId],estimatedCostPaisa:null},p_correlation_id:randomUUID()});
  await rpc(owner,'publish_business',{p_business_id:businessId,p_row_version:2,p_correlation_id:randomUUID()});
  const cafe=await rpc(member,'public_business',{p_slug:`phase6-provider-${run}-0`});
  const joined=await rpc(member,'join_business',{p_input:{businessSlug:`phase6-provider-${run}-0`,branchId:business.branchId,displayName:'Ayesha Synthetic',shareVerifiedEmail:false,
   phone:'+923001234567',whatsappMarketingConsent:true,acceptedProgrammeVersionId:cafe.programme.id,platformTermsDocumentId:configuration.policies.find(p=>p.kind==='platform_terms').id,
   privacyDocumentId:configuration.policies.find(p=>p.kind==='privacy').id,rejoin:false},p_correlation_id:randomUUID()});
  const memberId=joined.membershipId;
  const invitation=await rpc(owner,'create_staff_invitation',{p_business_id:businessId,p_input:{email:cashier.email,role:'cashier',branchIds:[business.branchId]},p_correlation_id:randomUUID()});
  await rpc(cashier,'accept_staff_invitation',{p_token:invitation.token,p_correlation_id:randomUUID()});
  const template=await api(owner,'save-template',{businessId,templateId:null,rowVersion:null,name:'Synthetic greeting',body:'Hello {{first_name}} 😀 & friends.\nVisit {{business_name}}.',active:true});
  const batchInput={businessId,name:'Synthetic batch',templateId:template.templateId,templateVersion:template.version,audience:'selected_members',memberIds:[memberId],inactiveDays:null,targetRewardVersionId:null,offerId:null,assignedBusinessUserId:null};
  const preview=await api(owner,'preview-batch',batchInput);assert.equal(preview.eligible,1);assert(!JSON.stringify(preview).includes('923001234567'));
  const batch=await api(owner,'create-batch',{...batchInput,idempotencyKey:randomUUID()});assert.equal(batch.createdTasks,1);
  const list=await api(owner,'tasks',{businessId,batchId:batch.batchId});const taskId=list.tasks[0].id;
  assert(!JSON.stringify(list).includes('923001234567'));assert.deepEqual(list.counts,{opened:0,staffMarkedSent:0});
  await rpc(cashier,'whatsapp_task_detail',{p_business:businessId,p_task:taskId},'42501');
  await rpc(member,'whatsapp_task_detail',{p_business:businessId,p_task:taskId},'42501');
  await api(cashier,'task-detail',{businessId,taskId},403);await api(ownerB,'task-detail',{businessId,taskId},403);
  const raw=await member.client.from('followup_tasks').select('rendered_body');assert(raw.error);
  console.log('PASS hosted Auth/PostgREST/HTTP scoped templates, real consent, tasks, cashier/member/other-owner denial and private headers');
  browser=await chromium.launch({headless:true});const context=await browser.newContext({baseURL:origin,viewport:{width:360,height:800}});
  await context.addCookies([...owner.cookies].map(([name,value])=>({name,value,url:origin,httpOnly:false,secure:origin.startsWith('https:'),sameSite:'Lax'})));
  await context.route('https://wa.me/**',route=>route.fulfill({contentType:'text/html',body:'Synthetic click-to-chat interception. No WhatsApp message sent.'}));
  const page=await context.newPage();stage='browser task detail';await page.goto(`/dashboard/${businessId}/whatsapp/tasks/${taskId}`);
  await page.getByRole('heading',{name:'Follow-up for Ayesha Synthetic'}).waitFor();
  assert(await page.getByRole('button',{name:'Mark as sent',exact:true}).isDisabled());
  const popupEvent=page.waitForEvent('popup');await page.getByRole('button',{name:'Open WhatsApp',exact:true}).click();const popup=await popupEvent;await popup.waitForURL('https://wa.me/**');
  const destination=new URL(popup.url());assert.equal(destination.pathname,'/923001234567');assert.equal(destination.searchParams.get('text'),'Hello Ayesha 😀 & friends.\nVisit Phase6 synthetic cafe 0.');
  await popup.close();const opened=await api(owner,'task-detail',{businessId,taskId});assert.equal(opened.state,'opened');assert.equal(opened.markedSentAt,null);
  // Attest only to synthetic test work; no real Send is pressed.
  const marked=await api(owner,'task-action',{businessId,taskId,rowVersion:opened.rowVersion,action:'mark_sent',attestsSent:true,note:'Synthetic test attestation only',assignedBusinessUserId:null});assert.equal(marked.state,'staff_marked_sent');
  const metrics=await api(owner,'tasks',{businessId,batchId:batch.batchId});assert.deepEqual(metrics.counts,{opened:1,staffMarkedSent:1});
  console.log('PASS persisted staging task page on 360px; explicit encoded handoff and human-attested status stay separate (WhatsApp target intercepted)');
  const later=await api(owner,'create-batch',{...batchInput,idempotencyKey:randomUUID()});const laterList=await api(owner,'tasks',{businessId,batchId:later.batchId});const laterId=laterList.tasks[0].id;
  assert.equal((await api(owner,'open-task',{businessId,taskId:laterId,rowVersion:1},429)).code,'rate_limited');
  await rpc(member,'set_consent',{p_membership_id:memberId,p_channel:'whatsapp',p_purpose:'marketing',p_allowed:false,p_text_version:configuration.policies.find(p=>p.kind==='whatsapp_marketing').version,p_correlation_id:randomUUID()});
  const suppressed=await api(owner,'task-detail',{businessId,taskId:laterId});assert.equal(suppressed.state,'opted_out');
  await page.goto(`/dashboard/${businessId}/whatsapp/tasks/${laterId}`);assert(await page.getByRole('button',{name:'Open WhatsApp',exact:true}).isDisabled());
  assert(!(await page.content()).includes('https://wa.me/'));
  const denials=await api(owner,'preview-batch',batchInput);assert.equal(denials.eligible,0);assert.equal(denials.members[0].exclusion,'no_whatsapp_consent');
  console.log('PASS hosted 24-hour gate, customer preference suppression and no stale send link after opt-out');
 }catch(error){throw new Error(`Phase 6 staging check failed at ${stage}; code=${lastCode}; ${error instanceof Error?error.message.split('\n')[0]:'unknown error'}`);}
 finally{
  await browser?.close().catch(()=>{});
  for(const b of businesses)await sql.query("update public.businesses set status='archived' where id=$1 and slug like $2",[b.businessId,`phase6-provider-${run}-%`]).catch(()=>{});
  for(const who of users){await who.client.auth.signOut().catch(()=>{});await admin.auth.admin.deleteUser(who.id).catch(()=>{});}
  await sql.end();
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
