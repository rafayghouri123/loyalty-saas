import {PgBoss} from 'pg-boss';
import pg from 'pg';
process.once('message',async({workerUrl})=>{
  try {
    const url=new URL(workerUrl);if(url.hostname!=='127.0.0.1'||url.username!=='integration_worker')throw new Error('Local test role required');
    const pool=new pg.Pool({connectionString:workerUrl,max:1});
    const boss=new PgBoss({connectionString:workerUrl,schema:'pgboss',createSchema:false,migrate:false,supervise:false,schedule:false});
    await boss.start();
    const [job]=await boss.fetch('phase9-crash');if(!job)throw new Error('Missing probe job');
    await pool.query('select public.worker_observe_profile($1)',[job.data.outboxId]);
    process.send({stage:'committed'});
    // Parent terminates this actual OS process before queue acknowledgement.
    setInterval(()=>{},1000);
  } catch { process.send({stage:'failed'});process.exitCode=1; }
});
