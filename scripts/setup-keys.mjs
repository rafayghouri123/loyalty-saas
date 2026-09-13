import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const path='.env.local';
const existing=existsSync(path)?readFileSync(path,'utf8'):'';
if (/^APP_ENV=production\s*$/m.test(existing)) throw new Error('Use the production secret store; this command generates development keys only.');
const values={ENCRYPTION_KEY_ID:'local-v1',ENCRYPTION_KEY_BASE64:randomBytes(32).toString('base64'),RATE_LIMIT_HMAC_KEY_BASE64:randomBytes(32).toString('base64')};
let output='';
for(const [key,value] of Object.entries(values)) {
  if(!new RegExp(`^${key}=.+$`,'m').test(existing)) {
    if(new RegExp(`^${key}=`,'m').test(existing)) throw new Error(`Remove the empty ${key} placeholder first; existing files are never silently overwritten.`);
    output+=`${key}=${value}\n`;
  }
}
if(output) appendFileSync(path,`\n# Local development keys; never commit.\n${output}`,{mode:0o600});
console.log(output?'Local keys generated in .env.local. Values are not printed.':'Existing local keys preserved.');
