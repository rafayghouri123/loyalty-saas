import { PgBoss, type JobWithMetadata, type WorkOptions, type Queue } from 'pg-boss';
import {createHash} from 'node:crypto';
import pg from 'pg';
import { z } from 'zod';
import { dispatchPushChallenge, type ChallengeSender } from './push-challenge.js';
import { databaseTls } from '../lib/db/tls.js';
import { validateMedia, purgeMedia, type MediaStorage } from './media.js';
import { sendAuthEmail, type AuthEmailSender } from './auth-email.js';
import { dispatchAutomations, dispatchCampaigns, dispatchCampaignTest, type CampaignSender } from './campaign-push.js';
import {processReportExport,purgeReportExports,type ExportStorage} from './report-export.js';
import {processPrivacy,type IdentityDeletion} from './privacy.js';

const jobSchema=z.strictObject({outboxId:z.uuid()});
export type WorkerSettings={connectionString:string;ssl:boolean;caPath?:string;onError?:(code:string)=>void;challengeSender?:ChallengeSender;
 campaignSender?:CampaignSender;mediaStorage?:MediaStorage;authEmailSender?:AuthEmailSender;exportStorage?:ExportStorage;identityDeletion?:IdentityDeletion};
export async function startWorker(settings:WorkerSettings, options:{bounded?:boolean}={}) {
  const databaseUrl=new URL(settings.connectionString);
  if(!['postgres:','postgresql:'].includes(databaseUrl.protocol)
    ||[...databaseUrl.searchParams.keys()].some(key=>key.toLowerCase().startsWith('ssl'))
    ||(!settings.ssl&&!['localhost','127.0.0.1','[::1]'].includes(databaseUrl.hostname))) {
    throw new Error('Invalid worker database configuration.');
  }
  const ssl=databaseTls(settings.ssl,settings.caPath);
  const pool=new pg.Pool({connectionString:settings.connectionString,max:4,ssl,connectionTimeoutMillis:5000,...(options.bounded?{statement_timeout:15000}:{})});
  const boss=new PgBoss({schema:'pgboss',createSchema:false,...(options.bounded?{db:{executeSql:(sql:string,values?:unknown[])=>pool.query(sql,values)},schedule:false,supervise:false,migrate:false}:{connectionString:settings.connectionString,max:4,ssl})});
  const handlers=new Map<string,(jobs:JobWithMetadata<unknown>[])=>Promise<void>>();
  const existingQueues=new Set<string>();
  const createQueue=async(name:string,config:Omit<Queue,'name'>={})=>{
    if(!options.bounded||!existingQueues.has(name)){await boss.createQueue(name,config);existingQueues.add(name);}
  };
  const schedules=new Map<string,string>();
  const work=async(name:string,workOptions:WorkOptions,handler:(jobs:JobWithMetadata<unknown>[])=>Promise<void>)=>{
    if(options.bounded)handlers.set(name,handler);
    else await boss.work(name,{...workOptions,includeMetadata:true},handler);
  };
  const schedule=async(name:string,cron:string,data:object,config:{tz:string})=>{
    if(options.bounded)schedules.set(name,cron);
    else await boss.schedule(name,cron,data,config);
  };
  const report=settings.onError??(()=>{});
  boss.on('error',()=>report('queue_error'));
  pool.on('error',()=>report('database_error'));
  try {
    const role=await pool.query<{allowed:boolean}>("select pg_has_role(current_user,'loyalty_worker','member') and not rolsuper and not rolbypassrls as allowed from pg_roles where rolname=current_user");
    if(!role.rows[0]?.allowed) throw new Error('Dedicated worker role required.');
    await boss.start();
    if(options.bounded)for(const queue of await boss.getQueues())existingQueues.add(queue.name);
    await createQueue('loyalty-dead-letter');
    await createQueue('profile-created',{retryLimit:5,retryDelay:30,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await createQueue('push-registration-challenge',{retryLimit:0,deadLetter:'loyalty-dead-letter'});
    await createQueue('media-validation',{retryLimit:5,retryDelay:30,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await createQueue('auth-email',{retryLimit:4,retryDelay:15,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await createQueue('loyalty-value',{retryLimit:5,retryDelay:30,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await createQueue('loyalty-reconcile',{retryLimit:3,retryDelay:60,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await createQueue('campaign-scan',{retryLimit:5,retryDelay:30,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await createQueue('campaign-dispatch',{retryLimit:5,retryDelay:30,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await createQueue('campaign-test',{retryLimit:0,deadLetter:'loyalty-dead-letter'});
    await createQueue('automation-scan',{retryLimit:5,retryDelay:30,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await createQueue('automation-dispatch',{retryLimit:5,retryDelay:30,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await createQueue('report-export',{retryLimit:5,retryDelay:30,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await createQueue('privacy',{retryLimit:5,retryDelay:30,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await createQueue('billing-cycle',{retryLimit:3,retryDelay:60,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await createQueue('retention',{retryLimit:3,retryDelay:60,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await schedule('billing-cycle','0 * * * *',{}, {tz:'UTC'});
    await schedule('retention','30 3 * * *',{}, {tz:'UTC'});
    await work('billing-cycle',{batchSize:1},async()=>{await pool.query('select public.worker_billing_cycle()');});
    await work('retention',{batchSize:1},async()=>{await pool.query('select public.worker_retention()');});
    if(settings.exportStorage&&settings.identityDeletion)await work('privacy',{batchSize:1},async jobs=>{for(const job of jobs)await processPrivacy(pool,jobSchema.parse(job.data).outboxId,settings.exportStorage!,settings.identityDeletion!);});
    if(settings.exportStorage)await work('report-export',{batchSize:1,includeMetadata:true},async jobs=>{for(const job of jobs){
      const id=jobSchema.parse(job.data).outboxId;
      try{await processReportExport(pool,id,settings.exportStorage!);}catch(error){
        if(job.retryCount>=job.retryLimit)await pool.query('select public.worker_fail_report_export($1)',[id]);
        throw error;
      }
    }});
    await schedule('loyalty-reconcile','0 3 * * *',{}, { tz: 'UTC' });
    await schedule('campaign-scan','* * * * *',{}, { tz: 'UTC' });
    if(settings.campaignSender)await schedule('campaign-dispatch','* * * * *',{}, { tz: 'UTC' });
    await schedule('automation-scan','* * * * *',{}, { tz: 'UTC' });
    if(settings.campaignSender)await schedule('automation-dispatch','* * * * *',{}, { tz: 'UTC' });
    await work('campaign-scan',{batchSize:1},async () => {
      await pool.query('select public.worker_scan_campaigns()');
    });
    if(settings.campaignSender)await work('campaign-dispatch',{batchSize:1},async()=>{
      await dispatchCampaigns(pool,settings.campaignSender!);
    });
    if(settings.campaignSender)await work('campaign-test',{batchSize:1},async jobs=>{
      for(const job of jobs)await dispatchCampaignTest(pool,settings.campaignSender!,jobSchema.parse(job.data).outboxId);
    });
    await work('automation-scan',{batchSize:1},async()=>{
      await pool.query('select public.worker_scan_automations()');
    });
    if(settings.campaignSender)await work('automation-dispatch',{batchSize:1},async()=>{
      await dispatchAutomations(pool,settings.campaignSender!);
    });
    await work('loyalty-reconcile',{batchSize:1},async () => {
      await pool.query('select public.worker_reconcile_balances()');
    });
    await work('loyalty-value',{batchSize:1},async jobs=>{
      for(const job of jobs) await pool.query('select public.worker_observe_loyalty($1::uuid)',[jobSchema.parse(job.data).outboxId]);
    });
    if(settings.authEmailSender) await work('auth-email',{batchSize:1},async jobs=>{
      for(const job of jobs)await sendAuthEmail(pool,jobSchema.parse(job.data).outboxId,settings.authEmailSender!);
    });
    if(settings.mediaStorage) await work('media-validation',{batchSize:1},async jobs=>{
      for(const job of jobs) await validateMedia(pool,jobSchema.parse(job.data).outboxId,settings.mediaStorage!);
    });
    if(settings.challengeSender) await work('push-registration-challenge',{batchSize:1},async jobs=>{
      for(const job of jobs) await dispatchPushChallenge(pool,jobSchema.parse(job.data).outboxId,settings.challengeSender!);
    });
    for(let i=0;i<4;i++) await work('profile-created',{batchSize:1},async jobs=>{
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
      // Cleanup commits independently; a broken outbox event must not retain IP/email buckets.
      await client.query('select public.worker_purge_rate_limits()');
      await client.query('select public.worker_expire_push_challenges()');
      await client.query('select public.worker_expire_pending_campaign_attempts()');
      await client.query('select public.worker_expire_pending_automation_attempts()');
      await client.query('select public.worker_finish_campaigns()');
      await client.query('select public.worker_purge_auth_email()');
      await client.query('select public.worker_purge_referral_grants()');
      await client.query('select public.worker_purge_referral_visits()');
      await client.query('select public.worker_purge_manual_messages()');
      if(!options.bounded){
        if(settings.mediaStorage) await purgeMedia(pool,settings.mediaStorage);
        if(settings.exportStorage) await purgeReportExports(pool,settings.exportStorage);
      }
      await client.query('begin');
      const {rows}=await client.query<{id:string;event_type:string;event_key:string}>('select * from public.worker_pending_outbox()');
      for(const row of rows) {
        const queue = row.event_type==='profile.created'?'profile-created':row.event_type.startsWith('loyalty.')?'loyalty-value':row.event_type==='campaign.scheduled'?'campaign-scan':row.event_type==='campaign.test_requested'&&settings.campaignSender?'campaign-test':row.event_type==='automation.created'?'automation-dispatch':row.event_type==='push.registration_challenge'&&settings.challengeSender?'push-registration-challenge':row.event_type==='media.validate'&&settings.mediaStorage?'media-validation':row.event_type==='auth.email_requested'&&settings.authEmailSender?'auth-email':null;
        const selectedQueue=row.event_type==='privacy.requested'&&settings.exportStorage&&settings.identityDeletion?'privacy':row.event_type==='report.export_requested'&&settings.exportStorage?'report-export':queue;
        if(!selectedQueue) { report('unsupported_outbox_event'); continue; }
        // The installed adapter executes pg-boss enqueue on the SAME transaction.
        await boss.send(selectedQueue,{outboxId:row.id},{id:row.id,db:{executeSql:(sql,values)=>client.query(sql,values)}});
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
  if(!options.bounded)run();
  const timer=options.bounded?undefined:setInterval(run,5000);
  return {
    async stop(){stopping=true;clearInterval(timer);await inFlight;await boss.stop({graceful:true,timeout:30_000});await pool.end();},
    async runBatch(){
      if(!options.bounded||stopping)throw new Error('Bounded worker required.');
      // No work() pollers or in-process scheduler: a durable Workflow owns invocation timing.
      const heartbeat=setInterval(()=>{void pool.query('select public.worker_heartbeat()').catch(()=>report('heartbeat_failed'));},10000);
      let processed=0;
      try{
        try{await tick();}catch{report('outbox_dispatch_failed');}
        await boss.supervise();
        const now=Date.now();
        for(const [name,cron]of schedules){
          const slot=cron==='* * * * *'?Math.floor(now/60000):cron==='0 * * * *'?Math.floor(now/3600000):Math.floor((now-(cron==='30 3 * * *'?3.5:3)*3600000)/86400000);
          const hex=createHash('sha256').update('loyalty-periodic:'+name+':'+slot).digest('hex');
          const id=hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32);
          await boss.send(name,{}, {id});
        }
        const deadline=Date.now()+20000;
        do{
          let fetched=false;
          for(const [name,handler]of handlers){
            if(Date.now()>=deadline||processed>=50)break;
            const batchSize=Math.min(name==='profile-created'||name==='loyalty-value'?10:1,50-processed);
            const jobs=await boss.fetch<unknown>(name,{batchSize,includeMetadata:true});
            if(!jobs.length)continue;
            fetched=true;processed+=jobs.length;
            for(const job of jobs){
              try{await handler([job]);await boss.complete(name,job.id);}
              catch{await boss.fail(name,job.id,{code:'worker_job_failed'});report('worker_job_failed');}
            }
            await pool.query('select public.worker_heartbeat()');
          }
          if(!fetched)break;
        }while(Date.now()<deadline&&processed<50);
        if(settings.mediaStorage)try{await purgeMedia(pool,settings.mediaStorage,5);}catch{report('media_purge_failed');}
        if(settings.exportStorage)try{await purgeReportExports(pool,settings.exportStorage,5);}catch{report('export_purge_failed');}
        await pool.query('select public.worker_heartbeat()');
        return {processed};
      }finally{clearInterval(heartbeat);}
    },
    boss,
  };
}
