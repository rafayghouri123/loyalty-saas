import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { generateDbTypes } from './generate-db-types.mjs';

const {startWorker}=await import('../src/worker/runtime.ts');
const base=resolve('.local/integration');
mkdirSync(base,{recursive:true});
const directory=resolve(base,randomUUID());
// No recursive deletion: diagnostic database files stay within .local/integration.
const server=createServer();
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const port=server.address().port;
await new Promise(resolve=>server.close(resolve));
const password=randomBytes(24).toString('hex');
const postgres=new EmbeddedPostgres({databaseDir:directory,port,user:'postgres',password,authMethod:'scram-sha-256',persistent:true,createPostgresUser:false,initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
let client;let worker;
const passed=[];
const test=async(name,action)=>{await action();passed.push(name);console.log(`PASS ${name}`);};
try{
  await postgres.initialise();await postgres.start();
  client=postgres.getPgClient();await client.connect();
  // Explicit SQL-only Auth fixture. This is not Supabase GoTrue/PostgREST proof.
  await client.query(`create role anon nologin;create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean default false,deleted_at timestamptz);
    create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`);
  for(const migration of readdirSync('supabase/migrations').filter(v=>v.endsWith('.sql')).sort()) await client.query(readFileSync(`supabase/migrations/${migration}`,'utf8'));
  await test('migration applies to a real PostgreSQL server',async()=>{const result=await client.query('show server_version');console.log(`PostgreSQL ${result.rows[0].server_version}`);});
  const a=randomUUID(),b=randomUUID(),c=randomUUID(),unverified=randomUUID(),anonymous=randomUUID();
  await client.query('insert into auth.users(id,email_confirmed_at,is_anonymous) values($1,now(),false),($2,now(),false),($3,now(),false),($4,null,false),($5,now(),true)',[a,b,c,unverified,anonymous]);
  const asUser=async(id,sql,params=[])=>{
    await client.query('begin');
    try{await client.query('set local role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);const result=await client.query(sql,params);await client.query('commit');return result;}
    catch(error){await client.query('rollback');throw error;}
  };
  await test('profile creation commits one profile, audit and outbox; repeat does not overwrite',async()=>{
    await asUser(a,'select public.complete_profile($1,$2)',['Customer A',randomUUID()]);
    const replay=await asUser(a,'select public.complete_profile($1,$2)',['Changed name',randomUUID()]);
    assert.equal(replay.rows[0].complete_profile.created,false);
    assert.equal(replay.rows[0].complete_profile.displayName,'Customer A');
    assert.equal((await client.query('select count(*) from public.outbox_events')).rows[0].count,'1');
    assert.equal((await client.query('select count(*) from public.audit_events')).rows[0].count,'1');
  });
  await test('unverified and anonymous direct RPC calls are denied',async()=>{
    for(const user of [unverified,anonymous])await assert.rejects(asUser(user,'select public.complete_profile($1,$2)',['Invalid',randomUUID()]),{code:'42501'});
  });
  await test('Unicode/blank bounds enforced directly in SQL',async()=>{
    for(const name of [' ','😀'.repeat(81)])await assert.rejects(asUser(b,'select public.complete_profile($1,$2)',[name,randomUUID()]),{code:'22023'});
    await asUser(b,'select public.complete_profile($1,$2)',['😀'.repeat(80),randomUUID()]);
  });
  await test('profile RLS isolates two customers; no direct profile or internal table writes',async()=>{
    const result=await asUser(a,'select user_id from public.profiles');assert.deepEqual(result.rows,[{user_id:a}]);
    await assert.rejects(asUser(a,'update public.profiles set display_name=$1',['Injected']),{code:'42501'});
    for(const table of ['audit_events','outbox_events','businesses','business_users','job_effect_receipts']) await assert.rejects(asUser(a,`select * from public.${table}`),{code:'42501'});
    await assert.rejects(asUser(a,'select public.worker_pending_outbox()'),{code:'42501'});
  });
  await test('rollback removes profile and both transactional effects',async()=>{
    await client.query('begin');await client.query('set local role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,true)",[c]);
    await client.query('select public.complete_profile($1,$2)',['Rolled back',randomUUID()]);await client.query('rollback');
    assert.equal((await client.query('select count(*) from public.profiles where user_id=$1',[c])).rows[0].count,'0');
    assert.equal((await client.query('select count(*) from public.outbox_events where event_key=$1',[c])).rows[0].count,'0');
  });
  await test('simultaneous direct RPC creates a single profile and outbox event',async()=>{
    await Promise.all(Array.from({length:5},async()=>{
      const conn=postgres.getPgClient();await conn.connect();
      try{await conn.query('begin');await conn.query('set local role authenticated');await conn.query("select set_config('request.jwt.claim.sub',$1,true)",[c]);await conn.query('select public.complete_profile($1,$2)',['Concurrent',randomUUID()]);await conn.query('commit');}
      finally{await conn.end();}
    }));
    assert.equal((await client.query('select count(*) from public.outbox_events where event_key=$1',[c])).rows[0].count,'1');
  });
  await test('composite branch assignments reject cross-tenant records',async()=>{
    const cafeA=randomUUID(),cafeB=randomUUID(),branchB=randomUUID(),staffA=randomUUID();
    await client.query("insert into public.businesses(id,slug,display_name,created_by) values($1,'fixture-cafe-a','Fixture Cafe A',$3),($2,'fixture-cafe-b','Fixture Cafe B',$3)",[cafeA,cafeB,a]);
    await client.query("insert into public.branches(id,business_id,name,address,city) values($1,$2,'Test branch','Fictional address','Lahore')",[branchB,cafeB]);
    await client.query("insert into public.business_users(id,business_id,user_id,staff_display_name,staff_email,role) values($1,$2,$3,'Fixture owner','fixture@example.invalid','owner')",[staffA,cafeA,a]);
    await assert.rejects(client.query('insert into public.branch_assignments(business_id,business_user_id,branch_id) values($1,$2,$3)',[cafeA,staffA,branchB]),{code:'23503'});
    await assert.rejects(client.query("insert into public.business_users(business_id,user_id,staff_display_name,staff_email,role,can_contact_customers) values($1,$2,'Cashier','cashier@example.invalid','cashier',true)",[cafeB,b]),{code:'23514'});
  });
  await test('audit records are append-only even under a privileged write',async()=>{
    await assert.rejects(client.query("update public.audit_events set action='changed'"),{code:'42501'});
  });
  await client.query(`create role integration_worker login password '${password}' inherit;grant loyalty_worker to integration_worker;`);
  const workerUrl=`postgresql://integration_worker:${password}@127.0.0.1:${port}/postgres`;
  const errors=[];
  await test('failed outbox marking rolls back its durable pg-boss enqueue',async()=>{
    await client.query("create function public.integration_fail_dispatch() returns trigger language plpgsql as $$ begin raise exception 'injected_dispatch_failure'; end $$;create trigger integration_fail_dispatch before update on public.outbox_events for each row execute function public.integration_fail_dispatch()");
    worker=await startWorker({connectionString:workerUrl,ssl:false,onError:code=>errors.push(code)});
    const deadline=Date.now()+10_000;
    while(!errors.includes('outbox_dispatch_failed')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
    assert.ok(errors.includes('outbox_dispatch_failed'));
    assert.equal((await client.query('select count(*) from pgboss.job')).rows[0].count,'0');
    assert.equal((await client.query("select count(*) from public.outbox_events where state='pending'")).rows[0].count,'3');
    await client.query('drop trigger integration_fail_dispatch on public.outbox_events;drop function public.integration_fail_dispatch()');
    errors.length=0;
  });
  await test('real pg-boss worker recovers and consumes committed outbox events durably',async()=>{
    const deadline=Date.now()+25_000;
    while(Date.now()<deadline){
      const count=(await client.query('select count(*) from public.job_effect_receipts')).rows[0].count;
      if(count==='3')break;
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    assert.deepEqual(errors,[]);
    assert.equal((await client.query('select count(*) from public.job_effect_receipts')).rows[0].count,'3');
    assert.equal((await client.query("select count(*) from public.outbox_events where state='dispatched'")).rows[0].count,'3');
  });
  await test('durable consumer receipt prevents repeated effects and rejects tampered scope',async()=>{
    const event=(await client.query('select id from public.outbox_events order by id limit 1')).rows[0];
    const conn=new pg.Client({connectionString:workerUrl});await conn.connect();
    try{assert.equal((await conn.query('select public.worker_observe_profile($1)',[event.id])).rows[0].worker_observe_profile,false);await assert.rejects(conn.query('select * from public.profiles'),{code:'42501'});}
    finally{await conn.end();}
    const bad=(await client.query("insert into public.outbox_events(event_type,event_key,schema_version,payload) values('profile.created',$1,1,'{}') returning id",[randomUUID()])).rows[0];
    await assert.rejects(client.query('select public.worker_observe_profile($1)',[bad.id]),{code:'22023'});
  });
  await generateDbTypes(client);
  console.log(`Integration: ${passed.length} checks passed. Auth adapter is SQL-only; provider integration remains pending.`);
}finally{
  if(worker)await worker.stop();
  if(client)await client.end();
  await postgres.stop();
}
