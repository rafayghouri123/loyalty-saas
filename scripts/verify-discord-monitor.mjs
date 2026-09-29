// Sends two labeled synthetic notifications. Does not stop or mutate staging services.
import assert from 'node:assert/strict';
import pg from 'pg';
import {writeFile} from 'node:fs/promises';
import {monitorPool,observeHealth,webhookConfiguration,createAlertTracker} from './monitor-delivery.mjs';

async function verify(){
 if(process.env.APP_ENV!=='staging')throw new Error('staging_required');
 const configuration=webhookConfiguration();if(!configuration.discord)throw new Error('discord_required');
 const real=monitorPool(),failed=new pg.Pool({host:'127.0.0.1',port:1,user:'acceptance_probe',database:'acceptance_probe',connectionTimeoutMillis:1000});failed.on('error',()=>{});
 try{
  // Establish real staging availability; never infer recovery if it is unreachable.
  const baseline=await observeHealth(real);assert(!baseline.alerts.includes('database_unavailable'));
  const send=createAlertTracker(configuration);
  const failure={...await observeHealth(failed),acceptanceTest:true};assert.deepEqual(failure.alerts,['database_unavailable']);
  const failureReceipt=await send(failure);assert(failureReceipt?.messageId);
  const recovery={...await observeHealth(real),acceptanceTest:true};assert(!recovery.alerts.includes('database_unavailable'));
  const recoveryReceipt=await send(recovery);assert(recoveryReceipt?.messageId);
  // Read back saved messages, rather than equating an HTTP 204 with delivery.
  for(const [receipt,label] of [[failureReceipt,'ATTENTION'],[recoveryReceipt,'RECOVERY']]){
   const url=new URL(configuration.destination);url.search='';url.pathname+=`/messages/${receipt.messageId}`;
   const response=await fetch(url,{signal:AbortSignal.timeout(8000),redirect:'error'});assert(response.ok);
   const message=await response.json();assert.equal(message.id,receipt.messageId);assert(message.content.includes(`[STAGING ACCEPTANCE TEST] Loyalty monitor — ${label}`));
   if(label==='RECOVERY')assert(message.content.includes('Cleared: database_unavailable'));
  }
  const evidence={time:new Date().toISOString(),provider:'discord',failure:failureReceipt,recovery:recoveryReceipt,remainingAlerts:recovery.alerts,scope:'isolated refused DB probe followed by real staging health query; no worker outage; continuous monitor not hosted'};
  await writeFile('.local/phase8-discord-monitor-evidence.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({status:'passed',...evidence}));
 }finally{await Promise.allSettled([real.end(),failed.end()]);}
}
await verify().catch(()=>{console.error('discord_monitor_acceptance_failed');process.exitCode=1;});
