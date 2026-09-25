import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { verifiedUser } from '@/lib/db/server';
import { getPublicConfig } from '@/lib/config';
import { failure, PRIVATE_HEADERS, readSmallJson, validMutationOrigin } from '@/lib/security/http';

export async function POST(request: Request) {
  const correlationId = randomUUID();
  const config = getPublicConfig();
  if (!config) return failure('temporary_failure', 'Authentication needs setup.', correlationId);
  if (!validMutationOrigin(request, config.appUrl)) return failure('forbidden', 'Request origin is not allowed.', correlationId);
  const { client, user } = await verifiedUser();
  if (!client || !user) return failure('unauthenticated', 'Sign in before configuring your authenticator.', correlationId);
  let input;
  try { input = z.discriminatedUnion('action', [z.strictObject({ action: z.literal('enroll') }), z.strictObject({ action: z.literal('verify'), factorId: z.uuid(), code: z.string().regex(/^\d{6}$/u) })]).parse(await readSmallJson(request)); }
  catch { return failure('invalid_input', 'Enter a six-digit authenticator code.', correlationId); }
  if (input.action === 'enroll') {
    const { data: factors, error: listError } = await client.auth.mfa.listFactors();
    if (listError) return failure('temporary_failure', 'Authenticator setup is unavailable.', correlationId);
    if (factors.totp.some(f => f.status === 'verified')) return failure('conflict', 'Use your existing authenticator.', correlationId);
    for (const factor of factors.all.filter(f => f.factor_type === 'totp' && f.status === 'unverified')) {
      const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (error) return failure('temporary_failure', 'Previous setup could not be reset.', correlationId);
    }
    const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Loyalty authenticator' });
    if (error) return failure('temporary_failure', 'Authenticator setup is unavailable. Please retry.', correlationId);
    return Response.json({ data: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret }, correlationId }, { headers: PRIVATE_HEADERS });
  }
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId: input.factorId, code: input.code });
  if (error) return failure('invalid_input', 'That code could not be verified. Check your authenticator and retry.', correlationId);
  return Response.json({ data: { verified: true }, correlationId }, { headers: PRIVATE_HEADERS });
}
