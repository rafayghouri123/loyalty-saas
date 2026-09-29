import {getHookByToken,start} from 'workflow/api';
import {monitorPool,observeHealth,alertDecision,deliverAlert,webhookConfiguration} from '../shared/monitor-delivery.mjs';
import {durableMonitor} from './workflow';
import {type MonitorState,type CheckResult} from './policy';

export async function monitorCheck(runId:string,hookToken:string,state:MonitorState,probe:'none'|'failure'|'recovery'='none'):Promise<CheckResult>{
 'use step';
 try{
  if(process.env.MONITOR_ENABLED!=='true'||process.env.VERCEL_ENV!=='production')return {state,stopped:true};
  const owner=await getHookByToken(hookToken);
  if(owner.runId!==runId)return {state,stopped:true};
  if(probe!=='none'&&process.env.APP_ENV!=='staging')throw new Error();
  const pool=monitorPool(probe==='failure'?{...process.env,WORKER_DATABASE_URL:'postgres://acceptance_probe@127.0.0.1:1/acceptance_probe',WORKER_DB_SSL:'false'}:{...process.env,WORKER_DATABASE_URL:process.env.MONITOR_DATABASE_URL});
  let payload;
  try{payload=await observeHealth(pool);}finally{await pool.end();}
  // Check the actual web origin as well as DB/worker health. No response body leaves this step.
  if(probe!=='failure'){
   try{
    const origin=new URL(process.env.MONITOR_APP_ORIGIN!);if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/')throw new Error();
    const ready=await fetch(new URL('/api/health/ready',origin),{signal:AbortSignal.timeout(8000),redirect:'error',cache:'no-store'});
    if(!ready.ok||(await ready.json()).database!=='ok')throw new Error();
   }catch{payload.alerts.push('web_readiness_failed');payload.status='attention';}
  }
  if(probe!=='none')payload={...payload,acceptanceTest:true};
  const now=Date.now(),decision=alertDecision(payload,state,now);
  const receipt=decision?await deliverAlert(webhookConfiguration(),decision):undefined;
  const next=receipt?{previous:[...payload.alerts],lastSent:now}:state;
  console.log(JSON.stringify({component:'loyalty-monitor',time:payload.time,status:payload.status,alerts:payload.alerts,delivery:receipt?'confirmed':'unchanged',...(receipt?{receipt}:{}),acceptanceTest:probe!=='none'}));
  return {state:next,stopped:false,observedAt:payload.time,alerts:payload.alerts,...(receipt?{receipt}:{})};
 }catch{throw new Error('monitor_check_failed');}
}

export async function continueMonitor(state:MonitorState):Promise<{runId:string}|undefined>{
 'use step';
 if(process.env.MONITOR_ENABLED!=='true'||process.env.VERCEL_ENV!=='production')return;
 try{const run=await start(durableMonitor,[state,288,300,process.env.VERCEL_DEPLOYMENT_ID!],{deploymentId:process.env.VERCEL_DEPLOYMENT_ID!});return {runId:run.runId};}
 catch{throw new Error('monitor_handoff_failed');}
}
