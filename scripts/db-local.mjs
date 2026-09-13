import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const action=process.argv[2];
const allowed=new Set(['start','stop','reset','types']);
if(!allowed.has(action)) throw new Error('Use db:start, db:stop, db:reset or db:types.');
// Commands are fixed to --local; DATABASE_URL and linked project state are never used.
const args=action==='types'?['gen','types','typescript','--local','--schema','public']
  :action==='reset'?['db','reset','--local']: [action];
const result=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js',...args],{stdio:action==='types'?['ignore','pipe','inherit']:'inherit',encoding:'utf8',windowsHide:true});
if(result.error) { console.error('Local Supabase CLI could not start. Install dependencies and Docker Desktop first.'); process.exit(1); }
if(result.status!==0) process.exit(result.status??1);
if(action==='types') writeFileSync('src/lib/db/database.types.ts',result.stdout);
