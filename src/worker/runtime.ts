import { PgBoss } from 'pg-boss';
import pg from 'pg';
import { z } from 'zod';

const jobSchema=z.strictObject({outboxId:z.uuid()});
type Settings={connectionString:string;ssl:boolean;onError?:(code:string)=>void};
export async function startWorker(settings:Settings) {
  const ssl=settings.ssl?{rejectUnauthorized:true}:false;
  const pool=new pg.Pool({connectionString:settings.connectionString,max:4,ssl,connectionTimeoutMillis:5000});
  const boss=new PgBoss({connectionString:settings.connectionString,max:4,ssl,schema:'pgboss',createSchema:false});
  const report=settings.onError??(()=>{});
  boss.on('error',()=>report('queue_error'));
  pool.on('error',()=>report('database_error'));
  try {
    const role=await pool.query<{allowed:boolean}>("select pg_has_role(current_user,'loyalty_worker','member') and not rolsuper and not rolbypassrls as allowed from pg_roles where rolname=current_user");
    if(!role.rows[0]?.allowed) throw new Error('Dedicated worker role required.');
    await boss.start();
    await boss.createQueue('loyalty-dead-letter');
    await boss.createQueue('profile-created',{retryLimit:5,retryDelay:30,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    for(let i=0;i<4;i++) await boss.work('profile-created',{batchSize:1},async jobs=>{
      for(const job of jobs) {
        const input=jobSchema.parse(job.data);
        await pool.query('select public.worker_observe_profile($1::uuid)',[input.outboxId]);
      }
    });
  } catch(error) { await boss.stop({graceful:false}); await pool.end(); throw error; }

  let stopping=false;
  let inFlight:Promise<void>|null=null;
  const tick=async()=>{
    const client=await pool.connect();
    try {
      await client.query('begin');
      const {rows}=await client.query<{id:string;event_type:string;event_key:string}>('select * from public.worker_pending_outbox()');
      for(const row of rows) {
        if(row.event_type!=='profile.created') { report('unsupported_outbox_event'); continue; }
        // The installed adapter executes pg-boss enqueue on the SAME transaction.
        await boss.send('profile-created',{outboxId:row.id},{id:row.id,db:{executeSql:(sql,values)=>client.query(sql,values)}});
        await client.query('select public.worker_mark_dispatched($1::uuid)',[row.id]);
      }
      await client.query('select public.worker_heartbeat()');
      await client.query('commit');
    } catch(error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
  };
  const run=()=>{
    if(stopping||inFlight) return;
    inFlight=tick().catch(()=>report('outbox_dispatch_failed')).finally(()=>{inFlight=null;});
  };
  run();
  const timer=setInterval(run,5000);
  return {
    async stop(){stopping=true;clearInterval(timer);await inFlight;await boss.stop({graceful:true,timeout:30_000});await pool.end();},
    boss,
  };
}
