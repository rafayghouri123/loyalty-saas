import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { verifiedUser } from '@/lib/db/server';
import { ProgrammeList, type ProgrammeSummary } from '@/features/loyalty/programme-list';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{businessId:string}>}) {
  const {businessId}=await params;if(!z.uuid().safeParse(businessId).success)notFound();
  const {client,user}=await verifiedUser();if(!client||!user)redirect('/auth/login?intent=business');
  const {data,error}=await client.rpc('business_programmes',{p_business:businessId});if(error||!data)notFound();
  return <main id="main" className="container"><nav className="actions"><Link href={`/dashboard/${businessId}`}>Dashboard</Link></nav>
    <h1>Loyalty programmes</h1><p>Each programme gives customers its own card, balance, earning rules and rewards.</p>
    <ProgrammeList businessId={businessId} programmes={data as ProgrammeSummary[]}/>
    <Link className="button" href={`/dashboard/${businessId}/programmes/new`}>Create another programme</Link></main>;
}
