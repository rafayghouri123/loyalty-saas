import pg from 'pg';
import { z } from 'zod';
import { databaseTls } from './tls';

const decision = z.strictObject({ allowed: z.boolean(), retryAfterSeconds: z.number().int().min(0).max(3600) })
  .refine(value => value.allowed === (value.retryAfterSeconds === 0));
export type RateDecision = z.infer<typeof decision>;
export type PushCandidate = { userId: string; sessionId: string; installationId: string; installationSecretHash: string;
  tokenHash: string; tokenCiphertext: string; keyId: string; nonceHash: string; nonceCiphertext: string };

// Bounded, server-only operations. This role cannot read business/customer tables.
// Use the provider transaction pooler for Vercel, and never migration/service-role credentials.
export function createGateway(settings: { connectionString: string; ssl: boolean; caPath?:string }) {
  const url = new URL(settings.connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || [...url.searchParams.keys()].some(key => key.toLowerCase().startsWith('ssl'))
    || (!settings.ssl && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('Invalid gateway database configuration.');
  }
  const pool = new pg.Pool({ connectionString: settings.connectionString, ssl: databaseTls(settings.ssl,settings.caPath),
    max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10_000, statement_timeout: 5000, query_timeout: 7000 });
  pool.on('error', () => { /* Requests fail closed; never log connection strings or database error details. */ });
  let checked: Promise<void> | null = null;
  const check = () => checked ??= pool.query<{ allowed: boolean }>(
    "select pg_has_role(current_user,'loyalty_web_gateway','member') and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb as allowed from pg_roles where rolname=current_user"
  ).then(result => { if (!result.rows[0]?.allowed) throw new Error('Dedicated web gateway role required.'); })
    .catch(error => { checked = null; throw error; });
  return {
    async authorizeAuthEmail(email:string,emailSubject:string,ipSubject:string,callbackUrl:string) {
      await check();
      const result=await pool.query('select public.gateway_authorize_auth_email($1,$2,$3,$4) as result',[email,emailSubject,ipSubject,callbackUrl]);
      return z.object({allowed:z.boolean(),retryAfterSeconds:z.number(),token:z.string().optional(),grantId:z.uuid().optional()}).parse(result.rows[0]?.result);
    },
    async issueReferralGrant(input:{userId:string;sessionId:string;businessSlug:string;code:string;seenAt:string;tokenHash:string}):Promise<boolean> {
      await check();
      const result=await pool.query('select public.gateway_issue_referral_grant($1,$2,$3,$4,$5,$6) as issued',
        [input.userId,input.sessionId,input.businessSlug,input.code,input.seenAt,input.tokenHash]);
      return z.boolean().parse(result.rows[0]?.issued);
    },
    async recordReferralVisit(code:string):Promise<boolean> {
      await check();
      const result=await pool.query('select public.gateway_record_referral_visit($1) as recorded',[code]);
      return z.boolean().parse(result.rows[0]?.recorded);
    },
    async requestPushChallenge(input: PushCandidate): Promise<unknown> {
      await check();
      const result = await pool.query('select public.gateway_request_push_challenge($1,$2,$3,$4,$5,$6,$7,$8,$9) as result',
        [input.userId,input.sessionId,input.installationId,input.installationSecretHash,input.tokenHash,input.tokenCiphertext,input.keyId,input.nonceHash,input.nonceCiphertext]);
      return result.rows[0]?.result;
    },
    async limitMagicLink(emailSubject: string, ipSubject: string): Promise<RateDecision> {
      await check();
      // Autocommit is deliberate: a denial/provider failure must not undo the consumed attempt.
      const result = await pool.query('select public.gateway_limit_magic_link($1,$2) as decision', [emailSubject, ipSubject]);
      return decision.parse(result.rows[0]?.decision);
    },
    async close() { await pool.end(); },
  };
}
