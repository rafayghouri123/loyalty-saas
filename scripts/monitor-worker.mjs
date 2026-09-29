// Run on a separately supervised monitor, so worker death does not stop observation.
import {monitorPool,observeHealth,webhookConfiguration,createAlertTracker} from './monitor-delivery.mjs';
const dry=process.argv.includes('--dry-run'),once=process.argv.includes('--once');
const send=dry?null:createAlertTracker(webhookConfiguration());
const pool=monitorPool();let stopping=false;
process.once('SIGINT',()=>{stopping=true;});process.once('SIGTERM',()=>{stopping=true;});
try{
 do{
  const payload=await observeHealth(pool);console.log(JSON.stringify(payload));
  if(send)try{const receipt=await send(payload);if(receipt)console.log(JSON.stringify({component:'loyalty-monitor',status:'delivered',...receipt}));}catch{console.log(JSON.stringify({component:'loyalty-monitor',status:'delivery_failed'}));process.exitCode=1;}
  if(once||stopping)break;
  for(let i=0;i<30&&!stopping;i++)await new Promise(r=>setTimeout(r,1000));
 }while(!stopping);
}finally{await pool.end();}
