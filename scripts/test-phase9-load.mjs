import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import pg from 'pg';
import { withPhase9Database, phase9Rpc } from './phase9-database.mjs';
import { startWorker } from '../src/worker/runtime.ts';

const smoke = process.argv.includes('--smoke');
const seconds = smoke ? 30 : 900;
const hash = value => createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const percentile = (values, fraction) => [...values].sort((a,b) => a-b)[Math.max(0, Math.ceil(values.length*fraction)-1)] ?? null;
const statistics = values => ({ samples: values.length, p50Ms: percentile(values,.5), p95Ms: percentile(values,.95), maxMs: values.length ? Math.max(...values) : null });
mkdirSync('.local', { recursive: true });
await withPhase9Database(async ({ client, workerUrl, appUrl }) => {
  const cafes = [];
  const policy = (await client.query("insert into public.policy_documents(kind,version,body,published_at) values('push_marketing','phase9-test','TEST ONLY consent wording.',now()) returning id")).rows[0].id;
  for (const kind of ['platform_terms','privacy']) await client.query("insert into public.policy_documents(kind,version,body,published_at) values($1,'phase9-test','TEST ONLY, not legal wording.',now())", [kind]);
  const plan = (await client.query("insert into public.plans(code,name) values('phase9-test','TEST ONLY load plan') returning id")).rows[0].id;
  const pv = (await client.query("insert into public.plan_versions(plan_id,version,price_paisa,billing_period,branch_limit,staff_limit,member_limit,status,published_at) values($1,1,100,'monthly',2,5,2000,'published',now()) returning id", [plan])).rows[0].id;
  for (let i=0;i<10;i++) {
    console.log(`Seeding synthetic cafe ${i+1}/10.`);
    const owner = { id: randomUUID(), session: randomUUID() };
    await client.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [owner.id, `owner-${i}@example.invalid`]);
    await client.query('insert into auth.sessions(id,user_id) values($1,$2)', [owner.session, owner.id]);
    await client.query("insert into public.profiles(user_id,auth_user_id,display_name) values($1,$1,'TEST owner')", [owner.id]);
    const cafe = await phase9Rpc(client, owner, 'bootstrap_business', [{ planVersionId: pv, name: `TEST Load Cafe ${i+1}`, slug: `phase9-load-${i+1}`, accentHex:'#166534', branchName:'TEST main',address:'Fictional test address',city:'Test city',hours:[] }, randomUUID()]);
    const programme = await phase9Rpc(client, owner, 'save_initial_programme', [cafe.businessId, { rowVersion:1,type:'stamps',name:'TEST stamps',minimumSpendPaisa:'100',stampsPerPurchase:1,spendStepPaisa:null,unitsPerStep:null,maxBaseUnitsPerPurchase:1000,terms:'TEST one stamp per qualifying paid visit.',rewardTitle:'TEST coffee',rewardUnitCost:'8',rewardDescription:'',rewardTerms:'TEST collect at this fictional cafe.',rewardBranchIds:[cafe.branchId],estimatedCostPaisa:null },randomUUID()]);
    await phase9Rpc(client, owner, 'publish_business', [cafe.businessId,2,randomUUID()]);
    console.log('Published fixture; inserting membership history.');
    const otherBranch = (await client.query("insert into public.branches(business_id,name,address,city) values($1,'TEST second branch','Fictional second address','Test city') returning id", [cafe.businessId])).rows[0].id;
    const row = { ...cafe, owner, version:programme.programmeVersionId, otherBranch };
    cafes.push(row);
    // Uneven visit frequency (0/5/10/15/20), 90 days of history, two branches,
    // varied bill/eligible amounts and explicitly non-consenting memberships.
    await client.query(`create temporary table seed_members as select n,gen_random_uuid() uid,gen_random_uuid() mid from generate_series(1,1000) n;
      insert into auth.users(id,email,email_confirmed_at) select uid,'load-'||uid||'@example.invalid',now() from seed_members;
      insert into public.profiles(user_id,auth_user_id,display_name) select uid,uid,'TEST customer' from seed_members;`);
    await client.query(`insert into public.memberships(id,business_id,customer_user_id,display_name,joined_branch_id,joined_at)
      select mid,$1,uid,'TEST member '||n,case when n%2=0 then $2::uuid else $3::uuid end,now()-interval '100 days' from seed_members;
      `,[cafe.businessId,cafe.branchId,otherBranch]);
    await client.query(`insert into public.balances(business_id,membership_id) select $1,mid from seed_members;
      `,[cafe.businessId]);
    await client.query(`insert into public.purchases(business_id,branch_id,membership_id,programme_version_id,recorded_bill_paisa,eligible_spend_paisa,base_units,qualifying_purchase_confirmed,qualifies_for_loyalty,occurred_at,staff_user_id,idempotency_key,request_hash)
      select $1,case when m.n%2=0 then $2::uuid else $3::uuid end,m.mid,$4,50000+(m.n%20)*10000,40000+(m.n%20)*10000,1,true,true,now()-make_interval(days=>1+((m.n+j)%89)), $5,gen_random_uuid()::text,repeat('a',64)
      from seed_members m cross join lateral generate_series(1,(m.n%5)*5) j`,[cafe.businessId,cafe.branchId,otherBranch,row.version,owner.id]);
    console.log('Inserting ledger history.');
    await client.query(`insert into public.ledger_entries(business_id,membership_id,entry_kind,units,purchase_id,occurred_at,actor_user_id)
      select business_id,membership_id,'purchase_base',1,id,occurred_at,staff_user_id from public.purchases where business_id=$1`,[cafe.businessId]);
    await client.query(`update public.memberships m set last_qualifying_purchase_at=p.latest from (select membership_id,max(occurred_at) latest from public.purchases where business_id=$1 group by membership_id) p where m.id=p.membership_id`,[cafe.businessId]);
    await client.query(`insert into public.consent_preferences(business_id,membership_id,channel,purpose,allowed,text_version,changed_at,source,policy_document_id)
      select $1,mid,'push','marketing',true,'phase9-test',now(),'customer_settings',$2 from seed_members where n%3=0`,[cafe.businessId,policy]);
    row.members = (await client.query('select mid id from seed_members order by n')).rows.map(member=>({...member,handle:`LOYALTY:EARN:v1:${randomBytes(32).toString('base64url')}`}));
    await client.query(`insert into public.membership_handles(business_id,membership_id,handle_hash,handle_ciphertext,encryption_key_id,status)
      select $1,id,hash,'TEST encrypted fixture','TEST key','active' from jsonb_to_recordset($2) as x(id uuid,hash text)`,[cafe.businessId,JSON.stringify(row.members.map(m=>({id:m.id,hash:hash(m.handle)})))]);
    await client.query('drop table seed_members');
  }
  await client.query('analyze');
  assert.equal((await client.query('select count(*) from public.purchases')).rows[0].count,'100000');
  assert.equal((await client.query('select count(*) from public.memberships')).rows[0].count,'10000');
  const app = new pg.Pool({connectionString:appUrl,max:16,connectionTimeoutMillis:5000});
  const rpc = async (user,name,args) => { const connection=await app.connect();try{return await phase9Rpc(connection,user,name,args);}finally{connection.release();} };
  const errors=[],workerErrors=[],commits=[],checkoutTimes=[],commitTimes=[],reportTimes=[],lag=[];
  let worker, stopped=false;
  try {
    // Initialize pg-boss once as the restricted worker; load uses the actual
    // bounded Vercel consumer. No Firebase credentials/transport are loaded.
    worker=await startWorker({connectionString:workerUrl,ssl:false,onError:code=>workerErrors.push(code)});await worker.stop();
    worker=await startWorker({connectionString:workerUrl,ssl:false,onError:code=>workerErrors.push(code)},{bounded:true});
    const campaign = async index => {
      const cafe=cafes[index%cafes.length];
      const draft=await rpc(cafe.owner,'save_campaign',[cafe.businessId,{name:'TEST load campaign',title:'TEST cafe news',body:'TEST synthetic campaign; no external sender.',destination:'card',offerId:null,audience:'all_opted_in',inactiveDays:null,nearRewardUnits:null,targetRewardVersionId:null,branchIds:[cafe.branchId,cafe.otherBranch],expiresAt:new Date(Date.now()+3600000).toISOString()},randomUUID()]);
      await rpc(cafe.owner,'schedule_campaign',[cafe.businessId,draft.campaignId,draft.rowVersion,new Date().toISOString(),randomUUID(),randomUUID()]);
    };
    for(let i=0;i<10;i++) await campaign(i);
    const workerLoop=(async()=>{while(!stopped){await worker.runBatch();await sleep(1000);}})();
    const started=performance.now();
    const run = async (interval,count,action) => {
      const pending=[];
      for(let i=0;i<count;i++) {
        const due=started+i*interval;await sleep(Math.max(0,due-performance.now()));
        lag.push(Math.max(0,performance.now()-due));
        pending.push(action(i).catch(e=>errors.push({operation:action.name,code:e.code??e.name})));
      }
      await Promise.all(pending);
    };
    async function checkout(index) {
      const cafe=cafes[index%10], member=cafe.members[Math.floor(index/10)%1000];
      const context=hash(randomBytes(32));
      const begin=performance.now(),input={recordedBillPaisa:'100000',eligibleSpendPaisa:'80000',qualifyingPurchaseConfirmed:true,receiptReference:`LOAD-${index}`};
      await rpc(cafe.owner,'resolve_scanner',[cafe.businessId,cafe.branchId,'earningHandle',member.handle,context]);
      const preview=await rpc(cafe.owner,'preview_purchase',[context,input]);
      const body={...input,expectedEffectHash:preview.expectedEffectHash,idempotencyKey:randomUUID()};
      const committing=performance.now();
      const result=await rpc(cafe.owner,'record_purchase',[context,body,randomUUID()]);
      commitTimes.push(performance.now()-committing);checkoutTimes.push(performance.now()-begin);
      assert.equal(result.baseUnits,'1');commits.push({cafe,context,body,result});
    }
    async function report(index) {
      const cafe=cafes[index%10],begin=performance.now();
      const result=await rpc(cafe.owner,'get_report',[cafe.businessId,{reportKind:['overview','customers','rewards','referrals','promotions','campaigns','staff'][index%7],preset:'last30',branchIds:[],pageSize:25}]);
      reportTimes.push(performance.now()-begin);assert(result.dataAsOf);
    }
    console.log(`Starting ${seconds}s mixed load: 10 cafes / 10,000 memberships / 100,000 purchases; 5 checkouts/s, 25 reports/min; local SQL boundary.`);
    const progress=setInterval(()=>console.log(`Load ${Math.floor((performance.now()-started)/1000)}s: ${commits.length} commits, ${reportTimes.length} reports, ${errors.length} errors.`),60000);
    try {
      await Promise.all([run(200,seconds*5,checkout),run(2400,Math.ceil(seconds*25/60),report),run(60000,Math.ceil(seconds/60),async function schedule(index){await campaign(index);})]);
      await sleep(Math.max(0,seconds*1000-(performance.now()-started)));
    } finally { clearInterval(progress);stopped=true;await workerLoop; }
    // Replayed commits must retain the same receipt without changing value.
    for(const item of commits.filter((_,i)=>i%100===0)) {
      const replay=await rpc(item.cafe.owner,'record_purchase',[item.context,item.body,randomUUID()]);
      assert.equal(replay.purchaseId,item.result.purchaseId);assert.equal(replay.replayed,true);
    }
    const mismatch=(await client.query(`select count(*) n from public.balances b left join (select membership_id,sum(units) units from public.ledger_entries group by membership_id) l on l.membership_id=b.membership_id where b.units<>coalesce(l.units,0)`)).rows[0].n;
    const count=Number((await client.query('select count(*) from public.purchases')).rows[0].count);
    const events=Number((await client.query("select count(*) from public.outbox_events where event_type='loyalty.record_purchase'")).rows[0].count);
    const queue=(await client.query("select name,state,count(*)::int count from pgboss.job group by name,state order by name,state")).rows;
    const plans=(await client.query("explain (analyze,buffers,format json) select * from public.purchases where business_id=$1 and branch_id=$2 and occurred_at>=now()-interval '30 days' order by occurred_at desc,id desc limit 25",[cafes[0].businessId,cafes[0].branchId])).rows[0]['QUERY PLAN'];
    const result={mode:smoke?'smoke':'acceptance',boundary:'Local PostgreSQL authenticated RPC + actual pg-boss bounded worker; no HTTPS/FCM/mobile evidence',date:new Date().toISOString(),seconds,seed:{cafes:10,memberships:10000,purchases:100000},machine:{platform:process.platform,node:process.version,cpu:cpus()[0]?.model,logicalCpus:cpus().length,memoryGiB:Math.round(totalmem()/2**30)},checkout:statistics(checkoutTimes),commit:statistics(commitTimes),report:statistics(reportTimes),scheduleLag:statistics(lag),errors,workerErrors,committed:commits.length,purchaseCount:count,balanceMismatches:Number(mismatch),purchaseOutboxEvents:events,queue,plans};
    result.passed=errors.length===0&&workerErrors.length===0&&commits.length===seconds*5&&reportTimes.length===Math.ceil(seconds*25/60)&&count===100000+commits.length&&events===commits.length&&mismatch==='0'&&queue.some(job=>job.name==='campaign-scan'&&job.state==='completed'&&job.count>0)&&result.checkout.p95Ms<=1000&&result.report.p95Ms<=2000;
    writeFileSync(`.local/phase9-load-${smoke?'smoke':'acceptance'}.json`,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({passed:result.passed,checkout:result.checkout,report:result.report,committed:result.committed,balanceMismatches:result.balanceMismatches,errors:result.errors,workerErrors:result.workerErrors}));
    assert(result.passed,'Mixed-load acceptance failed; inspect .local/phase9-load evidence.');
  } finally { stopped=true;if(worker)await worker.stop();await app.end(); }
});
console.log('Phase 9 isolated database and worker cleanup completed.');
