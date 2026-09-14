import { readFileSync } from 'node:fs';

export function databaseTls(enabled:boolean,caPath?:string) {
  if(!enabled) return false;
  const pem=process.env.DATABASE_CA_CERT_PEM?.trim();
  const encoded=process.env.DATABASE_CA_CERT_BASE64?.trim();
  const ca=(pem?pem.replaceAll('\\n','\n'):undefined)
    ?? (encoded?Buffer.from(encoded,'base64').toString('utf8'):undefined)
    ?? (caPath?.trim()?readFileSync(caPath,'utf8'):undefined);
  return {rejectUnauthorized:true,...(ca?{ca}:{})};
}
