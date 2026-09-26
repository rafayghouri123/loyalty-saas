// Isolated staging project only. Synthetic accounts and an archived cafe are removed in finally.
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {chromium} from '@playwright/test';
import pg from 'pg';
import {databaseTls} from '../src/lib/db/tls.ts';

const token=()=>randomBytes(32).toString('base64url');
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';
 for(const c of secret.toUpperCase().replace(/=+$/u,''))bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');
 const bytes=Buffer.from(bits.match(/.{8}/gu).map(v=>parseInt(v,2))),counter=Buffer.alloc(8);
 counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const digest=createHmac('sha1',bytes).update(counter).digest(),offset=digest[19]&15;
 return ((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');}
async function main(){
 const live=process.argv.includes('--live');
 const required=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','STORAGE_SERVICE_ROLE_KEY',
  'MIGRATION_DATABASE_URL','PHASE4_TEST_WEB_URL','WEB_GATEWAY_DATABASE_URL'];
 for(const key of required)if(!process.env[key])throw new Error(`Missing configuration: ${key}`);
 if(process.env.APP_ENV!=='staging')throw new Error('APP_ENV must be staging.');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const admin=createClient(url,process.env.STORAGE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const sql=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL,ssl:databaseTls(true,process.env.DATABASE_CA_CERT_PATH)});
 const run=randomBytes(6).toString('hex'),users=[];let businessId=null,browser=null,profileDir=null,persistentContext=null,
  stage='connect',lastCode='none';
 const rpc=async(who,name,args)=>{stage=`rpc:${name}`;const response=await who.client.rpc(name,args);
  lastCode=response.error?.code??response.data?.error?.code??'none';
  assert(!response.error&&!response.data?.error,`${name} failed`);return response.data;};
 const api=async(who,operation,input,expected=200)=>{stage=`api:${operation}`;
  const cookie=[...who.cookies].map(([name,value])=>`${name}=${value}`).join('; ');
  const response=await fetch(new URL(`/api/communications/${operation}`,process.env.PHASE4_TEST_WEB_URL),
   {method:'POST',headers:{origin:process.env.PHASE4_TEST_WEB_URL,'content-type':'application/json',cookie},body:JSON.stringify(input)});
  assert.match(response.headers.get('cache-control')??'',/no-store/u);
  const value=await response.json();lastCode=value.error?.code??'none';
  assert.equal(response.status,expected,`${operation} returned ${response.status}, code=${lastCode}`);
  return expected===200?value.data:value.error;};
 try{
  await sql.connect();
  const activeBusinesses=await sql.query("select count(*) from public.businesses b where b.status<>'archived' and (b.status<>'draft' or exists (select 1 from public.memberships m where m.business_id=b.id) or exists (select 1 from public.campaigns c where c.business_id=b.id))");
  assert.equal(activeBusinesses.rows[0].count,'0','Use staging without published businesses, members, or existing campaigns.');
  for(let i=0;i<3;i++){
   stage='create synthetic Auth user';const email=`phase5-${run}-${i}@example.invalid`,password=token();
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`Phase5 test ${i}`}});
   assert(!created.error&&created.data.user);const cookies=new Map();
   const client=createServerClient(url,key,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),
    setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}});
   users.push({id:created.data.user.id,email,client,cookies});
   assert(!(await client.auth.signInWithPassword({email,password})).error);
   await rpc(users[i],'complete_profile',{p_display_name:`Phase5 test ${i}`,p_correlation_id:randomUUID()});
  }
  const [owner,member,outsider]=users;
  stage='owner MFA';const enrolled=await owner.client.auth.mfa.enroll({factorType:'totp',friendlyName:'Phase5 provider test'});
  assert(!enrolled.error);assert(!(await owner.client.auth.mfa.challengeAndVerify({factorId:enrolled.data.id,code:totp(enrolled.data.totp.secret)})).error);
  const configuration=await rpc(owner,'public_configuration',{});assert(configuration.plans.length);
  const slug=`phase5-provider-${run}`;
  const business=await rpc(owner,'bootstrap_business',{p_input:{planVersionId:configuration.plans[0].id,
   name:`Phase5 provider ${run}`,slug,accentHex:'#166534',branchName:'Test branch',
   address:'Synthetic staging address',city:'Lahore',hours:[]},p_correlation_id:randomUUID()});
  businessId=business.businessId;
  await rpc(owner,'save_initial_programme',{p_business_id:businessId,p_input:{rowVersion:1,type:'stamps',name:'Synthetic stamps',
   minimumSpendPaisa:'100',stampsPerPurchase:'1',spendStepPaisa:null,unitsPerStep:null,maxBaseUnitsPerPurchase:'10',
   terms:'Synthetic paid-visit acceptance programme.',rewardTitle:'Synthetic treat',rewardUnitCost:'2',
   rewardDescription:'',rewardTerms:'Synthetic reward for provider acceptance.',rewardBranchIds:[business.branchId],
   estimatedCostPaisa:null},p_correlation_id:randomUUID()});
  await rpc(owner,'publish_business',{p_business_id:businessId,p_row_version:2,p_correlation_id:randomUUID()});
  const cafe=await rpc(member,'public_business',{p_slug:slug});
  await rpc(member,'join_business',{p_input:{businessSlug:slug,branchId:business.branchId,displayName:'Synthetic member',
   shareVerifiedEmail:false,phone:'',whatsappMarketingConsent:false,acceptedProgrammeVersionId:cafe.programme.id,
   platformTermsDocumentId:configuration.policies.find(p=>p.kind==='platform_terms').id,
   privacyDocumentId:configuration.policies.find(p=>p.kind==='privacy').id,rejoin:false},p_correlation_id:randomUUID()});
  const now=Date.now();
  const offer=await api(owner,'save-offer',{businessId,offerId:null,rowVersion:null,kind:'treat',title:'Synthetic test treat',
   description:'A synthetic treat for staging verification.',terms:'Present this claim to staff before the expiry.',
   startsAt:new Date(now-60_000).toISOString(),expiresAt:new Date(now+3_600_000).toISOString(),audience:'all_members',
   branchIds:[business.branchId],recipientIds:[],isAutomationTemplate:false,imageAssetId:null,discountPercent:null,
   minimumSpendPaisa:'0',maxDiscountPaisa:null});
  await api(owner,'set-offer-status',{businessId,offerId:offer.offerId,rowVersion:offer.rowVersion,status:'published'});
  const list=await api(member,'my-offers',{businessId:null});assert(list.some(item=>item.id===offer.offerId));
  const detail=await api(member,'offer-detail',{id:offer.offerId});assert.equal(detail.businessTimezone,'Asia/Karachi');
  assert.equal((await api(outsider,'offer-detail',{id:offer.offerId},404)).code,'not_found');
  const claim=await api(member,'claim-offer',{id:offer.offerId});assert.equal(claim.status,'claimed');
  const intent=await api(member,'create-offer-intent',{claimId:claim.claimId});
  assert.match(intent.qrValue,/^LOYALTY:OFFER:v1:/u);
  const campaign=await api(owner,'save-campaign',{businessId,campaignId:null,rowVersion:null,name:'Synthetic campaign',
   title:'Synthetic update',body:'A synthetic staging message for this test.',destination:'card',imageAssetId:null,offerId:null,
   audience:'all_opted_in',inactiveDays:null,nearRewardUnits:null,targetRewardVersionId:null,
   branchIds:[business.branchId],expiresAt:new Date(now+3_600_000).toISOString()});
  const preview=await api(owner,'preview-campaign-audience',{businessId,campaignId:campaign.campaignId});
  assert.equal(preview.eligibleMembers,0);assert.equal(preview.subscribedDevices,0);
  const scheduled=await api(owner,'schedule-campaign',{businessId,campaignId:campaign.campaignId,
   rowVersion:campaign.rowVersion,scheduledAt:new Date(now+120_000).toISOString(),idempotencyKey:randomUUID()});
  assert.equal(scheduled.status,'scheduled');
  await api(owner,'set-campaign-status',{businessId,campaignId:campaign.campaignId,
   rowVersion:scheduled.rowVersion,action:'cancel'});
  stage='browser:customer-offer';
  if(live){
   // Chromium does not support a real Push API subscription in a private Playwright context.
   profileDir=await mkdtemp(join(tmpdir(),'phase5-push-'));
   persistentContext=await chromium.launchPersistentContext(profileDir,{
    channel:'chrome',headless:false,ignoreDefaultArgs:['--disable-background-networking'],
    baseURL:process.env.PHASE4_TEST_WEB_URL,viewport:{width:390,height:844},permissions:['notifications']
   });
   browser=persistentContext.browser();
  }else browser=await chromium.launch({headless:true});
  const customerContext=await browser.newContext({baseURL:process.env.PHASE4_TEST_WEB_URL,viewport:{width:390,height:844}});
  await customerContext.addCookies([...member.cookies].map(([name,value])=>({name,value,url:process.env.PHASE4_TEST_WEB_URL})));
  const page=await customerContext.newPage();await page.goto('/app/offers');
  await page.getByText('Synthetic test treat').first().waitFor();
  await page.goto(`/app/offers/${offer.offerId}`);await page.getByText('Your claim is saved.').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  stage='browser:owner-campaign';const ownerContext=live?persistentContext:await browser.newContext({
   baseURL:process.env.PHASE4_TEST_WEB_URL,viewport:{width:390,height:844},permissions:[]});
  await ownerContext.addCookies([...owner.cookies].map(([name,value])=>({name,value,url:process.env.PHASE4_TEST_WEB_URL})));
  const ownerPage=await ownerContext.newPage();await ownerPage.goto(`/dashboard/${businessId}/campaigns`);
  await ownerPage.getByText('Synthetic campaign').first().waitFor();
  assert.equal(await ownerPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  if(live){
   stage='browser:live-registration';await ownerPage.goto('/app/notifications');
   await ownerPage.getByRole('button',{name:'Enable notifications'}).click();
   try{await ownerPage.getByText('This device is confirmed.').waitFor({timeout:30000});}
   catch{
    const state=await ownerPage.evaluate(()=>({permission:Notification.permission,
     messages:[...document.querySelectorAll('[role="status"]')].map(item=>item.textContent?.slice(0,160))})).catch(()=>null);
    throw new Error(`Push confirmation missing; browser state=${JSON.stringify(state)}`);
   }
   const binding=await ownerPage.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('loyalty-device-v1',1);
     request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    try{return await new Promise((resolve,reject)=>{const request=db.transaction('state').objectStore('state').get('binding');
     request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}finally{db.close();}
   });
   assert.equal(binding.userId,owner.id);
   const registered=await api(owner,'set-campaign-test-device',{businessId,installationId:binding.installationId,
    bindingGeneration:binding.bindingGeneration,enabled:true});
   const testCampaign=await api(owner,'save-campaign',{businessId,campaignId:null,rowVersion:null,name:'Synthetic live push',
    title:'Synthetic live update',body:'This is a synthetic staging device test.',destination:'card',imageAssetId:null,
    offerId:null,audience:'all_opted_in',inactiveDays:null,nearRewardUnits:null,targetRewardVersionId:null,
    branchIds:[business.branchId],expiresAt:new Date(Date.now()+3_600_000).toISOString()});
   const test=await api(owner,'request-campaign-test',{businessId,campaignId:testCampaign.campaignId,deviceId:registered.deviceId});
   stage='browser:live-foreground-receipt';
   await ownerPage.getByText('Synthetic live update').waitFor({timeout:120000});
   await ownerPage.getByRole('button',{name:'Open update'}).click();
   await ownerPage.waitForURL('**/app/notifications');
   const delivered=(await sql.query('select status from public.campaign_test_requests where id=$1',[test.requestId])).rows[0];
   assert.equal(delivered.status,'provider_accepted');
   console.log('PASS real Firebase foreground campaign test received and opened in Chrome; provider accepted separately');
   stage='browser:denied-permission-loyalty';
   const cdp=await customerContext.newCDPSession(page);
   await cdp.send('Browser.setPermission',{permission:{name:'notifications'},setting:'denied',
    origin:process.env.PHASE4_TEST_WEB_URL});
   await page.goto('/app/notifications');
   await page.getByRole('button',{name:'Enable notifications'}).click();
   await page.getByText('Notifications are off. You can still use all your loyalty cards.').waitFor();
   await page.goto('/app');
   await page.getByRole('link',{name:'Open card'}).click();
   await page.getByRole('button',{name:'Get checkout code'}).waitFor();
   assert.equal(await page.evaluate(()=>Notification.permission),'denied');
   console.log('PASS denied browser notifications leave an authenticated customer card usable');
  }
  await browser.close();browser=null;
  console.log('PASS real Supabase Auth/PostgREST/API/browser offer isolation, claim intent, zero-consent campaign and cancellation');
 }catch(error){throw new Error(`Phase 5 provider check failed at ${stage}; code=${lastCode}; detail=${error instanceof Error?error.message.split('\n')[0]:'unknown'}`);}
 finally{
  if(browser)await browser.close().catch(()=>{});
  if(profileDir&&dirname(profileDir)===tmpdir()&&basename(profileDir).startsWith('phase5-push-'))
   await rm(profileDir,{recursive:true,force:true}).catch(()=>{});
  if(businessId)await sql.query("update public.businesses set status='archived' where id=$1 and slug like $2",
   [businessId,`phase5-provider-${run}%`]).catch(()=>{});
  for(const who of users){await who.client.auth.signOut().catch(()=>{});await admin.auth.admin.deleteUser(who.id).catch(()=>{});}
  await sql.end();
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
