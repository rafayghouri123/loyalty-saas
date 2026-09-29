import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/db/server';
import { StatePanel } from '@/components/ui/state-panel';
import { workspacesSchema } from '@/features/tenancy/contracts';
import { BusinessWorkspaces } from '@/features/tenancy/business-shell';
export const dynamic='force-dynamic';
export default async function Workspace(){
  const {unavailable,user,client}=await verifiedUser();
  if(!unavailable&&!user) redirect('/auth/login?intent=business');
  if(!client) return <main id="main" className="container"><StatePanel title="Business sign-in needs setup"><p>Authentication is not configured for this development environment.</p></StatePanel></main>;
  const {data,error}=await client.rpc('my_workspaces');
  if(error) throw new Error('Workspaces could not be loaded. Please sign in again.');
  const workspaces=workspacesSchema.parse(data);
  const [admin,creation]=await Promise.all([client.rpc('my_admin_access'),client.rpc('can_bootstrap_business')]);
  // Admin discovery itself requires MFA; ordinary/new business sessions may be AAL1.
  if(admin.error&&admin.error.message!=='mfa_required') throw new Error('Business account access could not be checked. Please retry.');
  if(creation.error||typeof creation.data!=='boolean') throw new Error('Business creation access could not be checked. Please retry.');
  if(!workspaces.length&&admin.data!==true&&creation.data) redirect('/dashboard/onboarding');
  return <BusinessWorkspaces workspaces={workspaces} admin={admin.data===true} canCreateBusiness={creation.data}/>;
}
