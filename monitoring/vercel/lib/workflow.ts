import {createHook,getWorkflowMetadata,sleep} from 'workflow';
import {monitorCheck,continueMonitor} from './steps';
import {MONITOR_HOOK,type MonitorState} from './policy';

export async function durableMonitor(initial:MonitorState={previous:null,lastSent:0},waves=288,interval=300,deployment='local'):Promise<{runId?:string;deduplicated?:boolean;stopped?:boolean}|undefined>{
 'use workflow';
 const hook=createHook({token:MONITOR_HOOK,metadata:{deployment}});
 if(await hook.getConflict())return {deduplicated:true};
 const runId=getWorkflowMetadata().workflowRunId;let state=initial;
 try{
  for(let wave=0;wave<waves;wave++){
   try{const checked=await monitorCheck(runId,MONITOR_HOOK,state);if(checked.stopped)return {stopped:true};state=checked.state;}
   catch{/* Retry next scheduled check without acknowledging an undelivered notification. */}
   await sleep(`${interval}s`);
  }
 }finally{hook.dispose();}
 return await continueMonitor(state);
}

export async function monitorAcceptance(hookToken:string){
 'use workflow';
 const hook=createHook({token:hookToken});if(await hook.getConflict())return {deduplicated:true};
 const runId=getWorkflowMetadata().workflowRunId;
 try{
  const failure=await monitorCheck(runId,hookToken,{previous:null,lastSent:0},'failure');
  await sleep('5s');
  const recovery=await monitorCheck(runId,hookToken,failure.state,'recovery');
  return {failure,recovery};
 }finally{hook.dispose();}
}
