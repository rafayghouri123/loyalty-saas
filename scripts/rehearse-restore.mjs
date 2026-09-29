// Real stopped PostgreSQL physical backup and isolated restore. Synthetic/local only.
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,relative,isAbsolute} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import pg from 'pg';
import {processPrivacy} from '../src/worker/privacy.ts';
export async function rehearseRestore({client,postgres,stopWorker,directory,port,password,test}){
 const stopDatabase=async instance=>{const ctl=resolve(`node_modules/@embedded-postgres/${process.platform==='win32'?'windows':process.platform}-${process.arch}/native/bin/pg_ctl${process.platform==='win32'?'.exe':''}`);await promisify(execFile)(ctl,['-D',instance.options.databaseDir,'-m','fast','-w','-t','30','stop'],{windowsHide:true});instance.process=undefined;};
 const root=resolve('.local/integration'),destination=resolve(root,`restore-${randomUUID()}`),artifactRoot=resolve('.local/restore-evidence',randomUUID());
 for(const path of [resolve(directory),destination,artifactRoot]){const within=relative(resolve('.local'),path);assert(within&&!within.startsWith('..')&&!isAbsolute(within),'Restore paths must remain inside .local.');}
 // This extra subject exists in the backup and is REALLY deleted after the backup.
 const subject=randomUUID(),session=randomUUID(),member=randomUUID();
 const cafe=(await client.query("select b.id,br.id branch from public.businesses b join public.branches br on br.business_id=b.id where b.slug='phase8-billing-fixture' limit 1")).rows[0];
 await client.query("insert into auth.users(id,email,email_confirmed_at) values($1,'restore-sentinel@example.invalid',now());",[subject]);await client.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,subject]);await client.query("insert into public.profiles(user_id,auth_user_id,display_name) values($1,$1,'TEST restored personal identity')",[subject]);await client.query("insert into public.memberships(id,business_id,customer_user_id,display_name,joined_branch_id) values($1,$2,$3,'TEST restored membership',$4)",[member,cafe.id,subject,cafe.branch]);await client.query('insert into public.balances(business_id,membership_id,units) values($1,$2,0)',[cafe.id,member]);await client.query("insert into public.membership_contacts(business_id,membership_id,phone_e164) values($1,$2,'+923009876543')",[cafe.id,member]);
 await client.query('begin');await client.query('set local role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[subject,JSON.stringify({sub:subject,session_id:session,aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)}]})]);const request=(await client.query("select public.request_privacy('delete_account',null,$1,$2) r",[randomUUID(),randomUUID()])).rows[0].r;await client.query('commit');
 const event=(await client.query('select id from public.outbox_events where event_key=$1',[request.requestId])).rows[0].id;
 const snapshot=(await client.query("select (select count(*)::text from public.payment_events) payments,(select count(*)::text from public.ledger_entries) ledger,(select count(*)::text from public.purchases) purchases,(select jsonb_agg(jsonb_build_object('customerId',customer_user_id,'kind',kind,'membershipId',membership_id)) from public.privacy_requests where status='completed' and kind<>'export') privacy")).rows[0];
 const journal={requests:snapshot.privacy??[],consents:(await client.query('select membership_id as "membershipId",channel,purpose from public.consent_preferences where not allowed')).rows,devices:(await client.query("select id as \"deviceId\" from public.push_devices where status in ('revoked','invalid')")).rows};
 // Keep the durable privacy/consent journal separately from the database snapshot.
 await mkdir(artifactRoot,{recursive:true});await writeFile(resolve(artifactRoot,'revocations.json'),JSON.stringify(journal));
 const bytes=Buffer.from('Synthetic private storage backup fixture; no customer data.'),hash=createHash('sha256').update(bytes).digest('hex');await writeFile(resolve(artifactRoot,'private-object.bin'),bytes);
 await stopWorker();await client.end();await stopDatabase(postgres);
 const began=Date.now();await cp(directory,destination,{recursive:true,errorOnExist:true,force:false});
 await postgres.start();const source=postgres.getPgClient();await source.connect();const workerPool=new pg.Pool({connectionString:`postgresql://integration_worker:${password}@127.0.0.1:${port}/postgres`,max:1});
 try{await processPrivacy(workerPool,event,{key:{id:'restore-test',bytes:Buffer.alloc(32)},put:async()=>{},sign:async()=>'',remove:async()=>{}},{remove:async id=>{await source.query('delete from auth.users where id=$1',[id]);}});assert.equal((await source.query('select status from public.privacy_requests where id=$1',[request.requestId])).rows[0].status,'completed');journal.requests.push({customerId:subject,kind:'delete_account',membershipId:null});await writeFile(resolve(artifactRoot,'revocations.json'),JSON.stringify(journal));}finally{await workerPool.end();await source.end();await stopDatabase(postgres);}
 const clone=new EmbeddedPostgres({databaseDir:destination,port,user:'postgres',password,authMethod:'scram-sha-256',persistent:true,createPostgresUser:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});let restored;
 try{
  await clone.start();restored=clone.getPgClient();await restored.connect();
  await test('Phase 8 real stopped PostgreSQL backup restores immutable payments, ledger, purchases and private storage fixture',async()=>{
   const r=(await restored.query('select (select count(*)::text from public.payment_events) payments,(select count(*)::text from public.ledger_entries) ledger,(select count(*)::text from public.purchases) purchases')).rows[0];for(const key of ['payments','ledger','purchases'])assert.equal(r[key],snapshot[key]);
   const copy=resolve(artifactRoot,'restored-private-object.bin');await cp(resolve(artifactRoot,'private-object.bin'),copy,{errorOnExist:true,force:false});assert.equal(createHash('sha256').update(await readFile(copy)).digest('hex'),hash);
   await assert.rejects(restored.query("update public.payment_events set external_reference='changed'"),{code:'42501'});
  });
  await test('Phase 8 restore replays completed privacy/consent/device revocations before any sender and repeats safely',async()=>{
   const saved=JSON.parse(await readFile(resolve(artifactRoot,'revocations.json'),'utf8'));
   assert.equal((await restored.query('select display_name from public.profiles where user_id=$1',[subject])).rows[0].display_name,'TEST restored personal identity');assert.equal((await restored.query('select status from public.privacy_requests where id=$1',[request.requestId])).rows[0].status,'pending');
   for(let attempt=0;attempt<2;attempt++)await restored.query('select app_private.restore_privacy_replay($1,$2,$3)',[JSON.stringify(saved.requests),JSON.stringify(saved.consents),JSON.stringify(saved.devices)]);
   for(const req of saved.requests)if(req.kind==='delete_account'){const p=(await restored.query('select auth_user_id,display_name,birthday_month from public.profiles where user_id=$1',[req.customerId])).rows[0];assert.equal(p.auth_user_id,null);assert.equal(p.display_name,'Deleted user');assert.equal(p.birthday_month,null);assert.equal((await restored.query('select count(*) from public.memberships where customer_user_id=$1',[req.customerId])).rows[0].count,'0');}
   for(const item of saved.consents)assert.equal((await restored.query('select allowed from public.consent_preferences where membership_id=$1 and channel=$2 and purpose=$3',[item.membershipId,item.channel,item.purpose])).rows[0].allowed,false);
   assert.equal((await restored.query('select count(*) from auth.users where id=$1',[subject])).rows[0].count,'0');assert.equal((await restored.query('select phone_e164 from public.membership_contacts where membership_id=$1',[member])).rows[0].phone_e164,null);assert.equal((await restored.query('select status from public.privacy_requests where id=$1',[request.requestId])).rows[0].status,'completed');
  });
  await writeFile(resolve(artifactRoot,'result.json'),JSON.stringify({kind:'local-synthetic-stopped-PostgreSQL-18.4',restoredAt:new Date().toISOString(),elapsedMs:Date.now()-began,paymentEvents:snapshot.payments,ledgerEntries:snapshot.ledger,purchases:snapshot.purchases,storageFixtureSha256:hash,journalReplay:'passed',hostedBackupCoverage:'unverified'}));
  console.log(`Restore rehearsal: ${Date.now()-began} ms; evidence is local synthetic recovery, not purchased Supabase backup/RPO coverage.`);
 }finally{await restored?.end();if(clone.process)await stopDatabase(clone);}
}
