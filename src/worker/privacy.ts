import type pg from 'pg';
import {z} from 'zod';
import {createClient} from '@supabase/supabase-js';
import {sealSecret} from '../lib/security/crypto.js';
import type {ExportStorage} from './report-export.js';

export const ACCOUNT_SECTIONS=['profile','memberships','purchases','ledger','consent','current_consent','enrollment','redemptions','offers','referrals','devices','communications','notifications','automations','payment_submissions','staff','audit','privacy'] as const;
export const ACCOUNT_PART_BYTES=3*1024*1024;
export type IdentityDeletion={remove(id:string):Promise<void>};
const jobSchema=z.object({requestId:z.uuid(),customerId:z.uuid(),membershipId:z.uuid().nullable(),kind:z.enum(['export','delete_membership','delete_account']),processingToken:z.uuid(),exportRequestId:z.uuid().nullable(),authIdentityId:z.uuid().nullable(),expiresAt:z.string()});
const pageSchema=z.object({rows:z.array(z.record(z.string(),z.unknown())).max(100),nextCursor:z.uuid().nullable()});
export async function processPrivacy(pool:pg.Pool,outboxId:string,storage:ExportStorage,identities:IdentityDeletion){
 const data=(await pool.query('select public.worker_privacy_job($1) job',[outboxId])).rows[0]?.job;
 if(!data)return;const job=jobSchema.parse(data);
 try{
  if(job.kind==='export'){
   let part=2,entries:string[]=[],size=2;const counts:Record<string,number>={};
   const upload=async(number:number,bytes:Buffer)=>{
    if(bytes.length>ACCOUNT_PART_BYTES)throw new Error('oversized_account_record');
    const ttl=Math.floor((Date.parse(job.expiresAt)-Date.now())/1000);if(ttl<=0)throw new Error('expired');
    const path=`${job.customerId}/${job.exportRequestId}/${job.processingToken}/${number}.json`;
    await pool.query('select public.worker_reserve_account_upload($1,$2,$3)',[job.requestId,job.processingToken,path]);
    await storage.put(path,bytes,'application/json');
    const signed=await storage.sign(path,Math.min(ttl,86400));
    const sealed=sealSecret(signed,storage.key,`account-export:${job.exportRequestId}:${number}`);
    await pool.query('select public.worker_account_artifact($1,$2,$3,$4,$5,$6,$7)',[job.requestId,job.processingToken,number,path,bytes.length,sealed.ciphertext,sealed.keyId]);
   };
   const flush=async()=>{if(!entries.length)return;await upload(part++,Buffer.from(`[${entries.join(',')}]`));entries=[];size=2;};
   for(const section of ACCOUNT_SECTIONS){let cursor:string|null=null;counts[section]=0;
    do{
     const page=pageSchema.parse((await pool.query('select public.worker_account_export_page($1,$2,$3,$4) page',[job.requestId,job.processingToken,section,cursor])).rows[0]?.page);
     for(const row of page.rows){const entry=JSON.stringify({section,data:row}),bytes=Buffer.byteLength(entry);if(bytes+2>ACCOUNT_PART_BYTES)throw new Error('oversized_account_record');if(size+bytes+(entries.length?1:0)>ACCOUNT_PART_BYTES)await flush();size+=bytes+(entries.length?1:0);entries.push(entry);counts[section]!++;}
     if(page.nextCursor===cursor&&cursor!==null)throw new Error('invalid_cursor');cursor=page.nextCursor;
    }while(cursor);
   }
   await flush();
   await upload(1,Buffer.from(JSON.stringify({version:1,requestedAt:new Date(Date.parse(job.expiresAt)-86400000).toISOString(),exportedAt:new Date().toISOString(),expiresAt:job.expiresAt,parts:Array.from({length:part-2},(_,i)=>i+2),counts,format:'Each numbered part is a JSON array of section/data records.',exclusions:['Other customers and private cafe configuration','Authentication credentials, encrypted device tokens and bearer secrets'],retainedCategories:['Financial ledger and balances','Minimal audit and enrollment proof','Backup copies until configured expiry']})));
  }else{
   const result=z.object({blocked:z.boolean().optional(),authIdentityId:z.uuid().nullable().optional()}).parse((await pool.query('select public.worker_privacy_database($1,$2) result',[job.requestId,job.processingToken])).rows[0]?.result);
   if(result.blocked)return;
   if(job.kind==='delete_account'&&result.authIdentityId)await identities.remove(result.authIdentityId);
  }
  await pool.query('select public.worker_finish_privacy($1,$2)',[job.requestId,job.processingToken]);
 }catch(error){await pool.query('select public.worker_finish_privacy($1,$2,$3)',[job.requestId,job.processingToken,error instanceof Error&&error.message==='expired'?'expired':'temporary_failure']);throw new Error('privacy_processing_failed',{cause:error});}
}
export function supabaseIdentityDeletion(url:string,key:string):IdentityDeletion{
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)})}});
 return {async remove(id){const {error}=await client.auth.admin.deleteUser(id);if(error&&error.status!==404)throw new Error('identity_delete_failed');}};
}
