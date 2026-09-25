import { notFound,redirect } from 'next/navigation';
import { z } from 'zod';
import { verifiedUser } from '@/lib/db/server';
import { RewardsEditor,type Config } from '@/features/loyalty/owner-configuration';
export const dynamic = 'force-dynamic';
export default async function Page({params}:{params:Promise<{businessId:string;id:string}>}){
  const {businessId,id}=await params;if(!z.uuid().safeParse(businessId).success||!z.uuid().safeParse(id).success)notFound();
  const {client,user}=await verifiedUser();if(!client||!user)redirect('/auth/login?intent=business');
  const {data,error}=await client.rpc('loyalty_configuration',{p_business:businessId});if(error||!data)notFound();
  const config=data as unknown as Config;if(!config.rewards.some(reward=>reward.id===id))notFound();
  return <RewardsEditor businessId={businessId} initial={config} editId={id}/>;
}
