import {getWorkflowMetadata,sleep} from 'workflow';
import {workerWave,rotateWorker} from '../worker/vercel-steps';

export async function vercelWorker(generation:string,deployment:string,epoch:number,waveLimit=120){
 'use workflow';
 const runId=getWorkflowMetadata().workflowRunId;
 // Keep event histories small. The next run is selected atomically in PostgreSQL.
 for(let wave=0;wave<waveLimit;wave++){
  try{if(await workerWave(generation,deployment,epoch,runId)==='stopped')return;}
  catch{/* Durable retries exhausted: retain queued jobs and retry after sleep. */}
  await sleep('10s');
 }
 await rotateWorker(generation,deployment,epoch,runId,waveLimit);
}
