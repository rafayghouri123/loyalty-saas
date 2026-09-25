import { PgBoss } from 'pg-boss';
import pg from 'pg';
import { z } from 'zod';
import { dispatchPushChallenge, type ChallengeSender } from './push-challenge.js';
import { databaseTls } from '../lib/db/tls.js';
import { validateMedia, purgeMedia, type MediaStorage } from './media.js';
import { sendAuthEmail, type AuthEmailSender } from './auth-email.js';
import { dispatchAutomations, dispatchCampaigns, dispatchCampaignTest, type CampaignSender } from './campaign-push.js';

const jobSchema=z.strictObject({outboxId:z.uuid()});
type Settings={connectionString:string;ssl:boolean;caPath?:string;onError?:(code:string)=>void;challengeSender?:ChallengeSender;
 campaignSender?:CampaignSender;mediaStorage?:MediaStorage;authEmailSender?:AuthEmailSender};
export async function startWorker(settings:Settings) {
  const databaseUrl=new URL(settings.connectionString);
  if(!['postgres:','postgresql:'].includes(databaseUrl.protocol)
    ||[...databaseUrl.searchParams.keys()].some(key=>key.toLowerCase().startsWith('ssl'))
    ||(!settings.ssl&&!['localhost','127.0.0.1','[::1]'].includes(databaseUrl.hostname))) {
    throw new Error('Invalid worker database configuration.');
  }
  const ssl=databaseTls(settings.ssl,settings.caPath);
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
    await boss.createQueue('push-registration-challenge',{retryLimit:0,deadLetter:'loyalty-dead-letter'});
    await boss.createQueue('media-validation',{retryLimit:5,retryDelay:30,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await boss.createQueue('auth-email',{retryLimit:4,retryDelay:15,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await boss.createQueue('loyalty-value',{retryLimit:5,retryDelay:30,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await boss.createQueue('loyalty-reconcile',{retryLimit:3,retryDelay:60,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await boss.createQueue('campaign-scan',{retryLimit:5,retryDelay:30,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await boss.createQueue('campaign-dispatch',{retryLimit:5,retryDelay:30,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await boss.createQueue('campaign-test',{retryLimit:0,deadLetter:'loyalty-dead-letter'});
    await boss.createQueue('automation-scan',{retryLimit:5,retryDelay:30,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await boss.createQueue('automation-dispatch',{retryLimit:5,retryDelay:30,retryBackoff:true,deadLetter:'loyalty-dead-letter'});
    await boss.schedule('loyalty-reconcile','0 3 * * *',{}, { tz: 'UTC' });
    await boss.schedule('campaign-scan','* * * * *',{}, { tz: 'UTC' });
    if(settings.campaignSender)await boss.schedule('campaign-dispatch','* * * * *',{}, { tz: 'UTC' });
    await boss.schedule('automation-scan','* * * * *',{}, { tz: 'UTC' });
    if(settings.campaignSender)await boss.schedule('automation-dispatch','* * * * *',{}, { tz: 'UTC' });
    await boss.work('campaign-scan',{batchSize:1},async () => {
      await pool.query('select public.worker_scan_campaigns()');
    });
    if(settings.campaignSender)await boss.work('campaign-dispatch',{batchSize:1},async()=>{
      await dispatchCampaigns(pool,settings.campaignSender!);
    });
    if(settings.campaignSender)await boss.work('campaign-test',{batchSize:1},async jobs=>{
      for(const job of jobs)await dispatchCampaignTest(pool,settings.campaignSender!,jobSchema.parse(job.data).outboxId);
    });
    await boss.work('automation-scan',{batchSize:1},async()=>{
      await pool.query('select public.worker_scan_automations()');
    });
    if(settings.campaignSender)await boss.work('automation-dispatch',{batchSize:1},async()=>{
      await dispatchAutomations(pool,settings.campaignSender!);
    });
    await boss.work('loyalty-reconcile',{batchSize:1},async () => {
      await pool.query('select public.worker_reconcile_balances()');
    });
    await boss.work('loyalty-value',{batchSize:1},async jobs=>{
      for(const job of jobs) await pool.query('select public.worker_observe_loyalty($1::uuid)',[jobSchema.parse(job.data).outboxId]);
    });
    if(settings.authEmailSender) await boss.work('auth-email',{batchSize:1},async jobs=>{
      for(const job of jobs)await sendAuthEmail(pool,jobSchema.parse(job.data).outboxId,settings.authEmailSender!);
    });
    if(settings.mediaStorage) await boss.work('media-validation',{batchSize:1},async jobs=>{
      for(const job of jobs) await validateMedia(pool,jobSchema.parse(job.data).outboxId,settings.mediaStorage!);
    });
    if(settings.challengeSender) await boss.work('push-registration-challenge',{batchSize:1},async jobs=>{
      for(const job of jobs) await dispatchPushChallenge(pool,jobSchema.parse(job.data).outboxId,settings.challengeSender!);
    });
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
      // Cleanup commits independently; a broken outbox event must not retain IP/email buckets.
      await client.query('select public.worker_purge_rate_limits()');
      await client.query('select public.worker_expire_push_challenges()');
      await client.query('select public.worker_expire_pending_campaign_attempts()');
      await client.query('select public.worker_expire_pending_automation_attempts()');
      await client.query('select public.worker_finish_campaigns()');
      await client.query('select public.worker_purge_auth_email()');
      await client.query('select public.worker_purge_referral_grants()');
      await client.query('select public.worker_purge_referral_visits()');
      if(settings.mediaStorage) await purgeMedia(pool,settings.mediaStorage);
      await client.query('begin');
      const {rows}=await client.query<{id:string;event_type:string;event_key:string}>('select * from public.worker_pending_outbox()');
      for(const row of rows) {
        const queue = row.event_type==='profile.created'?'profile-created':row.event_type.startsWith('loyalty.')?'loyalty-value':row.event_type==='campaign.scheduled'?'campaign-scan':row.event_type==='campaign.test_requested'&&settings.campaignSender?'campaign-test':row.event_type==='automation.created'?'automation-dispatch':row.event_type==='push.registration_challenge'&&settings.challengeSender?'push-registration-challenge':row.event_type==='media.validate'&&settings.mediaStorage?'media-validation':row.event_type==='auth.email_requested'&&settings.authEmailSender?'auth-email':null;
        if(!queue) { report('unsupported_outbox_event'); continue; }
        // The installed adapter executes pg-boss enqueue on the SAME transaction.
        await boss.send(queue,{outboxId:row.id},{id:row.id,db:{executeSql:(sql,values)=>client.query(sql,values)}});
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
