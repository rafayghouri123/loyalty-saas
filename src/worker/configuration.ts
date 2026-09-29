import { z } from 'zod';
import type { WorkerSettings } from './runtime.js';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { parseSecretKey } from '../lib/security/crypto.js';
import type { ChallengeSender } from './push-challenge.js';
import type { CampaignSender } from './campaign-push.js';
import { supabaseMediaStorage } from './media.js';
import { resendAuthEmailSender } from './auth-email.js';
import {supabaseExportStorage} from './report-export.js';
import {supabaseIdentityDeletion} from './privacy.js';

const schema=z.object({
  APP_ENV:z.enum(['development','test','staging','production']).default('development'),
  WORKER_DATABASE_URL:z.string().url(),
  WORKER_DB_SSL:z.enum(['true','false']).default('true'),
  LIVE_PUSH_ENABLED:z.enum(['true','false']).default('false'),
  MEDIA_PROCESSING_ENABLED:z.enum(['true','false']).default('false'),
  AUTH_EMAIL_ENABLED:z.enum(['true','false']).default('false'),
  EXPORT_PROCESSING_ENABLED:z.enum(['true','false']).default('false'),
  PRIVACY_PROCESSING_ENABLED:z.enum(['true','false']).default('false'),
});
export function workerSettings():WorkerSettings {
  const config={data:schema.parse(process.env)};
  const dbUrl=new URL(config.data.WORKER_DATABASE_URL);
  if(config.data.WORKER_DB_SSL==='false'&&!['localhost','127.0.0.1','[::1]'].includes(dbUrl.hostname))throw new Error('Verified worker TLS required.');
  let challengeSender: ChallengeSender | undefined;
  let campaignSender: CampaignSender | undefined;
  if(config.data.LIVE_PUSH_ENABLED==='true') {
    const keyId=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/u).parse(process.env.ENCRYPTION_KEY_ID);
    const bytes=parseSecretKey(process.env.ENCRYPTION_KEY_BASE64 ?? '');
    const projectId=z.string().min(1).parse(process.env.FIREBASE_PROJECT_ID);
    const json=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if(process.env.VERCEL==='1'&&!json)throw new Error('Inline worker Firebase credential required.');
    const account=json?z.object({project_id:z.literal(projectId),client_email:z.email(),private_key:z.string().min(100)}).parse(JSON.parse(json)):undefined;
    const app=getApps().find(app=>app.name==='loyalty-worker')??initializeApp({credential:account?cert({projectId,clientEmail:account.client_email,privateKey:account.private_key}):applicationDefault(),projectId},'loyalty-worker');
    challengeSender={key:id=>{if(id!==keyId)throw new Error('Unknown encryption key.');return {id,bytes};},send:async message=>{
      await getMessaging(app).send({token:message.token,data:{type:'loyalty.registration.v1',challengeId:message.challengeId,installationId:message.installationId,nonce:message.nonce},
        webpush:{headers:{TTL:String(message.ttlSeconds),Urgency:'high'}}});
    }};
    campaignSender={key:challengeSender.key,send:async message=>{
      const imagePath=message.imagePath&&/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/v1\.webp$/iu.test(message.imagePath)?message.imagePath:null;
      const imageUrl=imagePath?`${z.url().parse(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/$/u,'')}/storage/v1/object/public/loyalty-brand/${imagePath}`:'';
      return getMessaging(app).send({token:message.token,
      data:{type:'loyalty.notification.v1',installationId:message.installationId,bindingGeneration:message.bindingGeneration,
       eventKey:message.eventKey,recipientId:message.recipientId,title:message.title,body:message.body,
       destination:message.destination,imageUrl,testOnly:message.testOnly?'true':'false'},
      webpush:{headers:{TTL:String(message.ttlSeconds),Urgency:'normal'}}});}};
  }
  const mediaStorage=config.data.MEDIA_PROCESSING_ENABLED==='true'?supabaseMediaStorage(z.url().parse(process.env.NEXT_PUBLIC_SUPABASE_URL),z.string().min(20).parse(process.env.STORAGE_SERVICE_ROLE_KEY)):undefined;
  const authEmailSender=config.data.AUTH_EMAIL_ENABLED==='true'?resendAuthEmailSender({key:z.string().min(20).parse(process.env.RESEND_API_KEY),from:z.string().min(5).parse(process.env.AUTH_EMAIL_FROM),supabaseUrl:z.url().parse(process.env.NEXT_PUBLIC_SUPABASE_URL),appOrigin:z.url().parse(process.env.NEXT_PUBLIC_APP_URL)}):undefined;
  const exportStorage=config.data.EXPORT_PROCESSING_ENABLED==='true'||config.data.PRIVACY_PROCESSING_ENABLED==='true'?supabaseExportStorage(z.url().parse(process.env.NEXT_PUBLIC_SUPABASE_URL),z.string().min(20).parse(process.env.STORAGE_SERVICE_ROLE_KEY),{id:z.string().min(1).parse(process.env.ENCRYPTION_KEY_ID),bytes:parseSecretKey(process.env.ENCRYPTION_KEY_BASE64??'')}):undefined;
  const identityDeletion=config.data.PRIVACY_PROCESSING_ENABLED==='true'?supabaseIdentityDeletion(z.url().parse(process.env.NEXT_PUBLIC_SUPABASE_URL),z.string().min(20).parse(process.env.STORAGE_SERVICE_ROLE_KEY)):undefined;
  return {connectionString:config.data.WORKER_DATABASE_URL,ssl:config.data.WORKER_DB_SSL==='true',caPath:process.env.DATABASE_CA_CERT_PATH,challengeSender,campaignSender,mediaStorage,authEmailSender,exportStorage,identityDeletion};
}
