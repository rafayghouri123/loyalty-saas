import { createGateway } from '@/lib/db/gateway';

let gateway: ReturnType<typeof createGateway> | null = null;
export async function issueReferralGrant(input:{userId:string;sessionId:string;businessSlug:string;code:string;seenAt:string;tokenHash:string}) {
  if (!process.env.WEB_GATEWAY_DATABASE_URL) throw new Error('Referral attribution gateway is not configured.');
  gateway ??= createGateway({connectionString:process.env.WEB_GATEWAY_DATABASE_URL,
    ssl:process.env.WEB_GATEWAY_DB_SSL!=='false',caPath:process.env.DATABASE_CA_CERT_PATH});
  return gateway.issueReferralGrant(input);
}
export async function recordReferralVisit(code:string) {
  if (!process.env.WEB_GATEWAY_DATABASE_URL) throw new Error('Referral visit gateway is not configured.');
  gateway ??= createGateway({connectionString:process.env.WEB_GATEWAY_DATABASE_URL,
    ssl:process.env.WEB_GATEWAY_DB_SSL!=='false',caPath:process.env.DATABASE_CA_CERT_PATH});
  return gateway.recordReferralVisit(code);
}
