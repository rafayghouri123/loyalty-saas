import pg from 'pg';
import {databaseTls} from '../lib/db/tls';

export const WORKER_LOCK="hashtextextended('loyalty-vercel-worker',0)";
export type WorkerControl={enabled:boolean;generation:string;deploymentId:string;epoch:number;runId:string;fresh:boolean};
export async function withWorkerControl<T>(operation:(client:pg.Client)=>Promise<T>):Promise<T|null>{
 const connectionString=process.env.WORKER_DATABASE_URL;
 if(!connectionString)throw new Error('worker_configuration_invalid');
 const url=new URL(connectionString);
 if(!['postgres:','postgresql:'].includes(url.protocol)||[...url.searchParams.keys()].some(key=>key.toLowerCase().startsWith('ssl'))
  ||(url.hostname.endsWith('.pooler.supabase.com')&&url.port!=='5432'))throw new Error('worker_session_connection_required');
 const ssl=process.env.WORKER_DB_SSL!=='false';
 if(!ssl&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('worker_verified_tls_required');
 const client=new pg.Client({connectionString,ssl:databaseTls(ssl,process.env.DATABASE_CA_CERT_PATH),connectionTimeoutMillis:5000,statement_timeout:30000});
 client.on('error',()=>{});
 try{
  await client.connect();
  const lock=await client.query<{locked:boolean}>(`select pg_try_advisory_lock(${WORKER_LOCK}) locked`);
  if(!lock.rows[0]?.locked)return null;
  try{return await operation(client);}finally{await client.query(`select pg_advisory_unlock(${WORKER_LOCK})`);}
 }finally{await client.end();}
}
export async function currentWorker(client:pg.Client,generation:string,deployment:string,epoch:number,runId:string){
 return (await client.query<{current:boolean}>('select public.worker_vercel_current($1,$2,$3,$4) current',[generation,deployment,epoch,runId])).rows[0]?.current===true;
}
