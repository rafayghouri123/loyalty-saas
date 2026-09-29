import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {startWorker} from '../src/worker/runtime.ts';
import {withWorkerControl} from '../src/worker/vercel-controller.ts';

export async function testVercelWorker({client,workerUrl,test}){
 const savedUrl=process.env.WORKER_DATABASE_URL,savedSsl=process.env.WORKER_DB_SSL;
 process.env.WORKER_DATABASE_URL=workerUrl;process.env.WORKER_DB_SSL='false';
 const control=new pg.Client({connectionString:workerUrl});await control.connect();
 let worker;
 try{
  await test('Vercel controller denies browser/gateway roles and selects one exact deployment/run',async()=>{
   await client.query('begin');await client.query('set local role authenticated');
   await assert.rejects(client.query('select public.worker_vercel_disable()'),{code:'42501'});await client.query('rollback');
   await client.query('begin');await client.query('set local role loyalty_web_gateway');
   await assert.rejects(client.query('select public.worker_vercel_status()'),{code:'42501'});await client.query('rollback');
   const generation=randomUUID();await control.query('select public.worker_vercel_activate($1,$2,$3)',[generation,'dpl_test','wrun_first']);
   const current=async(generation,epoch,run)=>(await control.query("select public.worker_vercel_current($1,'dpl_test',$2,$3) ok",[generation,epoch,run])).rows[0].ok;
   assert.equal(await current(generation,0,'wrun_first'),true);
   assert.equal(await current(randomUUID(),0,'wrun_first'),false);
   assert.equal(await current(generation,0,'wrun_orphan'),false);
   assert.equal((await control.query("select public.worker_vercel_advance($1,0,'wrun_first','wrun_next') ok",[generation])).rows[0].ok,true);
   assert.equal(await current(generation,0,'wrun_first'),false);assert.equal(await current(generation,1,'wrun_next'),true);
   assert.equal((await control.query("select public.worker_vercel_advance($1,0,'wrun_first','wrun_orphan') ok",[generation])).rows[0].ok,false);
   await control.query('select public.worker_vercel_disable()');assert.equal(await current(generation,1,'wrun_next'),false);
  });
  await test('Vercel overlapping invocations cannot acquire the worker session lock',async()=>{
   await withWorkerControl(async()=>{assert.equal(await withWorkerControl(async()=>true),null);});
   assert.equal(await withWorkerControl(async()=>true),true);
  });
  const customer=randomUUID();await client.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[customer,`bounded-${customer}@example.invalid`]);
  await client.query('begin');await client.query('set local role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,true)",[customer]);
  await client.query('select public.complete_profile($1,$2)',['Bounded customer',randomUUID()]);await client.query('commit');
  const event=(await client.query("select id from public.outbox_events where event_type='profile.created' and event_key=$1",[customer])).rows[0].id;
  await test('bounded pg-boss batch keeps enqueue and outbox acknowledgement atomic',async()=>{
   const failures=[];
   worker=await startWorker({connectionString:workerUrl,ssl:false,onError:code=>failures.push(code)},{bounded:true});
   await client.query("create function public.integration_bounded_fail() returns trigger language plpgsql as $$ begin raise exception 'injected_failure';end $$;create trigger integration_bounded_fail before update on public.outbox_events for each row execute function public.integration_bounded_fail()");
   await worker.runBatch();assert(failures.includes('outbox_dispatch_failed'));
   assert.equal((await client.query('select count(*) from pgboss.job where id=$1',[event])).rows[0].count,'0');
   assert.equal((await client.query('select state from public.outbox_events where id=$1',[event])).rows[0].state,'pending');
   await client.query('drop trigger integration_bounded_fail on public.outbox_events;drop function public.integration_bounded_fail()');
  });
  await test('bounded worker completes durable jobs; receipt prevents replay after lost acknowledgement',async()=>{
   await worker.runBatch();
   assert.equal((await client.query('select state from pgboss.job where id=$1',[event])).rows[0].state,'completed');
   assert.equal((await client.query("select count(*) from public.job_effect_receipts where event_key=$1 and handler_name='profile.created'",[customer])).rows[0].count,'1');
   await worker.boss.send('profile-created',{outboxId:event},{id:randomUUID()});await worker.runBatch();
   assert.equal((await client.query("select count(*) from public.job_effect_receipts where event_key=$1 and handler_name='profile.created'",[customer])).rows[0].count,'1');
  });
  await test('bounded calendar enqueue deduplicates billing and preserves failure retry metadata',async()=>{
   const before=(await client.query("select count(*) from pgboss.job where name='billing-cycle'")).rows[0].count;
   await worker.runBatch();assert.equal((await client.query("select count(*) from pgboss.job where name='billing-cycle'")).rows[0].count,before);
   const id=await worker.boss.send('profile-created',{outboxId:randomUUID()},{id:randomUUID()});await worker.runBatch();
   const row=(await client.query('select state,output from pgboss.job where id=$1',[id])).rows[0];
   assert.equal(row.state,'retry');assert.deepEqual(row.output,{code:'worker_job_failed'});
   assert.equal((await control.query('select public.worker_health_status() health')).rows[0].health.workerFresh,true);
  });
 }finally{if(worker)await worker.stop();await control.end();if(savedUrl===undefined)delete process.env.WORKER_DATABASE_URL;else process.env.WORKER_DATABASE_URL=savedUrl;if(savedSsl===undefined)delete process.env.WORKER_DB_SSL;else process.env.WORKER_DB_SSL=savedSsl;}
}
