import { staffWorkspace } from '@/features/loyalty/staff-data';
import { StaffScan } from '@/features/loyalty/staff-flow';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params; const space = await staffWorkspace(businessId);
  return <StaffScan businessId={businessId} businessName={space.name} branches={space.branches} />;
}
