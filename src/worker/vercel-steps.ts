import {start} from 'workflow/api';
import {vercelWorker} from '../workflows/worker';
import {workerSettings} from './configuration.js';
import {startWorker} from './runtime.js';
import {withWorkerControl,currentWorker} from './vercel-controller.js';

export async function workerWave(generation:string,deployment:string,epoch:number,runId:string){
 'use step';
 try{
  if(process.env.VERCEL_WORKER_ENABLED!=='true'||process.env.VERCEL_ENV!=='production'||process.env.VERCEL_DEPLOYMENT_ID!==deployment)return 'stopped';
  return await withWorkerControl(async client=>{
   if(!await currentWorker(client,generation,deployment,epoch,runId))return 'stopped';
   const worker=await startWorker({...workerSettings(),onError:code=>console.log(JSON.stringify({component:'worker',event:code}))},{bounded:true});
   try{await worker.runBatch();return 'running';}finally{await worker.stop();}
  })??'busy';
 }catch{
  // Workflow persists step errors. Never serialize provider/PG errors or causes.
  throw new Error('worker_wave_failed');
 }
}
export async function rotateWorker(generation:string,deployment:string,epoch:number,runId:string,waveLimit:number){
 'use step';
 try{
  const result=await withWorkerControl(async client=>{
   if(!await currentWorker(client,generation,deployment,epoch,runId))return;
   await client.query('begin');
   try{
    // Hold the same session lock through start+commit. A child cannot run until
    // its exact run ID is committed; orphan/replayed child launches are inert.
    const next=await start(vercelWorker,[generation,deployment,epoch+1,waveLimit],{deploymentId:deployment});
    await client.query('select public.worker_vercel_advance($1,$2,$3,$4)',[generation,epoch,runId,next.runId]);
    await client.query('commit');
   }catch{await client.query('rollback');throw new Error('worker_rotation_failed');}
  });
  if(result===null)throw new Error('worker_busy');
 }catch{throw new Error('worker_rotation_failed');}
}
rotateWorker.maxRetries=20;
