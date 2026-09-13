import { z } from 'zod';
import type { RateDecision } from '../db/gateway';
import { subjectHmac } from './crypto';
import { trustedIpSubject, type TrustedIngressReader } from './ingress';

type Dependencies = {
  ingress: TrustedIngressReader | null;
  hmacKey: Buffer;
  limit: (emailSubject: string, ipSubject: string) => Promise<RateDecision>;
};

// A preflight boundary, not a public limiter ticket or authorization to send email.
// The email action stays disabled until direct Auth endpoint bypass is covered.
export async function limitMagicLink(request: Request, email: string, dependencies: Dependencies) {
  const parsed = z.email().max(254).safeParse(email.trim().toLowerCase());
  if (!parsed.success) return { kind: 'invalid_input' } as const;
  try {
    const ipSubject = trustedIpSubject(request, dependencies.ingress, dependencies.hmacKey);
    const emailSubject = subjectHmac(dependencies.hmacKey, 'login-email', parsed.data);
    const result = await dependencies.limit(emailSubject, ipSubject);
    return { kind: result.allowed ? 'allowed' : 'rate_limited', retryAfterSeconds: result.retryAfterSeconds } as const;
  } catch {
    return { kind: 'temporary_failure' } as const;
  }
}
