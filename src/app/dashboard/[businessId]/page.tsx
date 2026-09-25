import Link from 'next/link';
import { ownerSetup } from '@/features/tenancy/owner-data';
import { ProgrammeForm, PublishControl } from '@/features/tenancy/owner-forms';
import { verifiedUser } from '@/lib/db/server';
import { workspacesSchema } from '@/features/tenancy/contracts';
import { redirect, notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { client, user } = await verifiedUser(); if (!client || !user) redirect('/auth/login?intent=business');
  const workspaces = await client.rpc('my_workspaces');
  if (workspaces.error) throw new Error('Workspaces could not be loaded.');
  const workspace = workspacesSchema.parse(workspaces.data).find(w => w.id === businessId); if (!workspace) notFound();
  if (workspace.role === 'cashier') redirect(`/staff/${businessId}`);
  if (workspace.role === 'manager') return <main id="main" className="container"><h1>{workspace.name}</h1><p>Manager workspace · assigned branches only</p>{workspace.branches.map(b => <section className="screen-panel" key={b.id}><h2>{b.name}</h2><Link href={`/dashboard/${businessId}/customers?branch=${b.id}`}>Branch customers</Link><Link className="button button-secondary" href={`/staff/${businessId}?branch=${b.id}`}>Open scanner</Link></section>)}<Link href="/workspace">Workspaces</Link></main>;
  const setup = await ownerSetup(businessId);
  return <main id="main" className="container"><h1>{setup.business.display_name}</h1><p>{setup.business.status} · Subscription {setup.subscription.status}</p>
    {setup.subscription.withinGrace && <p className="notice">Past-due grace is active until {new Date(setup.subscription.graceEndsAt!).toLocaleString('en-PK')}. Contact support to reconcile billing before access is suspended.</p>}
    <nav className="actions"><Link href="/workspace">Workspaces</Link><Link href="/auth/mfa">Verify authenticator</Link><Link href={`/dashboard/${setup.business.id}/staff`}>Staff</Link><Link href={`/dashboard/${setup.business.id}/customers`}>Customers</Link><Link href={`/dashboard/${setup.business.id}/branches`}>Branches</Link><Link href={`/dashboard/${setup.business.id}/settings`}>Branding and settings</Link></nav>
    {setup.business.status === 'draft' ? <>{setup.programmeVersion ? <details><summary>Edit saved programme and reward drafts</summary><ProgrammeForm setup={setup}/></details> : <ProgrammeForm setup={setup}/>}<PublishControl setup={setup}/></> : <><Link className="button" href={`/b/${setup.business.slug}`}>Open cafe page</Link><p>Live reporting and checkout are implemented in their assigned phases.</p></>}
  </main>;
}
