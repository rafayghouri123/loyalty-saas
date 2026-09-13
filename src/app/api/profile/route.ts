import { randomUUID } from 'node:crypto';
import { getPublicConfig } from '@/lib/config';
import { verifiedUser } from '@/lib/db/server';
import { failure, PRIVATE_HEADERS, readSmallJson, validMutationOrigin } from '@/lib/security/http';
import { profileCompletionSchema } from '@/lib/validation/primitives';

export async function POST(request: Request) {
  const correlationId = randomUUID();
  const config = getPublicConfig();
  if (!config) return failure('temporary_failure', 'Account setup is unavailable until authentication is configured.', correlationId);
  if (!validMutationOrigin(request, config.appUrl)) return failure('forbidden', 'Request origin is not allowed.', correlationId);
  const { user, client } = await verifiedUser();
  if (!user || !client) return failure('unauthenticated', 'Sign in with a verified account to continue.', correlationId);
  let body: unknown;
  try { body = await readSmallJson(request); }
  catch { return failure('invalid_input', 'Enter a valid profile request.', correlationId); }
  const parsed = profileCompletionSchema.safeParse(body);
  if (!parsed.success) return failure('invalid_input', 'Check your display name.', correlationId);
  const { data, error } = await client.rpc('complete_profile', { p_display_name: parsed.data.displayName, p_correlation_id: correlationId });
  if (error) return failure('temporary_failure', 'Your profile could not be saved. Please retry.', correlationId);
  return Response.json({ data, correlationId }, { headers: PRIVATE_HEADERS });
}
