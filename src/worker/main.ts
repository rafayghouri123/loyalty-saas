import {startWorker} from './runtime.js';
import {workerSettings} from './configuration.js';
function log(event:string){console.log(JSON.stringify({time:new Date().toISOString(),component:'worker',event}));}
try{
 const worker=await startWorker({...workerSettings(),onError:log});
 log('started');let stopping=false;
 const stop=async()=>{if(stopping)return;stopping=true;await worker.stop();log('stopped');};
 process.once('SIGINT',()=>{void stop();});process.once('SIGTERM',()=>{void stop();});
}catch{log('startup_failed');process.exitCode=1;}
