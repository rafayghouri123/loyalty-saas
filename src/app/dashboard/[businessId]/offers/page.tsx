import { notFound, redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/db/server';
import { OfferManager } from '@/features/communications/offers-ui';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{businessId:string}>}){
 const {businessId}=await params;
 const {client,user}=await verifiedUser();
 if(!client||!user)redirect('/auth/login?intent=business');
 const {data,error}=await client.rpc('offer_configuration' as never,{p_business:businessId} as never);
 if(error||!data)notFound();
 return <OfferManager businessId={businessId} initial={data as never}/>;
}
