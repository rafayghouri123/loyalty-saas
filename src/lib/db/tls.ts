import { readFileSync } from 'node:fs';

export function databaseTls(enabled:boolean,caPath?:string) {
  return enabled?{rejectUnauthorized:true,...(caPath?{ca:readFileSync(caPath,'utf8')}:{})}:false;
}
