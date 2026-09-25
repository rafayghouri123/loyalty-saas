// Isolated development project only. Creates synthetic Auth accounts and an archived test business.
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
 const hash=createHmac('sha1',bytes).update(counter).digest(),offset=hash[19]&15;return ((hash.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');}
async function main(){
 const required=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','STORAGE_SERVICE_ROLE_KEY','MIGRATION_DATABASE_URL','PHASE3_TEST_WEB_URL','ENCRYPTION_KEY_ID','ENCRYPTION_KEY_BASE64'];
 for(const key of required)if(!process.env[key])throw new Error(`Missing configuration: ${key}`);
 if(process.env.APP_ENV!=='staging')throw new Error('APP_ENV must be staging.');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const admin=createClient(url,process.env.STORAGE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const sql=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL,ssl:databaseTls(true,process.env.DATABASE_CA_CERT_PATH)});
 const run=randomBytes(6).toString('hex'),users=[];let businessId=null,browser=null,stage='connect',lastCode='none';
 const rpc=async(who,name,args)=>{stage=`rpc:${name}`;const response=await who.client.rpc(name,args);lastCode=response.error?.code??response.data?.error?.code??'none';
  assert(!response.error&&!response.data?.error,`${name} failed`);return response.data;};
 const api=async(who,operation,input,expected=200)=>{stage=`api:${operation}`;const cookies=[...who.cookies].map(([name,value])=>`${name}=${value}`).join('; ');
  const response=await fetch(new URL(`/api/loyalty/${operation}`,process.env.PHASE3_TEST_WEB_URL),{method:'POST',headers:{origin:process.env.PHASE3_TEST_WEB_URL,
   'content-type':'application/json',cookie:cookies},body:JSON.stringify(input)});
  assert.match(response.headers.get('cache-control')??'',/no-store/u);const value=await response.json();lastCode=value.error?.code??'none';
  assert.equal(response.status,expected,`${operation} returned unexpected HTTP status`);return expected===200?value.data:value.error;};
 try{
  await sql.connect();
  const active=(await sql.query("select count(*) from public.businesses where status<>'archived'")).rows[0].count;
  assert.equal(active,'0','Use the isolated development project without active customer businesses.');
  for(let index=0;index<3;index++){
   stage='create synthetic Auth user';const email=`phase3-${run}-${index}@example.invalid`,password=token();
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`Phase3 test ${index}`}});
   assert(!created.error&&created.data.user);const cookies=new Map();const client=createServerClient(url,key,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),
    setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}});
   users.push({id:created.data.user.id,email,client,cookies});
   assert(!(await client.auth.signInWithPassword({email,password})).error);
   await rpc(users[index],'complete_profile',{p_display_name:`Phase3 test ${index}`,p_correlation_id:randomUUID()});
  }
  const [owner,customer,cashier]=users;
  stage='owner AAL2';const enrolled=await owner.client.auth.mfa.enroll({factorType:'totp',friendlyName:'Phase3 provider test'});assert(!enrolled.error);
  assert(!(await owner.client.auth.mfa.challengeAndVerify({factorId:enrolled.data.id,code:totp(enrolled.data.totp.secret)})).error);
  const config=await rpc(owner,'public_configuration',{});assert(config.plans.length);
  const slug=`phase3-provider-${run}`;
  const business=await rpc(owner,'bootstrap_business',{p_input:{planVersionId:config.plans[0].id,name:`Phase3 provider ${run}`,slug,
   accentHex:'#166534',branchName:'Test branch',address:'Synthetic staging address',city:'Lahore',hours:[]},p_correlation_id:randomUUID()});
  businessId=business.businessId;
  await rpc(owner,'save_initial_programme',{p_business_id:businessId,p_input:{rowVersion:1,type:'stamps',name:'Synthetic stamps',minimumSpendPaisa:'100',
   stampsPerPurchase:'1',spendStepPaisa:null,unitsPerStep:null,maxBaseUnitsPerPurchase:'10',terms:'Synthetic paid-visit acceptance programme.',
   rewardTitle:'Synthetic treat',rewardUnitCost:'1',rewardDescription:'',rewardTerms:'Synthetic reward for provider acceptance.',rewardBranchIds:[business.branchId],estimatedCostPaisa:null},p_correlation_id:randomUUID()});
  await rpc(owner,'publish_business',{p_business_id:businessId,p_row_version:2,p_correlation_id:randomUUID()});
  const stampConfig=await api(owner,'configuration',{businessId});
  const pointDraft=await api(owner,'save-programme',{businessId,rowVersion:stampConfig.programme.rowVersion,name:'Synthetic points',
   type:'points',minimumSpendPaisa:'100',stampsPerPurchase:null,spendStepPaisa:'100',unitsPerStep:1,maxBaseUnitsPerPurchase:10,
   terms:'Synthetic points before any purchase.',effectiveAt:new Date(Date.now()+3600000).toISOString()});
  const savedConfig=await api(owner,'configuration',{businessId});
  assert.equal(savedConfig.programme.type,'stamps');assert.equal(savedConfig.programme.name,'Synthetic stamps');
  await api(owner,'publish-programme',{businessId,programmeVersionId:pointDraft.programmeVersionId,rowVersion:pointDraft.rowVersion});
  const pointConfig=await api(owner,'configuration',{businessId});assert.equal(pointConfig.programme.type,'points');
  const stampDraft=await api(owner,'save-programme',{businessId,rowVersion:pointConfig.programme.rowVersion,name:'Synthetic stamps',
   type:'stamps',minimumSpendPaisa:'100',stampsPerPurchase:1,spendStepPaisa:null,unitsPerStep:null,maxBaseUnitsPerPurchase:10,
   terms:'Synthetic stamps before any purchase.',effectiveAt:new Date(Date.now()+3600000).toISOString()});
  await api(owner,'publish-programme',{businessId,programmeVersionId:stampDraft.programmeVersionId,rowVersion:stampDraft.rowVersion});
  const cafe=await rpc(customer,'public_business',{p_slug:slug});
  const joined=await rpc(customer,'join_business',{p_input:{businessSlug:slug,branchId:business.branchId,displayName:'Synthetic customer',shareVerifiedEmail:false,
   phone:'',whatsappMarketingConsent:false,acceptedProgrammeVersionId:cafe.programme.id,
   platformTermsDocumentId:config.policies.find(p=>p.kind==='platform_terms').id,privacyDocumentId:config.policies.find(p=>p.kind==='privacy').id,rejoin:false},p_correlation_id:randomUUID()});
  const invite=await rpc(owner,'create_staff_invitation',{p_business_id:businessId,p_input:{email:cashier.email,role:'cashier',branchIds:[business.branchId]},p_correlation_id:randomUUID()});
  await rpc(cashier,'accept_staff_invitation',{p_token:invite.token,p_correlation_id:randomUUID()});
  const example=await api(owner,'programme-example',{businessId,type:'stamps',minimumSpendPaisa:'100',stampsPerPurchase:1,
   spendStepPaisa:null,unitsPerStep:null,maxBaseUnitsPerPurchase:10,exampleEligibleSpendPaisa:'500'});
  assert.equal(example.baseUnits,'1');
  stage='browser:launch';browser=await chromium.launch({headless:true});
  const browserPage=async(who)=>{const context=await browser.newContext({baseURL:process.env.PHASE3_TEST_WEB_URL});
   await context.addCookies([...who.cookies].map(([name,value])=>({name,value,url:process.env.PHASE3_TEST_WEB_URL})));
   return context.newPage();};
  const customerPage=await browserPage(customer),staffPage=await browserPage(cashier),ownerPage=await browserPage(owner);
  stage='browser:owner-programme';await ownerPage.goto(`/dashboard/${businessId}/programme`);
  await ownerPage.getByLabel('Example eligible spend (Rs)').fill('5');
  await ownerPage.getByText('1 stamps earned').waitFor();
  stage='browser:customer-card';await customerPage.goto(`/app/cards/${joined.membershipId}`);
  await customerPage.getByRole('button',{name:'Get checkout code'}).waitFor({timeout:5000});
  const earningQr=customerPage.getByRole('img',{name:'Personal earning QR for staff checkout'});
  await earningQr.waitFor();const qrSource=await earningQr.getAttribute('src');assert(qrSource?.startsWith('data:image/png;base64,'));
  stage='browser:staff-camera';await staffPage.goto(`/staff/${businessId}`);
  await staffPage.evaluate(async(source)=>{
   const qr=new Image();qr.src=source;await qr.decode();
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
   const context=canvas.getContext('2d');if(!context)throw new Error('Synthetic camera canvas unavailable');
   const draw=()=>{context.fillStyle='white';context.fillRect(0,0,640,480);context.drawImage(qr,170,90,300,300);requestAnimationFrame(draw);};draw();
   const stream=canvas.captureStream(15);
   Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>stream});
  },qrSource);
  await staffPage.getByRole('button',{name:'Scan customer QR'}).click();
  await staffPage.waitForURL(`**/staff/${businessId}/checkout`,{timeout:15000});
  stage='browser:staff-purchase';
  await staffPage.getByLabel('Bill total paid (Rs)').fill('5');
  await staffPage.getByLabel('Eligible spend (Rs)').fill('5');
  await staffPage.getByLabel('Qualifying purchase confirmed').check();
  await staffPage.getByRole('button',{name:'Review purchase'}).click();
  await staffPage.getByRole('heading',{name:'Server preview'}).waitFor();
  staffPage.on('dialog',dialog=>dialog.accept());
  await staffPage.getByRole('button',{name:'Confirm and award'}).click();
  await staffPage.getByRole('heading',{name:'Purchase committed'}).waitFor();
  stage='browser:customer-intent';await customerPage.goto(`/app/cards/${joined.membershipId}/rewards`);
  await customerPage.getByText('Eligible at Test branch.').waitFor();
  await customerPage.getByRole('button',{name:'Use this reward'}).click();
  await customerPage.getByRole('button',{name:'Get short code'}).click();
  const redemptionCode=customerPage.locator('p').filter({hasText:'Code:'}).locator('strong');await redemptionCode.waitFor();
  stage='browser:staff-redemption';await staffPage.goto(`/staff/${businessId}`);
  await staffPage.getByLabel('8-character code').fill(await redemptionCode.innerText());
  await staffPage.getByRole('button',{name:'Look up customer'}).click();
  await staffPage.waitForURL(`**/staff/${businessId}/redeem`);
  await staffPage.getByRole('button',{name:'Review reward'}).click();
  await staffPage.getByRole('button',{name:'Confirm reward given'}).click();
  await staffPage.getByRole('heading',{name:'Reward fulfilled'}).waitFor();
  await customerPage.getByRole('heading',{name:'Reward redeemed'}).waitFor({timeout:15000});
  assert.match(await customerPage.getByRole('heading',{name:'Reward redeemed'}).locator('..').innerText(),/balance 0\./u);
  await browser.close();browser=null;
  const handle=await api(customer,'handle',{membershipId:joined.membershipId,rotate:false});assert.match(handle.qrValue,/^LOYALTY:EARN:v1:/u);
  const lookup=await api(cashier,'resolve',{businessId,branchId:business.branchId,kind:'earningHandle',rawValue:handle.qrValue});
  const amount={checkoutContext:lookup.checkoutContext,recordedBillPaisa:'500',eligibleSpendPaisa:'500',qualifyingPurchaseConfirmed:true};
  const preview=await api(cashier,'preview-purchase',amount);assert.equal(preview.baseUnits,'1');
  const purchaseInput={...amount,expectedEffectHash:preview.expectedEffectHash,idempotencyKey:randomUUID()};
  const purchase=await api(cashier,'record-purchase',purchaseInput);assert.equal(purchase.balanceAfterAtCommit,'1');
  assert.equal((await api(cashier,'record-purchase',purchaseInput)).replayed,true);
  const card=await api(customer,'card',{membershipId:joined.membershipId});assert.equal(card.units,'1');
  const reward=card.rewards.find(item=>item.unitCost==='1');assert(reward);
  const intent=await api(customer,'create-intent',{membershipId:joined.membershipId,rewardVersionId:reward.id});
  const redemptionLookup=await api(cashier,'resolve',{businessId,branchId:business.branchId,kind:'redemptionIntent',rawValue:intent.qrValue});
  const redemptionPreview=await api(cashier,'preview-redemption',{checkoutContext:redemptionLookup.checkoutContext});
  const redemptionInput={checkoutContext:redemptionLookup.checkoutContext,expectedEffectHash:redemptionPreview.expectedEffectHash,idempotencyKey:randomUUID()};
  const redemption=await api(cashier,'finalize-redemption',redemptionInput);assert.equal(redemption.balanceAfterAtCommit,'0');
  assert.equal((await api(cashier,'finalize-redemption',redemptionInput)).replayed,true);
  const balance=await api(customer,'card',{membershipId:joined.membershipId});
  const reversed=await api(owner,'reverse-purchase',{businessId,sourceId:purchase.purchaseId,reason:'Synthetic full purchase refund after reward use',
   expectedLedgerVersion:balance.ledgerVersion,idempotencyKey:randomUUID()});assert.equal(reversed.balanceAfterAtCommit,'-1');
  assert.equal((await api(customer,'card',{membershipId:joined.membershipId})).units,'-1');
  assert.equal((await api(owner,'reconcile',{businessId})).mismatches,0);
  const events=(await sql.query("select count(*) from public.outbox_events where business_id=$1 and event_type like 'loyalty.%'",[businessId])).rows[0].count;
  assert.equal(events,'5');
  console.log('PASS real browser customer/staff earn and redeem; Supabase Auth/PostgREST and Next API replay, refund debt, ledger reconciliation and private caching');
 }catch(error){throw new Error(`Phase 3 provider check failed at ${stage}; code=${lastCode}; detail=${error instanceof Error?error.message.split('\n')[0]:'unknown'}`);}
 finally{
  if(browser)await browser.close().catch(()=>{});
  if(businessId)await sql.query("update public.businesses set status='archived' where id=$1 and slug like $2",[businessId,`phase3-provider-${run}%`]).catch(()=>{});
  for(const who of users){await who.client.auth.signOut().catch(()=>{});await admin.auth.admin.deleteUser(who.id).catch(()=>{});}
  await sql.end();
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
