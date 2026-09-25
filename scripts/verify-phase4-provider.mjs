// Isolated development project only. Uses synthetic Auth accounts and archives its test cafe.
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { chromium } from '@playwright/test';
import pg from 'pg';
import { databaseTls } from '../src/lib/db/tls.ts';

const token=()=>randomBytes(32).toString('base64url');
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.toUpperCase().replace(/=+$/u,''))bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');
 const bytes=Buffer.from(bits.match(/.{8}/gu).map(v=>parseInt(v,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const digest=createHmac('sha1',bytes).update(counter).digest(),offset=digest[19]&15;return ((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');}
async function main(){
 const required=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','STORAGE_SERVICE_ROLE_KEY','MIGRATION_DATABASE_URL',
  'PHASE4_TEST_WEB_URL','ENCRYPTION_KEY_ID','ENCRYPTION_KEY_BASE64','RATE_LIMIT_HMAC_KEY_BASE64','WEB_GATEWAY_DATABASE_URL'];
 for(const key of required)if(!process.env[key])throw new Error(`Missing configuration: ${key}`);
 if(process.env.APP_ENV!=='staging')throw new Error('APP_ENV must be staging.');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const admin=createClient(url,process.env.STORAGE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const sql=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL,ssl:databaseTls(true,process.env.DATABASE_CA_CERT_PATH)});
 const run=randomBytes(6).toString('hex'),users=[];let businessId=null,browser=null,stage='connect',lastCode='none';
 const rpc=async(who,name,args)=>{stage=`rpc:${name}`;const response=await who.client.rpc(name,args);lastCode=response.error?.code??response.data?.error?.code??'none';
  assert(!response.error&&!response.data?.error,`${name} failed`);return response.data;};
 const api=async(who,path,input,expected=200,extraCookie='')=>{stage=`api:${path}`;const cookies=[...who.cookies].map(([name,value])=>`${name}=${value}`).join('; ');
  const response=await fetch(new URL(path,process.env.PHASE4_TEST_WEB_URL),{method:'POST',headers:{origin:process.env.PHASE4_TEST_WEB_URL,
   'content-type':'application/json',cookie:`${cookies}${extraCookie?`; ${extraCookie}`:''}`},body:JSON.stringify(input)});
  assert.match(response.headers.get('cache-control')??'',/no-store/u);const value=await response.json();lastCode=value.error?.code??'none';
  assert.equal(response.status,expected,`${path} returned ${response.status}, code=${lastCode}`);return expected===200?value.data:value.error;};
 try{
  await sql.connect();
  assert.equal((await sql.query("select count(*) from public.businesses where status<>'archived'")).rows[0].count,'0','Use the isolated project without active customer businesses.');
  for(let index=0;index<3;index++){
   stage='create synthetic Auth user';const email=`phase4-${run}-${index}@example.invalid`,password=token();
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`Phase4 test ${index}`}});
   assert(!created.error&&created.data.user);const cookies=new Map();const client=createServerClient(url,key,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),
    setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}});
   users.push({id:created.data.user.id,email,client,cookies});
   assert(!(await client.auth.signInWithPassword({email,password})).error);
   await rpc(users[index],'complete_profile',{p_display_name:`Phase4 test ${index}`,p_correlation_id:randomUUID()});
  }
  const [owner,referrer,friend]=users;
  stage='owner MFA';const enrolled=await owner.client.auth.mfa.enroll({factorType:'totp',friendlyName:'Phase4 provider test'});assert(!enrolled.error);
  assert(!(await owner.client.auth.mfa.challengeAndVerify({factorId:enrolled.data.id,code:totp(enrolled.data.totp.secret)})).error);
  const configuration=await rpc(owner,'public_configuration',{});assert(configuration.plans.length);
  const slug=`phase4-provider-${run}`;
  const business=await rpc(owner,'bootstrap_business',{p_input:{planVersionId:configuration.plans[0].id,name:`Phase4 provider ${run}`,slug,
   accentHex:'#166534',branchName:'Test branch',address:'Synthetic staging address',city:'Lahore',hours:[]},p_correlation_id:randomUUID()});
  businessId=business.businessId;
  await rpc(owner,'save_initial_programme',{p_business_id:businessId,p_input:{rowVersion:1,type:'stamps',name:'Synthetic stamps',
   minimumSpendPaisa:'100',stampsPerPurchase:'1',spendStepPaisa:null,unitsPerStep:null,maxBaseUnitsPerPurchase:'10',
   terms:'Synthetic paid-visit acceptance programme.',rewardTitle:'Synthetic treat',rewardUnitCost:'1',rewardDescription:'',
   rewardTerms:'Synthetic reward for provider acceptance.',rewardBranchIds:[business.branchId],estimatedCostPaisa:null},p_correlation_id:randomUUID()});
  await rpc(owner,'publish_business',{p_business_id:businessId,p_row_version:2,p_correlation_id:randomUUID()});
  const cafe=await rpc(referrer,'public_business',{p_slug:slug});
  const joinInput={businessSlug:slug,branchId:business.branchId,displayName:'Synthetic referrer',shareVerifiedEmail:false,
   phone:'',whatsappMarketingConsent:false,acceptedProgrammeVersionId:cafe.programme.id,
   platformTermsDocumentId:configuration.policies.find(p=>p.kind==='platform_terms').id,
   privacyDocumentId:configuration.policies.find(p=>p.kind==='privacy').id,rejoin:false};
  const first=await rpc(referrer,'join_business',{p_input:joinInput,p_correlation_id:randomUUID()});
  await api(owner,'/api/loyalty/save-referral-rules',{businessId,enabled:true,inviterBonusUnits:2,friendBonusUnits:3,
   minimumSpendPaisa:'25000',monthlyInviterCap:10,attributionDays:7,qualificationDays:30});
  const referral=await api(referrer,'/api/loyalty/my-referral-code',{membershipId:first.membershipId});
  assert.match(referral.code,/^[A-Za-z0-9_-]{21}[AEIMQUYcgkosw048]$/u);
  const local=(await sql.query("select (clock_timestamp() at time zone timezone)::date::text as date,extract(isodow from clock_timestamp() at time zone timezone)::int as day from public.businesses where id=$1",[businessId])).rows[0];
  const slot=await api(owner,'/api/loyalty/save-promotion',{businessId,name:'Synthetic double slot',branchIds:[business.branchId],
   startsOn:local.date,endsOn:local.date,weekdays:[local.day],startsAt:'00:00',endsAt:'23:59',minimumSpendPaisa:'0',
   memberDailyCap:1,maxBonusUnitsPerPurchase:1,effectiveAt:new Date().toISOString()});
  await api(owner,'/api/loyalty/publish-promotion',{businessId,promotionId:slot.promotionId,promotionVersionId:slot.promotionVersionId,
   rowVersion:slot.rowVersion,enable:true});
  const second=await api(owner,'/api/loyalty/save-promotion',{businessId,name:'Synthetic overlap',branchIds:[business.branchId],
   startsOn:local.date,endsOn:local.date,weekdays:[local.day],startsAt:'00:00',endsAt:'23:59',minimumSpendPaisa:'0',
   memberDailyCap:null,maxBonusUnitsPerPurchase:1,effectiveAt:new Date().toISOString()});
  stage='direct SQL overlap diagnosis';
  const session=(await sql.query('select id from auth.sessions where user_id=$1 order by created_at desc limit 1',[owner.id])).rows[0].id;
  await sql.query('begin');
  try{
   await sql.query('set local role authenticated');await sql.query("set local statement_timeout='5s'");
   await sql.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
    [owner.id,JSON.stringify({sub:owner.id,session_id:session,aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)}]})]);
   await sql.query('select public.publish_promotion($1,$2,$3,$4,$5,$6)',[businessId,second.promotionId,second.promotionVersionId,second.rowVersion,true,randomUUID()]);
   throw new Error('Overlapping promotion unexpectedly published');
  }catch(error){if(error.code!=='23P01')throw error;console.log('Direct SQL overlap rejected promptly.');}
  finally{await sql.query('rollback');}
  const overlap=await api(owner,'/api/loyalty/publish-promotion',{businessId,promotionId:second.promotionId,
   promotionVersionId:second.promotionVersionId,rowVersion:second.rowVersion,enable:true},409);
  assert.match(overlap.message,/Synthetic double slot.*Test branch/u);
  stage='browser:referral';browser=await chromium.launch({headless:true});
  const customerContext=await browser.newContext({baseURL:process.env.PHASE4_TEST_WEB_URL,viewport:{width:390,height:844}});
  const customerPage=await customerContext.newPage();
  await customerPage.goto(`/r/${referral.code}`);await customerPage.waitForURL(`**/b/${slug}`);
  const attributionCookie=(await customerContext.cookies()).find(cookie=>cookie.name==='loyalty_referral_v1');assert(attributionCookie?.httpOnly);
  const visitCookie=(await customerContext.cookies()).find(cookie=>cookie.name==='loyalty_referral_visits_v1');assert(visitCookie?.httpOnly);
  await customerPage.goto(`/r/${referral.code}`);await customerPage.waitForURL(`**/b/${slug}`);
  assert.equal((await sql.query('select count(*) from public.referral_visit_events where business_id=$1',[businessId])).rows[0].count,'1');
  await customerContext.addCookies([...friend.cookies].map(([name,value])=>({name,value,url:process.env.PHASE4_TEST_WEB_URL})));
  await customerPage.goto(`/join/${slug}`);
  await customerPage.getByText('A referral link is saved for this cafe.').waitFor();
  await customerPage.getByLabel('Display name').fill('Synthetic friend');
  await customerPage.getByRole('checkbox',{name:/I accept the programme terms/u}).check();
  await customerPage.getByRole('button',{name:'Join and view my card'}).click();
  await customerPage.waitForURL('**/app/cards/*',{timeout:15000});
  const member=(await sql.query('select id from public.memberships where business_id=$1 and customer_user_id=$2',[businessId,friend.id])).rows[0];
  assert(member);
  assert.equal((await sql.query('select count(*) from public.referral_claims where business_id=$1 and referred_membership_id=$2',[businessId,member.id])).rows[0].count,'1');
  const direct=await friend.client.rpc('join_business_referral',{p_input:{...joinInput,displayName:'Synthetic friend'},p_grant_hash:referral.code,p_correlation_id:randomUUID()});
  assert.equal(direct.error?.code,'42501');
  const handle=await api(friend,'/api/loyalty/handle',{membershipId:member.id,rotate:false});
  const lookup=await api(owner,'/api/loyalty/resolve',{businessId,branchId:business.branchId,kind:'earningHandle',rawValue:handle.qrValue});
  const input={checkoutContext:lookup.checkoutContext,recordedBillPaisa:'25000',eligibleSpendPaisa:'25000',qualifyingPurchaseConfirmed:true};
  const preview=await api(owner,'/api/loyalty/preview-purchase',input);
  assert.deepEqual([preview.baseUnits,preview.promotionBonusUnits,preview.referralBonusUnits,preview.inviterBonusUnits],['1','1','3','2']);
  const stale=await api(owner,'/api/loyalty/record-purchase',{...input,expectedEffectHash:'0'.repeat(64),idempotencyKey:randomUUID()},409);
  assert.equal(stale.code,'conflict');assert.equal(stale.freshPreview.expectedEffectHash,preview.expectedEffectHash);
  assert.equal((await sql.query('select count(*) from public.purchases where business_id=$1',[businessId])).rows[0].count,'0');
  const purchaseInput={...input,expectedEffectHash:preview.expectedEffectHash,idempotencyKey:randomUUID()};
  const purchase=await api(owner,'/api/loyalty/record-purchase',purchaseInput);
  assert.equal(purchase.balanceAfterAtCommit,'5');
  assert.equal((await api(owner,'/api/loyalty/record-purchase',purchaseInput)).replayed,true);
  assert.equal((await api(referrer,'/api/loyalty/card',{membershipId:first.membershipId})).units,'2');
  stage='browser:owner-pages';
  const ownerContext=await browser.newContext({baseURL:process.env.PHASE4_TEST_WEB_URL,viewport:{width:390,height:844}});
  await ownerContext.addCookies([...owner.cookies].map(([name,value])=>({name,value,url:process.env.PHASE4_TEST_WEB_URL})));
  const ownerPage=await ownerContext.newPage();
  await ownerPage.goto(`/dashboard/${businessId}/promotions`);await ownerPage.getByText('Synthetic double slot').first().waitFor();
  await ownerPage.getByRole('article',{name:/loyalty card/u}).waitFor();
  await ownerPage.getByRole('button',{name:'Calendar'}).click();
  await ownerPage.getByRole('gridcell',{name:local.date}).getByText('Synthetic double slot').waitFor();
  assert.equal(await ownerPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await ownerPage.goto(`/dashboard/${businessId}/referrals`);await ownerPage.getByRole('button',{name:'Results'}).click();
  await ownerPage.getByText('1 qualified').waitFor();
  await ownerPage.getByText('1 approximate link visits',{exact:false}).waitFor();
  assert.equal(await ownerPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  const card=await api(friend,'/api/loyalty/card',{membershipId:member.id});
  await api(owner,'/api/loyalty/reverse-purchase',{businessId,sourceId:purchase.purchaseId,reason:'Synthetic full referral purchase refund',
   expectedLedgerVersion:card.ledgerVersion,idempotencyKey:randomUUID()});
  assert.equal((await api(referrer,'/api/loyalty/card',{membershipId:first.membershipId})).units,'0');
  assert.equal((await api(friend,'/api/loyalty/card',{membershipId:member.id})).units,'0');
  assert.equal((await api(owner,'/api/loyalty/reconcile',{businessId})).mismatches,0);
  await browser.close();browser=null;
  console.log('PASS real Supabase Auth/PostgREST/browser referral cookie, gateway grant, scheduled bonus, duplicate denial, reversal and reconciliation');
 }catch(error){throw new Error(`Phase 4 provider check failed at ${stage}; code=${lastCode}; detail=${error instanceof Error?error.message.split('\n')[0]:'unknown'}`);}
 finally{
  if(browser)await browser.close().catch(()=>{});
  if(businessId)await sql.query("update public.businesses set status='archived' where id=$1 and slug like $2",[businessId,`phase4-provider-${run}%`]).catch(()=>{});
  for(const who of users){await who.client.auth.signOut().catch(()=>{});await admin.auth.admin.deleteUser(who.id).catch(()=>{});}
  await sql.end();
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
