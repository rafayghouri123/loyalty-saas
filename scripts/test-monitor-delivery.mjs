import test from 'node:test';
import assert from 'node:assert/strict';
import {webhookConfiguration,deliverAlert,createAlertTracker,observeHealth,monitorPool} from './monitor-delivery.mjs';
const configuration=webhookConfiguration({MONITOR_WEBHOOK_URL:'https://discord.com/api/webhooks/123456789/test-token',MONITOR_WEBHOOK_TOKEN:'must-not-send'});
const payload=alerts=>({component:'loyalty-monitor',time:'2026-09-27T12:00:00.000Z',status:alerts.length?'attention':'ok',alerts});
const acknowledge=async(_url,request)=>new Response(JSON.stringify({id:'123456789',content:JSON.parse(request.body).content}),{status:200});

test('Discord waits for confirmed persistence and does not send generic bearer credentials',async()=>{
 await deliverAlert(configuration,payload(['database_unavailable']),{fetchImpl:async(url,request)=>{
  assert.equal(url.searchParams.get('wait'),'true');assert.equal(request.headers.authorization,undefined);
  assert.deepEqual(JSON.parse(request.body).allowed_mentions,{parse:[]});assert.equal(request.redirect,'error');
  return acknowledge(url,request);
 }});
});
test('Discord 204 and mismatched saved messages cannot be mistaken for delivery',async()=>{
 for(const response of [new Response(null,{status:204}),new Response(JSON.stringify({id:'123',content:'wrong'}),{status:200})])
  await assert.rejects(deliverAlert(configuration,payload([]),{fetchImpl:async()=>response}),/^Error: monitor_delivery_failed$/u);
});
test('rate limits obey bounded retry_after without acknowledging unsent alerts',async()=>{
 let attempts=0;const delays=[];
 await deliverAlert(configuration,payload([]),{fetchImpl:async(url,request)=>++attempts===1?new Response(JSON.stringify({retry_after:0.5}),{status:429}):acknowledge(url,request),sleep:async ms=>{delays.push(ms);}});
 assert.equal(attempts,2);assert.deepEqual(delays,[500]);
 await assert.rejects(deliverAlert(configuration,payload([]),{fetchImpl:async()=>new Response(JSON.stringify({retry_after:120}),{status:429})}),/monitor_delivery_failed/u);
});
test('failure retries preserve state; recovery shows remaining warnings; unchanged observations are quiet',async()=>{
 const contents=[];let fail=true;
 const send=createAlertTracker(configuration,{fetchImpl:async(url,request)=>{
  if(fail){fail=false;throw new Error('private provider exception');}
  contents.push(JSON.parse(request.body).content);return acknowledge(url,request);
 }});
 await assert.rejects(send(payload(['database_unavailable']),100),/^Error: monitor_delivery_failed$/u);
 assert((await send(payload(['database_unavailable']),200)).messageId);
 assert.equal(await send(payload(['database_unavailable']),300),null);
 assert((await send(payload(['backup_evidence_missing']),400)).messageId);
 assert(contents[1].includes('RECOVERY'));assert(contents[1].includes('Cleared: database_unavailable'));assert(contents[1].includes('Active: backup_evidence_missing'));
 assert.equal(await send(payload(['backup_evidence_missing']),500),null);
 assert((await send(payload(['backup_evidence_missing']),3600400)).messageId);
});
test('DB failure cannot claim recovery of DB-backed warnings',async()=>{
 const contents=[];const send=createAlertTracker(configuration,{fetchImpl:async(url,request)=>{contents.push(JSON.parse(request.body).content);return acknowledge(url,request);}});
 await send(payload(['worker_heartbeat_lost']),100);await send(payload(['database_unavailable']),200);
 assert(!contents[1].includes('Cleared:'));assert(contents[1].includes('ATTENTION'));
});
test('generic webhook JSON and optional bearer token remain compatible',async()=>{
 const generic=webhookConfiguration({MONITOR_WEBHOOK_URL:'https://alerts.example.test/ingest',MONITOR_WEBHOOK_TOKEN:'generic-token'});
 const receipt=await deliverAlert(generic,payload([]),{fetchImpl:async(_url,request)=>{assert.equal(request.headers.authorization,'Bearer generic-token');assert.deepEqual(JSON.parse(request.body),payload([]));return new Response(null,{status:204});}});
 assert.deepEqual(receipt,{provider:'webhook'});
});
test('actual query exceptions are redacted; thresholds and missing evidence remain visible',async()=>{
 assert.deepEqual((await observeHealth({query:async()=>{throw new Error('private SQL credentials');}},0)).alerts,['database_unavailable']);
 const result=await observeHealth({query:async()=>({rows:[{state:{workerFresh:false,pendingOutbox:101,failedAttempts15m:5,authAttempts1h:1000,ledgerStatus:'mismatch',backupStatus:null,restoreStatus:null}}]})},0);
 assert.deepEqual(result.alerts,['worker_heartbeat_lost','queue_backlog','repeated_provider_failures','auth_spike','ledger_mismatch','backup_evidence_missing','restore_evidence_missing']);
});
test('invalid destinations and unverified remote TLS are rejected',()=>{
 for(const url of [undefined,'http://alerts.example.test','https://user:password@alerts.example.test'])assert.throws(()=>webhookConfiguration({MONITOR_WEBHOOK_URL:url}),/monitor_destination_not_configured/u);
 assert.throws(()=>monitorPool({WORKER_DATABASE_URL:'postgres://worker:secret@remote.example.test/db',WORKER_DB_SSL:'false'}),/verified_tls_required/u);
});
