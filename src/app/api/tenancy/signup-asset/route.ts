import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { verifiedUser } from '@/lib/db/server';
import { getPublicConfig } from '@/lib/config';
import { failure, PRIVATE_HEADERS } from '@/lib/security/http';
import { signupArtwork, signupDestination } from '@/features/tenancy/signup-assets';
import type { Setup } from '@/features/tenancy/owner-forms';

export async function GET(request: Request) {
  const correlationId = randomUUID(), config = getPublicConfig();
  if (!config) return failure('temporary_failure', 'Configuration unavailable.', correlationId);
  const query = z.object({ businessId: z.uuid(), branchId: z.uuid(), format: z.enum(['png', 'svg']) }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return failure('invalid_input', 'Choose a branch and file format.', correlationId);
  const { client, user } = await verifiedUser();
  if (!client || !user) return failure('unauthenticated', 'Sign in to download signage.', correlationId);
  const { data, error } = await client.rpc('business_setup', { p_business_id: query.data.businessId });
  if (error || !data) return failure('not_found', 'Business unavailable.', correlationId);
  const setup = data as unknown as Setup;
  const branch = setup.branches.find(b => b.id === query.data.branchId && b.status === 'active');
  if (!branch || setup.business.status !== 'active' || !setup.rewardVersion || !setup.programme) return failure('conflict', 'Publish the programme and select an active branch first.', correlationId);
  const bytes = await signupArtwork({ destination: signupDestination(config.appUrl, setup.business.slug, branch.id), cafe: setup.business.display_name, branch: branch.name,
    proposition: `${setup.rewardVersion.title} · ${setup.rewardVersion.unit_cost} ${setup.programme.type}` }, query.data.format);
  return new Response(new Uint8Array(bytes), { headers: { ...PRIVATE_HEADERS, 'Content-Type': query.data.format === 'svg' ? 'image/svg+xml' : 'image/png',
    'Content-Disposition': `attachment; filename="${setup.business.slug}-signup.${query.data.format}"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
}
