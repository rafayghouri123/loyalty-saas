import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getPublicConfig } from '@/lib/config';
import { createUserClient } from '@/lib/db/server';
import { emailLoginConfigured, limitEmailLogin } from '@/lib/security/email-login';
import { failure, PRIVATE_HEADERS, rateLimited, readSmallJson, safeReturnPath, validMutationOrigin } from '@/lib/security/http';
export async function POST(request: Request) {
  const correlationId = randomUUID(), config = getPublicConfig();
  if (!config || !emailLoginConfigured()) return failure('temporary_failure', 'Email sign-in is awaiting provider setup.', correlationId);
  if (!validMutationOrigin(request, config.appUrl)) return failure('forbidden', 'Request origin is not allowed.', correlationId);
  let input;
  try { input = z.strictObject({ email: z.email().max(254).transform(v => v.trim().toLowerCase()), intent: z.enum(['customer', 'business']), next: z.string().max(2048).optional() }).parse(await readSmallJson(request)); }
  catch { return failure('invalid_input', 'Enter a valid email address.', correlationId); }
  try {
    const next = safeReturnPath(input.next, input.intent === 'business' ? '/workspace' : '/app');
    const callbackUrl = `${new URL(config.appUrl).origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const decision = await limitEmailLogin(request, input.email, callbackUrl);
    if (!decision.allowed) return rateLimited(decision.retryAfterSeconds, correlationId);
    if (!decision.token) return failure('temporary_failure', 'Email sign-in is unavailable.', correlationId);
    const client = await createUserClient();
    if (!client) return failure('temporary_failure', 'Email sign-in is unavailable.', correlationId);
    const { error } = await client.auth.signInWithOtp({ email: input.email, options: { emailRedirectTo: `${callbackUrl}&email_request=${decision.token}` } });
    if (error && (error.status === undefined || error.status >= 500 || error.status === 429)) return failure('temporary_failure', 'Email sign-in is temporarily unavailable. Please retry later.', correlationId);
    // The same response covers eligible accounts and provider account restrictions.
    return Response.json({ data: { sent: true, resendAfterSeconds: 60 }, correlationId }, { headers: PRIVATE_HEADERS });
  } catch { return failure('temporary_failure', 'Email sign-in is temporarily unavailable.', correlationId); }
}
