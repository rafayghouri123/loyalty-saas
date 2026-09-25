import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { verifiedUser } from '@/lib/db/server';
import { ProgrammeEditor, type Config } from '@/features/loyalty/owner-configuration';
export const dynamic = 'force-dynamic';
export default async function Page({params}:{params:Promise<{businessId:string}>}){
  const {businessId}=await params;if(!z.uuid().safeParse(businessId).success)notFound();
  const {client,user}=await verifiedUser();if(!client||!user)redirect('/auth/login?intent=business');
  const {data,error}=await client.rpc('loyalty_configuration',{p_business:businessId});if(error||!data)notFound();
  return <ProgrammeEditor businessId={businessId} initial={data as unknown as Config}/>;
}
