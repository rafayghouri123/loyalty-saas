import { staffWorkspace } from '@/features/loyalty/staff-data';
import { StaffScan } from '@/features/loyalty/staff-flow';
import { verifiedUser } from '@/lib/db/server';
import { z } from 'zod';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params; const space = await staffWorkspace(businessId);
  const {client}=await verifiedUser();
  const {data,error}=await client!.rpc('staff_programmes',{p_business:businessId});
  if(error)throw new Error('Checkout programmes could not be loaded.');
  const programmes=z.array(z.object({id:z.uuid(),name:z.string(),type:z.enum(['stamps','points']),status:z.string()})).parse(data);
  return <StaffScan businessId={businessId} businessName={space.name} branches={space.branches} programmes={programmes}/>;
}
