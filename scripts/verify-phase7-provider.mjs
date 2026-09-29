// Real isolated staging Auth/PostgREST/private Storage and production web proof.
// Synthetic accounts only; no email, push, WhatsApp message or payment is sent.
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {chromium} from '@playwright/test';
import pg from 'pg';
import {databaseTls} from '../src/lib/db/tls.ts';
import {configuration} from '../src/features/reports/contracts.ts';
import {parseSecretKey} from '../src/lib/security/crypto.ts';
import {processReportExport,purgeReportExports,supabaseExportStorage} from '../src/worker/report-export.ts';
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=+$/u,''))bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');const bytes=Buffer.from(bits.match(/.{8}/gu).map(v=>parseInt(v,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const d=createHmac('sha1',bytes).update(counter).digest(),offset=d[19]&15;return ((d.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');}
async function main(){
 if(process.env.APP_ENV!=='staging')throw new Error('APP_ENV must be staging.');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,origin=process.env.PHASE4_TEST_WEB_URL;
 const admin=createClient(url,process.env.STORAGE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const dbUrl=new URL(process.env.MIGRATION_DATABASE_URL);for(const k of [...dbUrl.searchParams.keys()])if(k.toLowerCase().startsWith('ssl'))dbUrl.searchParams.delete(k);
 const sql=new pg.Client({connectionString:dbUrl.toString(),ssl:databaseTls(true,process.env.DATABASE_CA_CERT_PATH),statement_timeout:10000,connectionTimeoutMillis:10000});
 const worker=new pg.Pool({connectionString:process.env.WORKER_DATABASE_URL,ssl:databaseTls(true,process.env.DATABASE_CA_CERT_PATH),max:2});
 const storage=supabaseExportStorage(url,process.env.STORAGE_SERVICE_ROLE_KEY,{id:process.env.ENCRYPTION_KEY_ID,bytes:parseSecretKey(process.env.ENCRYPTION_KEY_BASE64)});
 const run=randomBytes(6).toString('hex'),users=[],businesses=[];let browser,testPage,exportId,stage='connect',code='none';
 const rpc=async(who,name,args,expected)=>{stage=`rpc:${name}`;const r=await who.client.rpc(name,args);code=r.error?.code??r.data?.error?.code??'none';if(expected){assert.equal(code,expected);return;}assert(!r.error&&!r.data?.error,`RPC denied (${code})`);return r.data;};
 const cookies=who=>[...who.cookies].map(([n,v])=>`${n}=${v}`).join('; ');
 const api=async(who,family,operation,input,expected=200)=>{stage=`api:${family}/${operation}`;const response=await fetch(new URL(`/api/${family}/${operation}`,origin),{method:'POST',headers:{origin,'content-type':'application/json',cookie:cookies(who)},body:JSON.stringify(input)});assert.match(response.headers.get('cache-control')??'',/private, no-store/u);const value=await response.json();code=value.error?.code??'none';assert.equal(response.status,expected,`HTTP ${response.status} (${code})`);return expected===200?value.data:value.error;};
 try{
  await sql.connect();assert.equal((await sql.query("select count(*) from public.businesses b where b.status<>'archived' and (b.status<>'draft' or exists(select from public.memberships m where m.business_id=b.id))")).rows[0].count,'0','Use isolated staging without active customer data.');
  for(let i=0;i<4;i++){stage='synthetic Auth';const email=`phase7-${run}-${i}@example.invalid`,password=randomBytes(32).toString('base64url');const made=await admin.auth.admin.createUser({email,password,email_confirm:true});assert(!made.error&&made.data.user);const jar=new Map(),client=createServerClient(url,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});const who={id:made.data.user.id,email,client,cookies:jar};users.push(who);assert(!(await client.auth.signInWithPassword({email,password})).error);await rpc(who,'complete_profile',{p_display_name:`TEST Phase7 ${i}`,p_correlation_id:randomUUID()});}
  const [owner,member,cashier,otherOwner]=users,config=await rpc(owner,'public_configuration',{});
  for(const [i,who] of [[0,owner],[1,otherOwner]]){const factor=await who.client.auth.mfa.enroll({factorType:'totp',friendlyName:'Phase7 synthetic'});assert(!factor.error);assert(!(await who.client.auth.mfa.challengeAndVerify({factorId:factor.data.id,code:totp(factor.data.totp.secret)})).error);businesses.push(await rpc(who,'bootstrap_business',{p_input:{planVersionId:config.plans[0].id,name:`TEST Phase7 cafe ${i}`,slug:`phase7-provider-${run}-${i}`,accentHex:'#166534',branchName:'Synthetic branch',address:'Synthetic staging address',city:'Lahore',hours:[]},p_correlation_id:randomUUID()}));}
  const b=businesses[0],businessId=b.businessId;
  await rpc(owner,'save_initial_programme',{p_business_id:businessId,p_input:{rowVersion:1,type:'stamps',name:'Synthetic programme',minimumSpendPaisa:'100',stampsPerPurchase:'1',spendStepPaisa:null,unitsPerStep:null,maxBaseUnitsPerPurchase:'10',terms:'Synthetic paid-visit test terms.',rewardTitle:'Synthetic coffee',rewardUnitCost:'2',rewardDescription:'',rewardTerms:'Synthetic reward test conditions.',rewardBranchIds:[b.branchId],estimatedCostPaisa:null},p_correlation_id:randomUUID()});await rpc(owner,'publish_business',{p_business_id:businessId,p_row_version:2,p_correlation_id:randomUUID()});
  const cafe=await rpc(member,'public_business',{p_slug:`phase7-provider-${run}-0`}),joined=await rpc(member,'join_business',{p_input:{businessSlug:`phase7-provider-${run}-0`,branchId:b.branchId,displayName:'TEST report member',shareVerifiedEmail:false,whatsappMarketingConsent:false,acceptedProgrammeVersionId:cafe.programme.id,platformTermsDocumentId:config.policies.find(p=>p.kind==='platform_terms').id,privacyDocumentId:config.policies.find(p=>p.kind==='privacy').id,rejoin:false},p_correlation_id:randomUUID()});
  const invite=await rpc(owner,'create_staff_invitation',{p_business_id:businessId,p_input:{email:cashier.email,role:'cashier',branchIds:[b.branchId]},p_correlation_id:randomUUID()});await rpc(cashier,'accept_staff_invitation',{p_token:invite.token,p_correlation_id:randomUUID()});
  for(const who of [member,cashier,otherOwner])await api(who,'reports','read',{businessId,filters:{preset:'today'}},403);
  assert((await member.client.from('export_artifacts').select('*')).error);const listing=await member.client.storage.from('loyalty-exports').list();assert(listing.error||listing.data?.length===0);
  const short=await api(member,'loyalty','scanner-code',{membershipId:joined.membershipId,purpose:'membership_lookup'}),lookup=await api(owner,'loyalty','resolve',{businessId,branchId:b.branchId,kind:'typedCode',rawValue:short.code});
  const purchaseInput={checkoutContext:lookup.checkoutContext,recordedBillPaisa:'120000',eligibleSpendPaisa:'100000',qualifyingPurchaseConfirmed:true},preview=await api(owner,'loyalty','preview-purchase',purchaseInput),purchase=await api(owner,'loyalty','record-purchase',{...purchaseInput,expectedEffectHash:preview.expectedEffectHash,idempotencyKey:randomUUID()});assert(purchase.purchaseId);
  const first=await api(owner,'reports','read',{businessId,filters:{preset:'today'}});assert.equal(first.metrics.recordedSalesPaisa,'120000');assert.equal(first.metrics.recordedPurchases,1);assert.equal(first.metrics.purchasingMembers,1);assert.equal(first.metrics.returningShare,'0.00');
  await rpc(owner,'get_report',{p_business:businessId,p_filters:{preset:'custom',startDate:'2026-01-01',endDate:'2026-04-01'}},'22023');await api(owner,'reports','read',{businessId,filters:{pageSize:101}},422);
  console.log('PASS real verified Auth/PostgREST and web reports: persisted purchase totals, private headers, cashier/customer/other-owner denial, 90-day/page bounds and raw table/Storage listing denial');
  stage='actual PostgREST report timeout';await sql.query('begin');await sql.query('lock table public.purchases in access exclusive mode');const began=Date.now();try{await rpc(owner,'get_report',{p_business:businessId,p_filters:{preset:'today'}},'57014');assert(Date.now()-began>=4500&&Date.now()-began<9000);}finally{await sql.query('rollback');}
  console.log('PASS real PostgREST hoists the five-second statement timeout before the blocked report begins');
  const made=await api(owner,'reports','export',{businessId,filters:{preset:'today'},columns:['date','recordedSalesPaisa','purchases'],idempotencyKey:randomUUID()});exportId=made.exportRequestId;
  const event=(await sql.query("select id from public.outbox_events where event_type='report.export_requested' and event_key=$1",[exportId])).rows[0].id;stage='private export worker Storage';await processReportExport(worker,event,storage);
  const state=await api(owner,'reports','export-status',{businessId,exportRequestId:exportId});assert.equal(state.status,'completed');
  stage='bounded authenticated download';const response=await fetch(`${origin}/api/reports/download?businessId=${businessId}&exportRequestId=${exportId}`,{headers:{cookie:cookies(owner)}});assert.equal(response.status,200);assert.match(response.headers.get('cache-control')??'',/private, no-store/u);assert.match(response.headers.get('content-disposition')??'',/attachment/u);const csv=await response.text();assert(csv.includes('120000'));assert(!csv.includes('phone'));assert(!csv.includes('token='));
  const artifact=(await sql.query('select storage_path from public.export_artifacts where export_request_id=$1',[exportId])).rows[0].storage_path;const anon=await fetch(`${url}/storage/v1/object/public/loyalty-exports/${artifact}`);assert(!anon.ok);
  await sql.query("update public.business_users set can_export_reports=true,role='manager' where business_id=$1 and user_id=$2",[businessId,cashier.id]);
  const managerExport=await api(cashier,'reports','export',{businessId,filters:{preset:'today'},columns:['date','purchases'],idempotencyKey:randomUUID()}),managerEvent=(await sql.query('select id from public.outbox_events where event_key=$1',[managerExport.exportRequestId])).rows[0].id;await processReportExport(worker,managerEvent,storage);
  await sql.query('update public.business_users set can_export_reports=false where business_id=$1 and user_id=$2',[businessId,cashier.id]);await api(cashier,'reports','export-status',{businessId,exportRequestId:managerExport.exportRequestId},403);const denied=await fetch(`${origin}/api/reports/download?businessId=${businessId}&exportRequestId=${managerExport.exportRequestId}`,{headers:{cookie:cookies(cashier)}});assert.equal(denied.status,403);
  console.log('PASS real private Storage artifact, bounded no-store download without bearer URL, anonymous denial and immediate export-permission revocation');
  browser=await chromium.launch();const context=await browser.newContext({baseURL:origin,viewport:{width:360,height:800}});await context.addCookies([...owner.cookies].map(([name,value])=>({name,value,url:origin,httpOnly:false,secure:false,sameSite:'Lax'})));const page=await context.newPage();testPage=page;
  configuration.parse(await rpc(owner,'report_configuration',{p_business:businessId}));
  stage='browser:report-totals';await page.goto(`/dashboard/${businessId}/reports`);await page.getByText('1,200.00',{exact:true}).first().waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  stage='browser:reward-tile';await page.getByRole('tab',{name:'Rewards',exact:true}).click();await page.getByText('Current outstanding units · all branches',{exact:true}).waitFor();
  stage='browser:refresh';await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByText('Updated ',{exact:false}).waitFor();
  console.log('PASS persisted 360px owner report page, accessible tab controls, current outstanding balance and explicit refresh');
 }catch(e){if(testPage){await testPage.screenshot({path:'.local/phase7-staging-browser.png',fullPage:true}).catch(()=>{});const state=await testPage.locator('main').innerText().catch(()=>'No main content');console.error('Synthetic report screen state:',state.slice(0,700));}throw new Error(`Phase 7 staging check failed at ${stage}; code=${code}; ${e instanceof Error?e.message.split('\n')[0]:'unknown'}`);}
 finally{
  await browser?.close().catch(()=>{});await sql.query('rollback').catch(()=>{});
  for(const b of businesses){await sql.query("update public.export_artifacts set expires_at=now()-interval '1 second' where export_request_id in(select id from public.export_requests where business_id=$1)",[b.businessId]).catch(()=>{});await sql.query("update public.export_requests set created_at=now()-interval '25 hours' where business_id=$1",[b.businessId]).catch(()=>{});}
  await purgeReportExports(worker,storage).catch(()=>{});
  for(const b of businesses)await sql.query("update public.businesses set status='archived' where id=$1 and slug like $2",[b.businessId,`phase7-provider-${run}-%`]).catch(()=>{});
  for(const who of users){await who.client.auth.signOut().catch(()=>{});await admin.auth.admin.deleteUser(who.id).catch(()=>{});}await worker.end();await sql.end();
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
