import { createGateway } from '../db/gateway';
import { parseSecretKey, subjectHmac } from './crypto';
import { trustedIpSubject, vercelIngressReader } from './ingress';
let gateway: ReturnType<typeof createGateway> | undefined;
export function emailLoginConfigured() {
  return process.env.EMAIL_LOGIN_ENABLED === 'true' && process.env.EMAIL_DIRECT_AUTH_LIMITS_VERIFIED === 'true'
    && Boolean(process.env.WEB_GATEWAY_DATABASE_URL && process.env.RATE_LIMIT_HMAC_KEY_BASE64 && vercelIngressReader(process.env));
}
export async function limitEmailLogin(request: Request, email: string, callbackUrl:string) {
  if (!emailLoginConfigured()) throw new Error('Email login unavailable');
  const key = parseSecretKey(process.env.RATE_LIMIT_HMAC_KEY_BASE64!);
  const ip = trustedIpSubject(request, vercelIngressReader(process.env), key);
  gateway ??= createGateway({ connectionString: process.env.WEB_GATEWAY_DATABASE_URL!, ssl: process.env.WEB_GATEWAY_DB_SSL !== 'false', caPath: process.env.DATABASE_CA_CERT_PATH });
  return gateway.authorizeAuthEmail(email,subjectHmac(key, 'login-email', email), ip,callbackUrl);
}
