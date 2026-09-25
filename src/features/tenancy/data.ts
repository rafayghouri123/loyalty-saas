import { createUserClient, verifiedUser } from '@/lib/db/server';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { cafeSchema, configurationSchema, membershipSchema } from './contracts';

export async function publicConfiguration() {
  const client = await createUserClient();
  if (!client) return { plans: [], policies: [] };
  const { data, error } = await client.rpc('public_configuration');
  if (error) return { plans: [], policies: [] };
  return configurationSchema.parse(data);
}
export async function readCafe(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/u.test(slug)) notFound();
  const client = await createUserClient();
  if (!client) notFound();
  const { data, error } = await client.rpc('public_business', { p_slug: slug });
  if (error) throw new Error('Cafe details could not be loaded.');
  if (!data) notFound();
  return cafeSchema.parse(data);
}
export async function customerData(next = '/app') {
  const auth = await verifiedUser();
  if (!auth.client || !auth.user) redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  const { data, error } = await auth.client.rpc('my_memberships');
  if (error) throw new Error('Memberships could not be loaded. Please sign in again.');
  return { client: auth.client, user: auth.user, memberships: z.array(membershipSchema).parse(data) };
}
