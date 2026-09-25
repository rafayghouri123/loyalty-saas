import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { verifiedUser } from '@/lib/db/server';
import { RewardIntent, type Card } from '@/features/loyalty/customer-card';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ membershipId: string }> }) {
  const { membershipId } = await params;
  if (!z.uuid().safeParse(membershipId).success) notFound();
  const { client, user } = await verifiedUser(); if (!client || !user) redirect('/auth/login?next=/app');
  const { data, error } = await client.rpc('customer_card', { p_membership: membershipId });
  if (error || !data) notFound();
  return <RewardIntent initial={data as unknown as Card} />;
}
