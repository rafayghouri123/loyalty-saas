import { ownerSetup } from '@/features/tenancy/owner-data';
import { StaffForm } from '@/features/tenancy/owner-forms';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ businessId: string }> }) {
  const setup = await ownerSetup((await params).businessId);
  return <main id="main" className="container"><h1>Staff at {setup.business.display_name}</h1><StaffForm setup={setup}/></main>;
}
