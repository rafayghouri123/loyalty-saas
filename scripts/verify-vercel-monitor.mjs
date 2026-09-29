// Observe actual hosted Workflows. Never starts a local monitor or worker.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createVercelWorld} from '@workflow/world-vercel';
import {setWorld} from 'workflow/runtime';
import {getRun} from 'workflow/api';
process.loadEnvFile('.env.local');
const project=JSON.parse(readFileSync('.local/vercel-monitor-project.json','utf8'));
const token=readFileSync('.local/vercel-monitor-token','utf8').trim(),secret=readFileSync('.local/vercel-monitor-secret','utf8').trim();
const origin=`https://${project.projectName}.vercel.app`;
const world=createVercelWorld({token,projectConfig:{projectId:project.projectId,teamId:project.orgId,environment:'production'}});setWorld(world);
async function control(path,method='POST'){
 const result=await fetch(`${origin}${path}`,{method,headers:{authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(60000),redirect:'error'});
 assert.equal(result.status,200,'hosted_monitor_control');assert.match(result.headers.get('cache-control')??'',/private, no-store/u);return result.json();
}
async function waitFor(check,timeout=240000){const end=Date.now()+timeout;while(Date.now()<end){const result=await check();if(result)return result;await new Promise(resolve=>setTimeout(resolve,5000));}throw new Error('hosted_monitor_timeout');}
async function finished(runId){return waitFor(async()=>{const status=await getRun(runId).status;if(status==='failed')throw new Error('hosted_monitor_run_failed');return status==='completed'?{value:await getRun(runId).returnValue}:false;});}
async function checked(runId,minimum=1){return waitFor(async()=>{const list=await world.steps.list({runId,resolveData:'none',pagination:{limit:100,sortOrder:'asc'}});const steps=list.data.filter(s=>s.stepName.endsWith('//monitorCheck')&&s.status==='completed');return steps.length>=minimum?steps:false;},minimum>1?420000:240000);}
try{
 if(process.argv.includes('--steady')){
  const evidence=JSON.parse(readFileSync('.local/phase8-vercel-monitor-hosted-evidence.json','utf8'));
  const steps=await checked(evidence.steadyRunId,2);assert.notEqual(steps[0].stepId,steps[1].stepId);
  evidence.scheduledChecks=steps.map(s=>({stepId:s.stepId,completedAt:s.completedAt}));evidence.steadyVerifiedAt=new Date().toISOString();
  writeFileSync('.local/phase8-vercel-monitor-hosted-evidence.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({check:'automatic_five_minute_hosted_checks',runId:evidence.steadyRunId,steps:evidence.scheduledChecks}));
 }else{
  const denied=await fetch(`${origin}/api/control`,{method:'POST',signal:AbortSignal.timeout(15000)});assert.equal(denied.status,401);assert.match(denied.headers.get('cache-control')??'',/private, no-store/u);
  for(const path of ['/api/control','/.well-known/workflow/v1/flow','/.well-known/workflow/v1/step']){
   const deniedSdk=await fetch(`${origin}${path}`,{method:'POST',signal:AbortSignal.timeout(15000)});assert([401,404].includes(deniedSdk.status));
  }
  console.log('PASS anonymous control and unsigned Workflow execution denied.');
  const test=await control('/api/control?action=verify');const result=(await finished(test.runId)).value;
  assert.deepEqual(result.failure.alerts,['database_unavailable']);assert(!result.recovery.alerts.includes('database_unavailable'));
  for(const [receipt,heading] of [[result.failure.receipt,'ATTENTION'],[result.recovery.receipt,'RECOVERY']]){
   assert(receipt?.messageId);const url=new URL(process.env.MONITOR_WEBHOOK_URL);url.search='';url.pathname+=`/messages/${receipt.messageId}`;
   const response=await fetch(url,{signal:AbortSignal.timeout(8000),redirect:'error'});assert(response.ok);const message=await response.json();
   assert.equal(message.id,receipt.messageId);assert(message.content.includes(`[STAGING ACCEPTANCE TEST] Loyalty monitor — ${heading}`));
   if(heading==='RECOVERY')assert(message.content.includes('Cleared: database_unavailable'));
  }
  console.log(JSON.stringify({check:'hosted_failure_recovery_discord_readback',runId:test.runId,failure:result.failure.receipt,recovery:result.recovery.receipt,remainingAlerts:result.recovery.alerts}));
  const initial=await control('/api/control?handoff=test');const handoff=(await finished(initial.runId)).value;assert(handoff.runId);
  const steps=await checked(handoff.runId);const ensure=await control('/api/control','GET');assert.equal(ensure.runId,handoff.runId);assert.equal(ensure.state,'running');
  const evidence={time:new Date().toISOString(),origin,projectId:project.projectId,acceptanceRunId:test.runId,failureReceipt:result.failure.receipt,recoveryReceipt:result.recovery.receipt,remainingAlerts:result.recovery.alerts,initialRunId:initial.runId,steadyRunId:handoff.runId,firstCheck:steps[0].stepId,intervalSeconds:300};
  writeFileSync('.local/phase8-vercel-monitor-hosted-evidence.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({check:'hosted_handoff_and_watchdog_deduplication',...evidence}));
 }
}catch(error){console.error(JSON.stringify({status:'verification_failed',code:error?.code??'hosted_monitor_verification',message:typeof error?.message==='string'&&/^[a-z_]+$/u.test(error.message)?error.message:'safe_failure'}));process.exitCode=1;}
