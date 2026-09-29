import {existsSync,mkdirSync,copyFileSync} from 'node:fs';
const source=new URL('../../../scripts/monitor-delivery.mjs',import.meta.url);
const destination=new URL('../shared/monitor-delivery.mjs',import.meta.url);
// Repository builds sync canonical code; curated uploads already contain the same bytes.
if(existsSync(source)){mkdirSync(new URL('../shared/',import.meta.url),{recursive:true});copyFileSync(source,destination);}
if(!existsSync(destination))throw new Error('monitor_shared_source_missing');
