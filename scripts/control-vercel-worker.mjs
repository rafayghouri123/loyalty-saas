import {readFileSync} from 'node:fs';
const action=process.argv[2]??'ensure';
if(!['start','stop','ensure'].includes(action))throw new Error('Use start, stop or ensure.');
let secret=process.env.CRON_SECRET;
if(!secret){try{secret=readFileSync('.local/vercel-worker-secret','utf8').trim();}catch{}}
if(!secret||secret.length<32)throw new Error('Set the server-only CRON_SECRET.');
const origin=process.env.WORKER_CONTROL_ORIGIN??'https://loyalty-saas-three.vercel.app';
const url=new URL(`/api/worker/control${action==='stop'?'?action=stop':''}`,origin);
if(url.protocol!=='https:')throw new Error('An HTTPS worker control origin is required.');
const response=await fetch(url,{method:action==='ensure'?'GET':'POST',headers:{authorization:`Bearer ${secret}`},redirect:'error',signal:AbortSignal.timeout(60000)});
const result=await response.json();
console.log(JSON.stringify({status:response.status,state:result.state??result.error,runId:result.runId}));
if(!response.ok)process.exitCode=1;
