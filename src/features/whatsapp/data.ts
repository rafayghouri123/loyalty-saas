import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { verifiedUser } from '@/lib/db/server';
export async function whatsappData<T>(businessId: string, name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!z.uuid().safeParse(businessId).success) notFound();
  const { client, user } = await verifiedUser();
  if (!client || !user) redirect('/auth/login?intent=business');
  const { data, error } = await client.rpc(name as never, { p_business: businessId, ...args } as never);
  if (error?.code === '42501' || error?.code === 'P0002') notFound();
  if (error || !data) throw new Error('Follow-ups could not be loaded. Please retry.');
  return data as T;
}
