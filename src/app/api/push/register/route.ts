import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { getPublicConfig } from '@/lib/config';
import { verifiedUser } from '@/lib/db/server';
import { randomToken } from '@/lib/security/crypto';
import { failure, PRIVATE_HEADERS, rateLimited, readSmallJson, validMutationOrigin } from '@/lib/security/http';
import { pushRegistrationConfigured, requestPushChallenge } from '@/lib/push/server';
import { registrationFailureCode } from '@/lib/push/diagnostics';

export async function POST(request: Request) {
  const correlationId = randomUUID(), config = getPublicConfig();
  if (!config || !pushRegistrationConfigured()) return failure('temporary_failure','Notifications are not configured yet.',correlationId);
  if (!validMutationOrigin(request,config.appUrl)) return failure('forbidden','Request origin is not allowed.',correlationId);
  const { user, client } = await verifiedUser();
  if (!user || !client) return failure('unauthenticated','Sign in to enable notifications.',correlationId);
  let input;
  try { input = z.strictObject({ token: z.string().min(20).max(4096) }).parse(await readSmallJson(request)); }
  catch { return failure('invalid_input','The notification registration is invalid.',correlationId); }
  try {
    const { data, error } = await client.auth.getClaims();
    const session = z.uuid().safeParse(data?.claims.session_id);
    if (error || !session.success || data?.claims.sub !== user.id) return failure('unauthenticated','Sign in again to enable notifications.',correlationId);
    const jar = await cookies();
    const saved = jar.get('loyalty-installation')?.value.split('.');
    const valid = saved?.length === 2 && z.uuid().safeParse(saved[0]).success && /^[A-Za-z0-9_-]{43}$/u.test(saved[1]!);
    const installationId = valid ? saved[0]! : randomUUID(), installationSecret = valid ? saved[1]! : randomToken();
    // HTTP-only possession cookie prevents an editable installation UUID from evicting someone else's device.
    jar.set('loyalty-installation',`${installationId}.${installationSecret}`,{ httpOnly: true, secure: new URL(config.appUrl).protocol === 'https:', sameSite: 'strict', path: '/', maxAge: 31_536_000 });
    const result = await requestPushChallenge({ userId: user.id, sessionId: session.data, installationId, installationSecret, token: input.token });
    if ('error' in result) return rateLimited(result.error.retryAfterSeconds,correlationId);
    return Response.json({ data: result, correlationId },{ headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error(JSON.stringify({ event: 'push_registration_failed', correlationId, code: registrationFailureCode(error) }));
    return failure('temporary_failure','Notifications could not be registered. Please retry.',correlationId);
  }
}
