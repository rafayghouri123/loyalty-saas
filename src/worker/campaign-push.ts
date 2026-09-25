import type pg from 'pg';
import { z } from 'zod';
import { hashToken, openSecret, type EncryptionKey } from '../lib/security/crypto.js';

const attempt=z.strictObject({attemptId:z.uuid(),deviceId:z.uuid(),installationId:z.uuid(),bindingGeneration:z.uuid(),
 tokenCiphertext:z.string(),tokenKeyId:z.string(),tokenHash:z.string()});
const delivery=z.strictObject({campaignId:z.uuid(),recipientId:z.uuid(),membershipId:z.uuid(),eventKey:z.string(),
 title:z.string(),body:z.string(),imagePath:z.string().nullable(),destination:z.string().startsWith('/app/'),expiresAt:z.string(),attempts:z.array(attempt)});
const automationDelivery=z.strictObject({runId:z.uuid(),membershipId:z.uuid(),eventKey:z.string(),
 title:z.string(),body:z.string(),imagePath:z.string().nullable(),destination:z.string().startsWith('/app/'),expiresAt:z.string(),attempts:z.array(attempt)});
const ready=z.strictObject({attemptId:z.uuid(),tokenCiphertext:z.string(),tokenKeyId:z.string(),tokenHash:z.string(),
 installationId:z.uuid(),bindingGeneration:z.uuid(),expiresAt:z.string()});
const testDelivery=z.strictObject({requestId:z.uuid(),title:z.string(),body:z.string(),imagePath:z.string().nullable(),destination:z.literal('/app/notifications'),
 eventKey:z.string(),expiresAt:z.string(),installationId:z.uuid(),bindingGeneration:z.uuid(),
 tokenCiphertext:z.string(),tokenKeyId:z.string(),tokenHash:z.string()});
export type CampaignSender={key:(id:string)=>EncryptionKey;send:(message:{token:string;title:string;body:string;
 destination:string;eventKey:string;recipientId:string;installationId:string;bindingGeneration:string;ttlSeconds:number;
 imagePath?:string|null;testOnly?:boolean})=>Promise<string>};

function providerFailure(error:unknown):{state:'failed'|'unknown';code:string}{
 const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
 if(code==='messaging/registration-token-not-registered'||code==='messaging/invalid-registration-token')
  return {state:'failed',code:'invalid_token'};
 if(code==='messaging/server-unavailable'||code==='messaging/internal-error'||code==='messaging/message-rate-exceeded')
  return {state:'failed',code:'transient'};
 // A timeout or crash after submission can mean FCM accepted the message.
 return {state:'unknown',code:'provider_unknown'};
}

export async function dispatchCampaigns(pool:pg.Pool,sender:CampaignSender,maxRecipients=100){
 let claimed=0;
 for(;claimed<maxRecipients;claimed++){
  const row=(await pool.query<{delivery:unknown}>('select public.worker_claim_campaign_delivery() as delivery')).rows[0]?.delivery;
  if(!row)break;
  const item=delivery.parse(row);
  for(const candidate of item.attempts){
   const fresh=(await pool.query<{ready:unknown}>('select public.worker_campaign_attempt_ready($1) as ready',[candidate.attemptId])).rows[0]?.ready;
   if(!fresh)continue;
   const device=ready.parse(fresh);
   let state:'failed'|'unknown'|'provider_accepted',code:string|null=null,providerId:string|null=null;
   try{
    const token=openSecret(device.tokenCiphertext,sender.key(device.tokenKeyId),`push-token:${device.tokenHash}`);
    if(hashToken(token)!==device.tokenHash)throw new Error('Invalid device token.');
    const ttlSeconds=Math.min(7*86400,Math.floor((Date.parse(device.expiresAt)-Date.now())/1000));
    if(ttlSeconds<=0){state='failed';code='expired';}
    else{
     providerId=await sender.send({token,title:item.title,body:item.body,imagePath:item.imagePath,destination:item.destination,
      eventKey:item.eventKey,recipientId:item.recipientId,installationId:device.installationId,
      bindingGeneration:device.bindingGeneration,ttlSeconds});
     state='provider_accepted';
    }
   }catch(error){const classified=providerFailure(error);state=classified.state;code=classified.code;}
   await pool.query('select public.worker_finish_campaign_attempt($1,$2,$3,$4)',[candidate.attemptId,state,providerId,code]);
  }
 }
 await pool.query('select public.worker_finish_campaigns()');
 return claimed;
}

