import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/db/server';
import { StatePanel } from '@/components/ui/state-panel';
export const dynamic='force-dynamic';
export default async function Workspace(){
  const {unavailable,user}=await verifiedUser();
  if(!unavailable&&!user) redirect('/auth/login?intent=business');
  return <main id="main" className="container"><StatePanel title={unavailable?'Business sign-in needs setup':'Business setup is in progress'} href="/" action="Back to home"><p>{unavailable?'Authentication is not configured for this development environment.':'Your sign-in is verified. Business creation and workspace permissions are being implemented; no business role has been assigned.'}</p></StatePanel></main>;
}
