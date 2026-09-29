import {randomUUID,timingSafeEqual} from 'node:crypto';
import {start} from 'workflow/api';
import {vercelWorker} from '@/workflows/worker';
import {withWorkerControl,type WorkerControl} from '@/worker/vercel-controller';

export const runtime='nodejs';
export const maxDuration=60;
function response(body:object,status=200){return Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}
function authorized(request:Request){
 const secret=process.env.CRON_SECRET;
 const supplied=request.headers.get('authorization');
 if(!secret||secret.length<32||!supplied)return false;
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(supplied);
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
async function control(request:Request,force:boolean){
 if(!authorized(request))return response({error:'unauthorized'},401);
 const deployment=process.env.VERCEL_DEPLOYMENT_ID;
 if(process.env.VERCEL_WORKER_ENABLED!=='true'||process.env.VERCEL_ENV!=='production'||!deployment)return response({error:'worker_not_enabled'},503);
 const parameters=new URL(request.url).searchParams;
 const action=parameters.get('action');
 const waves=parameters.get('waves');
 if(waves&&(!force||process.env.APP_ENV!=='staging'||!/^\d{1,3}$/u.test(waves)||Number(waves)<3||Number(waves)>120))return response({error:'invalid_wave_limit'},400);
 const waveLimit=waves?Number(waves):120;
 if(action&&(!force||action!=='stop'))return response({error:'invalid_action'},400);
 try{
  const result=await withWorkerControl(async client=>{
   if(action==='stop'){await client.query('select public.worker_vercel_disable()');return {state:'stopped'};}
   const status=(await client.query<{status:WorkerControl|null}>('select public.worker_vercel_status() status')).rows[0]?.status;
   if(!force&&status?.enabled&&status.deploymentId===deployment&&status.fresh)return {state:'running',runId:status.runId};
   const generation=randomUUID();
   await client.query('begin');
   try{
    const run=await start(vercelWorker,[generation,deployment,0,waveLimit]);
    await client.query('select public.worker_vercel_activate($1,$2,$3)',[generation,deployment,run.runId]);
    await client.query('commit');
    return {state:'started',runId:run.runId};
   }catch{await client.query('rollback');throw new Error('worker_start_failed');}
  });
  return result?response(result):response({state:'busy'},409);
 }catch{return response({error:'worker_control_failed'},503);}
}
export async function GET(request:Request){return control(request,false);}
export async function POST(request:Request){return control(request,true);}
