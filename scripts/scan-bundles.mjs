import {readdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const privateKeys=['WORKER_DATABASE_URL','MIGRATION_DATABASE_URL','WEB_GATEWAY_DATABASE_URL','MONITOR_DATABASE_URL','STORAGE_SERVICE_ROLE_KEY','ENCRYPTION_KEY_BASE64','RATE_LIMIT_HMAC_KEY_BASE64','RESEND_API_KEY','VERCEL_TOKEN','MONITOR_WEBHOOK_URL','MONITOR_WEBHOOK_TOKEN','MONITOR_CRON_SECRET','CRON_SECRET','FIREBASE_SERVICE_ACCOUNT_JSON'];
const values=privateKeys.map(k=>process.env[k]).filter(v=>v&&v.length>=20);
try{const token=new URL(process.env.MONITOR_WEBHOOK_URL).pathname.split('/').at(-1);if(token.length>=20)values.push(token);}catch{}
for(const k of ['WORKER_DATABASE_URL','MIGRATION_DATABASE_URL','WEB_GATEWAY_DATABASE_URL','MONITOR_DATABASE_URL']){try{const password=decodeURIComponent(new URL(process.env[k]).password);if(password.length>=16)values.push(password);}catch{}}
if(process.env.GOOGLE_APPLICATION_CREDENTIALS){try{const data=JSON.parse(await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS,'utf8'));if(data.private_key)values.push(data.private_key,JSON.stringify(data.private_key).slice(1,-1));}catch{}}
try{const token=(await readFile('.local/vercel-token','utf8')).trim();if(token.length>=20)values.push(token);}catch{}
for(const path of ['.local/vercel-monitor-token','.local/vercel-monitor-secret']){try{const value=(await readFile(path,'utf8')).trim();if(value.length>=20)values.push(value);}catch{}}
try{const secret=(await readFile('.local/vercel-worker-secret','utf8')).trim();if(secret.length>=32)values.push(secret);}catch{}
const files=[];
async function walk(path){for(const item of await readdir(path,{withFileTypes:true})){const file=resolve(path,item.name);if(item.isDirectory())await walk(file);else if(/\.(?:js|json|map|html|txt|log)$/u.test(item.name))files.push(file);}}
await walk(resolve('.next/static'));
try{await walk(resolve('monitoring/vercel/.next/static'));}catch(error){if(error.code!=='ENOENT')throw error;}
for(const item of await readdir('.local'))if((item.startsWith('phase8-')||item.startsWith('phase9-')||item.startsWith('vercel-worker-'))&&item.endsWith('.log'))files.push(resolve('.local',item));
let failures=0;
for(const path of files){const content=await readFile(path,'utf8');if(values.some(value=>content.includes(value))||/-----BEGIN (?:RSA )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/]/u.test(content)){console.error('FAIL sensitive bytes in:',path.replace(process.cwd(),'workspace'));failures++;}}
if(failures)process.exitCode=1;else console.log(`PASS ${files.length} browser assets/acceptance logs checked against ${values.length} configured server-secret values; no sensitive bytes printed.`);
