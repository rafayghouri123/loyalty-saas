import Link from 'next/link';
import { ownerSetup } from '@/features/tenancy/owner-data';
import { BranchForm } from '@/features/tenancy/configuration-forms';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ businessId: string }> }) {
  const setup = await ownerSetup((await params).businessId);
  return <main id="main" className="container"><h1>Branches at {setup.business.display_name}</h1>{setup.branches.map(b => <section className="screen-panel" key={b.id}><h2>{b.name}</h2><p>{b.status}</p><Link href={`/dashboard/${setup.business.id}/branches/${b.id}`}>Edit branch and hours</Link></section>)}<h2>Add branch</h2><BranchForm businessId={setup.business.id}/></main>;
}
