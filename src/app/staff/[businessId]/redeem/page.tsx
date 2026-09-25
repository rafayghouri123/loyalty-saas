import { staffWorkspace } from '@/features/loyalty/staff-data';
import { RedemptionCheckout } from '@/features/loyalty/staff-flow';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params; await staffWorkspace(businessId);
  return <RedemptionCheckout businessId={businessId} />;
}
