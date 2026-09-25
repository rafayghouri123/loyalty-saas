import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/db/server';
import { StatePanel } from '@/components/ui/state-panel';
import { copy } from '@/lib/copy';
import Link from 'next/link';
import { z } from 'zod';
import { membershipSchema } from '@/features/tenancy/contracts';
import { CardsSnapshot } from '@/components/offline-cards';
export const dynamic='force-dynamic';
export default async function CardsPage(){
  const {unavailable,user,client}=await verifiedUser();
  if(unavailable) return <main id="main" className="container"><StatePanel title={copy.setup.title} href="/" action="Back to home"><p>{copy.setup.body}</p></StatePanel></main>;
  if(!user) redirect('/auth/login');
  const {data,error}=await client!.rpc('my_memberships');
  if(error) throw new Error('Your cards could not be loaded. Please sign in again.');
  const memberships=z.array(membershipSchema).parse(data);
  return <main id="main" className="container"><CardsSnapshot userId={user.id} cards={memberships.map(m=>({id:m.id,businessName:m.businessName,units:m.units,programmeType:m.programmeType,status:m.status}))}/><h1>Your loyalty cards</h1>{!memberships.length&&<StatePanel title="Your first card starts at a cafe"><p>Scan a participating cafe’s signup QR to join. Each cafe has its own balance and preferences.</p></StatePanel>}
    <div className="card-grid">{memberships.map(m=><section className="screen-panel" key={m.id}><h2>{m.businessName}</h2><p>{m.units} {m.programmeType} · {m.status}</p><Link className="button" href={`/app/cards/${m.id}`}>Open card</Link></section>)}</div></main>;
}
