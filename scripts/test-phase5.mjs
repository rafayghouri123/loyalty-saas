import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

export async function testPhase5({client,test}) {
  const cafe=(await client.query("select id from public.businesses where slug='phase2-a'")).rows[0];
  const owner=(await client.query("select u.user_id,s.id session_id from public.business_users u join auth.sessions s on s.user_id=u.user_id where u.business_id=$1 and u.role='owner' and u.status='active' limit 1",[cafe.id])).rows[0];
  const branch=(await client.query("select id from public.branches where business_id=$1 and status='active' limit 1",[cafe.id])).rows[0].id;
  const member=(await client.query("select id,customer_user_id from public.memberships where business_id=$1 and status='active' limit 1",[cafe.id])).rows[0];
  const memberSession=(await client.query('select id from auth.sessions where user_id=$1 limit 1',[member.customer_user_id])).rows[0].id;
  const as=async(user,session,name,args=[])=>{
    await client.query('begin');
    try {
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
        [user,JSON.stringify({sub:user,session_id:session,aal:'aal2'})]);
      const value=(await client.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result;
      await client.query('commit');return value;
    } catch(error) {await client.query('rollback');throw error;}
  };
  const ownerCall=(name,args)=>as(owner.user_id,owner.session_id,name,args);
  const memberCall=(name,args)=>as(member.customer_user_id,memberSession,name,args);
  let offer;
  await test('Phase 5 offer drafts are scoped, bounded and immutable after publication',async()=>{
    const input={kind:'treat',title:'TEST free coffee',description:'TEST one small coffee at checkout',terms:'TEST only while this offer is valid.',
      startsAt:new Date(Date.now()-60_000).toISOString(),expiresAt:new Date(Date.now()+86_400_000).toISOString(),
      audience:'all_members',branchIds:[branch],recipientIds:[],isAutomationTemplate:false,
      discountPercent:null,minimumSpendPaisa:'0',maxDiscountPaisa:null};
    await assert.rejects(memberCall('save_offer',[cafe.id,input,randomUUID()]),{code:'42501'});
    await assert.rejects(ownerCall('save_offer',[cafe.id,{...input,title:'x'},randomUUID()]),{code:'22023'});
    offer=await ownerCall('save_offer',[cafe.id,input,randomUUID()]);
    assert.equal(offer.status,'draft');
    const published=await ownerCall('set_offer_status',[cafe.id,offer.offerId,'published',offer.rowVersion,randomUUID()]);
    assert.equal(published.status,'published');
    await assert.rejects(ownerCall('save_offer',[cafe.id,{...input,offerId:offer.offerId,rowVersion:published.rowVersion},randomUUID()]),{code:'23514'});
    const visible=await memberCall('my_offers',[cafe.id]);
    assert(visible.some(x=>x.id===offer.offerId));
    assert.equal((await memberCall('offer_detail',[offer.offerId])).title,input.title);
  });
  await test('Phase 5 offer claim is one per member and pause blocks new claims',async()=>{
    const first=await memberCall('claim_offer',[offer.offerId,randomUUID()]);
    const again=await memberCall('claim_offer',[offer.offerId,randomUUID()]);
    assert.equal(first.claimId,again.claimId);
    const row=(await client.query('select row_version from public.offers where id=$1',[offer.offerId])).rows[0];
    await ownerCall('set_offer_status',[cafe.id,offer.offerId,'paused',row.row_version,randomUUID()]);
    await assert.rejects(memberCall('claim_offer',[offer.offerId,randomUUID()]),{code:'P0002'});
    assert.equal((await memberCall('offer_detail',[offer.offerId])).claimStatus,'claimed');
    await assert.rejects(ownerCall('offer_detail',[offer.offerId]),{code:'P0002'});
    await assert.rejects((async()=>{await client.query('begin');try{await client.query('set local role authenticated');await client.query('select * from public.offer_claims');}finally{await client.query('rollback');}})(),{code:'42501'});
  });
  const campaignInput=(audience='all_opted_in')=>({name:'TEST welcome campaign',title:'TEST cafe update',body:'TEST your cafe card has a new update.',
    destination:'card',offerId:null,audience,inactiveDays:audience==='inactive'?365:null,
    nearRewardUnits:null,targetRewardVersionId:null,branchIds:[branch],expiresAt:new Date(Date.now()+3600_000).toISOString()});
  await test('Phase 5 campaign draft, schedule and empty snapshot are explicit',async()=>{
    const draft=await ownerCall('save_campaign',[cafe.id,campaignInput('inactive'),randomUUID()]);
    assert.equal(draft.status,'draft');
    await assert.rejects(memberCall('schedule_campaign',[cafe.id,draft.campaignId,draft.rowVersion,new Date().toISOString(),randomUUID(),randomUUID()]),{code:'42501'});
    const key=randomUUID(),scheduledAt=new Date().toISOString();
    const scheduled=await ownerCall('schedule_campaign',[cafe.id,draft.campaignId,draft.rowVersion,scheduledAt,key,randomUUID()]);
    assert.equal(scheduled.status,'scheduled');
    assert.deepEqual(await ownerCall('schedule_campaign',[cafe.id,draft.campaignId,draft.rowVersion,scheduledAt,key,randomUUID()]),scheduled);
    const result=await client.query('begin').then(async()=>{try{await client.query('set local role loyalty_worker');
      const r=(await client.query('select public.worker_scan_campaigns() result')).rows[0].result;
      await client.query('commit');return r;}catch(error){await client.query('rollback');throw error;}});
    assert.equal(result.completedScans,1);
    const row=(await client.query('select status from public.campaigns where id=$1',[draft.campaignId])).rows[0];
    assert.equal(row.status,'completed');
    const view=await ownerCall('campaign_configuration',[cafe.id]);
    assert.equal(view.campaigns.find(x=>x.id===draft.campaignId).eligibleAudience,0);
    await assert.rejects(ownerCall('set_campaign_status',[cafe.id,draft.campaignId,'resume',scheduled.rowVersion,randomUUID()]),{code:'22023'});
  });
  let optedCampaign;
  await test('Phase 5 campaign snapshot respects opted-in membership and branch',async()=>{
    const policy=(await client.query("select version from public.policy_documents where kind='push_marketing' and published_at is not null order by published_at desc limit 1")).rows[0].version;
    await memberCall('set_consent',[member.id,'push','marketing',true,policy,randomUUID()]);
    const draft=await ownerCall('save_campaign',[cafe.id,campaignInput(),randomUUID()]);optedCampaign=draft.campaignId;
    await ownerCall('schedule_campaign',[cafe.id,draft.campaignId,draft.rowVersion,new Date().toISOString(),randomUUID(),randomUUID()]);
    await client.query('begin');try{await client.query('set local role loyalty_worker');await client.query('select public.worker_scan_campaigns()');await client.query('commit');}
    catch(error){await client.query('rollback');throw error;}
    const recipients=(await client.query('select membership_id from public.campaign_recipients where campaign_id=$1',[draft.campaignId])).rows;
    assert(recipients.some(x=>x.membership_id===member.id));
    const view=await ownerCall('campaign_configuration',[cafe.id]);
    const current=view.campaigns.find(x=>x.id===draft.campaignId);
    assert.equal(current.eligibleAudience,recipients.length);
    assert.equal(current.providerAccepted,0);
    assert.equal(current.observedClicks,0);
  });
  const workerCall=async(name,args=[])=>{await client.query('begin');try{await client.query('set local role loyalty_worker');
    const result=(await client.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result;
    await client.query('commit');return result;}catch(error){await client.query('rollback');throw error;}};
  const newCampaign=async()=>{const draft=await ownerCall('save_campaign',[cafe.id,campaignInput(),randomUUID()]);
    await ownerCall('schedule_campaign',[cafe.id,draft.campaignId,draft.rowVersion,new Date().toISOString(),randomUUID(),randomUUID()]);
    await workerCall('worker_scan_campaigns');return draft.campaignId;};
  await test('Phase 5 canceled and withdrawn-consent recipients cannot reach provider dispatch',async()=>{
    const current=(await ownerCall('campaign_configuration',[cafe.id])).campaigns.find(x=>x.id===optedCampaign);
    await ownerCall('set_campaign_status',[cafe.id,optedCampaign,'cancel',current.rowVersion,randomUUID()]);
    assert.equal((await client.query('select status from public.campaign_recipients where campaign_id=$1 and membership_id=$2',
      [optedCampaign,member.id])).rows[0].status,'suppressed');
    const zone=['UTC','Asia/Karachi','America/New_York','Pacific/Honolulu'].find(tz=>{
      const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:tz,hour:'numeric',hourCycle:'h23'}).format(new Date()));
      return hour>=9&&hour<21;
    });
    assert(zone);
    await client.query('update public.profiles set preferred_timezone=$1 where user_id=$2',[zone,member.customer_user_id]);
    const ids=[randomUUID(),randomUUID()];
    for(const id of ids){const hash=createHash('sha256').update(id).digest('hex');
      await client.query('insert into app_private.push_installations(id,secret_hash) values($1,$2)',[id,'a'.repeat(64)]);
      await client.query("insert into public.push_devices(customer_user_id,installation_id,token_ciphertext,encryption_key_id,token_hash,status) values($1,$2,$3,$4,$5,'active')",
        [member.customer_user_id,id,'v1.'+'x'.repeat(80),'test-key',hash]);}
    const campaignId=await newCampaign();
    const delivery=await workerCall('worker_claim_campaign_delivery');
    assert.equal(delivery.campaignId,campaignId);assert.equal(delivery.attempts.length,2);
    const policy=(await client.query("select version from public.policy_documents where kind='push_marketing' and published_at is not null order by published_at desc limit 1")).rows[0].version;
    await memberCall('set_consent',[member.id,'push','marketing',false,policy,randomUUID()]);
    for(const item of delivery.attempts)assert.equal(await workerCall('worker_campaign_attempt_ready',[item.attemptId]),null);
    const state=(await client.query('select status,suppression_reason from public.campaign_recipients where id=$1',[delivery.recipientId])).rows[0];
    assert.equal(state.status,'suppressed');assert.equal(state.suppression_reason,'consent_withdrawn');
    assert.equal((await client.query('select count(*) from public.delivery_attempts where campaign_recipient_id=$1 and attempted_at is not null',[delivery.recipientId])).rows[0].count,'0');
    await memberCall('set_consent',[member.id,'push','marketing',true,policy,randomUUID()]);
  });
  await test('Phase 5 two-device acceptance and observed click remain separate metrics',async()=>{
    const campaignId=await newCampaign();
    const delivery=await workerCall('worker_claim_campaign_delivery');
    assert.equal(delivery.campaignId,campaignId);assert.equal(delivery.attempts.length,2);
    for(const item of delivery.attempts){assert(await workerCall('worker_campaign_attempt_ready',[item.attemptId]));
      await workerCall('worker_finish_campaign_attempt',[item.attemptId,'provider_accepted',`test-${item.attemptId}`,null]);}
    await workerCall('worker_finish_campaigns');
    const current=(await ownerCall('campaign_configuration',[cafe.id])).campaigns.find(x=>x.id===campaignId);
    assert.equal(current.deviceAttempts,2);assert.equal(current.providerAccepted,2);assert.equal(current.observedClicks,0);
    await assert.rejects(ownerCall('observe_campaign_click',[delivery.recipientId]),{code:'P0002'});
    assert.equal((await memberCall('observe_campaign_click',[delivery.recipientId])).recorded,true);
    const clicked=(await ownerCall('campaign_configuration',[cafe.id])).campaigns.find(x=>x.id===campaignId);
    assert.equal(clicked.observedClicks,1);
  });
  await test('Phase 5 quiet hours and weekly cap suppress expired-window sends',async()=>{
    assert.equal((await client.query("select app_private.next_marketing_time('Asia/Karachi','2026-09-25T16:00:00Z') next")).rows[0].next.toISOString(),
      '2026-09-26T04:00:00.000Z');
    const campaignId=await newCampaign();
    const delivery=await workerCall('worker_claim_campaign_delivery');
    assert.equal(delivery.campaignId,campaignId);
    for(const item of delivery.attempts)await workerCall('worker_finish_campaign_attempt',[item.attemptId,'provider_accepted',`test-${item.attemptId}`,null]);
    const third=await newCampaign();
    assert.equal(await workerCall('worker_claim_campaign_delivery'),null);
    const recipient=(await client.query('select status,suppression_reason from public.campaign_recipients where campaign_id=$1 and membership_id=$2',[third,member.id])).rows[0];
    assert.equal(recipient.status,'suppressed');assert.equal(recipient.suppression_reason,'frequency_cap');
  });
  await test('Phase 5 automation rules require scoped authority and preserve versions',async()=>{
    const reward=(await client.query("select rv.id from public.rewards r join public.reward_versions rv on rv.id=r.published_version_id where r.business_id=$1 and r.status='published' limit 1",[cafe.id])).rows[0];
    const payload={kind:'reward_available',enabled:true,titleTemplate:'Reward at {{business_name}}',
      bodyTemplate:'Your {{reward_name}} is ready in your loyalty card.',inactiveDays:null,
      rewardVersionId:reward.id,offerId:null,birthdayValidityDays:null,version:null};
    await assert.rejects(memberCall('save_automation_rule',[cafe.id,payload,randomUUID()]),{code:'42501'});
    await assert.rejects(ownerCall('save_automation_rule',[cafe.id,{...payload,titleTemplate:'{{unknown}}'},randomUUID()]),{code:'22023'});
    const saved=await ownerCall('save_automation_rule',[cafe.id,payload,randomUUID()]);assert.equal(saved.version,1);
    await assert.rejects(ownerCall('save_automation_rule',[cafe.id,{...payload,version:4},randomUUID()]),{code:'40001'});
    const disabled=await ownerCall('save_automation_rule',[cafe.id,{...payload,enabled:false,version:1},randomUUID()]);
    assert.equal(disabled.version,2);
    assert.equal((await ownerCall('automation_configuration',[cafe.id])).rules.find(x=>x.kind==='reward_available').enabled,false);
  });
  await test('Phase 5 birthday creates one annual private offer without push permission',async()=>{
    const start=new Date(Date.now()-3600000).toISOString(),end=new Date(Date.now()+20*86400000).toISOString();
    const template=await ownerCall('save_offer',[cafe.id,{kind:'treat',title:'TEST birthday coffee',
      description:'TEST one coffee as a birthday treat',terms:'TEST valid once at participating branches.',startsAt:start,
      expiresAt:end,audience:'recipient_list',branchIds:[branch],recipientIds:[],isAutomationTemplate:true,
      discountPercent:null,minimumSpendPaisa:'0',maxDiscountPaisa:null},randomUUID()]);
    await ownerCall('set_offer_status',[cafe.id,template.offerId,'published',template.rowVersion,randomUUID()]);
    const rule={kind:'birthday',enabled:true,titleTemplate:'Birthday gift at {{business_name}}',
      bodyTemplate:'Your birthday offer is ready in your loyalty app.',inactiveDays:null,
      rewardVersionId:null,offerId:template.offerId,birthdayValidityDays:7,version:null};
    await ownerCall('save_automation_rule',[cafe.id,rule,randomUUID()]);
    const date=(await client.query('select (clock_timestamp() at time zone timezone)::date::text as local_date from public.businesses where id=$1',[cafe.id])).rows[0].local_date;
    const [year,month,day]=date.split('-').map(Number);
    await client.query("update public.profiles set birthday_month=$1,birthday_day=$2,birthday_changed_at=clock_timestamp()-interval '2 days' where user_id=$3",
      [month,day,member.customer_user_id]);
    const policy=(await client.query("select version from public.policy_documents where kind='inbox_birthday' and published_at is not null order by published_at desc limit 1")).rows[0].version;
    await memberCall('set_consent',[member.id,'inbox','birthday',true,policy,randomUUID()]);
    await client.query("update public.consent_preferences set changed_at=clock_timestamp()-interval '2 days' where membership_id=$1 and channel='inbox' and purpose='birthday'",[member.id]);
    await workerCall('worker_scan_automations');await workerCall('worker_scan_automations');
    const runs=(await client.query('select id,state from public.automation_runs where business_id=$1 and membership_id=$2 and birthday_year=$3',[cafe.id,member.id,year])).rows;
    assert.equal(runs.length,1);assert.equal(runs[0].state,'pending');
    const instance=(await client.query('select id,source_template_id,generated_by_run_id,is_automation_template from public.offers where generated_by_run_id=$1',[runs[0].id])).rows[0];
    assert.equal(instance.source_template_id,template.offerId);assert.equal(instance.is_automation_template,false);
    assert((await memberCall('my_offers',[cafe.id])).some(x=>x.id===instance.id));
    assert.equal(await workerCall('worker_claim_automation_delivery'),null);
    assert.equal((await client.query('select state,suppression_reason from public.automation_runs where id=$1',[runs[0].id])).rows[0].suppression_reason,'birthday_push_off');
    const claim=await memberCall('claim_offer',[instance.id,randomUUID()]);
    assert.equal((await client.query('select automation_run_id from public.offer_claims where id=$1',[claim.claimId])).rows[0].automation_run_id,runs[0].id);
  });
  await test('Phase 5 offer claim intent resolves only at an eligible branch and fulfils once with checkout',async()=>{
    const claim=(await client.query('select id from public.offer_claims where offer_id=$1 and membership_id=$2',[offer.offerId,member.id])).rows[0];
    const raw=`LOYALTY:OFFER:v1:${randomBytes(32).toString('base64url')}`;
    const hash=createHash('sha256').update(raw).digest('hex');
    const intent=await memberCall('create_offer_intent',[claim.id,hash,randomUUID()]);
    assert.equal(intent.claimId,claim.id);
    const contextRaw=randomBytes(32).toString('base64url');
    const contextHash=createHash('sha256').update(contextRaw).digest('hex');
    const resolved=await ownerCall('resolve_scanner',[cafe.id,branch,'offerIntent',raw,contextHash]);
    assert.equal(resolved.kind,'offer');assert.equal(resolved.offerKind,'treat');
    const input={recordedBillPaisa:'0',eligibleSpendPaisa:'0',qualifyingPurchaseConfirmed:false,receiptReference:'TEST-GIFT'};
    const preview=await ownerCall('preview_purchase',[contextHash,input]);
    assert.equal(preview.offerClaimId,claim.id);assert.equal(preview.appliedDiscountPaisa,'0');
    const key=randomUUID();
    const committed=await ownerCall('record_purchase',[contextHash,{...input,expectedEffectHash:preview.expectedEffectHash,idempotencyKey:key},randomUUID()]);
    assert.equal(committed.offerClaimId,claim.id);
    assert.equal((await client.query('select status,purchase_id from public.offer_claims where id=$1',[claim.id])).rows[0].purchase_id,committed.purchaseId);
    assert.equal((await client.query('select status from public.offer_claims where id=$1',[claim.id])).rows[0].status,'fulfilled');
    const replay=await ownerCall('record_purchase',[contextHash,{...input,expectedEffectHash:preview.expectedEffectHash,idempotencyKey:key},randomUUID()]);
    assert.equal(replay.purchaseId,committed.purchaseId);assert.equal(replay.replayed,true);
    assert.equal((await client.query('select count(*) from public.purchases where primary_offer_claim_id=$1',[claim.id])).rows[0].count,'1');
    await assert.rejects(memberCall('create_offer_intent',[claim.id,createHash('sha256').update('new').digest('hex'),randomUUID()]),{code:'P0001'});
  });
  await test('Phase 5 a no-minimum birthday treat fulfils without a purchase or balance change',async()=>{
    const claim=(await client.query('select id from public.offer_claims where business_id=$1 and membership_id=$2 and automation_run_id is not null',
      [cafe.id,member.id])).rows[0];
    const before=(await client.query('select units from public.balances where membership_id=$1',[member.id])).rows[0].units;
    const raw=`LOYALTY:OFFER:v1:${randomBytes(32).toString('base64url')}`;
    const intent=await memberCall('create_offer_intent',[claim.id,createHash('sha256').update(raw).digest('hex'),randomUUID()]);
    const contextHash=createHash('sha256').update(randomBytes(32)).digest('hex');
    assert.equal((await ownerCall('resolve_scanner',[cafe.id,branch,'offerIntent',raw,contextHash])).kind,'offer');
    const preview=await ownerCall('preview_offer_fulfillment',[contextHash]);
    assert.equal(preview.balanceChange,'0');
    const key=randomUUID();
    const result=await ownerCall('fulfill_offer',[contextHash,preview.expectedEffectHash,key,randomUUID()]);
    assert.equal(result.offerClaimId,claim.id);
    assert.equal((await ownerCall('fulfill_offer',[contextHash,preview.expectedEffectHash,key,randomUUID()])).replayed,true);
    const row=(await client.query('select status,purchase_id from public.offer_claims where id=$1',[claim.id])).rows[0];
    assert.equal(row.status,'fulfilled');assert.equal(row.purchase_id,null);
    assert.equal((await client.query('select units from public.balances where membership_id=$1',[member.id])).rows[0].units,before);
    assert.equal((await client.query('select consumed_at is not null consumed from public.offer_claim_intents where id=$1',[intent.intentId])).rows[0].consumed,true);
  });
  await test('Phase 5 discount amount is server-calculated and the paid eligible amount earns loyalty',async()=>{
    const input={kind:'discount',title:'TEST ten percent',description:'TEST discount on eligible goods',terms:'TEST one claim at participating branches.',
      startsAt:new Date(Date.now()-60_000).toISOString(),expiresAt:new Date(Date.now()+86_400_000).toISOString(),
      audience:'all_members',branchIds:[branch],recipientIds:[],isAutomationTemplate:false,
      discountPercent:10,minimumSpendPaisa:'500',maxDiscountPaisa:'200'};
    const saved=await ownerCall('save_offer',[cafe.id,input,randomUUID()]);
    await ownerCall('set_offer_status',[cafe.id,saved.offerId,'published',saved.rowVersion,randomUUID()]);
    const claim=await memberCall('claim_offer',[saved.offerId,randomUUID()]);
    const raw=`LOYALTY:OFFER:v1:${randomBytes(32).toString('base64url')}`;
    await memberCall('create_offer_intent',[claim.claimId,createHash('sha256').update(raw).digest('hex'),randomUUID()]);
    const contextHash=createHash('sha256').update(randomBytes(32)).digest('hex');
    assert.equal((await ownerCall('resolve_scanner',[cafe.id,branch,'offerIntent',raw,contextHash])).offerKind,'discount');
    const inputPurchase={recordedBillPaisa:'900',eligibleSpendPaisa:'900',offerEligibleBeforeDiscountPaisa:'1000',
      qualifyingPurchaseConfirmed:true,receiptReference:'TEST-DISCOUNT'};
    const preview=await ownerCall('preview_purchase',[contextHash,inputPurchase]);
    assert.equal(preview.appliedDiscountPaisa,'100');
    await assert.rejects(ownerCall('preview_purchase',[contextHash,{...inputPurchase,eligibleSpendPaisa:'1000'}]),{code:'22023'});
    const result=await ownerCall('record_purchase',[contextHash,{...inputPurchase,expectedEffectHash:preview.expectedEffectHash,
      idempotencyKey:randomUUID()},randomUUID()]);
    assert.equal(result.offerClaimId,claim.claimId);assert.equal(result.appliedDiscountPaisa,'100');
    const purchase=(await client.query('select recorded_bill_paisa,eligible_spend_paisa,offer_eligible_before_discount_paisa,applied_discount_paisa from public.purchases where id=$1',
      [result.purchaseId])).rows[0];
    assert.equal(purchase.recorded_bill_paisa,'900');assert.equal(purchase.eligible_spend_paisa,'900');
    assert.equal(purchase.offer_eligible_before_discount_paisa,'1000');assert.equal(purchase.applied_discount_paisa,'100');
  });
  await test('Phase 5 claimed offer history remains private after fulfillment and expiry',async()=>{
    const visible=await memberCall('my_offers',[cafe.id]);
    assert(visible.some(item=>item.id===offer.offerId&&item.claimStatus==='fulfilled'));
    assert.equal((await memberCall('offer_detail',[offer.offerId])).claimStatus,'fulfilled');
  });
  await test('Phase 5 audience preview and staff-only test-device delivery are scoped',async()=>{
    const draft=await ownerCall('save_campaign',[cafe.id,campaignInput(),randomUUID()]);
    const preview=await ownerCall('preview_campaign_audience',[cafe.id,draft.campaignId]);
    assert(preview.eligibleMembers>=1);assert(preview.subscribedDevices>=2);
    await assert.rejects(memberCall('preview_campaign_audience',[cafe.id,draft.campaignId]),{code:'42501'});
    const installationId=randomUUID(),generation=randomUUID();
    await client.query('insert into app_private.push_installations(id,secret_hash) values($1,$2)',[installationId,'b'.repeat(64)]);
    const device=(await client.query("insert into public.push_devices(customer_user_id,installation_id,binding_generation,token_ciphertext,encryption_key_id,token_hash,status) values($1,$2,$3,$4,$5,$6,'active') returning id",
      [owner.user_id,installationId,generation,'v1.'+'y'.repeat(80),'test-key',createHash('sha256').update(installationId).digest('hex')])).rows[0];
    await assert.rejects(memberCall('set_campaign_test_device',[cafe.id,installationId,generation,true]),{code:'42501'});
    assert.equal((await ownerCall('set_campaign_test_device',[cafe.id,installationId,generation,true])).registered,true);
    const first=await ownerCall('request_campaign_test',[cafe.id,draft.campaignId,device.id]);
    const outboxId=(await client.query("select id from public.outbox_events where event_type='campaign.test_requested' and event_key=$1",
      [first.requestId])).rows[0].id;
    const delivery=await workerCall('worker_claim_campaign_test',[outboxId]);
    assert.equal(delivery.destination,'/app/notifications');assert.equal(delivery.requestId,first.requestId);
    await ownerCall('set_campaign_test_device',[cafe.id,installationId,generation,false]);
    assert.equal(await workerCall('worker_campaign_test_ready',[first.requestId]),false);
    assert.equal((await client.query('select status from public.campaign_test_requests where id=$1',[first.requestId])).rows[0].status,'suppressed');
    await ownerCall('set_campaign_test_device',[cafe.id,installationId,generation,true]);
    const second=await ownerCall('request_campaign_test',[cafe.id,draft.campaignId,device.id]);
    const secondOutbox=(await client.query("select id from public.outbox_events where event_type='campaign.test_requested' and event_key=$1",
      [second.requestId])).rows[0].id;
    assert((await workerCall('worker_claim_campaign_test',[secondOutbox])).requestId===second.requestId);
    assert.equal(await workerCall('worker_campaign_test_ready',[second.requestId]),true);
    assert.equal(await workerCall('worker_finish_campaign_test',[second.requestId,'provider_accepted','test-message',null]),true);
    assert.equal((await client.query('select status from public.campaign_test_requests where id=$1',[second.requestId])).rows[0].status,'provider_accepted');
    const metrics=(await ownerCall('campaign_configuration',[cafe.id])).campaigns.find(item=>item.id===draft.campaignId);
    assert.equal(metrics.providerAccepted,0);
    await assert.rejects(memberCall('request_campaign_test',[cafe.id,draft.campaignId,device.id]),{code:'42501'});
  });
  await test('Phase 5 birthday outage catch-up keeps the original business-local validity window',async()=>{
    const other=(await client.query(`select m.id,m.customer_user_id,s.id session_id from public.memberships m
      join auth.sessions s on s.user_id=m.customer_user_id where m.business_id=$1 and m.id<>$2 and m.status='active'
      and not exists(select from public.automation_runs r where r.membership_id=m.id and r.birthday_year is not null)
      limit 1`,[cafe.id,member.id])).rows[0];
    assert(other);
    const today=(await client.query('select (clock_timestamp() at time zone timezone)::date::text as day,timezone from public.businesses where id=$1',[cafe.id])).rows[0];
    const yesterday=new Date(`${today.day}T00:00:00Z`);yesterday.setUTCDate(yesterday.getUTCDate()-1);
    await client.query("update public.profiles set birthday_month=$1,birthday_day=$2,birthday_changed_at=clock_timestamp()-interval '3 days' where user_id=$3",
      [yesterday.getUTCMonth()+1,yesterday.getUTCDate(),other.customer_user_id]);
    const policy=(await client.query("select version from public.policy_documents where kind='inbox_birthday' and published_at is not null order by published_at desc limit 1")).rows[0].version;
    await as(other.customer_user_id,other.session_id,'set_consent',[other.id,'inbox','birthday',true,policy,randomUUID()]);
    await client.query("update public.consent_preferences set changed_at=clock_timestamp()-interval '3 days' where membership_id=$1 and channel='inbox' and purpose='birthday'",[other.id]);
    await workerCall('worker_scan_automations');await workerCall('worker_scan_automations');
    const run=(await client.query('select id,scheduled_at,expires_at from public.automation_runs where business_id=$1 and membership_id=$2 and birthday_year=$3',
      [cafe.id,other.id,yesterday.getUTCFullYear()])).rows[0];
    assert(run);assert.equal((await client.query('select count(*) from public.offers where generated_by_run_id=$1',[run.id])).rows[0].count,'1');
    assert.equal((await client.query('select (scheduled_at at time zone $2)::date::text as local_day from public.automation_runs where id=$1',
      [run.id,today.timezone])).rows[0].local_day,yesterday.toISOString().slice(0,10));
    assert(run.expires_at>new Date());
  });
  await test('Phase 5 reward automation triggers at a committed balance crossing and stops after consent withdrawal',async()=>{
    const rule=(await client.query("select id,version,reward_version_id from public.automation_rules where business_id=$1 and kind='reward_available'",[cafe.id])).rows[0];
    const reward=(await client.query('select unit_cost from public.reward_versions where id=$1',[rule.reward_version_id])).rows[0];
    const target=(await client.query(`select m.id,m.customer_user_id,s.id session_id,b.units,b.ledger_version
      from public.memberships m join public.balances b on b.membership_id=m.id
      join auth.sessions s on s.user_id=m.customer_user_id
      where m.business_id=$1 and m.status='active' order by b.units asc limit 1`,[cafe.id])).rows[0];
    assert(target);
    const policy=(await client.query("select version from public.policy_documents where kind='push_reward' and published_at is not null order by published_at desc limit 1")).rows[0].version;
    await as(target.customer_user_id,target.session_id,'set_consent',[target.id,'push','reward_updates',true,policy,randomUUID()]);
    const desired=BigInt(reward.unit_cost)-1n,delta=desired-BigInt(target.units);
    if(delta!==0n)await ownerCall('adjust_units',[cafe.id,target.id,delta.toString(),'TEST reward crossing setup',target.ledger_version,randomUUID(),randomUUID()]);
    await ownerCall('save_automation_rule',[cafe.id,{kind:'reward_available',enabled:true,
      titleTemplate:'Reward at {{business_name}}',bodyTemplate:'Your {{reward_name}} is ready in your loyalty card.',
      inactiveDays:null,rewardVersionId:rule.reward_version_id,offerId:null,birthdayValidityDays:null,version:rule.version},randomUUID()]);
    const contextHash=createHash('sha256').update(randomBytes(32)).digest('hex');
    await client.query(`insert into app_private.checkout_contexts(business_id,branch_id,membership_id,staff_user_id,session_id,
      token_hash,kind,expires_at) values($1,$2,$3,$4,$5,$6,'earning',clock_timestamp()+interval '5 minutes')`,
      [cafe.id,branch,target.id,owner.user_id,owner.session_id,contextHash]);
    const programme=(await client.query(`select v.minimum_spend_paisa from public.loyalty_programmes p
      join public.programme_versions v on v.programme_id=p.id where p.business_id=$1 and v.status='published'
      and v.effective_at<=clock_timestamp() order by v.effective_at desc limit 1`,[cafe.id])).rows[0];
    const amount=(BigInt(programme.minimum_spend_paisa)>100000n?BigInt(programme.minimum_spend_paisa):100000n).toString();
    const input={recordedBillPaisa:amount,eligibleSpendPaisa:amount,qualifyingPurchaseConfirmed:true,receiptReference:'TEST-REWARD-CROSSING'};
    const preview=await ownerCall('preview_purchase',[contextHash,input]);assert(BigInt(preview.baseUnits)>0n);
    const purchase=await ownerCall('record_purchase',[contextHash,{...input,expectedEffectHash:preview.expectedEffectHash,
      idempotencyKey:randomUUID()},randomUUID()]);
    const runs=(await client.query(`select r.id,r.event_key,r.state from public.automation_runs r
      join public.ledger_entries l on l.id=r.source_ledger_entry_id where l.purchase_id=$1
      and r.membership_id=$2 and r.rule_id=$3`,[purchase.purchaseId,target.id,rule.id])).rows;
    assert.equal(runs.length,1);assert.equal(runs[0].state,'pending');
    await as(target.customer_user_id,target.session_id,'set_consent',[target.id,'push','reward_updates',false,policy,randomUUID()]);
    assert.equal((await client.query('select app_private.automation_still_eligible(r) as reason from public.automation_runs r where r.id=$1',[runs[0].id])).rows[0].reason,'consent_withdrawn');
    await workerCall('worker_claim_automation_delivery');
    assert.equal((await client.query('select state from public.automation_runs where id=$1',[runs[0].id])).rows[0].state,'suppressed');
  });
  await test('Phase 5 inactivity runs once per qualifying-purchase episode and suppresses after a new purchase',async()=>{
    let target=(await client.query(`select m.id,m.customer_user_id,s.id session_id from public.memberships m
      join auth.sessions s on s.user_id=m.customer_user_id where m.business_id=$1 and m.status='active'
      and not exists(select from public.purchases p where p.membership_id=m.id) limit 1`,[cafe.id])).rows[0];
    if(!target){
      const userId=randomUUID(),sessionId=randomUUID(),memberId=randomUUID();
      await client.query('insert into auth.users(id,email,email_confirmed_at,is_anonymous) values($1,$2,now(),false)',
        [userId,`phase5-inactivity-${userId}@example.invalid`]);
      await client.query("insert into public.profiles(user_id,auth_user_id,display_name) values($1,$1,'TEST Inactivity Member')",[userId]);
      await client.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
      await client.query("insert into public.memberships(id,business_id,customer_user_id,display_name,joined_branch_id) values($1,$2,$3,'TEST Inactivity Member',$4)",
        [memberId,cafe.id,userId,branch]);
      await client.query('insert into public.balances(business_id,membership_id) values($1,$2)',[cafe.id,memberId]);
      target={id:memberId,customer_user_id:userId,session_id:sessionId};
    }
    const policy=(await client.query("select version from public.policy_documents where kind='push_marketing' and published_at is not null order by published_at desc limit 1")).rows[0].version;
    await as(target.customer_user_id,target.session_id,'set_consent',[target.id,'push','marketing',true,policy,randomUUID()]);
    const programme=(await client.query(`select v.id from public.loyalty_programmes p join public.programme_versions v
      on v.programme_id=p.id where p.business_id=$1 and v.status='published' and v.effective_at<=clock_timestamp()
      order by v.effective_at desc limit 1`,[cafe.id])).rows[0];
    const insertPurchase=async(occurredAt)=> (await client.query(`insert into public.purchases(business_id,branch_id,membership_id,
      programme_version_id,recorded_bill_paisa,eligible_spend_paisa,base_units,qualifying_purchase_confirmed,
      qualifies_for_loyalty,staff_user_id,idempotency_key,request_hash,occurred_at)
      values($1,$2,$3,$4,100,100,0,true,true,$5,$6,$7,$8) returning id`,
      [cafe.id,branch,target.id,programme.id,owner.user_id,randomUUID(),
        createHash('sha256').update(randomUUID()).digest('hex'),occurredAt])).rows[0].id;
    const source=await insertPurchase(new Date(Date.now()-8*86400000));
    await ownerCall('save_automation_rule',[cafe.id,{kind:'inactivity',enabled:true,
      titleTemplate:'Visit {{business_name}} again',bodyTemplate:'Your loyalty card is ready when you visit us again.',
      inactiveDays:7,rewardVersionId:null,offerId:null,birthdayValidityDays:null,version:null},randomUUID()]);
    await workerCall('worker_scan_automations');await workerCall('worker_scan_automations');
    const runs=(await client.query(`select id,state from public.automation_runs where membership_id=$1
      and event_key=$2`,[target.id,`inactive:${source}`])).rows;
    assert.equal(runs.length,1);assert.equal(runs[0].state,'pending');
    await insertPurchase(new Date());
    assert.equal((await client.query('select app_private.automation_still_eligible(r) reason from public.automation_runs r where id=$1',
      [runs[0].id])).rows[0].reason,'purchase_changed');
    for(let i=0;i<10;i++)await workerCall('worker_claim_automation_delivery');
    const state=(await client.query('select state,suppression_reason from public.automation_runs where id=$1',[runs[0].id])).rows[0];
    assert.equal(state.state,'suppressed');assert.equal(state.suppression_reason,'purchase_changed');
  });
  await test('Phase 5 offer and campaign images require accepted same-business media and duplicates stay drafts',async()=>{
    const imageId=randomUUID();
    await client.query(`insert into public.media_assets(id,business_id,storage_path,kind,mime_type,bytes,width,height,
      uploaded_by,visibility,validation_status) values($1,$2,$3,'offer','image/webp',1000,600,400,$4,'public_brand','accepted')`,
      [imageId,cafe.id,`${cafe.id}/${imageId}/original`,owner.user_id]);
    const input={kind:'informational',title:'TEST image offer',description:'TEST image in offer inbox',terms:'',
      startsAt:new Date(Date.now()-60_000).toISOString(),expiresAt:new Date(Date.now()+86_400_000).toISOString(),
      audience:'all_members',branchIds:[branch],recipientIds:[],isAutomationTemplate:false,
      discountPercent:null,minimumSpendPaisa:'0',maxDiscountPaisa:null,imageAssetId:imageId};
    const saved=await ownerCall('save_offer',[cafe.id,input,randomUUID()]);
    assert.equal((await ownerCall('offer_configuration',[cafe.id])).offers.find(item=>item.id===saved.offerId).imageAssetId,imageId);
    await ownerCall('set_offer_status',[cafe.id,saved.offerId,'published',saved.rowVersion,randomUUID()]);
    assert.equal((await memberCall('offer_detail',[saved.offerId])).imagePath,`${cafe.id}/${imageId}/v1.webp`);
    const copied=await ownerCall('duplicate_offer',[cafe.id,saved.offerId,randomUUID()]);
    assert.equal(copied.status,'draft');
    assert.equal((await ownerCall('offer_configuration',[cafe.id])).offers.find(item=>item.id===copied.offerId).imageAssetId,imageId);
    const campaign=await ownerCall('save_campaign',[cafe.id,{...campaignInput(),imageAssetId:imageId},randomUUID()]);
    assert.equal((await ownerCall('campaign_configuration',[cafe.id])).campaigns.find(item=>item.id===campaign.campaignId).imageAssetId,imageId);
    await assert.rejects(ownerCall('save_offer',[cafe.id,{...input,imageAssetId:randomUUID()},randomUUID()]),{code:'23514'});
  });
}
