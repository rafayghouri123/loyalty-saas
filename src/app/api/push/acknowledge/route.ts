import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getPublicConfig } from '@/lib/config';
import { verifiedUser } from '@/lib/db/server';
import { failure, PRIVATE_HEADERS, rateLimited, readSmallJson, validMutationOrigin } from '@/lib/security/http';

export async function POST(request: Request) {
  const correlationId = randomUUID(), config = getPublicConfig();
  if (!config) return failure('temporary_failure','Notifications are unavailable.',correlationId);
  if (!validMutationOrigin(request,config.appUrl)) return failure('forbidden','Request origin is not allowed.',correlationId);
  const { user, client } = await verifiedUser();
  if (!user || !client) return failure('unauthenticated','Sign in to confirm this device.',correlationId);
  let input;
  try { input = z.strictObject({ challengeId: z.uuid(), installationId: z.uuid(), nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/u) }).parse(await readSmallJson(request)); }
  catch { return failure('invalid_input','The notification confirmation is invalid.',correlationId); }
  const { data, error } = await client.rpc('acknowledge_push_challenge',{ p_challenge_id: input.challengeId, p_installation_id: input.installationId, p_nonce: input.nonce });
  if (error) return failure('temporary_failure','This device could not be confirmed.',correlationId);
  const rejected = z.object({ error: z.object({ code: z.enum(['rate_limited','not_found','expired','invalid_input']), retryAfterSeconds: z.number().int().positive().optional() }) }).safeParse(data);
  if (rejected.success) return rejected.data.error.code === 'rate_limited'
    ? rateLimited(rejected.data.error.retryAfterSeconds ?? 60,correlationId)
    : failure(rejected.data.error.code,'This confirmation is unavailable or has expired. Enable notifications again.',correlationId);
  return Response.json({ data, correlationId },{ headers: PRIVATE_HEADERS });
}
