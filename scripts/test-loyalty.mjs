import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const hash = text => createHash('sha256').update(text).digest('hex');
const token = () => randomBytes(32).toString('base64url');

export async function testLoyalty({ client, postgres, test }) {
  const cafe = (await client.query("select id from public.businesses where slug='phase2-a'")).rows[0].id;
  const owner = (await client.query("select u.user_id,u.role,s.id as session_id from public.business_users u join auth.sessions s on s.user_id=u.user_id where u.business_id=$1 and u.role='owner' and u.status='active' limit 1",[cafe])).rows[0];
  const member = (await client.query('select id,customer_user_id from public.memberships where business_id=$1 and status=$2 limit 1',[cafe,'active'])).rows[0];
  const customerSession = (await client.query('select id from auth.sessions where user_id=$1 limit 1',[member.customer_user_id])).rows[0].id;
  const reward = (await client.query('select published_version_id from public.rewards where business_id=$1 and status=$2 limit 1',[cafe,'published'])).rows[0].published_version_id;
  const branch = (await client.query('select branch_id from public.reward_branches where business_id=$1 and reward_version_id=$2 limit 1',[cafe,reward])).rows[0].branch_id;
  const user = (id, sessionId) => ({ id, sessionId });
  const ownerUser = user(owner.user_id,owner.session_id), customer = user(member.customer_user_id,customerSession);
  const as = async (who, name, args=[], connection=client, aal='aal2') => {
    await connection.query('begin');
    try {
      await connection.query('set local role authenticated');
      await connection.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
        [who.id,JSON.stringify({ sub:who.id,session_id:who.sessionId,aal,amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)}] })]);
      const result = await connection.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,args);
      await connection.query('commit');return result.rows[0].result;
    } catch(error){await connection.query('rollback');throw error;}
  };
  await test('Phase 3 mode drafts preserve live rules and switch only before the first ledger entry',async()=>{
    const first=await as(ownerUser,'loyalty_configuration',[cafe]);
    const points=await as(ownerUser,'save_programme_version',[cafe,{rowVersion:first.programme.rowVersion,name:'Test points before earning',
      type:'points',minimumSpendPaisa:'0',stampsPerPurchase:null,spendStepPaisa:'100',unitsPerStep:2,
      maxBaseUnitsPerPurchase:10,terms:'TEST ONLY: switch before any member earns.',effectiveAt:new Date(Date.now()+86400000).toISOString()},randomUUID()]);
    assert.equal((await as(customer,'customer_card',[member.id])).programmeType,'stamps');
    assert.equal((await as(ownerUser,'loyalty_configuration',[cafe])).programme.name,first.programme.name);
    const activated=await as(ownerUser,'publish_programme_version',[cafe,points.programmeVersionId,points.rowVersion,randomUUID()]);
    assert(Math.abs(new Date(activated.effectiveAt).getTime()-Date.now())<60000);
    assert.equal((await as(customer,'customer_card',[member.id])).programmeType,'points');
    const current=await as(ownerUser,'loyalty_configuration',[cafe]);
    assert.equal(current.programme.name,'Test points before earning');
    const stamps=await as(ownerUser,'save_programme_version',[cafe,{rowVersion:current.programme.rowVersion,name:'Test stamps before earning',
      type:'stamps',minimumSpendPaisa:'0',stampsPerPurchase:1,spendStepPaisa:null,unitsPerStep:null,
      maxBaseUnitsPerPurchase:10,terms:'TEST ONLY: return to one stamp before earning.',effectiveAt:new Date(Date.now()+86400000).toISOString()},randomUUID()]);
    assert.equal((await as(customer,'customer_card',[member.id])).programmeType,'points');
    assert.equal((await as(ownerUser,'loyalty_configuration',[cafe])).programme.name,'Test points before earning');
    await as(ownerUser,'publish_programme_version',[cafe,stamps.programmeVersionId,stamps.rowVersion,randomUUID()]);
    assert.equal((await as(customer,'customer_card',[member.id])).programmeType,'stamps');
    assert.equal((await as(ownerUser,'loyalty_configuration',[cafe])).programme.name,'Test stamps before earning');
  });
  const handle = `LOYALTY:EARN:v1:${token()}`;
  await test('Phase 3 encrypted handle storage, tenant-scoped lookup and one-use context',async()=>{
    const created = await as(customer,'set_membership_handle',[member.id,hash(handle),'fixture-ciphertext','fixture-key',false,randomUUID()]);
    assert.equal(created.created,true);
    const same = await as(customer,'set_membership_handle',[member.id,hash(`LOYALTY:EARN:v1:${token()}`),'other-ciphertext','fixture-key',false,randomUUID()]);
    assert.equal(same.id,created.id);
    const foreign = (await client.query("select id from public.businesses where slug='phase2-b'")).rows[0].id;
    await assert.rejects(as(ownerUser,'resolve_scanner',[foreign,branch,'earningHandle',handle,hash(token())]),{code:'P0002'});
    await assert.rejects(as(ownerUser,'resolve_scanner',[cafe,branch,'earningHandle',handle,hash(token())],client,'aal1'),{code:'42501'});
    await assert.rejects(as(ownerUser,'customer_card',[member.id]),{code:'P0002'});
  });
  const lookup = async (raw,kind='earningHandle') => {
    const context = token();
    const resolved = await as(ownerUser,'resolve_scanner',[cafe,branch,kind,raw,hash(context)]);
    assert.equal(resolved.businessId,cafe);
    return context;
  };
  await test('Phase 3 expired typed lookup returns no checkout context',async()=>{
    const code='ABCDEFGH';
    await as(customer,'create_scanner_code',[member.id,'membership_lookup',null,hash(code)]);
    await client.query("update public.scanner_codes set expires_at=now()-interval '1 second' where code_hash=$1",[hash(code)]);
    const result=await as(ownerUser,'resolve_scanner',[cafe,branch,'typedCode',code,hash(token())]);
    assert.equal(result.error.code,'expired');
  });
  await test('Phase 3 owner example uses the purchase earning calculator',async()=>{
    const version=(await client.query(`select p.type,v.minimum_spend_paisa,v.stamps_per_purchase,v.spend_step_paisa,v.units_per_step,v.max_base_units_per_purchase
      from public.loyalty_programmes p join public.programme_versions v on v.programme_id=p.id
      where p.business_id=$1 and v.status='published' order by v.effective_at desc limit 1`,[cafe])).rows[0];
    const example=await as(ownerUser,'preview_programme_example',[cafe,version.type,version.minimum_spend_paisa,
      version.stamps_per_purchase,version.spend_step_paisa,version.units_per_step,version.max_base_units_per_purchase,500]);
    assert.equal(example.baseUnits,'1');
    const capped=await as(ownerUser,'preview_programme_example',[cafe,'points',0,null,100,2,4,1000]);
    assert.equal(capped.rawBaseUnits,'20');assert.equal(capped.baseUnits,'4');assert.equal(capped.capReduced,true);
    await assert.rejects(as(customer,'preview_programme_example',[cafe,'stamps',0,1,null,null,10,500]),{code:'42501'});
  });
  let firstPurchase, firstContext;
  await test('Phase 3 purchase preview, commit, replay and ledger reconciliation',async()=>{
    firstContext = await lookup(handle);
    const input={recordedBillPaisa:'500',eligibleSpendPaisa:'500',qualifyingPurchaseConfirmed:true,receiptReference:'TEST-1'};
    const effect = await as(ownerUser,'preview_purchase',[hash(firstContext),input]);
    assert.equal(effect.baseUnits,'1');
    assert.equal(effect.qualifiesForLoyalty,true);
    const body={...input,expectedEffectHash:effect.expectedEffectHash,idempotencyKey:randomUUID()};
    firstPurchase=await as(ownerUser,'record_purchase',[hash(firstContext),body,randomUUID()]);
    assert.equal(firstPurchase.baseUnits,'1');
    assert.equal(firstPurchase.balanceAfterAtCommit,'1');
    const replay=await as(ownerUser,'record_purchase',[hash(firstContext),body,randomUUID()]);
    assert.equal(replay.purchaseId,firstPurchase.purchaseId);assert.equal(replay.replayed,true);
    await assert.rejects(as(ownerUser,'record_purchase',[hash(firstContext),{...body,eligibleSpendPaisa:'400'},randomUUID()]),{code:'23505'});
    assert.equal((await as(ownerUser,'reconcile_balances',[cafe])).mismatches,0);
    const result=await as(ownerUser,'get_value_result',[cafe,'record_purchase',body.idempotencyKey]);
    assert.equal(result.result.purchaseId,firstPurchase.purchaseId);
  });
  await test('Phase 3 zero earn writes no ledger and paid amount bounds are authoritative',async()=>{
    const context=await lookup(handle);
    const input={recordedBillPaisa:'0',eligibleSpendPaisa:'0',qualifyingPurchaseConfirmed:true};
    const effect=await as(ownerUser,'preview_purchase',[hash(context),input]);
    assert.equal(effect.baseUnits,'0');
    const result=await as(ownerUser,'record_purchase',[hash(context),{...input,expectedEffectHash:effect.expectedEffectHash,idempotencyKey:randomUUID()},randomUUID()]);
    assert.equal(result.ledgerVersion,'1');
    await assert.rejects(as(ownerUser,'preview_purchase',[hash(context),{...input,recordedBillPaisa:'100000001'}]),{code:'22023'});
  });
  await test('Phase 3 adjustment requires owner MFA and preserves ledger sum',async()=>{
    const before=(await as(customer,'customer_card',[member.id])).ledgerVersion;
    await assert.rejects(as(ownerUser,'adjust_units',[cafe,member.id,7,'TEST ONLY: correct missing visit',before,randomUUID(),randomUUID()],client,'aal1'),{code:'42501'});
    const adjusted=await as(ownerUser,'adjust_units',[cafe,member.id,7,'TEST ONLY: correct missing visit',before,randomUUID(),randomUUID()]);
    assert.equal(adjusted.balanceAfterAtCommit,'8');
    assert.equal((await as(ownerUser,'reconcile_balances',[cafe])).mismatches,0);
  });
  await test('Phase 3 configurable intent expiry and replacement preserve customer-only status',async()=>{
    await client.query('update app_private.loyalty_settings set redemption_intent_ttl_seconds=90 where singleton=true');
    const first=await as(customer,'create_redemption_intent',[member.id,reward,hash(`LOYALTY:REDEEM:v1:${token()}`),randomUUID()]);
    assert(first.intentId,JSON.stringify(first));
    const ttl=(new Date(first.expiresAt).getTime()-Date.now())/1000;
    assert(ttl>60&&ttl<=92,`Expected approximately 90 seconds; observed ${ttl}`);
    assert.equal((await as(customer,'customer_intent_status',[first.intentId])).status,'active');
    await assert.rejects(as(ownerUser,'customer_intent_status',[first.intentId]),{code:'P0002'});
    const replacement=await as(customer,'create_redemption_intent',[member.id,reward,hash(`LOYALTY:REDEEM:v1:${token()}`),randomUUID()]);
    assert.equal((await as(customer,'customer_intent_status',[first.intentId])).status,'canceled');
    assert.equal((await as(customer,'customer_intent_status',[replacement.intentId])).status,'active');
    await as(customer,'cancel_redemption_intent',[replacement.intentId]);
    await client.query('update app_private.loyalty_settings set redemption_intent_ttl_seconds=120 where singleton=true');
  });
  let redemption;
  await test('Phase 3 intent only selects published reward and one finalize debits once',async()=>{
    const raw=`LOYALTY:REDEEM:v1:${token()}`;
    const intent=await as(customer,'create_redemption_intent',[member.id,reward,hash(raw),randomUUID()]);
    assert.equal(intent.unitCost,'8');
    assert.equal((await as(customer,'customer_intent_status',[intent.intentId])).status,'active');
    const context=await lookup(raw,'redemptionIntent');
    const effect=await as(ownerUser,'preview_redemption',[hash(context)]);
    assert.equal(effect.balanceAfter,'0');
    const key=randomUUID();
    redemption=await as(ownerUser,'finalize_redemption',[hash(context),effect.expectedEffectHash,key,randomUUID()]);
    assert.equal(redemption.balanceAfterAtCommit,'0');
    const customerResult=await as(customer,'customer_intent_status',[intent.intentId]);
    const currentBranchName=(await client.query('select name from public.branches where id=$1',[branch])).rows[0].name;
    assert.equal(customerResult.status,'fulfilled');assert.equal(customerResult.balance,'0');assert.equal(customerResult.branchName,currentBranchName);
    assert((await as(customer,'customer_card',[member.id])).rewards.some(item=>item.id===reward&&item.eligibleBranches.includes(currentBranchName)));
    const replay=await as(ownerUser,'finalize_redemption',[hash(context),effect.expectedEffectHash,key,randomUUID()]);
    assert.equal(replay.redemptionId,redemption.redemptionId);assert.equal(replay.replayed,true);
    await assert.rejects(as(ownerUser,'finalize_redemption',[hash(context),effect.expectedEffectHash,randomUUID(),randomUUID()]),{code:'P0001'});
    assert.equal((await as(ownerUser,'reconcile_balances',[cafe])).mismatches,0);
  });
  await test('Phase 3 full refund after spend creates visible debt and blocks new redemption',async()=>{
    const before=(await as(customer,'customer_card',[member.id])).ledgerVersion;
    const reversed=await as(ownerUser,'reverse_purchase',[cafe,firstPurchase.purchaseId,'TEST ONLY: full purchase refund',before,randomUUID(),randomUUID()]);
    assert.equal(reversed.balanceAfterAtCommit,'-1');
    assert.equal((await as(customer,'create_redemption_intent',[member.id,reward,hash(`LOYALTY:REDEEM:v1:${token()}`),randomUUID()])).error.code,'insufficient_balance');
    assert.equal((await as(ownerUser,'reconcile_balances',[cafe])).mismatches,0);
    assert.equal((await as(customer,'customer_card',[member.id])).units,'-1');
  });
  await test('Phase 3 concurrent checkout replay cannot award a scan twice',async()=>{
    const context=await lookup(handle);
    const input={recordedBillPaisa:'250',eligibleSpendPaisa:'250',qualifyingPurchaseConfirmed:true};
    const preview=await as(ownerUser,'preview_purchase',[hash(context),input]);
    const attempts=await Promise.allSettled(Array.from({length:2},async()=>{
      const conn=postgres.getPgClient();await conn.connect();
      try{return await as(ownerUser,'record_purchase',[hash(context),{...input,expectedEffectHash:preview.expectedEffectHash,idempotencyKey:randomUUID()},randomUUID()],conn);}
      finally{await conn.end();}
    }));
    assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
    assert.equal((await as(customer,'customer_card',[member.id])).units,'0');
    assert.equal((await as(ownerUser,'reconcile_balances',[cafe])).mismatches,0);
  });
  await test('Phase 3 two concurrent redemption contexts consume one intent only',async()=>{
    const before=(await as(customer,'customer_card',[member.id])).ledgerVersion;
    await as(ownerUser,'adjust_units',[cafe,member.id,8,'TEST ONLY: restore eight eligible units',before,randomUUID(),randomUUID()]);
    const raw=`LOYALTY:REDEEM:v1:${token()}`;
    await as(customer,'create_redemption_intent',[member.id,reward,hash(raw),randomUUID()]);
    const contexts=[await lookup(raw,'redemptionIntent'),await lookup(raw,'redemptionIntent')];
    const previews=await Promise.all(contexts.map(c=>as(ownerUser,'preview_redemption',[hash(c)])));
    const attempts=await Promise.allSettled(contexts.map(async(c,i)=>{
      const conn=postgres.getPgClient();await conn.connect();
      try{return await as(ownerUser,'finalize_redemption',[hash(c),previews[i].expectedEffectHash,randomUUID(),randomUUID()],conn);}
      finally{await conn.end();}
    }));
    assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
    assert.equal((await as(customer,'customer_card',[member.id])).units,'0');
    assert.equal((await as(ownerUser,'reconcile_balances',[cafe])).mismatches,0);
  });
  await test('Phase 3 activity scope and outbox receipts exclude unauthorized direct reads',async()=>{
    const end=new Date(Date.now()+86400000).toISOString().slice(0,10),since=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
    await assert.rejects(as(customer,'staff_activity',[cafe,null,'all',since,end,25,0]),{code:'42501'});
    const rows=await as(ownerUser,'staff_activity',[cafe,null,'all',since,end,25,0]);
    assert.ok(rows.rows.some(row=>row.id===firstPurchase.purchaseId));
    const reversals=await as(ownerUser,'staff_activity',[cafe,null,'reversal',since,end,25,0]);
    assert.ok(reversals.rows.some(row=>row.id===firstPurchase.purchaseId&&row.type==='reversal'));
    const detail=await as(ownerUser,'staff_activity_detail',[cafe,'purchase',firstPurchase.purchaseId]);
    assert.equal(detail.source.status,'reversed');
    await assert.rejects(as(customer,'reconcile_balances',[cafe]),{code:'42501'});
    const event=(await client.query("select id from public.outbox_events where business_id=$1 and event_type='loyalty.record_purchase' limit 1",[cafe])).rows[0].id;
    const worker=postgres.getPgClient();await worker.connect();
    try{await worker.query('set role loyalty_worker');await worker.query('select public.worker_observe_loyalty($1)',[event]);
      assert.equal((await worker.query('select public.worker_observe_loyalty($1) as result',[event])).rows[0].result,false);}
    finally{await worker.end();}
  });
  await test('Phase 3 future programme and additive reward versions preserve published commitments',async()=>{
    const configuration=await as(ownerUser,'loyalty_configuration',[cafe]);
    await assert.rejects(as(ownerUser,'save_programme_version',[cafe,{rowVersion:configuration.programme.rowVersion,name:'Illegal mode switch',
      type:'points',minimumSpendPaisa:'0',stampsPerPurchase:null,spendStepPaisa:'100',unitsPerStep:1,
      maxBaseUnitsPerPurchase:10,terms:'TEST ONLY: no mode change after ledger entry.',effectiveAt:new Date(Date.now()+86400000).toISOString()},randomUUID()]),{code:'23514'});
    const effectiveAt=new Date(Date.now()+86400000).toISOString();
    const draft=await as(ownerUser,'save_programme_version',[cafe,{
      rowVersion:configuration.programme.rowVersion,name:'Updated test stamps',type:'stamps',minimumSpendPaisa:'200',
      stampsPerPurchase:2,spendStepPaisa:null,unitsPerStep:null,maxBaseUnitsPerPurchase:1000,
      terms:'TEST ONLY: two stamps for a qualifying paid visit.',effectiveAt},randomUUID()]);
    const published=await as(ownerUser,'publish_programme_version',[cafe,draft.programmeVersionId,draft.rowVersion,randomUUID()]);
    assert.equal(published.programmeVersionId,draft.programmeVersionId);
    assert.equal((await client.query('select programme_version_id from public.purchases where id=$1',[firstPurchase.purchaseId])).rows[0].programme_version_id,
      firstPurchase.programmeVersionId);
    const rewardDraft=await as(ownerUser,'save_reward_draft',[cafe,{title:'Test additive treat',unitCost:2,description:'',
      terms:'TEST ONLY: redeem at the selected branch.',estimatedCostPaisa:null,branchIds:[branch]},randomUUID()]);
    await as(ownerUser,'publish_reward',[cafe,rewardDraft.rewardId,rewardDraft.rowVersion,randomUUID()]);
    const card=await as(customer,'customer_card',[member.id]);
    assert.ok(card.rewards.some(item=>item.id===rewardDraft.rewardVersionId));
    await assert.rejects(client.query('update public.reward_versions set unit_cost=4 where id=$1',[reward]),{code:'42501'});
    assert.equal((await as(ownerUser,'reconcile_balances',[cafe])).mismatches,0);
  });
  await test('Phase 3 points use integer steps, cap, and zero-base qualification',async()=>{
    const pointsCafe=randomUUID(),pointsBranch=randomUUID(),pointsProgramme=randomUUID(),pointsReward=randomUUID(),pointsMember=randomUUID();
    const planVersion=(await client.query('select plan_version_id from public.subscriptions where business_id=$1',[cafe])).rows[0].plan_version_id;
    await client.query('begin');
    try{
      await client.query("insert into public.businesses(id,slug,display_name,status,created_by,published_at) values($1,'phase3-points','Phase 3 Points','active',$2,now())",[pointsCafe,ownerUser.id]);
      await client.query("insert into public.business_users(business_id,user_id,staff_display_name,staff_email,role) values($1,$2,'Points owner','points-owner@example.invalid','owner')",[pointsCafe,ownerUser.id]);
      await client.query("insert into public.branches(id,business_id,name,address,city) values($1,$2,'Points branch','Fictional test address','Lahore')",[pointsBranch,pointsCafe]);
      await client.query("insert into public.subscriptions(business_id,plan_version_id,status,period_start,period_end,billing_anchor_at) values($1,$2,'trial',now(),now()+interval '14 days',now())",[pointsCafe,planVersion]);
      await client.query("insert into public.loyalty_programmes(id,business_id,type,status,name) values($1,$2,'points','published','Test points')",[pointsProgramme,pointsCafe]);
      await client.query("insert into public.programme_versions(business_id,programme_id,version,status,effective_at,published_at,minimum_spend_paisa,spend_step_paisa,units_per_step,max_base_units_per_purchase,terms,created_by) values($1,$2,1,'published',now()-interval '1 minute',now()-interval '1 minute',100,300,2,5,'TEST ONLY: two points per three rupees.',$3)",[pointsCafe,pointsProgramme,ownerUser.id]);
      await client.query("insert into public.rewards(id,business_id,programme_id,name) values($1,$2,$3,'Points treat')",[pointsReward,pointsCafe,pointsProgramme]);
      const rewardVersion=(await client.query("insert into public.reward_versions(business_id,reward_id,version,unit_cost,title,description,terms,created_by) values($1,$2,1,4,'Points treat','','TEST ONLY: redeem at points branch.',$3) returning id",[pointsCafe,pointsReward,ownerUser.id])).rows[0].id;
      await client.query('insert into public.reward_branches(business_id,reward_version_id,branch_id) values($1,$2,$3)',[pointsCafe,rewardVersion,pointsBranch]);
      await client.query("update public.rewards set status='published',published_version_id=$1 where id=$2",[rewardVersion,pointsReward]);
      await client.query("insert into public.memberships(id,business_id,customer_user_id,display_name,joined_branch_id) values($1,$2,$3,'Points member',$4)",[pointsMember,pointsCafe,customer.id,pointsBranch]);
      await client.query('insert into public.balances(business_id,membership_id) values($1,$2)',[pointsCafe,pointsMember]);
      await client.query('commit');
    }catch(error){await client.query('rollback');throw error;}
    const pointsHandle=`LOYALTY:EARN:v1:${token()}`;
    await as(customer,'set_membership_handle',[pointsMember,hash(pointsHandle),'fixture-ciphertext','fixture-key',false,randomUUID()]);
    const newContext=async()=>{const context=token();await as(ownerUser,'resolve_scanner',[pointsCafe,pointsBranch,'earningHandle',pointsHandle,hash(context)]);return context;};
    const first=await newContext();
    const capped=await as(ownerUser,'preview_purchase',[hash(first),{recordedBillPaisa:'1000',eligibleSpendPaisa:'1000',qualifyingPurchaseConfirmed:false}]);
    assert.equal(capped.baseUnits,'5');assert.equal(capped.capReduced,true);
    await as(ownerUser,'record_purchase',[hash(first),{recordedBillPaisa:'1000',eligibleSpendPaisa:'1000',qualifyingPurchaseConfirmed:false,
      expectedEffectHash:capped.expectedEffectHash,idempotencyKey:randomUUID()},randomUUID()]);
    const second=await newContext();
    const small=await as(ownerUser,'preview_purchase',[hash(second),{recordedBillPaisa:'200',eligibleSpendPaisa:'200',qualifyingPurchaseConfirmed:false}]);
    assert.equal(small.qualifiesForLoyalty,true);assert.equal(small.baseUnits,'0');
    assert.equal((await as(ownerUser,'reconcile_balances',[pointsCafe])).mismatches,0);
  });
  await test('Phase 3 cashier checkout loses authority immediately on role revocation',async()=>{
    const row=(await client.query("select id,user_id,row_version from public.business_users where business_id=$1 and role='cashier' and status='revoked' limit 1",[cafe])).rows[0];
    const sessionId=randomUUID();await client.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,row.user_id]);
    await client.query("update public.business_users set status='active',row_version=row_version+1 where id=$1",[row.id]);
    const cashier=user(row.user_id,sessionId),context=token();
    const resolved=await as(cashier,'resolve_scanner',[cafe,branch,'earningHandle',handle,hash(context)],client,'aal1');
    assert.equal(resolved.kind,'earning');
    const fields={recordedBillPaisa:'300',eligibleSpendPaisa:'300',qualifyingPurchaseConfirmed:true};
    const preview=await as(cashier,'preview_purchase',[hash(context),fields],client,'aal1');
    const version=(await client.query('select row_version from public.business_users where id=$1',[row.id])).rows[0].row_version;
    await as(ownerUser,'manage_staff',[cafe,{id:row.id,rowVersion:version,action:'revoke'},randomUUID()]);
    await assert.rejects(as(cashier,'record_purchase',[hash(context),{...fields,expectedEffectHash:preview.expectedEffectHash,idempotencyKey:randomUUID()},randomUUID()],client,'aal1'),{code:'42501'});
    assert.equal((await as(ownerUser,'reconcile_balances',[cafe])).mismatches,0);
  });
  await test('Phase 3 paused earning preserves earned reward redemption',async()=>{
    const current=await as(customer,'customer_card',[member.id]);
    await as(ownerUser,'adjust_units',[cafe,member.id,2,'TEST ONLY: restore two eligible units',current.ledgerVersion,randomUUID(),randomUUID()]);
    const config=await as(ownerUser,'loyalty_configuration',[cafe]);
    await as(ownerUser,'set_programme_status',[cafe,'paused',config.programme.rowVersion,randomUUID()]);
    const purchaseContext=await lookup(handle);
    await assert.rejects(as(ownerUser,'preview_purchase',[hash(purchaseContext),{recordedBillPaisa:'300',eligibleSpendPaisa:'300',qualifyingPurchaseConfirmed:true}]),{code:'42501'});
    const pausedCard=await as(customer,'customer_card',[member.id]);
    await assert.rejects(as(ownerUser,'adjust_units',[cafe,member.id,1,'TEST ONLY: positive while paused',pausedCard.ledgerVersion,randomUUID(),randomUUID()]),{code:'42501'});
    const cheapReward=(await client.query('select published_version_id from public.rewards where business_id=$1 and status=$2 and name=$3',[cafe,'published','Test additive treat'])).rows[0].published_version_id;
    const raw=`LOYALTY:REDEEM:v1:${token()}`;
    await as(customer,'create_redemption_intent',[member.id,cheapReward,hash(raw),randomUUID()]);
    const context=await lookup(raw,'redemptionIntent');
    const preview=await as(ownerUser,'preview_redemption',[hash(context)]);
    const fulfilled=await as(ownerUser,'finalize_redemption',[hash(context),preview.expectedEffectHash,randomUUID(),randomUUID()]);
    assert.equal(fulfilled.balanceAfterAtCommit,'0');
    const updated=await as(ownerUser,'loyalty_configuration',[cafe]);
    await as(ownerUser,'set_programme_status',[cafe,'published',updated.programme.rowVersion,randomUUID()]);
    const after=(await as(customer,'customer_card',[member.id])).ledgerVersion,reverseKey=randomUUID();
    const undone=await as(ownerUser,'reverse_redemption',[cafe,fulfilled.redemptionId,'TEST ONLY: reward handoff was not completed',after,reverseKey,randomUUID()]);
    assert.equal(undone.balanceAfterAtCommit,'2');
    assert.equal((await as(ownerUser,'reverse_redemption',[cafe,fulfilled.redemptionId,'TEST ONLY: reward handoff was not completed',after,reverseKey,randomUUID()])).replayed,true);
    await assert.rejects(as(ownerUser,'reverse_redemption',[cafe,fulfilled.redemptionId,'TEST ONLY: reward handoff was not completed',after,randomUUID(),randomUUID()]),{code:'40001'});
    assert.equal((await as(ownerUser,'reconcile_balances',[cafe])).mismatches,0);
  });
  await test('Phase 3 failed direct scanner guesses consume the shared lookup limit',async()=>{
    await client.query('delete from public.rate_limit_buckets');
    for(let attempt=0;attempt<30;attempt++){
      const denied=await as(ownerUser,'resolve_scanner',[cafe,branch,'typedCode','HGFEDCBA',hash(token())]);
      assert.equal(denied.error.code,'not_found');
    }
    const limited=await as(ownerUser,'resolve_scanner',[cafe,branch,'typedCode','HGFEDCBA',hash(token())]);
    assert.equal(limited.error.code,'rate_limited');
  });
  await test('Phase 3 worker reconciliation reports ledger equality without editing balances',async()=>{
    const before=(await client.query('select units,ledger_version from public.balances where membership_id=$1',[member.id])).rows[0];
    await assert.rejects(as(ownerUser,'worker_reconcile_balances'),{code:'42501'});
    const worker=postgres.getPgClient();await worker.connect();
    try{await worker.query('set role loyalty_worker');const result=(await worker.query('select public.worker_reconcile_balances() as result')).rows[0].result;
      assert.equal(result.mismatches,0);}finally{await worker.end();}
    assert.deepEqual((await client.query('select units,ledger_version from public.balances where membership_id=$1',[member.id])).rows[0],before);
    assert.equal((await client.query("select status from public.operational_checks where name='ledger_reconciliation'")).rows[0].status,'ok');
  });
}
