import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { startWorker } from '../src/worker/runtime.ts';

export async function testPhase9Security({client,workerUrl,test}) {
  await test('Phase 9 timezone fast path still rejects invalid changed values and accepts IANA zones',async()=>{
    const id=(await client.query('select user_id from public.profiles limit 1')).rows[0].user_id;
    await client.query('begin');
    try {
      await client.query("update public.profiles set preferred_timezone='Europe/London' where user_id=$1",[id]);
      await client.query("update public.profiles set display_name='TEST unchanged timezone' where user_id=$1",[id]);
      await assert.rejects(client.query("update public.profiles set preferred_timezone='Invalid/Timezone' where user_id=$1",[id]),{code:'22023'});
    } finally { await client.query('rollback'); }
  });
  const inventory=(await client.query(`select p.oid::regprocedure::text signature,p.prosecdef security_definer,p.proconfig configuration,
    has_function_privilege('anon',p.oid,'execute') anonymous,has_function_privilege('authenticated',p.oid,'execute') authenticated,
    has_function_privilege('loyalty_worker',p.oid,'execute') worker,
    has_function_privilege('loyalty_web_gateway',p.oid,'execute') gateway
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') order by 1`)).rows;
  mkdirSync('.local',{recursive:true});writeFileSync('.local/phase9-security-inventory.json',JSON.stringify(inventory,null,2)+'\n');
  await test('Phase 9 every application SECURITY DEFINER has a fixed safe search path',async()=>{
    assert.deepEqual(inventory.filter(p=>p.security_definer&&!p.configuration?.some(c=>c==='search_path=""'||c==='search_path=')),[]);
  });
  await test('Phase 9 every public table has RLS and no anonymous table privilege',async()=>{
    const rows=(await client.query(`select c.relname,c.relrowsecurity,
      has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') exposed
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')`)).rows;
    assert.deepEqual(rows.filter(r=>!r.relrowsecurity||r.exposed),[]);
  });
  await test('Phase 9 worker and gateway RPCs are denied to browser roles',async()=>{
    assert.deepEqual(inventory.filter(p=>/^(worker_|gateway_)/u.test(p.signature)&&(p.anonymous||p.authenticated)),[]);
    const writes=(await client.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','app_private') and c.relkind='r' and has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')`)).rows;
    assert.deepEqual(writes,[]);
  });
  await test('Phase 9 terminated consumer after committed effect recovers without duplicate receipt',async()=>{
    const user=randomUUID();
    await client.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,`crash-${user}@example.invalid`]);
    await client.query('begin');await client.query('set local role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
    await client.query("select public.complete_profile('TEST crash recovery',$1)",[randomUUID()]);await client.query('commit');
    const event=(await client.query("select id from public.outbox_events where event_type='profile.created' and event_key=$1",[user])).rows[0].id;
    let worker=await startWorker({connectionString:workerUrl,ssl:false},{bounded:true});
    let child;
    try {
      // This dedicated queue prevents consuming an unrelated earlier fixture.
      await worker.boss.createQueue('phase9-crash',{retryLimit:2,retryDelay:0,expireInSeconds:1});
      const id=await worker.boss.send('phase9-crash',{outboxId:event},{expireInSeconds:1,retryLimit:2,retryDelay:0});
      await worker.stop();worker=undefined;
      child=fork(new URL('./phase9-crash-child.mjs',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc'],execArgv:[]});
      const stage=new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Crash probe did not reach committed stage')),15000);
        child.once('message',message=>{clearTimeout(timer);message.stage==='committed'?resolve():reject(new Error('Crash probe failed'));});
        child.once('error',error=>{clearTimeout(timer);reject(error);});
      });
      child.send({workerUrl});await stage;
      const exited=once(child,'exit');child.kill('SIGKILL');await exited;child=undefined;
      assert.equal((await client.query('select state from pgboss.job where id=$1',[id])).rows[0].state,'active');
      await new Promise(resolve=>setTimeout(resolve,1600));
      worker=await startWorker({connectionString:workerUrl,ssl:false},{bounded:true});
      await worker.boss.supervise();
      const [job]=await worker.boss.fetch('phase9-crash',{includeMetadata:true});assert.equal(job.id,id);assert(job.retryCount>0);
      const replay=(await client.query('select public.worker_observe_profile($1) changed',[event])).rows[0].changed;assert.equal(replay,false);
      await worker.boss.complete('phase9-crash',id);
      assert.equal((await client.query("select count(*) from public.job_effect_receipts where handler_name='profile.created' and event_key=$1",[user])).rows[0].count,'1');
      assert.equal((await client.query('select state from pgboss.job where id=$1',[id])).rows[0].state,'completed');
    } finally { if(child)child.kill('SIGKILL');if(worker)await worker.stop(); }
  });
}
