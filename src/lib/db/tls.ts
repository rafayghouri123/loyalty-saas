import { readFileSync } from 'node:fs';

export function databaseTls(enabled:boolean,caPath?:string) {
  if(!enabled) return false;
  const ca=process.env.DATABASE_CA_CERT_PEM?.replaceAll('\\n','\n')
    ?? (process.env.DATABASE_CA_CERT_BASE64?Buffer.from(process.env.DATABASE_CA_CERT_BASE64,'base64').toString('utf8'):undefined)
    ?? (caPath?readFileSync(caPath,'utf8'):undefined);
  return {rejectUnauthorized:true,...(ca?{ca}:{})};
}
