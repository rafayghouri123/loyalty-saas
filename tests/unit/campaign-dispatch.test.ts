import {randomBytes,randomUUID} from 'node:crypto';
import type pg from 'pg';
import {describe,expect,it,vi} from 'vitest';
import {hashToken,sealSecret} from '../../src/lib/security/crypto';
import {dispatchCampaigns,type CampaignSender} from '../../src/worker/campaign-push';

const key={id:'test',bytes:randomBytes(32)};
function fixture(){
 const campaignId=randomUUID(),recipientId=randomUUID(),membershipId=randomUUID();
 const attemptId=randomUUID(),deviceId=randomUUID(),installationId=randomUUID(),bindingGeneration=randomUUID();
 const token='synthetic-device-token',tokenHash=hashToken(token),sealed=sealSecret(token,key,`push-token:${tokenHash}`);
 const item={campaignId,recipientId,membershipId,eventKey:`campaign:${campaignId}:${membershipId}`,
  title:'Synthetic update',body:'A synthetic test message.',imagePath:null,destination:`/app/cards/${membershipId}`,
  expiresAt:new Date(Date.now()+60_000).toISOString(),attempts:[{attemptId,deviceId,installationId,bindingGeneration,
   tokenCiphertext:sealed.ciphertext,tokenKeyId:key.id,tokenHash}]};
 const ready={attemptId,tokenCiphertext:sealed.ciphertext,tokenKeyId:key.id,tokenHash,installationId,bindingGeneration,
  expiresAt:item.expiresAt};
 return {item,ready,attemptId};
}
describe('campaign provider dispatch',()=>{
 it('rechecks each device immediately before send and skips a canceled or revoked attempt',async()=>{
  const {item}=fixture();let claims=0;
  const query=vi.fn(async(sql:string,params?:unknown[])=>{
   void params;
   if(sql.includes('worker_claim_campaign_delivery'))return {rows:[{delivery:claims++===0?item:null}]};
   if(sql.includes('worker_campaign_attempt_ready'))return {rows:[{ready:null}]};
   return {rows:[{}]};
  });
  const send=vi.fn(async()=>randomUUID());
  await dispatchCampaigns({query} as unknown as pg.Pool,{key:()=>key,send} as CampaignSender);
  expect(send).not.toHaveBeenCalled();
  expect(query.mock.calls.some(([sql])=>sql.includes('worker_finish_campaign_attempt'))).toBe(false);
 });
 it('records provider acceptance separately from receipt or click',async()=>{
  const {item,ready,attemptId}=fixture();let claims=0;
  const query=vi.fn(async(sql:string,params?:unknown[])=>{
   void params;
   if(sql.includes('worker_claim_campaign_delivery'))return {rows:[{delivery:claims++===0?item:null}]};
   if(sql.includes('worker_campaign_attempt_ready'))return {rows:[{ready}]};
   return {rows:[{}]};
  });
  const send=vi.fn(async(message:Parameters<CampaignSender['send']>[0])=>{expect(message.token).toBe('synthetic-device-token');return randomUUID();});
  await dispatchCampaigns({query} as unknown as pg.Pool,{key:()=>key,send} as CampaignSender);
  expect(send).toHaveBeenCalledOnce();
  expect(send.mock.calls[0]?.[0]).toMatchObject({token:'synthetic-device-token',recipientId:item.recipientId});
  expect(query.mock.calls.find(([sql])=>sql.includes('worker_finish_campaign_attempt'))?.[1])
   .toEqual([attemptId,'provider_accepted',expect.any(String),null]);
 });
 it('does not send when the validity window expires after a device passes the database recheck',async()=>{
  const {item,ready,attemptId}=fixture();let claims=0;
  const query=vi.fn(async(sql:string)=>{
   if(sql.includes('worker_claim_campaign_delivery'))return {rows:[{delivery:claims++===0?item:null}]};
   if(sql.includes('worker_campaign_attempt_ready'))return {rows:[{ready:{...ready,expiresAt:new Date(Date.now()-1000).toISOString()}}]};
   return {rows:[{}]};
  });
  const send=vi.fn(async()=>randomUUID());
  await dispatchCampaigns({query} as unknown as pg.Pool,{key:()=>key,send} as CampaignSender);
  expect(send).not.toHaveBeenCalled();
  expect(query.mock.calls.find(([sql])=>sql.includes('worker_finish_campaign_attempt'))?.[1])
   .toEqual([attemptId,'failed',null,'expired']);
 });
 it('keeps ambiguous provider failures unknown, so no blind retry can duplicate a send',async()=>{
  const {item,ready,attemptId}=fixture();let claims=0;
  const query=vi.fn(async(sql:string,params?:unknown[])=>{
   void params;
   if(sql.includes('worker_claim_campaign_delivery'))return {rows:[{delivery:claims++===0?item:null}]};
   if(sql.includes('worker_campaign_attempt_ready'))return {rows:[{ready}]};
   return {rows:[{}]};
  });
  const send=vi.fn(async(message:Parameters<CampaignSender['send']>[0])=>{
   expect(message.token).toBe('synthetic-device-token');throw new Error('Network response lost after submission');});
  await dispatchCampaigns({query} as unknown as pg.Pool,{key:()=>key,send} as CampaignSender);
  expect(query.mock.calls.find(([sql])=>sql.includes('worker_finish_campaign_attempt'))?.[1])
   .toEqual([attemptId,'unknown',null,'provider_unknown']);
 });
});
