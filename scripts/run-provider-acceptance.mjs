import { spawn } from 'node:child_process';
import { once } from 'node:events';
const live=process.argv.includes('--phase5-live');
const env={...process.env,APP_ENV:'staging',NEXT_PUBLIC_APP_URL:'http://127.0.0.1:3101',PHASE2_TEST_WEB_URL:'http://127.0.0.1:3101',PHASE3_TEST_WEB_URL:'http://127.0.0.1:3101',PHASE4_TEST_WEB_URL:'http://127.0.0.1:3101',
 ...(live?{LIVE_PUSH_ENABLED:'true',PUSH_REGISTRATION_ENABLED:'true'}:{})};
const run=async(args)=>{const child=spawn(process.execPath,args,{env,windowsHide:true,stdio:'inherit'});const [code]=await once(child,'exit');if(code!==0)throw new Error('Acceptance subprocess failed');};
let server,worker;
try {
 if(!process.argv.includes('--skip-build')) await run(['node_modules/next/dist/bin/next','build']);
 if(live)await run(['node_modules/typescript/bin/tsc','-p','tsconfig.worker.json']);
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3101'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let ready=false;server.stdout.on('data',chunk=>{if(chunk.toString().includes('Ready in'))ready=true;});
 // Do not echo framework request logs containing callback/cookie details.
 server.stderr.on('data',chunk=>{for(const line of chunk.toString().split(/\r?\n/u))if(line.includes('loyalty_rpc_error'))console.error(line);});
 const deadline=Date.now()+30000;
 while(!ready&&Date.now()<deadline&&server.exitCode===null)await new Promise(resolve=>setTimeout(resolve,100));
 if(!ready)throw new Error('Acceptance web server unavailable');
 if(live){
  worker=spawn(process.execPath,['dist/worker/worker/main.js'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let workerReady=false;worker.stdout.on('data',chunk=>{if(chunk.toString().includes('"event":"started"'))workerReady=true;});
  worker.stderr.on('data',()=>{});
  const workerDeadline=Date.now()+30000;
  while(!workerReady&&Date.now()<workerDeadline&&worker.exitCode===null)await new Promise(resolve=>setTimeout(resolve,100));
  if(!workerReady)throw new Error('Acceptance worker unavailable');
 }
 await run(['--import','tsx',process.argv.includes('--phase5')||live?'scripts/verify-phase5-provider.mjs':process.argv.includes('--phase4')?'scripts/verify-phase4-provider.mjs':process.argv.includes('--phase3')?'scripts/verify-phase3-provider.mjs':process.argv.includes('--email')?'scripts/verify-auth-email-provider.mjs':'scripts/verify-phase2-provider.mjs',...(live?['--live']:[])]);
} catch(error) {console.error(error.message);process.exitCode=1;}
finally {if(worker){worker.kill();await once(worker,'exit').catch(()=>{});}if(server){server.kill();await once(server,'exit').catch(()=>{});}}
