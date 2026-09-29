import {randomUUID} from 'node:crypto';
import {getHookByToken,getRun,start} from 'workflow/api';
import {HookNotFoundError} from 'workflow/internal/errors';
import {MONITOR_HOOK} from '../../../lib/policy';
import {authorized,response} from '../../../lib/http';
import {durableMonitor,monitorAcceptance} from '../../../lib/workflow';
export const runtime='nodejs';
export const maxDuration=60;
async function control(request:Request,post:boolean){
 if(!authorized(request))return response({error:'unauthorized'},401);
 if(process.env.MONITOR_ENABLED!=='true'||process.env.VERCEL_ENV!=='production'||!process.env.VERCEL_DEPLOYMENT_ID)return response({error:'monitor_not_enabled'},503);
 const params=new URL(request.url).searchParams,action=params.get('action'),test=params.get('handoff');
 if((action&&(!post||action!=='verify'))||(test&&(!post||test!=='test'||action)))return response({error:'invalid_action'},400);
 if((action||test)&&process.env.APP_ENV!=='staging')return response({error:'staging_required'},400);
 try{
  if(action==='verify'){const run=await start(monitorAcceptance,[`loyalty-monitor-acceptance:${randomUUID()}`]);return response({state:'acceptance_started',runId:run.runId});}
  let owner;
  try{owner=await getHookByToken(MONITOR_HOOK);}catch(error){if(!HookNotFoundError.is(error)&&(error as {status?:number}).status!==404)throw error;}
  if(owner){
   const run=getRun(owner.runId),status=await run.status;
   if(['pending','running'].includes(status)&&(owner.metadata as {deployment?:string}|undefined)?.deployment===process.env.VERCEL_DEPLOYMENT_ID&&!test)return response({state:'running',runId:owner.runId});
   await run.cancel();
  }
  const run=await start(durableMonitor,[{previous:null,lastSent:0},test?3:288,test?10:300,process.env.VERCEL_DEPLOYMENT_ID]);
  return response({state:'started',runId:run.runId,intervalSeconds:test?10:300});
 }catch{return response({error:'monitor_control_failed'},503);}
}
export async function GET(request:Request){return control(request,false);}
export async function POST(request:Request){return control(request,true);}
