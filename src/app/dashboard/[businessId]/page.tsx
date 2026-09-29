import Link from 'next/link';
import { ownerSetup } from '@/features/tenancy/owner-data';
import { ProgrammeForm, PublishControl } from '@/features/tenancy/owner-forms';
import { verifiedUser } from '@/lib/db/server';
import { workspacesSchema } from '@/features/tenancy/contracts';
import { redirect, notFound } from 'next/navigation';
import { reportConfig } from '@/features/reports/data';
import { Reports } from '@/features/reports/ui';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { client, user } = await verifiedUser(); if (!client || !user) redirect('/auth/login?intent=business');
  const workspaces = await client.rpc('my_workspaces');
  if (workspaces.error) throw new Error('Workspaces could not be loaded.');
  const workspace = workspacesSchema.parse(workspaces.data).find(w => w.id === businessId); if (!workspace) notFound();
  if (workspace.role === 'cashier') redirect(`/staff/${businessId}`);
  if (workspace.role === 'manager') {
    const branch = workspace.branches[0];
    const access = branch ? await client.rpc('business_access', { p_business_id: businessId, p_branch_id: branch.id }) : null;
    if (access?.error && access.error.code !== '42501') throw new Error('Workspace permissions could not be loaded.');
    const canContact = !access?.error && (access?.data as { canContactCustomers?: boolean } | null)?.canContactCustomers === true;
    return <main id="main" className="container"><p>Manager workspace · assigned branches only</p>{workspace.branches.map(b => <section className="screen-panel" key={b.id}><h2>{b.name}</h2><Link href={`/dashboard/${businessId}/customers?branch=${b.id}`}>Branch customers</Link><Link className="button button-secondary" href={`/staff/${businessId}?branch=${b.id}`}>Open scanner</Link></section>)}{canContact && <Link href={`/dashboard/${businessId}/whatsapp`}>Manual WhatsApp follow-ups</Link>}<Link href="/workspace">Workspaces</Link><Reports businessId={businessId} config={await reportConfig(businessId)} overviewOnly/></main>;
  }
  const setup = await ownerSetup(businessId);
  return <main id="main" className="container"><h1>{setup.business.display_name}</h1><p>{setup.business.status} · Subscription {setup.subscription.status}</p>
    {setup.subscription.withinGrace && <p className="notice">Past-due grace is active until {new Date(setup.subscription.graceEndsAt!).toLocaleString('en-PK')}. Contact support to reconcile billing before access is suspended.</p>}
    <nav className="actions" aria-label="Business dashboard tools"><Link href="/workspace">Workspaces</Link><Link href="/auth/mfa">Verify authenticator</Link><Link href={`/dashboard/${setup.business.id}/staff`}>Staff</Link><Link href={`/dashboard/${setup.business.id}/customers`}>Customers</Link><Link href={`/dashboard/${setup.business.id}/branches`}>Branches</Link><Link href={`/dashboard/${setup.business.id}/settings`}>Branding and settings</Link><Link href={`/dashboard/${setup.business.id}/whatsapp`}>Manual WhatsApp follow-ups</Link></nav>
    {setup.business.status!=='draft'&&setup.programme&&<section className="screen-panel"><h2>Your loyalty programmes</h2><p>Original programme: {setup.programme.name} · {setup.programme.type} · {setup.rewards.length} rewards</p><div className="actions"><Link className="button" href={`/dashboard/${setup.business.id}/programmes`}>View all programmes</Link><Link className="button button-secondary" href={`/dashboard/${setup.business.id}/programmes/new`}>Create another programme</Link></div></section>}
    {setup.business.status === 'draft' ? <>{setup.programmeVersion ? <details><summary>Edit saved programme and reward drafts</summary><ProgrammeForm setup={setup}/></details> : <ProgrammeForm setup={setup}/>}<PublishControl setup={setup}/></> : <><Link className="button" href={`/b/${setup.business.slug}`}>Open cafe page</Link><Reports businessId={businessId} config={await reportConfig(businessId)} overviewOnly/></>}
  </main>;
}
