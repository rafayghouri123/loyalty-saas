import { notFound } from 'next/navigation';
import { ownerSetup } from '@/features/tenancy/owner-data';
import { BranchForm, type Branch } from '@/features/tenancy/configuration-forms';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ businessId: string; id: string }> }) {
  const { businessId, id } = await params; const setup = await ownerSetup(businessId); const branch = setup.branches.find(b => b.id === id) as Branch | undefined;
  if (!branch) notFound();
  return <main id="main" className="container"><h1>Edit {branch.name}</h1><BranchForm businessId={businessId} initial={branch}/></main>;
}
