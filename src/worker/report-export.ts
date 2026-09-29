import type pg from 'pg';
import {z} from 'zod';
import {createClient} from '@supabase/supabase-js';
import {reportCsv} from '../features/reports/csv.js';
import {sealSecret,type EncryptionKey} from '../lib/security/crypto.js';
export type ExportStorage={put(path:string,bytes:Buffer,mimeType?:'text/csv'|'application/json'):Promise<void>;sign(path:string,seconds:number):Promise<string>;remove(path:string):Promise<void>;key:EncryptionKey};
const jobSchema=z.object({exportRequestId:z.uuid(),businessId:z.uuid(),artifactId:z.uuid(),processingToken:z.uuid(),path:z.string(),expiresAt:z.string(),columns:z.array(z.string()),rows:z.array(z.record(z.string(),z.unknown())).max(10000),filters:z.unknown(),metrics:z.unknown(),dataAsOf:z.string()});
export async function processReportExport(pool:pg.Pool,outboxId:string,storage:ExportStorage){
 const conn=await pool.connect();let data;
 try{
  await conn.query('begin');await conn.query("set local statement_timeout='5s'");
  data=(await conn.query('select public.worker_report_export($1) job',[outboxId])).rows[0]?.job;await conn.query('commit');
 }catch(e){await conn.query('rollback');throw e;}finally{conn.release();}
 if(!data)return;const job=jobSchema.parse(data);
 if(job.path!==`${job.businessId}/${job.exportRequestId}/${job.processingToken}.csv`||job.artifactId!==job.exportRequestId)throw new Error('invalid_export_job');
 let csv;try{csv=reportCsv(job.columns,job.rows,{filters:job.filters,metrics:job.metrics,dataAsOf:job.dataAsOf});}catch(e){if(e instanceof Error&&e.message==='narrow_filters'){await pool.query("select public.worker_finish_report_export($1,$2,null,null,null,'narrow_filters')",[job.exportRequestId,job.processingToken]);return;}throw e;}
 const ttl=Math.floor((Date.parse(job.expiresAt)-Date.now())/1000);
 if(ttl<=0){await pool.query("select public.worker_finish_report_export($1,$2,null,null,null,'expired')",[job.exportRequestId,job.processingToken]);return;}
 await storage.put(job.path,csv);
 const signed=await storage.sign(job.path,Math.min(ttl,86400)),sealed=sealSecret(signed,storage.key,`export:${job.artifactId}`);
 await pool.query('select public.worker_finish_report_export($1,$2,$3,$4,$5) ok',[job.exportRequestId,job.processingToken,csv.length,sealed.ciphertext,sealed.keyId]);
}
export async function purgeReportExports(pool:pg.Pool,storage:ExportStorage,limit=100){
 const items=z.array(z.object({exportRequestId:z.uuid(),path:z.string()})).parse((await pool.query('select public.worker_expired_report_exports() items')).rows[0]?.items);
 for(const item of items.slice(0,limit)){await storage.remove(item.path);await pool.query('select public.worker_purge_report_export($1,$2)',[item.exportRequestId,item.path]);}
}
export function supabaseExportStorage(url:string,key:string,encryption:EncryptionKey):ExportStorage{
 const storage=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)})}}).storage.from('loyalty-exports');
 return {key:encryption,
  async put(path,bytes,mimeType='text/csv'){const {error}=await storage.upload(path,bytes,{contentType:mimeType,cacheControl:'0',upsert:false});if(error)throw new Error('storage_unavailable');},
  async sign(path,seconds){const {data,error}=await storage.createSignedUrl(path,seconds);if(error||!data)throw new Error('storage_unavailable');return data.signedUrl;},
  async remove(path){const {error}=await storage.remove([path]);if(error)throw new Error('storage_unavailable');},
 };
}
