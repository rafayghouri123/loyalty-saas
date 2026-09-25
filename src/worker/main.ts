import { z } from 'zod';
import { startWorker } from './runtime.js';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { parseSecretKey } from '../lib/security/crypto.js';
import type { ChallengeSender } from './push-challenge.js';
import type { CampaignSender } from './campaign-push.js';
import { supabaseMediaStorage } from './media.js';
import { resendAuthEmailSender } from './auth-email.js';

const schema=z.object({
  APP_ENV:z.enum(['development','test','staging','production']).default('development'),
  WORKER_DATABASE_URL:z.string().url(),
  WORKER_DB_SSL:z.enum(['true','false']).default('true'),
  LIVE_PUSH_ENABLED:z.enum(['true','false']).default('false'),
  MEDIA_PROCESSING_ENABLED:z.enum(['true','false']).default('false'),
  AUTH_EMAIL_ENABLED:z.enum(['true','false']).default('false'),
});
const config=schema.safeParse(process.env);
function log(event:string){console.log(JSON.stringify({time:new Date().toISOString(),component:'worker',event}));}
if(!config.success){log('configuration_missing_or_invalid');process.exit(1);}
const dbUrl=new URL(config.data.WORKER_DATABASE_URL);
if(config.data.WORKER_DB_SSL==='false'&&!['localhost','127.0.0.1','[::1]'].includes(dbUrl.hostname)){
  log('remote_database_requires_verified_tls');process.exit(1);
}
try {
  let challengeSender: ChallengeSender | undefined;
  let campaignSender: CampaignSender | undefined;
  if(config.data.LIVE_PUSH_ENABLED==='true') {
    const keyId=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/u).parse(process.env.ENCRYPTION_KEY_ID);
    const bytes=parseSecretKey(process.env.ENCRYPTION_KEY_BASE64 ?? '');
    const app=initializeApp({credential:applicationDefault(),projectId:z.string().min(1).parse(process.env.FIREBASE_PROJECT_ID)});
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
  const worker=await startWorker({connectionString:config.data.WORKER_DATABASE_URL,ssl:config.data.WORKER_DB_SSL==='true',caPath:process.env.DATABASE_CA_CERT_PATH,onError:log,challengeSender,campaignSender,mediaStorage,authEmailSender});
  log('started');
  let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;await worker.stop();log('stopped');};
  process.once('SIGINT',()=>{void stop();});
  process.once('SIGTERM',()=>{void stop();});
} catch {log('startup_failed');process.exitCode=1;}
