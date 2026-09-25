import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const hash = raw => createHash('sha256').update(raw).digest('hex');
const token = () => randomBytes(32).toString('base64url');

export async function testPhase4({ client, postgres, test }) {
  // Phase 3 deliberately exhausted the same scanner limiter in its final denial test.
  await client.query('delete from public.rate_limit_buckets');
  const cafe = (await client.query("select id,slug,timezone from public.businesses where slug='phase2-a'")).rows[0];
  const owner = (await client.query("select u.user_id,s.id as session_id from public.business_users u join auth.sessions s on s.user_id=u.user_id where u.business_id=$1 and u.role='owner' and u.status='active' limit 1",[cafe.id])).rows[0];
  const referrer = (await client.query('select id,customer_user_id from public.memberships where business_id=$1 and status=$2 limit 1',[cafe.id,'active'])).rows[0];
  const referrerSession = (await client.query('select id from auth.sessions where user_id=$1 limit 1',[referrer.customer_user_id])).rows[0].id;
  const branch = (await client.query('select id from public.branches where business_id=$1 and status=$2 limit 1',[cafe.id,'active'])).rows[0].id;
  const ownerUser={id:owner.user_id,sessionId:owner.session_id},referrerUser={id:referrer.customer_user_id,sessionId:referrerSession};
  const as=async(who,name,args=[],connection=client,aal='aal2')=>{
    await connection.query('begin');
    try {
      await connection.query('set local role authenticated');
      await connection.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
        [who.id,JSON.stringify({sub:who.id,session_id:who.sessionId,aal,amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)}]})]);
      const result=await connection.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,args);
      await connection.query('commit');return result.rows[0].result;
    }catch(error){await connection.query('rollback');throw error;}
  };
  const issueGrant=async(who,referralCode,seenAt=new Date().toISOString())=>{
    const grantHash=hash(token());
    await client.query('begin');
    try {
      await client.query('set local role loyalty_web_gateway');
      const issued=(await client.query('select public.gateway_issue_referral_grant($1,$2,$3,$4,$5,$6) as issued',
        [who.id,who.sessionId,cafe.slug,referralCode,seenAt,grantHash])).rows[0].issued;
      await client.query('commit');return issued?grantHash:'';
    }catch(error){await client.query('rollback');throw error;}
  };
  const recordVisit=async(referralCode)=>{
    await client.query('begin');
    try{
      await client.query('set local role loyalty_web_gateway');
      const result=(await client.query('select public.gateway_record_referral_visit($1) as recorded',[referralCode])).rows[0].recorded;
      await client.query('commit');return result;
    }catch(error){await client.query('rollback');throw error;}
  };
  let code,friend,friendUser,promo,purchase,firstPurchase,handle,joinInput,secondBranch,staleMember,staleFriendUser;
  await test('Phase 4 referral rules require owner MFA and code is canonical 128-bit Base64URL',async()=>{
    await assert.rejects(as(referrerUser,'save_referral_rules',[cafe.id,{enabled:true,inviterBonusUnits:2,friendBonusUnits:3,
      minimumSpendPaisa:'25000',monthlyInviterCap:10,attributionDays:7,qualificationDays:30},randomUUID()]),{code:'42501'});
    const rule=await as(ownerUser,'save_referral_rules',[cafe.id,{enabled:true,inviterBonusUnits:2,friendBonusUnits:3,
      minimumSpendPaisa:'25000',monthlyInviterCap:10,attributionDays:7,qualificationDays:30},randomUUID()]);
    assert.equal(rule.version,1);
    const own=await as(referrerUser,'my_referral_code',[referrer.id]);code=own.code;
    assert.match(code,/^[A-Za-z0-9_-]{21}[AEIMQUYcgkosw048]$/u);
    assert.equal(Buffer.from(code,'base64url').length,16);
    assert.equal((await as(referrerUser,'my_referral_code',[referrer.id])).code,code);
    assert.equal((await client.query('select public.resolve_referral($1) as result',[code])).rows[0].result.businessSlug,cafe.slug);
    assert.equal((await client.query('select public.resolve_referral($1) as result',[`${code.slice(0,21)}B`])).rows[0].result,null);
    await assert.rejects(as(referrerUser,'gateway_record_referral_visit',[code]),{code:'42501'});
    assert.equal(await recordVisit(code),true);
    assert.equal(await recordVisit(`${code.slice(0,21)}B`),false);
    assert.equal((await client.query('select count(*) from public.referral_visit_events')).rows[0].count,'1');
    const visitCodeId=(await client.query('select id from public.referral_codes where code=$1',[code])).rows[0].id;
    await client.query("insert into public.referral_visit_events(business_id,referral_code_id,occurred_at) values($1,$2,clock_timestamp()-interval '91 days')",
      [cafe.id,visitCodeId]);
    await client.query('begin');
    try{await client.query('set local role loyalty_worker');assert.equal((await client.query('select public.worker_purge_referral_visits() as removed')).rows[0].removed,1);
      await client.query('commit');}catch(error){await client.query('rollback');throw error;}
    assert.equal((await client.query('select count(*) from public.referral_visit_events')).rows[0].count,'1');
    await assert.rejects(as(referrerUser,'gateway_issue_referral_grant',[referrerUser.id,referrerUser.sessionId,cafe.slug,code,new Date().toISOString(),hash(token())]),{code:'42501'});
    await assert.rejects((async()=>{await client.query('begin');try{await client.query('set local role authenticated');await client.query('select * from app_private.referral_attribution_grants');}finally{await client.query('rollback');}})(),{code:'42501'});
    await assert.rejects(as(ownerUser,'my_referral_code',[referrer.id]),{code:'P0002'});
    await assert.rejects(as(referrerUser,'referral_configuration',[cafe.id,new Date().toISOString().slice(0,10),new Date().toISOString().slice(0,10),'all',null,0,25]),{code:'42501'});
  });
  await test('Phase 4 slot interval is half-open in the business timezone',async()=>{
    const cases=[['2026-09-21T09:59:59Z',false],['2026-09-21T10:00:00Z',true],
      ['2026-09-21T12:00:00Z',true],['2026-09-21T13:00:00Z',false],['2026-09-21T13:00:01Z',false],
      ['2026-09-22T10:00:00Z',false]];
    for(const [at,expected] of cases){const actual=(await client.query("select app_private.promotion_window('2026-09-21','2026-09-21',array[1,2,3],'15:00','18:00','Asia/Karachi',$1) as active",[at])).rows[0].active;
      assert.equal(actual,expected,at);}
  });
  await test('Phase 4 signed attribution is rechecked at enrollment; one durable claim is created',async()=>{
    const userId=randomUUID(),sessionId=randomUUID();friendUser={id:userId,sessionId};
    await client.query('insert into auth.users(id,email,email_confirmed_at,is_anonymous) values($1,$2,now(),false)',[userId,`friend-${userId}@example.invalid`]);
    await client.query('insert into public.profiles(user_id,auth_user_id,display_name) values($1,$1,$2)',[userId,'TEST Referral Friend']);
    await client.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
    const configuration=await as(friendUser,'public_configuration');
    const cafeInfo=await as(friendUser,'public_business',[cafe.slug]);
    const policy=kind=>configuration.policies.find(p=>p.kind===kind).id;
    const input={businessSlug:cafe.slug,branchId:branch,displayName:'TEST Referral Friend',shareVerifiedEmail:false,phone:'',whatsappMarketingConsent:false,
      acceptedProgrammeVersionId:cafeInfo.programme.id,platformTermsDocumentId:policy('platform_terms'),privacyDocumentId:policy('privacy'),rejoin:false};
    joinInput=input;
    const grant=await issueGrant(friendUser,code);
    assert(grant);
    const joined=await as(friendUser,'join_business_referral',[input,grant,randomUUID()]);
    assert.equal(joined.status,'created');assert.equal(joined.referralApplied,true);friend=joined.membershipId;
    const existing=await as(friendUser,'join_business_referral',[input,'',randomUUID()]);
    assert.equal(existing.status,'existing');
    await assert.rejects(as(friendUser,'join_business_referral',[input,grant,randomUUID()]),{code:'42501'});
    await assert.rejects(as(friendUser,'join_business_referral',[input,code,randomUUID()]),{code:'42501'});
    assert.equal((await client.query('select count(*) from public.referral_claims where business_id=$1 and referred_membership_id=$2',[cafe.id,friend])).rows[0].count,'1');
    const localDay=(await client.query("select (clock_timestamp() at time zone timezone)::date::text as day from public.businesses where id=$1",[cafe.id])).rows[0].day;
    const report=await as(ownerUser,'referral_configuration',[cafe.id,localDay,localDay,'all',null,0,25]);
    assert.equal(report.metrics.signups,1);assert.equal(report.results[0].status,'pending');
    assert.equal(report.metrics.visits,1);
    assert.match(report.results[0].friendLabel,/^Friend [a-f0-9]{6}$/u);
    assert.equal(await issueGrant(referrerUser,code),'');
    const self=await as(referrerUser,'join_business_referral',[input,'',randomUUID()]);
    assert.equal(self.status,'existing');
    const staleUser=randomUUID(),staleSession=randomUUID();
    await client.query('insert into auth.users(id,email,email_confirmed_at,is_anonymous) values($1,$2,now(),false)',[staleUser,`stale-${staleUser}@example.invalid`]);
    await client.query('insert into public.profiles(user_id,auth_user_id,display_name) values($1,$1,$2)',[staleUser,'TEST Stale Friend']);
    await client.query('insert into auth.sessions(id,user_id) values($1,$2)',[staleSession,staleUser]);
    assert.equal(await issueGrant({id:staleUser,sessionId:staleSession},code,new Date(Date.now()-8*86400000).toISOString()),'');
    staleFriendUser={id:staleUser,sessionId:staleSession};
    const stale=await as(staleFriendUser,'join_business_referral',[input,'',randomUUID()]);
    staleMember=stale.membershipId;
    assert.equal(stale.status,'created');assert.equal(stale.referralApplied,undefined);
  });
  await test('Phase 4 promotion publication blocks overlap and cross-tenant configuration',async()=>{
    const local=(await client.query("select (clock_timestamp() at time zone timezone)::date::text as date,extract(isodow from clock_timestamp() at time zone timezone)::int as day from public.businesses where id=$1",[cafe.id])).rows[0];
    const draft={name:'TEST Afternoon double stamps',branchIds:[branch],startsOn:local.date,endsOn:local.date,weekdays:[local.day],
      startsAt:'00:00',endsAt:'23:59',minimumSpendPaisa:'0',memberDailyCap:1,maxBonusUnitsPerPurchase:1,effectiveAt:new Date().toISOString()};
    const saved=await as(ownerUser,'save_promotion',[cafe.id,draft,randomUUID()]);
    promo=await as(ownerUser,'publish_promotion',[cafe.id,saved.promotionId,saved.promotionVersionId,saved.rowVersion,true,randomUUID()]);
    assert.equal(promo.status,'enabled');
    const other=await as(ownerUser,'save_promotion',[cafe.id,{...draft,name:'TEST Overlapping slot'},randomUUID()]);
    await assert.rejects(as(ownerUser,'publish_promotion',[cafe.id,other.promotionId,other.promotionVersionId,other.rowVersion,true,randomUUID()]),{code:'23P01'});
    await assert.rejects(as(referrerUser,'promotion_configuration',[cafe.id]),{code:'42501'});
    const config=await as(ownerUser,'promotion_configuration',[cafe.id]);
    assert.equal(config.promotions.find(p=>p.id===promo.promotionId).versions[0].status,'published');
    assert.equal(config.programmeType,'stamps');assert.match(config.accentHex,/^#[0-9A-Fa-f]{6}$/u);
    assert(config.businessName&&config.nextReward?.unitCost>0);
  });
  await test('Phase 4 slots sharing a weekday but not an actual local date can coexist',async()=>{
    const common={branchIds:[branch],weekdays:[1],startsAt:'12:00',endsAt:'13:00',minimumSpendPaisa:'0',
      memberDailyCap:null,maxBonusUnitsPerPurchase:1,effectiveAt:new Date().toISOString()};
    const a=await as(ownerUser,'save_promotion',[cafe.id,{...common,name:'TEST First Monday',startsOn:'2026-09-28',endsOn:'2026-10-01'},randomUUID()]);
    await as(ownerUser,'publish_promotion',[cafe.id,a.promotionId,a.promotionVersionId,a.rowVersion,true,randomUUID()]);
    const b=await as(ownerUser,'save_promotion',[cafe.id,{...common,name:'TEST Next Monday',startsOn:'2026-09-29',endsOn:'2026-10-05'},randomUUID()]);
    const published=await as(ownerUser,'publish_promotion',[cafe.id,b.promotionId,b.promotionVersionId,b.rowVersion,true,randomUUID()]);
    assert.equal(published.status,'enabled');
  });
  const context=async()=>{const raw=token();await as(ownerUser,'resolve_scanner',[cafe.id,branch,'earningHandle',handle,hash(raw)]);return raw;};
  await test('Phase 4 first below-threshold purchase earns a slot bonus but no referral; later qualifying purchase earns both once',async()=>{
    await as(ownerUser,'save_referral_rules',[cafe.id,{enabled:false,inviterBonusUnits:2,friendBonusUnits:3,
      minimumSpendPaisa:'25000',monthlyInviterCap:10,attributionDays:7,qualificationDays:30},randomUUID()]);
    assert.equal((await client.query('select public.resolve_referral($1) as result',[code])).rows[0].result,null);
    assert.equal(await recordVisit(code),false);
    handle=`LOYALTY:EARN:v1:${token()}`;
    await as(friendUser,'set_membership_handle',[friend,hash(handle),'fixture-ciphertext','fixture-key',false,randomUUID()]);
    const first=await context(),low={recordedBillPaisa:'10000',eligibleSpendPaisa:'10000',qualifyingPurchaseConfirmed:true};
    const lowPreview=await as(ownerUser,'preview_purchase',[hash(first),low]);
    assert.equal(lowPreview.promotionBonusUnits,'1');assert.equal(lowPreview.referralBonusUnits,'0');
    await assert.rejects(as(ownerUser,'record_purchase',[hash(first),{...low,clientOccurredAt:'2000-01-01T00:00:00Z',expectedEffectHash:lowPreview.expectedEffectHash,idempotencyKey:randomUUID()},randomUUID()]),{code:'22023'});
    firstPurchase=await as(ownerUser,'record_purchase',[hash(first),{...low,expectedEffectHash:lowPreview.expectedEffectHash,idempotencyKey:randomUUID()},randomUUID()]);
    const second=await context(),high={recordedBillPaisa:'25000',eligibleSpendPaisa:'25000',qualifyingPurchaseConfirmed:true};
    const preview=await as(ownerUser,'preview_purchase',[hash(second),high]);
    assert.equal(preview.promotionBonusUnits,'0');assert.equal(preview.promotionReason,'daily_cap');
    assert.equal(preview.referralBonusUnits,'3');assert.equal(preview.inviterBonusUnits,'2');
    const key=randomUUID();purchase=await as(ownerUser,'record_purchase',[hash(second),{...high,expectedEffectHash:preview.expectedEffectHash,idempotencyKey:key},randomUUID()]);
    assert.equal(purchase.referralBonusUnits,'3');
    assert.equal((await as(ownerUser,'record_purchase',[hash(second),{...high,expectedEffectHash:preview.expectedEffectHash,idempotencyKey:key},randomUUID()])).replayed,true);
    const claim=(await client.query('select status,inviter_awarded_units,friend_awarded_units from public.referral_claims where referred_membership_id=$1',[friend])).rows[0];
    assert.deepEqual([claim.status,claim.inviter_awarded_units,claim.friend_awarded_units],['qualified',2,3]);
    assert.equal((await as(ownerUser,'reconcile_balances',[cafe.id])).mismatches,0);
  });
  await test('Phase 4 an inactive inviter pauses a pending claim until they return within the deadline',async()=>{
    const codeId=(await client.query('select id from public.referral_codes where code=$1',[code])).rows[0].id;
    const ruleId=(await client.query('select id from public.referral_rule_versions where business_id=$1 order by version limit 1',[cafe.id])).rows[0].id;
    await client.query("insert into public.referral_claims(business_id,referrer_membership_id,referred_membership_id,code_id,rule_version_id,enrolled_at,qualifies_until) values($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '30 days')",
      [cafe.id,referrer.id,staleMember,codeId,ruleId]);
    const staleHandle=`LOYALTY:EARN:v1:${token()}`;
    await as(staleFriendUser,'set_membership_handle',[staleMember,hash(staleHandle),'fixture-ciphertext','fixture-key',false,randomUUID()]);
    const checkout=token();await as(ownerUser,'resolve_scanner',[cafe.id,branch,'earningHandle',staleHandle,hash(checkout)]);
    const fields={recordedBillPaisa:'25000',eligibleSpendPaisa:'25000',qualifyingPurchaseConfirmed:true};
    await client.query("update public.memberships set status='left',left_at=clock_timestamp() where id=$1",[referrer.id]);
    const paused=await as(ownerUser,'preview_purchase',[hash(checkout),fields]);
    assert.equal(paused.referralReason,'referrer_inactive');assert.equal(paused.referralBonusUnits,'0');
    assert.equal((await client.query('select status from public.referral_claims where referred_membership_id=$1',[staleMember])).rows[0].status,'pending');
    await client.query("update public.memberships set status='active',left_at=null where id=$1",[referrer.id]);
    const resumed=await as(ownerUser,'preview_purchase',[hash(checkout),fields]);
    assert.equal(resumed.referralBonusUnits,'3');assert.equal(resumed.inviterBonusUnits,'2');
    await client.query("update public.memberships set status='anonymized' where id=$1",[referrer.id]);
    const anonymized=await as(ownerUser,'preview_purchase',[hash(checkout),fields]);
    assert.equal(anonymized.referralBonusUnits,'3');assert.equal(anonymized.inviterBonusUnits,'0');
    assert.equal(anonymized.referralReason,'member_unavailable');
    await client.query("update public.memberships set status='active' where id=$1",[referrer.id]);
    await client.query("update public.referral_claims set enrolled_at=clock_timestamp()-interval '31 days',qualifies_until=clock_timestamp()-interval '1 day' where referred_membership_id=$1",[staleMember]);
    const expired=await as(ownerUser,'preview_purchase',[hash(checkout),fields]);
    assert.equal(expired.referralReason,'expired');assert.equal(expired.referralBonusUnits,'0');
  });
  await test('Phase 4 branch and version changes invalidate previews without resetting daily cap',async()=>{
    secondBranch=randomUUID();
    await client.query("insert into public.branches(id,business_id,name,address,city) values($1,$2,'TEST Second Branch','Synthetic address','Lahore')",[secondBranch,cafe.id]);
    const checkout=token();const resolved=await as(ownerUser,'resolve_scanner',[cafe.id,secondBranch,'earningHandle',handle,hash(checkout)]);
    assert.equal(resolved.kind,'earning');
    const fields={recordedBillPaisa:'25000',eligibleSpendPaisa:'25000',qualifyingPurchaseConfirmed:true};
    const before=await as(ownerUser,'preview_purchase',[hash(checkout),fields]);
    assert.equal(before.promotionReason,'no_matching_slot');
    const date=(await client.query("select (clock_timestamp() at time zone timezone)::date::text as date,extract(isodow from clock_timestamp() at time zone timezone)::int as day from public.businesses where id=$1",[cafe.id])).rows[0];
    const newVersion=await as(ownerUser,'save_promotion',[cafe.id,{promotionId:promo.promotionId,rowVersion:promo.rowVersion,
      name:'TEST Afternoon double stamps',branchIds:[secondBranch],startsOn:date.date,endsOn:date.date,weekdays:[date.day],
      startsAt:'00:00',endsAt:'23:59',minimumSpendPaisa:'0',memberDailyCap:1,maxBonusUnitsPerPurchase:1,effectiveAt:new Date().toISOString()},randomUUID()]);
    await as(ownerUser,'publish_promotion',[cafe.id,newVersion.promotionId,newVersion.promotionVersionId,newVersion.rowVersion,true,randomUUID()]);
    await assert.rejects(as(ownerUser,'record_purchase',[hash(checkout),{...fields,expectedEffectHash:before.expectedEffectHash,
      idempotencyKey:randomUUID()},randomUUID()]),{code:'23P01'});
    const refreshed=await as(ownerUser,'preview_purchase',[hash(checkout),fields]);
    assert.equal(refreshed.promotionBonusUnits,'0');assert.equal(refreshed.promotionReason,'daily_cap');
    assert.notEqual(refreshed.expectedEffectHash,before.expectedEffectHash);
    assert.equal((await client.query('select bonus_units from public.promotion_usage where purchase_id=$1',[firstPurchase.purchaseId])).rows[0].bonus_units,1);
  });
  await test('Phase 4 full refund reverses friend and inviter ledgers and releases cap use once',async()=>{
    const before=(await as(friendUser,'customer_card',[friend])).ledgerVersion;
    const key=randomUUID(),reversed=await as(ownerUser,'reverse_purchase',[cafe.id,purchase.purchaseId,'TEST ONLY: full refund after referral',before,key,randomUUID()]);
    assert.equal(reversed.reversedEntryIds.length,3);
    assert.equal((await as(ownerUser,'reverse_purchase',[cafe.id,purchase.purchaseId,'TEST ONLY: full refund after referral',before,key,randomUUID()])).replayed,true);
    assert.equal((await client.query('select status from public.referral_claims where referred_membership_id=$1',[friend])).rows[0].status,'reversed');
    assert.equal((await client.query('select count(*) from public.referral_cap_usage where reversed_at is not null')).rows[0].count,'1');
    assert.equal((await as(ownerUser,'reconcile_balances',[cafe.id])).mismatches,0);
  });
  await test('Phase 4 full reversal frees the stable promotion daily cap across branches and versions',async()=>{
    const before=(await as(friendUser,'customer_card',[friend])).ledgerVersion;
    await as(ownerUser,'reverse_purchase',[cafe.id,firstPurchase.purchaseId,'TEST ONLY: full refund releases daily slot cap',before,randomUUID(),randomUUID()]);
    const checkout=token();await as(ownerUser,'resolve_scanner',[cafe.id,secondBranch,'earningHandle',handle,hash(checkout)]);
    const fields={recordedBillPaisa:'25000',eligibleSpendPaisa:'25000',qualifyingPurchaseConfirmed:true};
    const preview=await as(ownerUser,'preview_purchase',[hash(checkout),fields]);
    assert.equal(preview.promotionBonusUnits,'1');assert.equal(preview.referralBonusUnits,'0');
    const committed=await as(ownerUser,'record_purchase',[hash(checkout),{...fields,expectedEffectHash:preview.expectedEffectHash,
      idempotencyKey:randomUUID()},randomUUID()]);
    assert.equal(committed.promotionBonusUnits,'1');
    assert.equal((await as(ownerUser,'reconcile_balances',[cafe.id])).mismatches,0);
  });
  await test('Phase 4 concurrent first purchases honor the inviter monthly cap across rule versions',async()=>{
    const ruleInput={enabled:true,inviterBonusUnits:2,friendBonusUnits:3,minimumSpendPaisa:'25000',monthlyInviterCap:1,attributionDays:7,qualificationDays:30};
    await as(ownerUser,'save_referral_rules',[cafe.id,ruleInput,randomUUID()]);
    const createFriend=async(index)=>{
      const userId=randomUUID(),sessionId=randomUUID(),who={id:userId,sessionId};
      await client.query('insert into auth.users(id,email,email_confirmed_at,is_anonymous) values($1,$2,now(),false)',[userId,`cap-${index}-${userId}@example.invalid`]);
      await client.query('insert into public.profiles(user_id,auth_user_id,display_name) values($1,$1,$2)',[userId,`TEST Cap Friend ${index}`]);
      await client.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
      const grant=await issueGrant(who,code);assert(grant);
      const joined=await as(who,'join_business_referral',[{...joinInput,displayName:`TEST Cap Friend ${index}`},grant,randomUUID()]);
      assert.equal(joined.referralApplied,true);
      const raw=`LOYALTY:EARN:v1:${token()}`;
      await as(who,'set_membership_handle',[joined.membershipId,hash(raw),'fixture-ciphertext','fixture-key',false,randomUUID()]);
      const checkout=token();const resolved=await as(ownerUser,'resolve_scanner',[cafe.id,branch,'earningHandle',raw,hash(checkout)]);
      assert.equal(resolved.kind,'earning');
      return {membershipId:joined.membershipId,checkout};
    };
    const first=await createFriend(1);
    await as(ownerUser,'save_referral_rules',[cafe.id,ruleInput,randomUUID()]);
    const second=await createFriend(2);
    const fields={recordedBillPaisa:'25000',eligibleSpendPaisa:'25000',qualifyingPurchaseConfirmed:true};
    const preview1=await as(ownerUser,'preview_purchase',[hash(first.checkout),fields]);
    const preview2=await as(ownerUser,'preview_purchase',[hash(second.checkout),fields]);
    assert.equal(preview1.inviterBonusUnits,'2');assert.equal(preview2.inviterBonusUnits,'2');
    const connections=[postgres.getPgClient(),postgres.getPgClient()];await Promise.all(connections.map(connection=>connection.connect()));
    let results;
    try {
      results=await Promise.allSettled([as(ownerUser,'record_purchase',[hash(first.checkout),{...fields,expectedEffectHash:preview1.expectedEffectHash,idempotencyKey:randomUUID()},randomUUID()],connections[0]),
        as(ownerUser,'record_purchase',[hash(second.checkout),{...fields,expectedEffectHash:preview2.expectedEffectHash,idempotencyKey:randomUUID()},randomUUID()],connections[1])]);
    } finally {await Promise.all(connections.map(connection=>connection.end()));}
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.code==='23P01').length,1);
    const loser=results[0].status==='rejected'?first:second;
    const refreshed=await as(ownerUser,'preview_purchase',[hash(loser.checkout),fields]);
    assert.equal(refreshed.inviterBonusUnits,'0');assert.equal(refreshed.referralBonusUnits,'3');assert.equal(refreshed.referralReason,'monthly_cap');
    await as(ownerUser,'record_purchase',[hash(loser.checkout),{...fields,expectedEffectHash:refreshed.expectedEffectHash,idempotencyKey:randomUUID()},randomUUID()]);
    const cap=(await client.query('select count(*) from public.referral_cap_usage where business_id=$1 and referrer_membership_id=$2 and reversed_at is null',[cafe.id,referrer.id])).rows[0].count;
    assert.equal(cap,'1');
    assert.equal((await as(ownerUser,'reconcile_balances',[cafe.id])).mismatches,0);
  });
  await test('Phase 4 concurrent purchases award one promotion daily-cap slot',async()=>{
    const raw=`LOYALTY:EARN:v1:${token()}`;
    await as(referrerUser,'set_membership_handle',[referrer.id,hash(raw),'fixture-ciphertext','fixture-key',true,randomUUID()]);
    const contexts=[token(),token()];
    for(const checkout of contexts){
      const resolved=await as(ownerUser,'resolve_scanner',[cafe.id,secondBranch,'earningHandle',raw,hash(checkout)]);
      assert.equal(resolved.kind,'earning');
    }
    const fields={recordedBillPaisa:'25000',eligibleSpendPaisa:'25000',qualifyingPurchaseConfirmed:true};
    const previews=await Promise.all(contexts.map(checkout=>as(ownerUser,'preview_purchase',[hash(checkout),fields])));
    assert.deepEqual(previews.map(preview=>preview.promotionBonusUnits),['1','1'],
      JSON.stringify(previews.map(preview=>({base:preview.baseUnits,reason:preview.promotionReason}))));
    const connections=[postgres.getPgClient(),postgres.getPgClient()];await Promise.all(connections.map(connection=>connection.connect()));
    let results;
    try{
      results=await Promise.allSettled(contexts.map((checkout,index)=>as(ownerUser,'record_purchase',
        [hash(checkout),{...fields,expectedEffectHash:previews[index].expectedEffectHash,idempotencyKey:randomUUID()},randomUUID()],connections[index])));
    }finally{await Promise.all(connections.map(connection=>connection.end()));}
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.code==='23P01').length,1);
    const loser=contexts[results.findIndex(result=>result.status==='rejected')];
    const fresh=await as(ownerUser,'preview_purchase',[hash(loser),fields]);
    assert.equal(fresh.promotionBonusUnits,'0');assert.equal(fresh.promotionReason,'daily_cap');
    const base=await as(ownerUser,'record_purchase',[hash(loser),{...fields,expectedEffectHash:fresh.expectedEffectHash,
      idempotencyKey:randomUUID()},randomUUID()]);
    assert.equal(base.promotionBonusUnits,'0');
    assert.equal((await client.query('select count(*) from public.promotion_usage where promotion_id=$1 and membership_id=$2 and reversed_at is null',
      [promo.promotionId,referrer.id])).rows[0].count,'1');
    assert.equal((await as(ownerUser,'reconcile_balances',[cafe.id])).mismatches,0);
  });
  await test('Phase 4 points round the Rs 250 base before applying the capped 2x slot',async()=>{
    const pointsCafe=(await client.query("select id,timezone from public.businesses where slug='phase3-points'")).rows[0];
    const pointsMember=(await client.query('select id,customer_user_id from public.memberships where business_id=$1 limit 1',[pointsCafe.id])).rows[0];
    const pointsBranch=(await client.query('select id from public.branches where business_id=$1 limit 1',[pointsCafe.id])).rows[0].id;
    const current=await as(ownerUser,'loyalty_configuration',[pointsCafe.id]);
    const saved=await as(ownerUser,'save_programme_version',[pointsCafe.id,{rowVersion:current.programme.rowVersion,name:'TEST Rs 100 step',
      type:'points',minimumSpendPaisa:'0',stampsPerPurchase:null,spendStepPaisa:'10000',unitsPerStep:1,
      maxBaseUnitsPerPurchase:1000,terms:'TEST ONLY: one point for every Rs 100.',effectiveAt:new Date().toISOString()},randomUUID()]);
    await as(ownerUser,'publish_programme_version',[pointsCafe.id,saved.programmeVersionId,saved.rowVersion,randomUUID()]);
    const local=(await client.query("select (clock_timestamp() at time zone timezone)::date::text as date,extract(isodow from clock_timestamp() at time zone timezone)::int as day from public.businesses where id=$1",[pointsCafe.id])).rows[0];
    const slot=await as(ownerUser,'save_promotion',[pointsCafe.id,{name:'TEST points double',branchIds:[pointsBranch],startsOn:local.date,
      endsOn:local.date,weekdays:[local.day],startsAt:'00:00',endsAt:'23:59',minimumSpendPaisa:'0',memberDailyCap:null,
      maxBonusUnitsPerPurchase:1000,effectiveAt:new Date().toISOString()},randomUUID()]);
    await as(ownerUser,'publish_promotion',[pointsCafe.id,slot.promotionId,slot.promotionVersionId,slot.rowVersion,true,randomUUID()]);
    const raw=`LOYALTY:EARN:v1:${token()}`;
    await as(referrerUser,'set_membership_handle',[pointsMember.id,hash(raw),'fixture-ciphertext','fixture-key',true,randomUUID()]);
    const checkout=token();const resolved=await as(ownerUser,'resolve_scanner',[pointsCafe.id,pointsBranch,'earningHandle',raw,hash(checkout)]);
    assert.equal(resolved.kind,'earning');
    const fields={recordedBillPaisa:'25000',eligibleSpendPaisa:'25000',qualifyingPurchaseConfirmed:false};
    const preview=await as(ownerUser,'preview_purchase',[hash(checkout),fields]);
    assert.equal(preview.baseUnits,'2');assert.equal(preview.promotionBonusUnits,'2');
    const committed=await as(ownerUser,'record_purchase',[hash(checkout),{...fields,expectedEffectHash:preview.expectedEffectHash,
      idempotencyKey:randomUUID()},randomUUID()]);
    assert.equal(committed.baseUnits,'2');assert.equal(committed.promotionBonusUnits,'2');
    assert.equal((await as(ownerUser,'reconcile_balances',[pointsCafe.id])).mismatches,0);
  });
}
