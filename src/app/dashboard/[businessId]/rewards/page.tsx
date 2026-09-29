import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { verifiedUser } from '@/lib/db/server';
import { RewardsEditor, type Config } from '@/features/loyalty/owner-configuration';
export const dynamic = 'force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{businessId:string}>;searchParams:Promise<{programme?:string}>}){
  const {businessId}=await params;if(!z.uuid().safeParse(businessId).success)notFound();
  const {programme}=await searchParams;if(programme&&!z.uuid().safeParse(programme).success)notFound();
  const {client,user}=await verifiedUser();if(!client||!user)redirect('/auth/login?intent=business');
  const {data,error}=programme?await client.rpc('programme_configuration',{p_business:businessId,p_programme:programme})
    :await client.rpc('loyalty_configuration',{p_business:businessId});if(error||!data||(data as unknown as Config).programme===null)notFound();
  return <RewardsEditor businessId={businessId} initial={data as unknown as Config} programmeId={programme}/>;
}
