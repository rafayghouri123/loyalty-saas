import {mkdirSync,readdirSync,copyFileSync,statSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const source=resolve('monitoring/vercel'),target=resolve('.local/vercel-monitor-deploy');mkdirSync(target,{recursive:true});
const manifest=[];
function copy(path){if(path.replaceAll('\\','/').startsWith('app/.well-known/workflow'))return;const input=join(source,path),output=join(target,path);
 if(statSync(input).isDirectory()){mkdirSync(output,{recursive:true});for(const item of readdirSync(input))copy(join(path,item));}
 else{copyFileSync(input,output);manifest.push({path:path.replaceAll('\\','/'),sha256:createHash('sha256').update(readFileSync(input)).digest('hex')});}
}
for(const path of ['app','lib','scripts','tests','package.json','package-lock.json','tsconfig.json','next.config.ts','vercel.json'])copy(path);
mkdirSync(join(target,'shared'),{recursive:true});copyFileSync('scripts/monitor-delivery.mjs',join(target,'shared/monitor-delivery.mjs'));
manifest.push({path:'shared/monitor-delivery.mjs',sha256:createHash('sha256').update(readFileSync('scripts/monitor-delivery.mjs')).digest('hex')});
const project=JSON.parse(readFileSync('.local/vercel-monitor-project.json','utf8'));mkdirSync(join(target,'.vercel'),{recursive:true});
writeFileSync(join(target,'.vercel/project.json'),JSON.stringify({orgId:project.orgId,projectId:project.projectId,projectName:project.projectName}));
writeFileSync('.local/vercel-monitor-source-manifest.json',JSON.stringify(manifest,null,2));
console.log(`PASS ${manifest.length} monitor source files staged; environment and credential files excluded.`);
