import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/db/server';
import { StatePanel } from '@/components/ui/state-panel';
import Link from 'next/link';
import { workspacesSchema } from '@/features/tenancy/contracts';
export const dynamic='force-dynamic';
export default async function Workspace(){
  const {unavailable,user,client}=await verifiedUser();
  if(!unavailable&&!user) redirect('/auth/login?intent=business');
  if(!client) return <main id="main" className="container"><StatePanel title="Business sign-in needs setup"><p>Authentication is not configured for this development environment.</p></StatePanel></main>;
  const {data,error}=await client.rpc('my_workspaces');
  if(error) throw new Error('Workspaces could not be loaded. Please sign in again.');
  const workspaces=workspacesSchema.parse(data);
  const admin=await client.rpc('my_admin_access');
  return <main id="main" className="container"><h1>Your workspaces</h1>{!workspaces.length&&<p>No active staff assignment. Create a business or accept your invitation.</p>}
    <div className="card-grid">{workspaces.map(w=><section className="screen-panel" key={w.id}><h2>{w.name}</h2><p>{w.role} · {w.branches.map(b=>b.name).join(', ')}</p><Link className="button" href={w.role==='cashier'?`/staff/${w.id}`:`/dashboard/${w.id}`}>{w.role==='cashier'?'Open scanner':'Open dashboard'}</Link></section>)}</div>
    <nav className="actions"><Link href="/dashboard/onboarding">Create business</Link><Link href="/app">My loyalty cards</Link><Link href="/auth/mfa">Authenticator</Link><Link href="/app/notifications">Device and sign out</Link>{!admin.error&&admin.data===true&&<Link href="/admin">Admin</Link>}</nav></main>;
}
