import { notFound, redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/db/server';
import { PromotionManager } from '@/features/loyalty/phase4-ui';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { client, user } = await verifiedUser();
  if (!user || !client) redirect('/auth/login?intent=business');
  const { data, error } = await client.rpc('promotion_configuration', { p_business: businessId });
  if (error || !data) notFound();
  return <PromotionManager businessId={businessId} initial={data as never}/>;
}
