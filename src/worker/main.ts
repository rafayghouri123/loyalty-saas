import { z } from 'zod';
import { startWorker } from './runtime.js';

const schema=z.object({
  APP_ENV:z.enum(['development','test','staging','production']).default('development'),
  WORKER_DATABASE_URL:z.string().url(),
  WORKER_DB_SSL:z.enum(['true','false']).default('true'),
  LIVE_PUSH_ENABLED:z.enum(['true','false']).default('false'),
});
const config=schema.safeParse(process.env);
function log(event:string){console.log(JSON.stringify({time:new Date().toISOString(),component:'worker',event}));}
if(!config.success){log('configuration_missing_or_invalid');process.exit(1);}
if(config.data.LIVE_PUSH_ENABLED==='true'){
  log('live_push_not_implemented');process.exit(1);
}
const dbUrl=new URL(config.data.WORKER_DATABASE_URL);
if(config.data.WORKER_DB_SSL==='false'&&!['localhost','127.0.0.1','[::1]'].includes(dbUrl.hostname)){
  log('remote_database_requires_verified_tls');process.exit(1);
}
try {
  const worker=await startWorker({connectionString:config.data.WORKER_DATABASE_URL,ssl:config.data.WORKER_DB_SSL==='true',onError:log});
  log('started');
  let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;await worker.stop();log('stopped');};
  process.once('SIGINT',()=>{void stop();});
  process.once('SIGTERM',()=>{void stop();});
} catch {log('startup_failed');process.exitCode=1;}
