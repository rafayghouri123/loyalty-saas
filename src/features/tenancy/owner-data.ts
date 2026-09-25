import { notFound, redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/db/server';
import { z } from 'zod';
import type { Setup } from './owner-forms';
export async function ownerSetup(businessId: string) {
  if (!z.uuid().safeParse(businessId).success) notFound();
  const { client, user } = await verifiedUser();
  if (!client || !user) redirect('/auth/login?intent=business');
  const { data, error } = await client.rpc('business_setup', { p_business_id: businessId });
  if (error || !data) notFound();
  return data as unknown as Setup;
}