export async function dispatchAutomations(pool:pg.Pool,sender:CampaignSender,maxRuns=100){
 let claimed=0;
 for(;claimed<maxRuns;claimed++){
  const row=(await pool.query<{delivery:unknown}>('select public.worker_claim_automation_delivery() as delivery')).rows[0]?.delivery;
  if(!row)break;
  const item=automationDelivery.parse(row);
  for(const candidate of item.attempts){
   const fresh=(await pool.query<{ready:unknown}>('select public.worker_automation_attempt_ready($1) as ready',[candidate.attemptId])).rows[0]?.ready;
   if(!fresh)continue;
   const device=ready.parse(fresh);
   let state:'failed'|'unknown'|'provider_accepted',code:string|null=null,providerId:string|null=null;
   try{
    const token=openSecret(device.tokenCiphertext,sender.key(device.tokenKeyId),`push-token:${device.tokenHash}`);
    if(hashToken(token)!==device.tokenHash)throw new Error('Invalid device token.');
    const ttlSeconds=Math.min(7*86400,Math.floor((Date.parse(device.expiresAt)-Date.now())/1000));
    if(ttlSeconds<=0){state='failed';code='expired';}
    else{
     providerId=await sender.send({token,title:item.title,body:item.body,imagePath:item.imagePath,destination:item.destination,
      eventKey:item.eventKey,recipientId:item.runId,installationId:device.installationId,
      bindingGeneration:device.bindingGeneration,ttlSeconds});
     state='provider_accepted';
    }
   }catch(error){const classified=providerFailure(error);state=classified.state;code=classified.code;}
   await pool.query('select public.worker_finish_automation_attempt($1,$2,$3,$4)',[candidate.attemptId,state,providerId,code]);
  }
 }
 return claimed;
}

export async function dispatchCampaignTest(pool:pg.Pool,sender:CampaignSender,outboxId:string){
 const row=(await pool.query<{delivery:unknown}>('select public.worker_claim_campaign_test($1::uuid) as delivery',[outboxId])).rows[0]?.delivery;
 if(!row)return false;
 const item=testDelivery.parse(row);
 const ready=(await pool.query<{ready:boolean}>('select public.worker_campaign_test_ready($1::uuid) as ready',[item.requestId])).rows[0]?.ready;
 if(!ready)return false;
 let state:'provider_accepted'|'failed'|'unknown';let code:string|null=null;let providerId:string|null=null;
 try{
  const token=openSecret(item.tokenCiphertext,sender.key(item.tokenKeyId),`push-token:${item.tokenHash}`);
  if(hashToken(token)!==item.tokenHash)throw new Error('Invalid device token.');
  const ttlSeconds=Math.min(300,Math.floor((Date.parse(item.expiresAt)-Date.now())/1000));
  if(ttlSeconds<=0){state='failed';code='expired';}
  else{
   providerId=await sender.send({token,title:item.title,body:item.body,imagePath:item.imagePath,destination:item.destination,
    eventKey:item.eventKey,recipientId:item.requestId,installationId:item.installationId,
    bindingGeneration:item.bindingGeneration,ttlSeconds,testOnly:true});
   state='provider_accepted';
  }
 }catch(error){const classified=providerFailure(error);state=classified.state;code=classified.code;}
 await pool.query('select public.worker_finish_campaign_test($1::uuid,$2,$3,$4)',[item.requestId,state,providerId,code]);
 return true;
}
