import assert from 'node:assert/strict';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';

export async function testMultiProgrammes({ client, test }) {
  const candidate=(await client.query(`select b.id business_id,b.slug,b.row_version,owner.user_id owner_id,
      session.id owner_session,branch.id branch_id,p.id primary_id,
      (select v.id from public.programme_versions v where v.programme_id=p.id and v.status='published' and v.effective_at<=now()
       order by v.effective_at desc,v.id desc limit 1) primary_version
    from public.businesses b join public.business_users owner on owner.business_id=b.id and owner.role='owner' and owner.status='active'
    join auth.sessions session on session.user_id=owner.user_id
    join public.branches branch on branch.business_id=b.id and branch.status='active'
    join public.loyalty_programmes p on p.business_id=b.id and p.is_primary and p.status='published'
    where b.status='active' and app_private.entitled(b.id)
    and exists(select from public.programme_versions v where v.programme_id=p.id and v.status='published' and v.effective_at<=now())
    order by b.created_at,b.id limit 1`)).rows[0];
  assert(candidate,'A published entitled cafe is required for the two-programme check');
  const customer={id:randomUUID(),session:randomUUID()};
  await client.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',
    [customer.id,`multi-${customer.id}@example.invalid`]);
  await client.query('insert into auth.sessions(id,user_id) values($1,$2)',[customer.session,customer.id]);
  await client.query('insert into public.profiles(user_id,auth_user_id,display_name) values($1,$1,$2)',[customer.id,'Multi card customer']);
  const rpc=async(user,name,args=[],aal='aal2')=>{
    await client.query('begin');
    try{
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
        [user.id,JSON.stringify({sub:user.id,session_id:user.session,aal,amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)}]})]);
      const result=(await client.query(`select public.${name}(${args.map((_,index)=>`$${index+1}`).join(',')}) result`,args)).rows[0].result;
      await client.query('set constraints all immediate');await client.query('commit');return result;
    }catch(error){await client.query('rollback');throw error;}
  };
  const owner={id:candidate.owner_id,session:candidate.owner_session};
  let programmeId,secondaryVersion,secondaryReward,primaryCard,secondaryCard;
  await test('additional programme needs owner MFA and keeps the primary programme intact',async()=>{
    const input={rowVersion:candidate.row_version,type:'points',name:`TEST extra ${customer.id.slice(0,8)}`,
      minimumSpendPaisa:'100',stampsPerPurchase:null,spendStepPaisa:'10000',unitsPerStep:1,
      maxBaseUnitsPerPurchase:1000,terms:'TEST points earning terms.',rewardTitle:'TEST extra coffee',
      rewardUnitCost:'5',rewardDescription:'',rewardTerms:'TEST extra reward terms.',
      rewardBranchIds:[candidate.branch_id],estimatedCostPaisa:null};
    await assert.rejects(rpc(owner,'create_additional_programme',[candidate.business_id,input,randomUUID()],'aal1'),{code:'42501'});
    const result=await rpc(owner,'create_additional_programme',[candidate.business_id,input,randomUUID()]);
    programmeId=result.programmeId;secondaryVersion=result.programmeVersionId;secondaryReward=result.rewardVersionId;
    assert.notEqual(programmeId,candidate.primary_id);
    assert.equal((await rpc(owner,'business_programmes',[candidate.business_id])).length,2);
    assert.equal((await client.query('select is_primary from public.loyalty_programmes where id=$1',[programmeId])).rows[0].is_primary,false);
    assert.equal((await client.query('select id from public.loyalty_programmes where business_id=$1 and is_primary',[candidate.business_id])).rows[0].id,candidate.primary_id);
    await assert.rejects(rpc(owner,'publish_programme_version',[candidate.business_id,secondaryVersion,1,randomUUID()]),{code:'40001'});
    const draftReward=(await client.query('select id,row_version from public.rewards where business_id=$1 and programme_id=$2',[candidate.business_id,programmeId])).rows[0];
    await assert.rejects(rpc(owner,'publish_reward',[candidate.business_id,draftReward.id,draftReward.row_version,randomUUID()]),{code:'40001'});
    await rpc(owner,'publish_additional_programme',[candidate.business_id,programmeId,randomUUID()]);
    assert.equal((await client.query('select status from public.loyalty_programmes where id=$1',[programmeId])).rows[0].status,'published');
  });
  await test('programme management is owner-only while public listings expose published versions',async()=>{
    await assert.rejects(rpc(customer,'business_programmes',[candidate.business_id],'aal1'),{code:'42501'});
    await assert.rejects(rpc(customer,'programme_configuration',[candidate.business_id,programmeId],'aal1'),{code:'42501'});
    await assert.rejects(rpc(customer,'staff_programmes',[candidate.business_id],'aal1'),{code:'42501'});
    assert((await rpc(owner,'staff_programmes',[candidate.business_id])).some(row=>row.id===programmeId));
    const published=await rpc(customer,'public_programmes',[candidate.slug],'aal1');
    assert(published.some(row=>row.id===programmeId&&row.programmeVersionId===secondaryVersion));
    const detail=await rpc(customer,'public_programme',[candidate.slug,programmeId],'aal1');
    assert.equal(detail.programme.id,secondaryVersion);
    assert.equal(detail.programme.programmeId,programmeId);
    assert(detail.rewards.some(row=>row.id===secondaryReward));
    const other=await rpc(customer,'public_programme',[candidate.slug,randomUUID()],'aal1');
    assert.equal(other,null);
  });
  await test('one customer gets independent cards, rewards and balances at one cafe',async()=>{
    const policies=(await rpc(customer,'public_configuration',[],'aal1')).policies;
    const policy=kind=>policies.find(row=>row.kind===kind)?.id;
    assert(policy('platform_terms')&&policy('privacy'));
    const join=version=>({businessSlug:candidate.slug,branchId:candidate.branch_id,displayName:'Multi card customer',
      shareVerifiedEmail:false,phone:'',whatsappMarketingConsent:false,acceptedProgrammeVersionId:version,
      platformTermsDocumentId:policy('platform_terms'),privacyDocumentId:policy('privacy'),rejoin:false});
    const firstJoin=await rpc(customer,'join_business',[join(candidate.primary_version),randomUUID()],'aal1');
    const secondJoin=await rpc(customer,'join_business',[join(secondaryVersion),randomUUID()],'aal1');
    assert(firstJoin.membershipId,`Primary join rejected: ${JSON.stringify(firstJoin.error??null)}`);
    assert(secondJoin.membershipId,`Additional join rejected: ${JSON.stringify(secondJoin.error??null)}`);
    primaryCard=firstJoin.membershipId;secondaryCard=secondJoin.membershipId;
    assert.notEqual(primaryCard,secondaryCard);
    const cards=(await rpc(customer,'my_memberships',[],'aal1')).filter(row=>row.businessId===candidate.business_id);
    assert.equal(cards.length,2);assert.equal(new Set(cards.map(row=>row.programmeId)).size,2);
    const first=await rpc(customer,'customer_card',[primaryCard],'aal1');
    const second=await rpc(customer,'customer_card',[secondaryCard],'aal1');
    assert.equal(first.programmeType,(await client.query('select type from public.loyalty_programmes where id=$1',[candidate.primary_id])).rows[0].type);
    assert.equal(second.programmeType,'points');assert.equal(second.programmeId,programmeId);
    assert(first.rewards.every(reward=>reward.id!==secondaryReward));
    assert(second.rewards.some(reward=>reward.id===secondaryReward));
    assert.equal(first.units,'0');assert.equal(second.units,'0');
    await assert.rejects(client.query(`insert into public.redemption_intents(business_id,membership_id,reward_version_id,token_hash,expires_at,created_by)
      values($1,$2,$3,$4,now()+interval '5 minutes',$5)`,
      [candidate.business_id,primaryCard,secondaryReward,'a'.repeat(64),customer.id]),{code:'23514'});
    assert.equal((await client.query('select count(*) from public.balances where membership_id in ($1,$2)',[primaryCard,secondaryCard])).rows[0].count,'2');
  });
  await test('staff programme choice rejects a different card and binds the selected earning rules',async()=>{
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const raw=Array.from({length:8},()=>alphabet[randomInt(alphabet.length)]).join('');
    const hash=value=>createHash('sha256').update(value).digest('hex');
    const code=await rpc(customer,'create_scanner_code',[secondaryCard,'membership_lookup',null,hash(raw)],'aal1');
    assert(code.expiresAt,JSON.stringify(code));
    const rejected=await rpc(owner,'resolve_scanner_for_programme',
      [candidate.business_id,candidate.branch_id,'typedCode',raw,hash(randomUUID()),candidate.primary_id]);
    assert.equal(rejected.error?.code,'conflict');
    const token=hash(randomUUID());
    const selected=await rpc(owner,'resolve_scanner_for_programme',
      [candidate.business_id,candidate.branch_id,'typedCode',raw,token,programmeId]);
    assert.equal(selected.programmeId,programmeId);
    assert.equal(selected.programmeType,'points');
    assert.equal(selected.balance,'0');
    const fields={recordedBillPaisa:'50000',eligibleSpendPaisa:'50000',qualifyingPurchaseConfirmed:true,receiptReference:'multi-programme'};
    const preview=await rpc(owner,'preview_purchase',[token,fields]);
    assert.equal(preview.membershipId,secondaryCard);
    assert.equal(preview.programmeVersionId,secondaryVersion);
    assert.equal(preview.programmeType,'points');
    assert.equal(preview.minimumSpendPaisa,'100');
    const purchase=await rpc(owner,'record_purchase',[token,{...fields,expectedEffectHash:preview.expectedEffectHash,idempotencyKey:randomUUID()},randomUUID()]);
    assert.equal(purchase.programmeVersionId,secondaryVersion);
    const balances=(await client.query('select membership_id,units from public.balances where membership_id in ($1,$2)',[primaryCard,secondaryCard])).rows;
    assert.equal(balances.find(row=>row.membership_id===primaryCard).units,'0');
    assert(BigInt(balances.find(row=>row.membership_id===secondaryCard).units)>=5n);
    const intentRaw=randomBytes(32).toString('base64url'),intent=await rpc(customer,'create_redemption_intent',[secondaryCard,secondaryReward,hash(`LOYALTY:REDEEM:v1:${intentRaw}`),randomUUID()],'aal1');
    assert(intent.intentId,JSON.stringify(intent));
    const redeemToken=hash(randomUUID());
    const redemption=await rpc(owner,'resolve_scanner_for_programme',
      [candidate.business_id,candidate.branch_id,'redemptionIntent',`LOYALTY:REDEEM:v1:${intentRaw}`,redeemToken,programmeId]);
    assert.equal(redemption.programmeId,programmeId);
    const redeemPreview=await rpc(owner,'preview_redemption',[redeemToken]);
    const completed=await rpc(owner,'finalize_redemption',[redeemToken,redeemPreview.expectedEffectHash,randomUUID(),randomUUID()]);
    assert.equal(completed.status,'fulfilled');
    assert.equal((await client.query('select units from public.balances where membership_id=$1',[primaryCard])).rows[0].units,'0');
  });
  await test('published reward edits keep its identity and past redemptions',async()=>{
    const before=(await client.query('select id,row_version,published_version_id from public.rewards where programme_id=$1',[programmeId])).rows[0];
    assert.equal(before.published_version_id,secondaryReward);
    const input={programmeId,rewardId:before.id,rowVersion:before.row_version,title:'TEST updated extra coffee',unitCost:7,
      description:'Updated reward',terms:'TEST updated reward terms for future redemptions.',estimatedCostPaisa:null,branchIds:[candidate.branch_id]};
    const saved=await rpc(owner,'save_reward_draft',[candidate.business_id,input,randomUUID()]);
    assert.equal(saved.rewardId,before.id);
    assert.notEqual(saved.rewardVersionId,secondaryReward);
    const pending=(await client.query('select status,published_version_id,draft_version_id,name from public.rewards where id=$1',[before.id])).rows[0];
    assert.equal(pending.status,'published');assert.equal(pending.published_version_id,secondaryReward);
    assert.equal(pending.draft_version_id,saved.rewardVersionId);
    assert.equal(pending.name,'TEST extra coffee');
    const detail=await rpc(owner,'programme_configuration',[candidate.business_id,programmeId]);
    const item=detail.rewards.find(row=>row.id===before.id);
    assert.equal(item.publishedVersion.unitCost,5);
    assert.equal(item.draftVersion.unitCost,7);
    await assert.rejects(rpc(owner,'publish_reward',[candidate.business_id,before.id,before.row_version,randomUUID()]),{code:'40001'});
    const published=await rpc(owner,'publish_reward',[candidate.business_id,before.id,saved.rowVersion,randomUUID()]);
    assert.equal(published.rewardId,before.id);
    assert.equal(published.rewardVersionId,saved.rewardVersionId);
    assert.equal((await client.query('select count(*) from public.rewards where programme_id=$1',[programmeId])).rows[0].count,'1');
    const history=(await client.query('select count(*) from public.redemptions where reward_version_id=$1 and status=$2',[secondaryReward,'fulfilled'])).rows[0].count;
    assert.equal(history,'1');
    await assert.rejects(client.query('delete from public.reward_branches where reward_version_id=$1',[secondaryReward]),{code:'42501'});
    await assert.rejects(client.query('update public.reward_versions set unit_cost=99 where id=$1',[secondaryReward]),{code:'42501'});
  });
  await test('mixed stamps and points reports avoid misleading business-wide unit totals',async()=>{
    const report=await rpc(owner,'get_report',[candidate.business_id,{reportKind:'rewards',preset:'today',branchIds:[]}]);
    for(const key of ['baseUnits','promotionUnits','referralUnits','redeemedUnits','outstandingUnitsCurrent','adjustmentDebtCurrent'])
      assert.equal(report.metrics[key],null,`${key} must not add units from separate programmes`);
  });
}
