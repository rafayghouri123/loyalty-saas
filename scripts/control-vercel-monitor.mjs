import {readFileSync} from 'node:fs';
const action=process.argv[2]??'ensure';
if(!['ensure','verify'].includes(action))throw new Error('use_ensure_or_verify');
const project=JSON.parse(readFileSync('.local/vercel-monitor-project.json','utf8'));
const origin=new URL(process.env.MONITOR_CONTROL_ORIGIN??`https://${project.projectName}.vercel.app`);
if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('https_monitor_origin_required');
const secret=process.env.MONITOR_CRON_SECRET??readFileSync('.local/vercel-monitor-secret','utf8').trim();
if(secret.length<32)throw new Error('monitor_control_secret_required');
try{
 const r=await fetch(new URL(action==='verify'?'/api/control?action=verify':'/api/control',origin),{method:action==='verify'?'POST':'GET',headers:{authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(60000),redirect:'error'});
 if(!r.ok)throw new Error();const result=await r.json();console.log(JSON.stringify({state:result.state,runId:result.runId}));
}catch{console.error('monitor_control_failed');process.exitCode=1;}
