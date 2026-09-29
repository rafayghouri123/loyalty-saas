import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {processReportExport,purgeReportExports} from '../src/worker/report-export.ts';
import {openSecret} from '../src/lib/security/crypto.ts';
import {startWorker} from '../src/worker/runtime.ts';
import {configuration} from '../src/features/reports/contracts.ts';

export async function testPhase7({client,postgres,test:runTest,password,port}){
 const test=(n,fn)=>runTest(n,async()=>{await client.query('delete from public.rate_limit_buckets');await fn();});
 const base=(await client.query("select id from public.businesses where slug='phase2-a'")).rows[0].id;
 const owner=(await client.query("select u.user_id id,s.id session from public.business_users u join auth.sessions s on s.user_id=u.user_id where u.business_id=$1 and u.role='owner' and u.status='active' limit 1",[base])).rows[0];
 const cafe=randomUUID(),branches=[randomUUID(),randomUUID()],programme=randomUUID(),version=randomUUID(),reward=randomUUID(),rewardVersion=randomUUID();
 await client.query('begin');
 await client.query("insert into public.businesses(id,slug,display_name,status,created_by) values($1,'phase7-report-fixture','TEST reporting cafe','active',$2)",[cafe,owner.id]);
 await client.query("insert into public.business_users(business_id,user_id,staff_display_name,staff_email,role) values($1,$2,'TEST owner','phase7-owner@example.invalid','owner')",[cafe,owner.id]);
 for(const [i,b] of branches.entries())await client.query("insert into public.branches(id,business_id,name,address,city) values($1,$2,$3,'TEST fictional address','Test city')",[b,cafe,`TEST branch ${i+1}`]);
 await client.query("insert into public.loyalty_programmes(id,business_id,type,status,name) values($1,$2,'stamps','published','TEST stamps')",[programme,cafe]);
 await client.query("insert into public.programme_versions(id,business_id,programme_id,version,status,effective_at,published_at,minimum_spend_paisa,stamps_per_purchase,max_base_units_per_purchase,terms,created_by) values($1,$2,$3,1,'published','2026-01-01',now(),0,1,10,'TEST one stamp per purchase',$4)",[version,cafe,programme,owner.id]);
 await client.query("insert into public.rewards(id,business_id,programme_id,name) values($1,$2,$3,'TEST reward')",[reward,cafe,programme]);
 await client.query("insert into public.reward_versions(id,business_id,reward_id,version,unit_cost,title,description,terms,created_by) values($1,$2,$3,1,4,'TEST coffee','','TEST four stamp reward',$4)",[rewardVersion,cafe,reward,owner.id]);
 for(const b of branches)await client.query('insert into public.reward_branches(business_id,reward_version_id,branch_id) values($1,$2,$3)',[cafe,rewardVersion,b]);
 await client.query("update public.rewards set status='published',published_version_id=$2 where id=$1",[reward,rewardVersion]);
 await client.query('commit');
 const users=[];
 for(const [i,role] of ['manager','cashier',null,null,null].entries()){
  const u={id:randomUUID(),session:randomUUID(),member:randomUUID(),staff:randomUUID()};users.push(u);
  await client.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[u.id,`p7-${i}@example.invalid`]);
  await client.query('insert into auth.sessions(id,user_id) values($1,$2)',[u.session,u.id]);
  await client.query("insert into public.profiles(user_id,auth_user_id,display_name) values($1,$1,'TEST Phase7 user')",[u.id]);
  if(role){await client.query("insert into public.business_users(id,business_id,user_id,staff_display_name,staff_email,role,can_export_reports) values($1,$2,$3,'TEST scoped staff',$4,$5,$6)",[u.staff,cafe,u.id,`p7-${i}@example.invalid`,role,role==='manager']);await client.query('insert into public.branch_assignments values($1,$2,$3)',[cafe,u.staff,branches[0]]);}
  else {await client.query("insert into public.memberships(id,business_id,customer_user_id,display_name,joined_branch_id,joined_at) values($1,$2,$3,$4,$5,$6)",[u.member,cafe,u.id,i===2?'=HYPERLINK("test")':'TEST member',branches[0],i===3?'2026-01-01T00:00:00Z':'2026-01-09T19:00:00Z']);await client.query('insert into public.balances(business_id,membership_id) values($1,$2)',[cafe,u.member]);}
 }
 const [manager,cashier,friend,returning,inviter]=users;
 const rpc=async(who,name,args=[],conn=client,aal='aal2')=>{await conn.query('begin');try{
  await conn.query('set local role authenticated');await conn.query("set local statement_timeout='5s'");
  await conn.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[who.id,JSON.stringify({sub:who.id,session_id:who.session,aal})]);
  const result=(await conn.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result;await conn.query('commit');return result;
 }catch(e){await conn.query('rollback');throw e;}};
 const input=(kind='overview',extra={})=>({reportKind:kind,preset:'custom',startDate:'2026-01-10',endDate:'2026-01-10',branchIds:[branches[0]],...extra});
 const read=(kind='overview',extra={},who=owner)=>rpc(who,'get_report',[cafe,input(kind,extra)]);
 await test('Phase 7 report configuration loads owner and manager scoped filter options',async()=>{
  const all=configuration.parse(await rpc(owner,'report_configuration',[cafe]));assert.equal(all.branches.length,2);assert.equal(all.role,'owner');assert.equal(all.canExportContacts,true);
  const scoped=configuration.parse(await rpc(manager,'report_configuration',[cafe]));assert.equal(scoped.branches.length,1);assert.equal(scoped.branches[0].id,branches[0]);assert.equal(scoped.canExportContacts,false);assert.equal(scoped.rewards.length,1);
 });
 const purchase=async(member,branch,at,bill,spend,baseUnits=1,bonus=0,promotionVersion=null)=>{
  const id=randomUUID();await client.query(`insert into public.purchases(id,business_id,branch_id,membership_id,programme_version_id,recorded_bill_paisa,eligible_spend_paisa,base_units,promotion_bonus_units,promotion_version_id,qualifying_purchase_confirmed,qualifies_for_loyalty,occurred_at,staff_user_id,idempotency_key,request_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13,$14,$15)`,[id,cafe,branch,member,version,bill,spend,baseUnits,bonus,promotionVersion,spend>0,at,owner.id,randomUUID(),'a'.repeat(64)]);
  if(baseUnits)await client.query("insert into public.ledger_entries(business_id,membership_id,entry_kind,units,purchase_id,occurred_at,actor_user_id) values($1,$2,'purchase_base',$3,$4,$5,$6)",[cafe,member,baseUnits,id,at,owner.id]);
  if(bonus)await client.query("insert into public.ledger_entries(business_id,membership_id,entry_kind,units,purchase_id,occurred_at,actor_user_id) values($1,$2,'promotion_bonus',$3,$4,$5,$6)",[cafe,member,bonus,id,at,owner.id]);return id;
 };
 const promo=randomUUID(),promoVersion=randomUUID();await client.query("insert into public.earning_promotions(id,business_id,name,created_by) values($1,$2,'TEST double slot',$3)",[promo,cafe,owner.id]);
 await client.query("insert into public.promotion_versions(id,business_id,promotion_id,version,starts_on,ends_on,weekdays,starts_at,ends_at,timezone,effective_at,created_by) values($1,$2,$3,1,'2026-01-01','2026-01-31',array[1,2,3,4,5,6,7],'00:00','23:59','Asia/Karachi','2026-01-01',$4)",[promoVersion,cafe,promo,owner.id]);await client.query('insert into public.promotion_branches values($1,$2,$3)',[cafe,promoVersion,branches[0]]);
 const source=await purchase(friend.member,branches[0],'2026-01-10T10:00:00Z',100000,80000,1,1,promoVersion);
 const rule=randomUUID(),code=randomUUID(),claim=randomUUID();await client.query("insert into public.referral_rule_versions(id,business_id,version,enabled,inviter_bonus_units,friend_bonus_units,minimum_spend_paisa,qualification_days,monthly_inviter_cap,effective_at,created_by) values($1,$2,1,true,3,2,0,30,10,'2026-01-01',$3)",[rule,cafe,owner.id]);
 await client.query('insert into public.referral_codes(id,business_id,membership_id,code) values($1,$2,$3,$4)',[code,cafe,inviter.member,randomBytes(16).toString('base64url')]);
 await client.query("insert into public.referral_claims(id,business_id,referrer_membership_id,referred_membership_id,code_id,rule_version_id,enrolled_at,qualifies_until,status,qualifying_purchase_id,qualified_at,inviter_awarded_units,friend_awarded_units) values($1,$2,$3,$4,$5,$6,'2026-01-09T19:00Z','2026-02-08','qualified',$7,'2026-01-10T10:00Z',3,2)",[claim,cafe,inviter.member,friend.member,code,rule,source]);
 for(const [member,units] of [[inviter.member,3],[friend.member,2]])await client.query("insert into public.ledger_entries(business_id,membership_id,entry_kind,units,purchase_id,referral_claim_id,occurred_at,actor_user_id) values($1,$2,'referral_bonus',$3,$4,$5,'2026-01-10T10:00Z',$6)",[cafe,member,units,source,claim,owner.id]);
 const intent=randomUUID(),redemption=randomUUID();await client.query("insert into public.redemption_intents(id,business_id,membership_id,reward_version_id,token_hash,expires_at,created_by,consumed_at) values($1,$2,$3,$4,$5,'2026-01-10T12:02Z',$6,'2026-01-10T12:00Z')",[intent,cafe,friend.member,rewardVersion,randomBytes(32).toString('hex'),friend.id]);
 await client.query("insert into public.redemptions(id,business_id,membership_id,reward_version_id,intent_id,branch_id,unit_cost,estimated_cost_paisa,fulfilled_at,fulfilled_by,idempotency_key) values($1,$2,$3,$4,$5,$6,4,5000,'2026-01-10T12:00Z',$7,$8)",[redemption,cafe,friend.member,rewardVersion,intent,branches[0],owner.id,randomUUID()]);
 await client.query("insert into public.ledger_entries(business_id,membership_id,entry_kind,units,redemption_id,occurred_at,actor_user_id) values($1,$2,'redemption',-4,$3,'2026-01-10T12:00Z',$4)",[cafe,friend.member,redemption,owner.id]);
 const reversal=randomUUID();await client.query("insert into public.purchase_reversals(id,business_id,purchase_id,reason,actor_user_id,reversed_at,idempotency_key) values($1,$2,$3,'TEST full reversal after reward',$4,'2026-01-12T00:00Z',$5)",[reversal,cafe,source,owner.id,randomUUID()]);
 await client.query("update public.purchases set status='reversed' where id=$1",[source]);await client.query("update public.referral_claims set status='reversed',reversed_at='2026-01-12T00:00Z' where id=$1",[claim]);
 await client.query("insert into public.ledger_entries(business_id,membership_id,entry_kind,units,purchase_id,referral_claim_id,reverses_entry_id,purchase_reversal_id,occurred_at,actor_user_id) select business_id,membership_id,'reversal',-units,purchase_id,referral_claim_id,id,$2,'2026-01-12T00:00Z',$3 from public.ledger_entries where purchase_id=$1 and entry_kind<>'reversal'",[source,reversal,owner.id]);
 await purchase(returning.member,branches[1],'2026-01-08T19:00Z',50000,40000);await purchase(returning.member,branches[0],'2026-01-09T19:00Z',100000,80000);await purchase(returning.member,branches[0],'2026-01-10T18:59:59Z',50000,40000);
 await purchase(returning.member,branches[0],'2026-01-10T12:00Z',10000,0,0);await purchase(returning.member,branches[0],'2026-01-10T13:00Z',0,0,0);
 await purchase(inviter.member,branches[1],'2026-01-10T18:59:59Z',70000,60000);await purchase(inviter.member,branches[0],'2026-01-10T19:00:00Z',90000,70000);
 await test('Phase 7 hand-calculated net sales, nonqualifying denominator, returning history and Karachi midnight boundaries',async()=>{
  const r=await read();assert.equal(r.metrics.recordedSalesPaisa,'160000');assert.equal(r.metrics.eligibleSpendPaisa,'120000');assert.equal(r.metrics.recordedPurchases,4);assert.equal(r.metrics.averageBillPaisa,'40000');assert.equal(r.metrics.purchasingMembers,1);assert.equal(r.metrics.returningMembers,1);assert.equal(r.metrics.returningShare,'100.00');assert.equal(r.metrics.repeatWithinPeriod,1);assert.equal(r.metrics.newMembers,2);
  assert.equal(r.appliedFilters.utcStart,'2026-01-09T19:00:00Z');assert.equal((await read('overview',{branchIds:[]})).metrics.recordedSalesPaisa,'230000');assert.equal(r.rows[0].recordedSalesPaisa,'160000');
 });
 await test('Phase 7 refunded referral and double-slot cohort units net to zero while fulfilled reward and debt remain',async()=>{
  const r=await read('rewards');assert.equal(r.metrics.baseUnits,'2');assert.equal(r.metrics.promotionUnits,'0');assert.equal(r.metrics.referralUnits,'0');assert.equal(r.metrics.redeemedUnits,'4');assert.equal(r.metrics.rewardsFulfilled,1);assert.equal(r.metrics.estimatedCostPaisa,'5000');assert(!('outstandingUnitsCurrent'in r.metrics));
  const all=await read('rewards',{branchIds:[]});assert.equal(all.metrics.adjustmentDebtCurrent,'4');assert.equal(all.metrics.outstandingUnitsCurrent,'5');
  const slots=await read('promotions');assert.equal(slots.rows[0].reversals,1);assert.equal(slots.rows[0].bonusUnits,'0');
  const refs=await read('referrals');assert.equal(refs.metrics.reversed,1);assert.equal(refs.metrics.bonusUnitsIssued,'5');assert.equal(refs.metrics.netBonusUnits,'0');
  const later=await read('rewards',{startDate:'2026-01-12',endDate:'2026-01-12'});assert.equal(later.metrics.purchaseReversalActivity,1);assert.equal(later.metrics.baseUnits,'0');assert.equal(later.rows[0].activityKind,'purchase_reversal');assert.equal(later.rows[0].units,'-7');
  assert.equal((await rpc(owner,'worker_reconcile_balances',[]).catch(()=>null)),null); // worker-only RPC
  const reconciled=(await client.query('select public.worker_reconcile_balances() r')).rows[0].r;assert.equal(reconciled.mismatches,0);
 });
 await test('Phase 7 all tabs empty ranges return N/A and no invented activity',async()=>{
  for(const kind of ['overview','customers','rewards','referrals','promotions','campaigns','staff']){const r=await read(kind,{startDate:'2025-12-01',endDate:'2025-12-01'});assert(r.dataAsOf);assert.equal(r.reportKind,kind);if(kind==='overview'){assert.equal(r.metrics.averageBillPaisa,null);assert.equal(r.metrics.returningShare,null);assert.equal(r.metrics.recordedPurchases,0);}else assert.equal(r.rows.length,0);}
 });
 await test('Phase 7 direct RPC validates range/page/filters and protects tenant, role and branch scope',async()=>{
  for(const extra of [{endDate:'2026-04-10'},{pageSize:101},{cursor:'-1'},{arbitrarySql:'select 1'},{rewardVersionId:rewardVersion},{branchIds:[randomUUID()]}])await assert.rejects(read('overview',extra),e=>['22023','42501'].includes(e.code));
  for(const u of [friend,cashier])await assert.rejects(read('overview',{},u),{code:'42501'});
  await assert.rejects(rpc(owner,'get_report',[(await client.query("select id from public.businesses where slug='fixture-cafe-a'")).rows[0].id,{}]),{code:'42501'});
  await assert.rejects(read('overview',{branchIds:[branches[1]]},manager),{code:'42501'});
  const r=await read('rewards',{branchIds:[]},manager);assert(!('outstandingUnitsCurrent'in r.metrics));assert.deepEqual(r.appliedFilters.branchIds,[branches[0]]);
  for(const table of ['export_requests','export_artifacts','purchases','ledger_entries'])await assert.rejects(rpc(manager,'get_report',[cafe,input('overview')]).then(async()=>{await client.query('begin');try{await client.query('set local role authenticated');await client.query(`select * from public.${table}`);}finally{await client.query('rollback');}}),{code:'42501'});
 });
 await test('Phase 7 presets agree with custom boundaries and direct reads commit shared rate denials',async()=>{
  for(const preset of ['today','last7','last30']){const r=await rpc(owner,'get_report',[cafe,{preset,branchIds:[branches[0]]}]);const same=await read('overview',{startDate:r.appliedFilters.startDate,endDate:r.appliedFilters.endDate});assert.deepEqual(r.metrics,same.metrics);}
  await client.query('delete from public.rate_limit_buckets');for(let i=0;i<30;i++)assert(!(await read()).error);const limited=await read();assert.equal(limited.error.code,'rate_limited');assert(limited.error.retryAfterSeconds>0);
 });
 await test('Phase 7 source totals refresh immediately and actual database query timeout cancels a blocked report',async()=>{
  const blocker=postgres.getPgClient();await blocker.connect();await blocker.query('begin');await blocker.query('lock table public.purchases in access exclusive mode');const began=Date.now();
  try{await assert.rejects(read(),{code:'57014'});assert(Date.now()-began>=4500&&Date.now()-began<8000);}finally{await blocker.query('rollback');await blocker.end();}
  const configs=(await client.query("select proconfig from pg_proc where proname='get_report'")).rows[0].proconfig;assert(configs.includes('statement_timeout=5s'));
  await purchase(returning.member,branches[0],'2026-01-10T14:00Z',30000,20000);assert.equal((await read()).metrics.recordedSalesPaisa,'190000');
 });
 await test('Phase 7 campaign reports count one member and two devices separately and manual opens never imply sent',async()=>{
  const c=(await client.query("select r.campaign_id from public.campaign_recipients r join public.delivery_attempts d on d.campaign_recipient_id=r.id where r.business_id=$1 and r.observed_clicked_at is not null and d.state='provider_accepted' group by r.campaign_id having count(*)=2 limit 1",[base])).rows[0].campaign_id;
  const r=await rpc(owner,'get_report',[base,{reportKind:'campaigns',campaignId:c}]);assert.equal(r.rows.length,1);assert.equal(r.rows[0].deviceAttempts,2);assert.equal(r.rows[0].providerAcceptedDeviceSends,2);assert.equal(r.rows[0].observedClicks,1);assert.equal(r.rows[0].uniqueAudience,1);
  const actual=(await client.query('select count(*) filter(where opened_at is not null)::int opened,count(*) filter(where marked_sent_at is not null)::int sent from public.followup_tasks where business_id=$1',[base])).rows[0];assert.equal(r.metrics.manualTasksOpened,actual.opened);assert.equal(r.metrics.manualTasksStaffMarkedSent,actual.sent);assert(!('delivered' in r.metrics));
 });
 await test('Phase 7 reward estimates remain unknown for missing merchant cost and capped referrals retain the friend policy',async()=>{
  const token=randomUUID(),id=randomUUID();await client.query("insert into public.redemption_intents(id,business_id,membership_id,reward_version_id,token_hash,expires_at,created_by,consumed_at) values($1,$2,$3,$4,$5,'2026-01-10T15:02Z',$6,'2026-01-10T15:00Z')",[token,cafe,returning.member,rewardVersion,randomBytes(32).toString('hex'),returning.id]);
  await client.query("insert into public.redemptions(id,business_id,membership_id,reward_version_id,intent_id,branch_id,unit_cost,fulfilled_at,fulfilled_by,idempotency_key) values($1,$2,$3,$4,$5,$6,4,'2026-01-10T15:00Z',$7,$8)",[id,cafe,returning.member,rewardVersion,token,branches[0],owner.id,randomUUID()]);
  await client.query("insert into public.ledger_entries(business_id,membership_id,entry_kind,units,redemption_id,occurred_at,actor_user_id) values($1,$2,'redemption',-4,$3,'2026-01-10T15:00Z',$4)",[cafe,returning.member,id,owner.id]);
  const r=await read('rewards');assert.equal(r.metrics.rewardsFulfilled,2);assert.equal(r.metrics.costKnownRewards,1);assert.equal(r.metrics.costUnknownRewards,1);assert.equal(r.metrics.estimatedCostPaisa,null);assert.equal(r.metrics.knownEstimatedCostPaisa,'5000');
  const other=await rpc(owner,'get_report',[base,{reportKind:'referrals'}]);assert(other.metrics.capped>=1);assert(other.rows.some(row=>row.inviterSuppression==='monthly_cap'&&row.inviterIssuedUnits==='0'&&Number(row.friendIssuedUnits)>0));
 });
 let exportId,key;const exportArgs=(who=owner,kind='customers',cols=['name','recordedSalesPaisa'],idempotency=randomUUID())=>[cafe,input(kind),JSON.stringify(cols),idempotency,randomUUID()];
 const files=new Map(),encryption={id:'phase7-test',bytes:randomBytes(32)},storage={key:encryption,put:async(path,bytes)=>files.set(path,bytes),sign:async path=>`https://storage.example.invalid/${path}?token=fixture`,remove:async path=>files.delete(path)};
 const pool=new pg.Pool({connectionString:`postgresql://integration_worker:${password}@127.0.0.1:${port}/postgres`,max:2});
 try{
  await test('Phase 7 exports enforce approved columns, no default contacts, combined permissions and owner contact MFA',async()=>{
   await assert.rejects(rpc(owner,'request_report_export',exportArgs(owner,'customers',['phone'])),{code:'22023'});await assert.rejects(rpc(manager,'request_report_export',exportArgs(manager,'contacts',['phone'])),{code:'42501'});
   await assert.rejects(rpc(owner,'request_report_export',exportArgs(owner,'contacts',['phone']),client,'aal1'),{code:'42501'});
   await assert.rejects(rpc(owner,'request_report_export',exportArgs(),client,'aal1'),{code:'42501'});
   await assert.rejects(read('contacts'),{code:'42501'});
  });
  await test('Phase 7 idempotent asynchronous private export processes source rows and formula-safe CSV exactly once',async()=>{
   key=randomUUID();const args=exportArgs(owner,'customers',['name','recordedSalesPaisa'],key);const made=await rpc(owner,'request_report_export',args);exportId=made.exportRequestId;
   assert.equal((await rpc(owner,'request_report_export',args)).exportRequestId,exportId);await assert.rejects(rpc(owner,'request_report_export',exportArgs(owner,'customers',['name'],key)),{code:'40001'});
   const running=await rpc(owner,'request_report_export',exportArgs());assert.equal(running.error.code,'conflict');
   const event=(await client.query("select id from public.outbox_events where event_type='report.export_requested' and event_key=$1",[exportId])).rows[0].id;
   const executions=await Promise.allSettled([processReportExport(pool,event,storage),processReportExport(pool,event,storage)]);assert(executions.some(r=>r.status==='fulfilled'));for(const r of executions)if(r.status==='rejected')assert.equal(r.reason.code,'40001');const status=await rpc(owner,'report_export_status',[cafe,exportId]);assert.equal(status.status,'completed');assert.equal(status.rowCount,3);
   const download=await rpc(owner,'report_export_status',[cafe,exportId,true,randomUUID()]);assert(openSecret(download.ciphertext,encryption,`export:${exportId}`).startsWith('https://storage.example.invalid/'));
   const csv=[...files.values()][0].toString('utf8');assert(csv.includes("'="));assert(!csv.includes('phone'));await processReportExport(pool,event,storage);assert.equal(files.size,1);
   assert.equal((await client.query("select count(*) from public.audit_events where target_id=$1 and action='export.requested'",[exportId])).rows[0].count,'1');
  });
  await test('Phase 7 permission revocation blocks export execution and download; expiry purges private artifacts',async()=>{
   const args=exportArgs(manager),made=await rpc(manager,'request_report_export',args);const event=(await client.query('select id from public.outbox_events where event_key=$1',[made.exportRequestId])).rows[0].id;
   await client.query('delete from public.branch_assignments where business_user_id=$1',[manager.staff]);await processReportExport(pool,event,storage);assert.equal((await client.query('select error_code from public.export_requests where id=$1',[made.exportRequestId])).rows[0].error_code,'permission_revoked');
   await assert.rejects(rpc(manager,'report_export_status',[cafe,made.exportRequestId]),{code:'42501'});
   await client.query('insert into public.branch_assignments values($1,$2,$3)',[cafe,manager.staff,branches[0]]);
   await client.query('begin');await client.query("update public.business_users set role='manager',can_export_reports=false where business_id=$1 and user_id=$2",[cafe,owner.id]);await client.query("update public.business_users set role='owner' where id=$1",[manager.staff]);await client.query('commit');await assert.rejects(rpc(owner,'report_export_status',[cafe,exportId,true,randomUUID()]),{code:'42501'});
   await client.query('begin');await client.query("update public.business_users set role='manager' where id=$1",[manager.staff]);await client.query("update public.business_users set role='owner' where business_id=$1 and user_id=$2",[cafe,owner.id]);await client.query('commit');
   await client.query("update public.export_artifacts set expires_at=now()-interval '1 second' where export_request_id=$1",[exportId]);await purgeReportExports(pool,storage);assert.equal(files.size,0);assert.equal((await rpc(owner,'report_export_status',[cafe,exportId])).status,'expired');
  });
  await test('Phase 7 source pagination is bounded and 10001-row export fails without silently truncating',async()=>{
   await client.query("insert into public.memberships(business_id,display_name,joined_branch_id,joined_at) select $1,'TEST export volume '||n,$2,'2026-01-20T00:00Z' from generate_series(1,10001)n",[cafe,branches[0]]);
   const r=await read('customers',{startDate:'2026-01-21',endDate:'2026-01-21'});assert.equal(r.rows.length,25);assert.equal(r.totalRows,10004);assert.equal(r.nextCursor,'25');
   const next=await read('customers',{startDate:'2026-01-21',endDate:'2026-01-21',cursor:'25'});assert(!next.rows.some(row=>r.rows.some(old=>old.memberId===row.memberId)));
   const made=await rpc(owner,'request_report_export',[cafe,input('customers',{startDate:'2026-01-21',endDate:'2026-01-21'}),JSON.stringify(['qualifyingPurchases']),randomUUID(),randomUUID()]);
   const event=(await client.query('select id from public.outbox_events where event_key=$1',[made.exportRequestId])).rows[0].id;await processReportExport(pool,event,storage);
   assert.equal((await rpc(owner,'report_export_status',[cafe,made.exportRequestId])).errorCode,'narrow_filters');assert.equal(files.size,0);
  });
  await test('Phase 7 concurrent export requests replay one ID without lock upgrades and enforce three hourly attempts',async()=>{
   const connections=[postgres.getPgClient(),postgres.getPgClient()];await Promise.all(connections.map(c=>c.connect()));const args=exportArgs(owner,'overview',['date','purchases'],randomUUID());let made;
   try{made=await Promise.all(connections.map(c=>rpc(owner,'request_report_export',args,c)));}finally{await Promise.all(connections.map(c=>c.end()));}
   assert.equal(made[0].exportRequestId,made[1].exportRequestId);
   for(let i=0;i<2;i++)assert.equal((await rpc(owner,'request_report_export',exportArgs(owner,'overview',['date']))).error.code,'conflict');
   const fourth=await rpc(owner,'request_report_export',exportArgs(owner,'overview',['date']));assert.equal(fourth.error.code,'rate_limited');assert(fourth.error.retryAfterSeconds>0);
   const event=(await client.query('select id from public.outbox_events where event_key=$1',[made[0].exportRequestId])).rows[0].id;
   await pool.query('select public.worker_fail_report_export($1)',[event]);assert.equal((await rpc(owner,'report_export_status',[cafe,made[0].exportRequestId])).errorCode,'temporary_failure');
  });
  await test('Phase 7 real pg-boss consumes the transactional export outbox and commits one private artifact receipt',async()=>{
   await client.query("delete from public.rate_limit_buckets where operation='report.export'");
   const made=await rpc(owner,'request_report_export',exportArgs(owner,'overview',['date','purchases']));
   const runtime=await startWorker({connectionString:`postgresql://integration_worker:${password}@127.0.0.1:${port}/postgres`,ssl:false,exportStorage:storage,onError:()=>{}});
   try{const deadline=Date.now()+25000;let status;do{status=(await client.query('select status from public.export_requests where id=$1',[made.exportRequestId])).rows[0].status;if(status==='completed')break;await new Promise(resolve=>setTimeout(resolve,200));}while(Date.now()<deadline);assert.equal(status,'completed');
    assert.equal((await client.query("select state from public.outbox_events where event_type='report.export_requested' and event_key=$1",[made.exportRequestId])).rows[0].state,'dispatched');
    assert.equal((await client.query("select count(*) from public.job_effect_receipts where handler_name='report-export' and event_key=$1",[made.exportRequestId])).rows[0].count,'1');
   }finally{await runtime.stop();}
  });
 }finally{await pool.end();}
 await test('Phase 7 representative branch/date query uses source index and private RPC grants are closed',async()=>{
  await client.query('analyze public.purchases');await client.query('set enable_seqscan=off');try{const plan=await client.query('explain select sum(recorded_bill_paisa) from public.purchases where business_id=$1 and branch_id=$2 and occurred_at>=$3 and occurred_at<$4',[cafe,branches[0],'2026-01-09T19:00Z','2026-01-10T19:00Z']);assert(plan.rows.some(r=>/reports_purchase_branch_date/u.test(r['QUERY PLAN'])));}finally{await client.query('reset enable_seqscan');}
  await assert.rejects(rpc(friend,'worker_report_export',[randomUUID()]),{code:'42501'});await assert.rejects(rpc(friend,'report_export_status',[cafe,exportId]),{code:'P0002'});
 });
}
