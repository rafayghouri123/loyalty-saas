import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { verifiedUser } from '@/lib/db/server';
import { ownerSetup } from '@/features/tenancy/owner-data';
import { ProgrammeForm } from '@/features/tenancy/owner-forms';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{businessId:string}>}) {
  const {businessId}=await params;if(!z.uuid().safeParse(businessId).success)notFound();
  const {client,user}=await verifiedUser();if(!client||!user)redirect('/auth/login?intent=business');
  const {error}=await client.rpc('business_programmes',{p_business:businessId});if(error)notFound();
  const setup=await ownerSetup(businessId);if(setup.business.status==='draft')redirect(`/dashboard/${businessId}`);
  return <main id="main" className="container"><nav className="actions"><Link href={`/dashboard/${businessId}/programmes`}>Programmes</Link></nav>
    <h1>Create another loyalty programme</h1><p>Set the earning rules and first reward. You can review the draft before publishing it.</p>
    <ProgrammeForm setup={setup} additional/></main>;
}
