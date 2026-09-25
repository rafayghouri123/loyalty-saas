import { staffWorkspace } from '@/features/loyalty/staff-data';
import { verifiedUser } from '@/lib/db/server';
import { StaffActivity } from '@/features/loyalty/staff-activity';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params; await staffWorkspace(businessId);
  const { client } = await verifiedUser();
  const { data, error } = await client!.rpc('staff_context', { p_business: businessId });
  if (error || !data) throw new Error('Staff activity unavailable.');
  const context = data as unknown as { timezone: string; branches: { id:string;name:string }[] };
  return <StaffActivity businessId={businessId} zone={context.timezone} branches={context.branches} />;
}
