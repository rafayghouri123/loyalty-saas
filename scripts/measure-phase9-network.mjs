import {writeFileSync,mkdirSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
const [rawOrigin,location,network,region]=process.argv.slice(2);
const origin=new URL(rawOrigin??'');
assert(origin.protocol==='https:'&&!origin.username&&!origin.password&&origin.pathname==='/'&&!origin.search&&!origin.hash,'Supply an HTTPS origin');
for(const label of [location,network,region])assert(label&&/^[a-zA-Z0-9_-]{1,60}$/u.test(label),'Supply location, network and region labels without identifiers/secrets');
const percentile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*q)-1]??null;
const measurements=[];
for(const path of ['/','/auth/login','/api/health/ready','/app','/sw.js','/manifest.webmanifest']){
  const samples=[];
  for(let i=0;i<10;i++){
    const start=performance.now();
    try{
      const response=await fetch(new URL(path,origin),{redirect:'manual',signal:AbortSignal.timeout(20000)});
      await response.arrayBuffer();
      samples.push({ms:performance.now()-start,status:response.status,cacheControl:response.headers.get('cache-control'),cdn:response.headers.get('x-vercel-cache'),age:response.headers.get('age'),csp:!!response.headers.get('content-security-policy')});
    }catch{samples.push({ms:performance.now()-start,status:0});}
  }
  const successful=samples.filter(s=>s.status>=200&&s.status<400);
  measurements.push({path,samples,firstMs:samples[0].ms,subsequentP50Ms:percentile(successful.slice(1).map(s=>s.ms),.5),p95Ms:percentile(successful.map(s=>s.ms),.95),errors:samples.length-successful.length});
}
// Do not infer a cold CDN response from the first client request. The recorded
// cache status/Age are the evidence; authenticated response isolation is separate.
const result={date:new Date().toISOString(),origin:origin.origin,location,network,region,boundary:'Anonymous client-to-HTTPS latency; not authenticated checkout, database latency, web vitals or physical-device evidence',measurements};
mkdirSync('.local',{recursive:true});writeFileSync(`.local/phase9-network-${location}-${region}.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(measurements.map(({path,p95Ms,errors})=>({path,p95Ms,errors}))));
if(measurements.some(m=>m.errors))process.exitCode=1;
