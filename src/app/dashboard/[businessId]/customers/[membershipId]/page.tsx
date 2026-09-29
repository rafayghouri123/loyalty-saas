import { notFound,redirect } from 'next/navigation';
import { z } from 'zod';
import { verifiedUser } from '@/lib/db/server';
import { OwnerMember,type Detail } from '@/features/loyalty/owner-member';
import { ContactTools, type MemberContact } from '@/features/whatsapp/contact-ui';
export const dynamic = 'force-dynamic';
export default async function Page({params}:{params:Promise<{businessId:string;membershipId:string}>}){
  const {businessId,membershipId}=await params;if(!z.uuid().safeParse(businessId).success||!z.uuid().safeParse(membershipId).success)notFound();
  const {client,user}=await verifiedUser();if(!client||!user)redirect('/auth/login?intent=business');
  const {data,error}=await client.rpc('owner_member_financial',{p_business:businessId,p_membership:membershipId});
  const contact=await client.rpc('whatsapp_member_contact',{p_business:businessId,p_membership:membershipId});
  if(error||!data){if(contact.error||!contact.data)notFound();return <main id="main" className="container"><h1>Customer communication</h1><ContactTools businessId={businessId} membershipId={membershipId} initial={contact.data as unknown as MemberContact}/></main>;}
  return <OwnerMember businessId={businessId} initial={data as unknown as Detail} contact={!contact.error&&contact.data?contact.data as unknown as MemberContact:undefined}/>;
}
