import { notFound } from 'next/navigation';
import { z } from 'zod';
import { staffWorkspace } from '@/features/loyalty/staff-data';
import { verifiedUser } from '@/lib/db/server';
import { StaffTransaction } from '@/features/loyalty/staff-activity';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{businessId:string;id:string}>;searchParams:Promise<{type?:string}>}){
  const {businessId,id}=await params;const {type}=await searchParams;
  if(!z.uuid().safeParse(id).success||!['purchase','redemption'].includes(type??''))notFound();
  await staffWorkspace(businessId);
  const {client}=await verifiedUser();const {data,error}=await client!.rpc('staff_activity_detail',{p_business:businessId,p_type:type!,p_id:id});
  if(error||!data)notFound();
  return <StaffTransaction businessId={businessId} type={type as 'purchase'|'redemption'} id={id} initial={data as never}/>;
}
