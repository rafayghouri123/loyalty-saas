// Real provider acceptance. Requires a dedicated staging deployment/project;
// no request sends an email, push message, payment, or WhatsApp message.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import pg from 'pg';
import sharp from 'sharp';
import { databaseTls } from '../src/lib/db/tls.ts';
import { validateMedia, supabaseMediaStorage } from '../src/worker/media.ts';

function totp(secret) {
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits='';
 for(const c of secret.toUpperCase().replace(/=+$/u,'')) bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');
 const bytes=Buffer.from(bits.match(/.{8}/gu).map(v=>parseInt(v,2)));
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const hash=createHmac('sha1',bytes).update(counter).digest();const offset=hash[19]&15;
 return ((hash.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}
async function main() {
 const required=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','STORAGE_SERVICE_ROLE_KEY','MIGRATION_DATABASE_URL','WORKER_DATABASE_URL','PHASE2_TEST_WEB_URL'];
 const missing=required.filter(k=>!process.env[k]);
 if(missing.length) throw new Error(`Missing configuration: ${missing.join(', ')}`);
 if(process.env.APP_ENV!=='staging') throw new Error('APP_ENV must be staging for this dedicated-project test.');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const admin=createClient(url,process.env.STORAGE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const sql=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL,ssl:databaseTls(true,process.env.DATABASE_CA_CERT_PATH)});
 const worker=new pg.Client({connectionString:process.env.WORKER_DATABASE_URL,ssl:databaseTls(true,process.env.DATABASE_CA_CERT_PATH)});
 const run=randomBytes(6).toString('hex'), users=[], businesses=[], assets=[];
 let operation='none',failureCode='none';
 const rpc=async(c,name,args={})=>{operation=name;const r=await c.rpc(name,args);failureCode=r.error?.code??r.data?.error?.sqlState??r.data?.error?.code??'none';if(/^(unauthenticated|mfa_required|permission denied for (table|schema|function) [a-z_]+)$/u.test(r.error?.message??''))failureCode+=` (${r.error.message})`;assert(!r.error,`${name}: provider rejected request`);assert(!r.data?.error,`${name}: operation denied`);return r.data;};
 let stage='connect';
 try {
  await sql.connect();await worker.connect();
  assert.equal((await sql.query("select count(*) from public.businesses where slug not like 'phase2-provider-%' and status<>'archived'")).rows[0].count,'0','Use an isolated project without active customer businesses.');
  assert.equal((await worker.query("select pg_has_role(current_user,'loyalty_worker','member') and not rolsuper and not rolbypassrls as allowed from pg_roles where rolname=current_user")).rows[0].allowed,true);
  stage='provider accounts and sessions';
  for(let i=0;i<4;i++) {
   const email=`phase2-${run}-${i}@example.invalid`,password=randomBytes(32).toString('base64url');
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`Phase2 test ${i}`}});
   assert(!created.error&&created.data.user,'Provider account creation failed');
   const cookies=new Map();
   const client=createServerClient(url,key,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}});
   users.push({id:created.data.user.id,email,client,cookies});
   const login=await client.auth.signInWithPassword({email,password});assert(!login.error,'Provider session creation failed');
   await rpc(client,'complete_profile',{p_display_name:`Phase2 test ${i}`,p_correlation_id:randomUUID()});
  }
  const [a,b,customer,cashier]=users;
  stage='verified email token exchange and single-use enforcement';
  const link=await admin.auth.admin.generateLink({type:'magiclink',email:customer.email});
  assert(!link.error,'Provider magic-link generation failed');
  await customer.client.auth.signOut();
  const verifiedEmail=await customer.client.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});
  assert(!verifiedEmail.error&&verifiedEmail.data.user?.email_confirmed_at,'Email token verification failed');
  const anonymous=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  assert((await anonymous.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token})).error,'Email token replay must fail');
  const config=await rpc(a.client,'public_configuration');assert(config.plans.length,'Publish the delegated configuration first');
  const makeInput=i=>({planVersionId:config.plans[0].id,name:`Phase2 provider ${run} ${i}`,slug:`phase2-provider-${run}-${i}`,accentHex:'#166534',branchName:'Test branch',address:'Synthetic staging address',city:'Lahore',hours:[]});
  const denied=await a.client.rpc('bootstrap_business',{p_input:makeInput(0),p_correlation_id:randomUUID()});assert(denied.error,'AAL1 must not bootstrap');
  stage='actual TOTP enrollment and verification';
  for(const owner of [a,b]) {
   const enrolled=await owner.client.auth.mfa.enroll({factorType:'totp',friendlyName:'Phase2 provider test'});assert(!enrolled.error,'TOTP enrollment failed');
   const verified=await owner.client.auth.mfa.challengeAndVerify({factorId:enrolled.data.id,code:totp(enrolled.data.totp.secret)});assert(!verified.error,'TOTP verification failed');
  }
  stage='business bootstrap and publication';
  for(const [i,owner] of [a,b].entries()) {
   const business=await rpc(owner.client,'bootstrap_business',{p_input:makeInput(i),p_correlation_id:randomUUID()});businesses.push(business.businessId);owner.business=business;
   await rpc(owner.client,'save_initial_programme',{p_business_id:business.businessId,p_correlation_id:randomUUID(),p_input:{rowVersion:1,type:'stamps',name:'Provider test stamps',minimumSpendPaisa:'0',stampsPerPurchase:'1',spendStepPaisa:null,unitsPerStep:null,maxBaseUnitsPerPurchase:'10',terms:'Synthetic acceptance test programme.',rewardTitle:'Test reward',rewardUnitCost:'8',rewardDescription:'',rewardTerms:'Synthetic acceptance test reward.',rewardBranchIds:[business.branchId],estimatedCostPaisa:null}});
   await rpc(owner.client,'publish_business',{p_business_id:business.businessId,p_row_version:2,p_correlation_id:randomUUID()});
  }
  stage='two-cafe enrollment and tenant isolation';
  for(const [i,owner] of [a,b].entries()) {
   const cafe=await rpc(customer.client,'public_business',{p_slug:makeInput(i).slug});
   await rpc(customer.client,'join_business',{p_correlation_id:randomUUID(),p_input:{businessSlug:cafe.slug,branchId:owner.business.branchId,displayName:`Customer ${run}`,shareVerifiedEmail:i===1,phone:'',whatsappMarketingConsent:false,acceptedProgrammeVersionId:cafe.programme.id,platformTermsDocumentId:config.policies.find(p=>p.kind==='platform_terms').id,privacyDocumentId:config.policies.find(p=>p.kind==='privacy').id,rejoin:false}});
  }
  assert.equal((await rpc(customer.client,'my_memberships')).length,2);
  const ownA=await rpc(a.client,'business_members',{p_business_id:a.business.businessId,p_branch_id:null,p_offset:0});
  const ownB=await rpc(b.client,'business_members',{p_business_id:b.business.businessId,p_branch_id:null,p_offset:0});
  assert.equal(ownA.length,1);assert.equal(ownB.length,1);assert.notEqual(ownA[0].id,ownB[0].id);
  assert.equal(ownA[0].contact.sharedEmail,null);assert.equal(ownB[0].contact.sharedEmail,customer.email);
  assert((await a.client.rpc('business_members',{p_business_id:b.business.businessId,p_branch_id:null,p_offset:0})).error,'Owner cannot list another cafe relationship');
  assert((await b.client.rpc('business_setup',{p_business_id:a.business.businessId})).error,'Cross-tenant owner read must fail');
  const invitation=await rpc(a.client,'create_staff_invitation',{p_business_id:a.business.businessId,p_input:{email:cashier.email,role:'cashier',branchIds:[a.business.branchId]},p_correlation_id:randomUUID()});
  await rpc(cashier.client,'accept_staff_invitation',{p_token:invitation.token,p_correlation_id:randomUUID()});
  assert((await cashier.client.rpc('business_members',{p_business_id:a.business.businessId,p_branch_id:a.business.branchId,p_offset:0})).error,'Cashier cannot list customers');
  const setup=await rpc(a.client,'business_setup',{p_business_id:a.business.businessId});const staff=setup.staff.find(s=>s.email===cashier.email);
  await rpc(a.client,'manage_staff',{p_business_id:a.business.businessId,p_input:{id:staff.id,rowVersion:staff.rowVersion,action:'revoke'},p_correlation_id:randomUUID()});
  assert((await cashier.client.rpc('business_access',{p_business_id:a.business.businessId,p_branch_id:a.business.branchId})).error,'Revoked staff session must fail');
  stage='Storage HTTP and real worker media processing';
  const bytes=await sharp({create:{width:32,height:32,channels:3,background:'#166534'}}).png().toBuffer();
  const grant=await rpc(a.client,'reserve_media',{p_business_id:a.business.businessId,p_kind:'logo',p_mime_type:'image/png',p_bytes:bytes.length,p_correlation_id:randomUUID()});
  assets.push({bucket:'loyalty-quarantine',path:grant.path});
  assert((await b.client.storage.from('loyalty-quarantine').upload(grant.path,bytes,{contentType:'image/png'})).error,'Cross-tenant upload must fail');
  assert(!(await a.client.storage.from('loyalty-quarantine').upload(grant.path,bytes,{contentType:'image/png'})).error,'Owner exact-path upload must work');
  assert((await b.client.storage.from('loyalty-quarantine').download(grant.path)).error,'Private original must remain isolated');
  await rpc(a.client,'submit_media',{p_asset_id:grant.assetId,p_correlation_id:randomUUID()});
  const event=(await sql.query("select id from public.outbox_events where event_type='media.validate' and event_key=$1",[grant.assetId])).rows[0].id;
  const job=(await worker.query('select public.worker_media_job($1) as job',[event])).rows[0].job;assets.push({bucket:'loyalty-brand',path:job.outputPath});
  await validateMedia(worker,event,supabaseMediaStorage(url,process.env.STORAGE_SERVICE_ROLE_KEY));
  assert.equal((await rpc(a.client,'media_status',{p_asset_id:grant.assetId})).status,'accepted');
  const publicImage=await fetch(`${url}/storage/v1/object/public/loyalty-brand/${job.outputPath}`);assert.equal(publicImage.status,200);
  const proof=await rpc(a.client,'reserve_media',{p_business_id:a.business.businessId,p_kind:'payment_proof',p_mime_type:'image/png',p_bytes:bytes.length,p_correlation_id:randomUUID()});
  assets.push({bucket:'loyalty-quarantine',path:proof.path});
  assert(!(await a.client.storage.from('loyalty-quarantine').upload(proof.path,bytes,{contentType:'image/png'})).error);
  await rpc(a.client,'submit_media',{p_asset_id:proof.assetId,p_correlation_id:randomUUID()});
  const proofEvent=(await sql.query("select id from public.outbox_events where event_type='media.validate' and event_key=$1",[proof.assetId])).rows[0].id;
  const proofJob=(await worker.query('select public.worker_media_job($1) as job',[proofEvent])).rows[0].job;assets.push({bucket:'loyalty-private',path:proofJob.outputPath});
  await validateMedia(worker,proofEvent,supabaseMediaStorage(url,process.env.STORAGE_SERVICE_ROLE_KEY));
  assert.equal((await rpc(a.client,'media_status',{p_asset_id:proof.assetId})).status,'accepted');
  assert((await anonymous.storage.from('loyalty-private').download(proofJob.outputPath)).error,'Private proof must not be anonymously readable');
  assert((await b.client.storage.from('loyalty-private').download(proofJob.outputPath)).error,'Other owner must not read private proof');
  stage='authenticated cross-user HTTP cache isolation';
  for(const who of [customer,a,customer,b]) {
   const cookie=[...who.cookies].map(([k,v])=>`${k}=${v}`).join('; ');
   const response=await fetch(new URL('/app',process.env.PHASE2_TEST_WEB_URL),{headers:{cookie},redirect:'manual'});
   assert.equal(response.status,200);assert.match(response.headers.get('cache-control')??'',/no-store/u);
   const html=await response.text();assert.equal(html.includes(makeInput(0).name),who===customer,'Private membership HTML leaked across sessions');
  }
  const ownerCookie=[...a.cookies].map(([k,v])=>`${k}=${v}`).join('; ');
  const signage=await fetch(new URL(`/api/tenancy/signup-asset?businessId=${a.business.businessId}&branchId=${a.business.branchId}&format=svg`,process.env.PHASE2_TEST_WEB_URL),{headers:{cookie:ownerCookie}});
  assert.equal(signage.status,200);assert.match(signage.headers.get('cache-control')??'',/no-store/u);
  assert.match(signage.headers.get('content-disposition')??'',/^attachment/u);assert((await signage.text()).includes(makeInput(0).name));
  console.log('PASS real provider MFA, email token/replay, two-cafe enrollment, revoked cashier, public/private Storage/worker and cross-user HTTP checks; email delivery not exercised');
 } catch {throw new Error(`Provider acceptance failed at: ${stage}; operation=${operation}; code=${failureCode}`);}
 finally {
  // Retain audited synthetic business history; never delete customer records or disable triggers.
  for(const id of businesses) await sql.query("update public.businesses set status='archived' where id=$1 and slug like $2",[id,`phase2-provider-${run}-%`]).catch(()=>{});
  for(const item of assets) await admin.storage.from(item.bucket).remove([item.path]);
  for(const u of users) {await u.client.auth.signOut();await admin.auth.admin.deleteUser(u.id);}
  await worker.end();await sql.end();
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
