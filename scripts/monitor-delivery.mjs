// Shared by the supervised monitor and the explicitly labeled acceptance probe.
// Only fixed operational labels leave the database. Never expose exception text.
import pg from 'pg';
import {readFileSync} from 'node:fs';

export function monitorPool(env=process.env){
 const url=new URL(env.WORKER_DATABASE_URL);
 if([...url.searchParams.keys()].some(k=>k.toLowerCase().startsWith('ssl')))throw new Error('invalid_database_configuration');
 const insecure=env.WORKER_DB_SSL==='false';
 if(insecure&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('verified_tls_required');
 const ca=env.DATABASE_CA_CERT_PEM?.replaceAll('\\n','\n')||(env.DATABASE_CA_CERT_BASE64?Buffer.from(env.DATABASE_CA_CERT_BASE64,'base64').toString():env.DATABASE_CA_CERT_PATH?readFileSync(env.DATABASE_CA_CERT_PATH,'utf8'):undefined);
 const pool=new pg.Pool({connectionString:url.toString(),ssl:insecure?false:{rejectUnauthorized:true,...(ca?{ca}:{})},max:1,connectionTimeoutMillis:5000,query_timeout:5000});
 pool.on('error',()=>{});return pool;
}

export async function observeHealth(pool,now=Date.now()){
 const alerts=[];let state;
 try{state=(await pool.query('select public.worker_health_status() state')).rows[0].state;}catch{alerts.push('database_unavailable');}
 if(state){
  if(!state.workerFresh)alerts.push('worker_heartbeat_lost');
  if(Number(state.pendingOutbox)>100||state.oldestPendingAt&&now-Date.parse(state.oldestPendingAt)>300000)alerts.push('queue_backlog');
  if(Number(state.failedAttempts15m)>=5)alerts.push('repeated_provider_failures');
  if(Number(state.authAttempts1h)>=1000)alerts.push('auth_spike');
  if(state.ledgerStatus&&state.ledgerStatus!=='ok')alerts.push('ledger_mismatch');
  if(state.backupStatus!=='ok')alerts.push(state.backupStatus?'backup_failed':'backup_evidence_missing');
  if(state.restoreStatus!=='ok')alerts.push('restore_evidence_missing');
 }
 return {component:'loyalty-monitor',time:new Date(now).toISOString(),status:alerts.length?'attention':'ok',alerts};
}

export function webhookConfiguration(env=process.env){
 let destination;
 try{destination=new URL(env.MONITOR_WEBHOOK_URL);}catch{throw new Error('monitor_destination_not_configured');}
 if(destination.protocol!=='https:'||destination.username||destination.password)throw new Error('monitor_destination_not_configured');
 const discord=['discord.com','canary.discord.com','ptb.discord.com'].includes(destination.hostname)&&/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+$/u.test(destination.pathname);
 if(discord)destination.searchParams.set('wait','true');
 return {destination,discord,token:discord?undefined:env.MONITOR_WEBHOOK_TOKEN};
}

export async function deliverAlert(configuration,payload,{fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const {destination,discord,token}=configuration;
 const cleared=payload.cleared??[],test=payload.acceptanceTest?'[STAGING ACCEPTANCE TEST] ':'';
 const heading=cleared.length?'RECOVERY':payload.alerts.length?'ATTENTION':'OK';
 const body=discord?{
  content:`${test}Loyalty monitor — ${heading}\nTime: ${payload.time}\nActive: ${payload.alerts.join(', ')||'none'}${cleared.length?`\nCleared: ${cleared.join(', ')}`:''}`,
  allowed_mentions:{parse:[]},
 }:payload;
 try{
  for(let attempt=0;attempt<3;attempt++){
   const response=await fetchImpl(destination,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(8000),redirect:'error'});
   if(discord&&response.status===429&&attempt<2){
    const seconds=Number((await response.json()).retry_after);
    if(!Number.isFinite(seconds)||seconds<0||seconds>15)throw new Error();
    await sleep(Math.ceil(seconds*1000));continue;
   }
   if(!response.ok)throw new Error();
   if(!discord)return {provider:'webhook'};
   const message=await response.json();
   if(!/^\d+$/u.test(message.id??'')||message.content!==body.content)throw new Error();
   return {provider:'discord',messageId:message.id};
  }
 }catch{throw new Error('monitor_delivery_failed');}
 throw new Error('monitor_delivery_failed');
}

export function createAlertTracker(configuration,options={}){
 let previous=null,lastSent=0;
 return async(payload,now=Date.now())=>{
  const decision=alertDecision(payload,{previous,lastSent},now);
  if(!decision)return null;
  const receipt=await deliverAlert(configuration,decision,options);
  previous=[...payload.alerts];lastSent=now;return receipt;
 };
}

// Pure decision supports durable Workflow state as well as the daemon's memory.
export function alertDecision(payload,{previous,lastSent},now=Date.now()){
 const signature=payload.alerts.join(',');
 if(previous!==null&&signature===previous.join(',')&&(!payload.alerts.length||now-lastSent<3600000))return null;
 const cleared=payload.alerts.includes('database_unavailable')?[]:(previous??[]).filter(label=>!payload.alerts.includes(label));
 return {...payload,cleared};
}
