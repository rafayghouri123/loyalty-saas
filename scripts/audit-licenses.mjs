import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const manifest=JSON.parse(readFileSync('package.json','utf8'));
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const entries=Object.entries(lock.packages).filter(([path])=>path.startsWith('node_modules/')).map(([path,pkg])=>{
  let installed={};try{installed=JSON.parse(readFileSync(resolve(path,'package.json'),'utf8'));}catch{}
  let license=pkg.license??installed.license??'UNKNOWN';
  const notices=existsSync(path)?readdirSync(path).filter(n=>/^(licen[sc]e|copying|notice|ofl)/iu.test(n)):[];
  if(license==='UNKNOWN')for(const notice of notices){const text=readFileSync(resolve(path,notice),'utf8');if(/Apache License\s+Version 2\.0/u.test(text))license='Apache-2.0';else if(text.includes('Permission is hereby granted, free of charge')&&text.includes('THE SOFTWARE IS PROVIDED "AS IS"'))license='MIT';}
  return {package:installed.name??path.split('node_modules/').at(-1),version:pkg.version,license:typeof license==='string'?license:JSON.stringify(license),development:!!pkg.dev,installed:existsSync(path),notices};
});
const unresolved=entries.filter(p=>p.license==='UNKNOWN'||/UNLICENSED|SEE LICENSE|GPL|AGPL/iu.test(p.license)&&!p.license.includes('LGPL'));
mkdirSync('.local',{recursive:true});writeFileSync('.local/phase9-licenses.json',JSON.stringify({date:new Date().toISOString(),entries,unresolved},null,2)+'\n');
const counts=new Map();for(const p of entries)counts.set(p.license,(counts.get(p.license)??0)+1);
let doc=`# Dependency and license inventory\n\nGenerated ${new Date().toISOString()} from the lockfile and installed package metadata. ${entries.length} locked dependency entries, including optional platform binaries. Package metadata is evidence for engineering review, not a legal opinion. Exact transitive inventory: run \`npm run licenses:check\` to regenerate \`.local/phase9-licenses.json\`.\n\n| License expression | Locked entries |\n| --- | ---: |\n`;
for(const [license,count] of [...counts].sort())doc+=`| ${license} | ${count} |\n`;
doc+='\n| Direct package | Pinned version | License |\n| --- | --- | --- |\n';
for(const [name,version] of Object.entries({...manifest.dependencies,...manifest.devDependencies}).sort())doc+=`| ${name} | ${version} | ${entries.find(p=>p.package===name)?.license??'UNKNOWN'} |\n`;
doc+='\nKeep dependency copyright/license notices with redistributed builds. Inter includes OFL-1.1; do not sell the font alone or use reserved font names for modified versions. The test-only axe-core engine uses MPL-2.0 and is not imported by application code. Sharp optional libvips binary packages include LGPL-3.0-or-later notices; preserve them in worker/container distribution and review any changes to those libraries. No license text is stripped by the application build.\n';
doc+=unresolved.length?`\nUnresolved metadata requires review: ${unresolved.map(p=>`${p.package}@${p.version} (${p.license})`).join(', ')}.\n`:'\nNo missing/UNLICENSED/strong-copyleft metadata was found by this inventory rule. This does not establish compliance of every bundled asset; retain supplier notices and review distribution changes.\n';
writeFileSync('docs/license-inventory.md',doc);
console.log(`${entries.length} lockfile entries; ${unresolved.length} require metadata review.`);
if(unresolved.length)process.exitCode=1;
