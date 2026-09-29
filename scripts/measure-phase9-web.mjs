import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {writeFileSync} from 'node:fs';
const origin='http://127.0.0.1:3110';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3110'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,APP_ENV:'test',NEXT_PUBLIC_APP_URL:origin,NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'',LIVE_PUSH_ENABLED:'false'}});
server.stdout.resume();server.stderr.resume();
let browser;
try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
  if(!ready)throw new Error('Production build server unavailable');
  browser=await chromium.launch();const rows=[];
  for(const path of ['/','/ui-fixtures/screens/C02','/ui-fixtures/screens/S01']){
    for(let sample=0;sample<5;sample++){
      const context=await browser.newContext({viewport:{width:360,height:800},deviceScaleFactor:1});
      const page=await context.newPage(),session=await context.newCDPSession(page);
      await session.send('Network.enable');await session.send('Network.setCacheDisabled',{cacheDisabled:true});
      await session.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1_600_000/8,uploadThroughput:750_000/8});
      await session.send('Emulation.setCPUThrottlingRate',{rate:4});
      await page.addInitScript(()=>{
        window.lab={lcp:0,cls:0};
        new PerformanceObserver(list=>{for(const e of list.getEntries())window.lab.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
        new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.lab.cls+=e.value;}).observe({type:'layout-shift',buffered:true});
      });
      await page.goto(origin+path);await page.waitForLoadState('networkidle');
      const metrics=await page.evaluate(()=>({...window.lab,scriptBytes:performance.getEntriesByType('resource').filter(e=>e.initiatorType==='script').reduce((sum,e)=>sum+e.transferSize,0)}));
      rows.push({path,sample,...metrics});await context.close();
    }
  }
  const summaries=[...new Set(rows.map(r=>r.path))].map(path=>{const selected=rows.filter(r=>r.path===path);return {path,samples:selected.length,p75LcpMs:selected.map(r=>r.lcp).sort((a,b)=>a-b)[3],maxCls:Math.max(...selected.map(r=>r.cls)),maxTransferredScriptBytes:Math.max(...selected.map(r=>r.scriptBytes))};});
  const result={date:new Date().toISOString(),conditions:{viewport:'360x800',cpuSlowdown:4,latencyMs:150,downMbps:1.6,upMbps:.75,cache:'disabled',browser:browser.version()},boundary:'Local production-build lab; synthetic card/scanner controls; not field p75, hosted Auth, physical-device or INP evidence',summaries,rows};
  writeFileSync('.local/phase9-web-performance.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(summaries));
}finally{if(browser)await browser.close();const exited=once(server,'exit');server.kill();await exited.catch(()=>{});}
