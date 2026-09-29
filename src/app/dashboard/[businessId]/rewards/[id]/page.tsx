import { notFound,redirect } from 'next/navigation';
import { z } from 'zod';
import { verifiedUser } from '@/lib/db/server';
import { RewardsEditor,type Config } from '@/features/loyalty/owner-configuration';
export const dynamic = 'force-dynamic';
export default async function Page({params}:{params:Promise<{businessId:string;id:string}>}){
  const {businessId,id}=await params;if(!z.uuid().safeParse(businessId).success||!z.uuid().safeParse(id).success)notFound();
  const {client,user}=await verifiedUser();if(!client||!user)redirect('/auth/login?intent=business');
  const {data:programmes,error}=await client.rpc('business_programmes',{p_business:businessId});
  if(error||!Array.isArray(programmes))notFound();
  for(const programme of programmes){
    if(!programme||typeof programme!=='object'||!('id' in programme)||typeof programme.id!=='string')continue;
    const {data}=await client.rpc('programme_configuration',{p_business:businessId,p_programme:programme.id});
    if(!data)continue;
    const config=data as unknown as Config;
    if(config.rewards.some(reward=>reward.id===id))return <RewardsEditor businessId={businessId} initial={config} editId={id} programmeId={programme.id}/>;
  }
  notFound();
}
