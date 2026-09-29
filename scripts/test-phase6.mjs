import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function testPhase6({ client, postgres, test: runTest }) {
 const test=(name,action)=>runTest(name,async()=>{await client.query('delete from public.rate_limit_buckets');await action();});
 const cafe=(await client.query("select id from public.businesses where slug='phase2-a'")).rows[0].id;
 const owner=(await client.query("select u.user_id id,s.id session,u.id staff_id from public.business_users u join auth.sessions s on s.user_id=u.user_id where u.business_id=$1 and u.role='owner' and u.status='active' limit 1",[cafe])).rows[0];
 const branch=(await client.query("select b.id from public.branches b join public.reward_branches rb on rb.branch_id=b.id join public.rewards r on r.published_version_id=rb.reward_version_id where b.business_id=$1 and b.status='active' and r.status='published' limit 1",[cafe])).rows[0].id;
 const users=[];
 for(let i=0;i<6;i++){
  const user={id:randomUUID(),session:randomUUID()};users.push(user);
  await client.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now());",[user.id,`phase6-${i}@example.invalid`]);
  await client.query('insert into auth.sessions(id,user_id) values($1,$2)',[user.session,user.id]);
  await client.query('insert into public.profiles(user_id,auth_user_id,display_name) values($1,$1,$2)',[user.id,`TEST phase6 ${i}`]);
 }
 const [manager,manager2,cashier,member,member2,noConsent]=users;
 for(const [who,role,contact] of [[manager,'manager',true],[manager2,'manager',true],[cashier,'cashier',false]]){
  who.staff_id=(await client.query("insert into public.business_users(business_id,user_id,staff_display_name,staff_email,role,can_contact_customers) values($1,$2,'Phase6 staff',$3,$4,$5) returning id",[cafe,who.id,`${who.id}@example.invalid`,role,contact])).rows[0].id;
  await client.query('insert into public.branch_assignments(business_id,business_user_id,branch_id) values($1,$2,$3)',[cafe,who.staff_id,branch]);
 }
 for(const [i,who] of [member,member2,noConsent].entries()){
  who.member_id=(await client.query("insert into public.memberships(business_id,customer_user_id,display_name,joined_branch_id) values($1,$2,$3,$4) returning id",[cafe,who.id,i===0?'Ayesha Test & 😀':`TEST member ${i}`,branch])).rows[0].id;
  await client.query('insert into public.balances(business_id,membership_id) values($1,$2)',[cafe,who.member_id]);
  await client.query("insert into public.membership_contacts(business_id,membership_id,phone_e164) values($1,$2,'+923001234567')",[cafe,who.member_id]);
 }
 const rpc=async(who,name,args=[],aal='aal2',connection=client)=>{
  await connection.query('begin');try{
   await connection.query('set local role authenticated');
   await connection.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[who.id,JSON.stringify({sub:who.id,session_id:who.session,aal})]);
   const value=(await connection.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result;
   await connection.query('set constraints all immediate');await connection.query('commit');return value;
  }catch(error){await connection.query('rollback');throw error;}
 };
 const policy=(await client.query("select version from public.policy_documents where kind='whatsapp_marketing' and published_at is not null order by published_at desc limit 1")).rows[0].version;
 for(const who of [member,member2])await rpc(who,'set_consent',[who.member_id,'whatsapp','marketing',true,policy,randomUUID()]);
 await client.query("insert into app_private.whatsapp_origin(origin) values('https://staging.example.invalid') on conflict(singleton) do update set origin=excluded.origin");
 let template;
 const templateInput=body=>({templateId:null,rowVersion:null,name:'TEST hello',body,active:true});
 await test('Phase 6 direct RPC denies customer/cashier contacts and owner mutations without MFA',async()=>{
  for(const who of [member,cashier]){
   for(const name of ['whatsapp_configuration','whatsapp_members','whatsapp_tasks'])await assert.rejects(rpc(who,name,[cafe]),{code:'42501'});
   await assert.rejects(rpc(who,'whatsapp_member_contact',[cafe,member.member_id]),{code:'42501'});
  }
  await assert.rejects(rpc(owner,'save_whatsapp_template',[cafe,templateInput('Hello {{first_name}}, visit {{business_name}}.'),randomUUID()],'aal1'),{code:'42501'});
  const conn=postgres.getPgClient();await conn.connect();try{
   await conn.query('set role authenticated');for(const table of ['whatsapp_templates','followup_batches','followup_tasks','followup_events'])await assert.rejects(conn.query(`select * from public.${table}`),{code:'42501'});
   await assert.rejects(conn.query('select public.worker_purge_manual_messages()'),{code:'42501'});
  }finally{await conn.end();}
 });
 await test('Phase 6 Unicode template bounds and exact grammar are enforced in SQL',async()=>{
  for(const body of ['short','😀'.repeat(1001),'Hello {{unknown}} today','Hello {first_name} today','Hello {{{first_name}}} today','Hello {{first_name today','Hello <% execute %> today','Hello ${execute} today'])
   await assert.rejects(rpc(owner,'save_whatsapp_template',[cafe,templateInput(body),randomUUID()]),{code:'22023'});
  await rpc(owner,'save_whatsapp_template',[cafe,templateInput('😀'.repeat(10)),randomUUID()]);
  await rpc(owner,'save_whatsapp_template',[cafe,templateInput('😀'.repeat(1000)),randomUUID()]);
  template=await rpc(manager,'save_whatsapp_template',[cafe,templateInput('Hello {{first_name}} & 😀, visit {{business_name}}.'),randomUUID()],'aal1');
 });
 const batch=(ids=[member.member_id],extras={})=>({name:'TEST follow-ups',templateId:template.templateId,templateVersion:template.version,
  audience:'selected_members',memberIds:ids,inactiveDays:null,targetRewardVersionId:null,offerId:null,assignedBusinessUserId:null,...extras});
 const create=async(who=owner,ids=[member.member_id],extras={})=>{
  const result=await rpc(who,'create_followup_batch',[cafe,batch(ids,extras),randomUUID(),randomUUID()]);
  const task=(await client.query('select id,row_version from public.followup_tasks where batch_id=$1 order by id',[result.batchId])).rows[0];
  return {batch:result,task};
 };
 const detail=async(task,who=owner)=>rpc(who,'whatsapp_task_detail',[cafe,task.id]);
 const action=async(task,kind,who=owner,extras={})=>rpc(who,'act_on_followup_task',[cafe,task.id,{rowVersion:(await detail(task,who)).rowVersion,action:kind,attestsSent:kind==='mark_sent',note:kind==='opt_out'?'Customer replied STOP':'',assignedBusinessUserId:null,...extras},randomUUID()]);
 let first;
 await test('Phase 6 preview excludes nonconsent and tasks snapshot version with idempotent retry',async()=>{
  const input=batch([member.member_id,noConsent.member_id]);
  const preview=await rpc(owner,'preview_followup_batch',[cafe,input]);assert.equal(preview.eligible,1);assert.equal(preview.excluded,1);
  assert.equal(preview.members.find(m=>m.membershipId===noConsent.member_id).exclusion,'no_whatsapp_consent');
  const cafeName=(await client.query('select display_name from public.businesses where id=$1',[cafe])).rows[0].display_name;
  assert.equal(preview.members.find(m=>m.membershipId===member.member_id).body,`Hello Ayesha & 😀, visit ${cafeName}.`);
  assert(!JSON.stringify(preview).includes('923001234567'));
  const key=randomUUID();first=await rpc(owner,'create_followup_batch',[cafe,input,key,randomUUID()]);assert.equal(first.createdTasks,1);
  const replay=await rpc(owner,'create_followup_batch',[cafe,input,key,randomUUID()]);assert.equal(replay.replayed,true);assert.equal(replay.excluded,1);
  await assert.rejects(rpc(owner,'create_followup_batch',[cafe,{...input,name:'Changed'},key,randomUUID()]),{code:'23505'});
  await assert.rejects(rpc(owner,'create_followup_batch',[cafe,batch([member.member_id],{assignedBusinessUserId:cashier.staff_id}),randomUUID(),randomUUID()]),{code:'42501'});
 });
 await test('Phase 6 first-name extraction handles Unicode whitespace without evaluating inserted placeholder text',async()=>{
  const original=(await client.query('select display_name from public.memberships where id=$1',[member.member_id])).rows[0].display_name;
  await client.query('update public.memberships set display_name=$2 where id=$1',[member.member_id,'\u00a0{{business_name}}\u2003Test']);
  try{const preview=await rpc(owner,'preview_followup_batch',[cafe,batch()]);assert(preview.members[0].body.startsWith('Hello {{business_name}} & 😀,'));}
  finally{await client.query('update public.memberships set display_name=$2 where id=$1',[member.member_id,original]);}
 });
 await test('Phase 6 templates keep saved tasks immutable and stale batch edits conflict',async()=>{
  const saved=(await client.query('select body,row_version from public.whatsapp_templates where id=$1',[template.templateId])).rows[0];
  const changed=await rpc(owner,'save_whatsapp_template',[cafe,{templateId:template.templateId,rowVersion:saved.row_version,name:'Updated template',body:'New {{first_name}} follow-up message.',active:true},randomUUID()]);
  await assert.rejects(rpc(owner,'preview_followup_batch',[cafe,batch()]),{code:'23505'});
  const body=(await client.query('select rendered_body from public.followup_tasks where batch_id=$1',[first.batchId])).rows[0].rendered_body;
  assert(body.startsWith('Hello Ayesha'));template=changed;
 });
 await test('Phase 6 rendered expansion is excluded and placeholders need real reward/offer values',async()=>{
  const expanded=await rpc(owner,'save_whatsapp_template',[cafe,templateInput('x'.repeat(975)+' {{business_name}}'),randomUUID()]);
  const oldName=(await client.query('select display_name from public.businesses where id=$1',[cafe])).rows[0].display_name;
  await client.query('update public.businesses set display_name=$2 where id=$1',[cafe,'C'.repeat(80)]);
  const preview=await rpc(owner,'preview_followup_batch',[cafe,batch([member.member_id],{templateId:expanded.templateId,templateVersion:expanded.version})]);
  await client.query('update public.businesses set display_name=$2 where id=$1',[cafe,oldName]);
  assert.equal(preview.members[0].exclusion,'rendered_length_out_of_bounds');assert.equal(preview.eligible,0);
  const missing=await rpc(owner,'save_whatsapp_template',[cafe,templateInput('Come for {{reward_name}} at {{public_offer_url}}'),randomUUID()]);
  await assert.rejects(rpc(owner,'preview_followup_batch',[cafe,batch([member.member_id],{templateId:missing.templateId,templateVersion:missing.version})]),{code:'22023'});
  const none=await rpc(owner,'preview_followup_batch',[cafe,batch([],{audience:'inactive',inactiveDays:365})]);assert.equal(none.eligible,0);
 });
 await test('Phase 6 public offer links use the configured origin and real published reward/offer selections',async()=>{
  const reward=(await client.query("select r.published_version_id id from public.rewards r join public.reward_branches rb on rb.reward_version_id=r.published_version_id where r.business_id=$1 and r.status='published' and rb.branch_id=$2 limit 1",[cafe,branch])).rows[0].id;
  const o=await rpc(owner,'save_offer',[cafe,{kind:'informational',title:'TEST public update',description:'Synthetic public information.',terms:'',startsAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),audience:'all_members',branchIds:[branch],recipientIds:[],isAutomationTemplate:false,discountPercent:null,minimumSpendPaisa:'0',maxDiscountPaisa:null},randomUUID()]);
  await rpc(owner,'set_offer_status',[cafe,o.offerId,'published',o.rowVersion,randomUUID()]);
  const all=await rpc(owner,'save_whatsapp_template',[cafe,templateInput('Hello {{first_name}} at {{business_name}}, enjoy {{reward_name}}: {{public_offer_url}}'),randomUUID()]);
  const input=batch([member.member_id],{templateId:all.templateId,templateVersion:all.version,targetRewardVersionId:reward,offerId:o.offerId});
  const preview=await rpc(owner,'preview_followup_batch',[cafe,input]);assert.equal(preview.eligible,1);
  assert(preview.members[0].body.includes(`https://staging.example.invalid/app/offers/${o.offerId}`));assert(!preview.members[0].body.includes('?'));
  await client.query('delete from app_private.whatsapp_origin');
  await assert.rejects(rpc(owner,'preview_followup_batch',[cafe,input]),{code:'22023'});
  await client.query("insert into app_private.whatsapp_origin(origin) values('https://staging.example.invalid')");
 });
 await test('Phase 6 cross-tenant task references and member selectors are denied directly',async()=>{
  const other=(await client.query("select m.id from public.memberships m join public.businesses b on b.id=m.business_id where b.slug='phase2-b' and m.status='active' limit 1")).rows[0].id;
  await assert.rejects(rpc(owner,'preview_followup_batch',[cafe,batch([other])]),{code:'P0002'});
  const fresh=await create();
  await assert.rejects(client.query("insert into public.followup_tasks(business_id,batch_id,membership_id,rendered_body,contact_version_at_creation) values($1,$2,$3,'TEST cross tenant message',1)",[cafe,fresh.batch.batchId,other]),{code:'23503'});
  await action(fresh.task,'skip');
 });
 let openedTask;
 await test('Phase 6 concurrent opens select one assignee and encode the intended chat without marking sent',async()=>{
  openedTask=(await create()).task;
  const conns=[postgres.getPgClient(),postgres.getPgClient()];await Promise.all(conns.map(c=>c.connect()));
  let results;try{results=await Promise.all([rpc(manager,'open_whatsapp_task',[cafe,openedTask.id,1,randomUUID()],'aal1',conns[0]),rpc(manager2,'open_whatsapp_task',[cafe,openedTask.id,1,randomUUID()],'aal1',conns[1])]);}finally{await Promise.all(conns.map(c=>c.end()));}
  const success=results.find(r=>r.url);assert.equal(results.filter(r=>r.url).length,1);assert.equal(success.state,'opened');
  const link=new URL(success.url);assert.equal(link.hostname,'wa.me');assert.equal(link.pathname,'/923001234567');assert.equal(link.searchParams.get('text'),'New Ayesha follow-up message.');
  const current=await detail(openedTask);assert.equal(current.markedSentAt,null);
  const list=await rpc(owner,'whatsapp_tasks',[cafe,{batchId:(await client.query('select batch_id from public.followup_tasks where id=$1',[openedTask.id])).rows[0].batch_id}]);
  assert.deepEqual(list.counts,{opened:1,staffMarkedSent:0});assert(!JSON.stringify(list).includes('923001234567'));
  const winner=current.assignedId===manager.staff_id?manager:manager2;
  const loser=winner===manager?manager2:manager;
  await assert.rejects(action(openedTask,'reassign',loser,{assignedBusinessUserId:loser.staff_id}),{code:'23505'});
  const reopened=await rpc(winner,'open_whatsapp_task',[cafe,openedTask.id,current.rowVersion,randomUUID()],'aal1');assert(reopened.url);
  await assert.rejects(action(openedTask,'mark_sent',winner,{attestsSent:false}),{code:'22023'});
  const marked=await action(openedTask,'mark_sent',winner);assert.equal(marked.state,'staff_marked_sent');assert(marked.markedSentAt);
 });
 await test('Phase 6 rolling 24-hour contact gate serializes distinct tasks and does not consume push allowance',async()=>{
  const next=(await create()).task;
  const before=(await client.query('select count(*) from public.contact_frequency_reservations')).rows[0].count;
  const denied=await rpc(owner,'open_whatsapp_task',[cafe,next.id,1,randomUUID()]);assert.equal(denied.error.code,'rate_limited');assert(denied.error.retryAfterSeconds>0);
  assert.equal((await detail(next)).state,'pending');
  assert.equal((await client.query('select count(*) from public.contact_frequency_reservations')).rows[0].count,before);
  await client.query("update public.followup_tasks set opened_at=now()-interval '25 hours',marked_sent_at=now()-interval '25 hours',last_contact_checked_at=now()-interval '25 hours' where id=$1",[openedTask.id]);
  assert((await rpc(owner,'open_whatsapp_task',[cafe,next.id,1,randomUUID()])).url);
  await action(next,'skip');
 });
 await test('Phase 6 a five-minute lease prevents takeover until expiry and human marking can record work without an open',async()=>{
  const fresh=(await create(owner,[member2.member_id])).task;
  const opened=await rpc(manager,'open_whatsapp_task',[cafe,fresh.id,1,randomUUID()],'aal1');assert(opened.url);
  await assert.rejects(action(fresh,'reassign',owner,{assignedBusinessUserId:manager2.staff_id}),{code:'23505'});
  await client.query("update public.followup_tasks set lease_expires_at=now()-interval '1 second' where id=$1",[fresh.id]);
  const reassigned=await action(fresh,'reassign',owner,{assignedBusinessUserId:manager2.staff_id});assert.equal(reassigned.assignedId,manager2.staff_id);
  const renewed=await rpc(manager2,'open_whatsapp_task',[cafe,fresh.id,reassigned.rowVersion,randomUUID()],'aal1');assert(renewed.url);
  await action(fresh,'skip',manager2);
  const manual=(await create(owner,[member2.member_id])).task;const marked=await action(manual,'mark_sent');assert.equal(marked.state,'staff_marked_sent');assert.equal(marked.openedAt,null);
 });
 await test('Phase 6 changed contact blocks old task even after a fresh opt-in; staff confirmation never grants consent',async()=>{
  const fresh=(await create(owner,[member2.member_id])).task;
  let contact=await rpc(member2,'membership_preferences',[member2.member_id]);
  await rpc(member2,'save_membership_contact',[member2.member_id,{phone:'+923111234567',shareVerifiedEmail:false,rowVersion:contact.contact.rowVersion},randomUUID()]);
  await rpc(member2,'set_consent',[member2.member_id,'whatsapp','marketing',true,policy,randomUUID()]);
  const old=await detail(fresh);assert.equal(old.state,'opted_out');assert.equal(old.contactStale,true);
  assert.equal((await rpc(owner,'open_whatsapp_task',[cafe,fresh.id,old.rowVersion,randomUUID()])).error.code,'conflict');
  const c=await rpc(owner,'whatsapp_member_contact',[cafe,noConsent.member_id]);
  const confirmed=await rpc(owner,'act_on_member_contact',[cafe,noConsent.member_id,{rowVersion:c.rowVersion,action:'confirm_number',note:'Verified customer-initiated chat',attested:true},randomUUID()]);
  assert.equal(confirmed.phoneStatus,'staff_confirmed');assert.equal(confirmed.whatsappConsent,false);
 });
 await test('Phase 6 manual STOP opt-out suppresses all unsent tasks and cannot opt a customer in',async()=>{
  const a=(await create(owner,[member2.member_id])).task,b=(await create(owner,[member2.member_id])).task;
  const out=await action(a,'opt_out');assert.equal(out.state,'opted_out');assert.equal((await detail(b)).state,'opted_out');
  const event=(await client.query("select source,allowed from public.consent_events where membership_id=$1 and channel='whatsapp' order by occurred_at desc limit 1",[member2.member_id])).rows[0];
  assert.equal(event.source,'staff_recorded_optout');assert.equal(event.allowed,false);
  await assert.rejects(rpc(owner,'act_on_member_contact',[cafe,member2.member_id,{rowVersion:2,action:'opt_in',note:'not allowed',attested:true},randomUUID()]),{code:'22023'});
 });
 await test('Phase 6 shared direct-RPC open limit persists failed attempts and rejects the 31st hourly call',async()=>{
  const task=(await create()).task;
  for(let i=0;i<30;i++)assert((await rpc(owner,'open_whatsapp_task',[cafe,task.id,999,randomUUID()])).error);
  assert.equal((await rpc(owner,'open_whatsapp_task',[cafe,task.id,999,randomUUID()])).error.code,'rate_limited');
  assert.equal((await client.query("select count from public.rate_limit_buckets where operation='manual_task_open' order by count desc limit 1")).rows[0].count,31);
 });
 await test('Phase 6 revoked contact rights, branch removal and subscription pause block numbers/opens immediately',async()=>{
  const fresh=(await create(owner,[member.member_id])).task;
  await client.query('delete from public.branch_assignments where business_user_id=$1',[manager.staff_id]);
  await assert.rejects(detail(fresh,manager),{code:'P0002'});
  await assert.rejects(rpc(manager,'preview_followup_batch',[cafe,batch()]),{code:'P0002'});
  await client.query('update public.business_users set can_contact_customers=false where id=$1',[manager2.staff_id]);
  await assert.rejects(detail(fresh,manager2),{code:'42501'});
  await client.query("update public.subscriptions set status='suspended' where business_id=$1",[cafe]);
  assert.equal((await rpc(owner,'open_whatsapp_task',[cafe,fresh.id,1,randomUUID()])).error.code,'forbidden');
  await client.query("update public.subscriptions set status='active' where business_id=$1",[cafe]);
  await assert.rejects(rpc(owner,'whatsapp_tasks',[cafe,{startDate:'2026-01-01',endDate:'2026-04-01'}]),{code:'22023'});
 });
 await test('Phase 6 90-day worker cleanup removes content while retaining honest action history',async()=>{
  const fresh=(await create()).task;
  await client.query("update public.followup_tasks set created_at=now()-interval '91 days' where id=$1",[fresh.id]);
  await client.query('begin');try{await client.query('set local role loyalty_worker');assert((await client.query('select public.worker_purge_manual_messages() n')).rows[0].n>=1);await client.query('commit');}catch(e){await client.query('rollback');throw e;}
  const cleaned=await detail(fresh);assert.equal(cleaned.body,null);assert.equal(cleaned.state,'skipped');
  assert((await client.query('select count(*) from public.followup_events')).rows[0].count>0);
  await assert.rejects(client.query("update public.followup_events set action='opened'"),{code:'42501'});
 });
}
