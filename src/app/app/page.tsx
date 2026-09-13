import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/db/server';
import { StatePanel } from '@/components/ui/state-panel';
import { copy } from '@/lib/copy';
export const dynamic='force-dynamic';
export default async function CardsPage(){
  const {unavailable,user}=await verifiedUser();
  if(unavailable) return <main id="main" className="container"><StatePanel title={copy.setup.title} href="/" action="Back to home"><p>{copy.setup.body}</p></StatePanel></main>;
  if(!user) redirect('/auth/login');
  return <main id="main" className="container"><StatePanel title="Card setup is in progress" href="/workspace" action="Open workspaces"><p>Your sign-in is verified. Membership enrollment and cards are being connected to the database. No loyalty transactions are available yet.</p></StatePanel></main>;
}
