import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/db/server';
import { ClaimOfferButton } from '@/features/communications/offers-ui';
import Image from 'next/image';
import { publicOfferImageUrl } from '@/lib/media/public-url';
export const dynamic='force-dynamic';
type Offer={id:string;businessName:string;businessTimezone:string;title:string;kind:string;description:string;terms:string;startsAt:string;expiresAt:string;
 status:string;minimumSpendPaisa:string;discountPercent:number|null;maxDiscountPaisa:string|null;claimId:string|null;claimStatus:string|null;
 membershipId:string;imagePath:string|null;branches:{id:string;name:string}[]};
export default async function OfferPage({params}:{params:Promise<{offerId:string}>}){
 const {offerId}=await params;const {client,user}=await verifiedUser();if(!client||!user)redirect('/auth/login');
 const {data,error}=await client.rpc('offer_detail' as never,{p_offer:offerId} as never);
 if(error||!data)notFound();const offer=data as Offer;
 return <main id="main" className="container"><Link href="/app/offers">← Offers</Link><h1>{offer.title}</h1><p>{offer.businessName}</p>
  <section className="screen-panel">{publicOfferImageUrl(offer.imagePath)&&<Image unoptimized src={publicOfferImageUrl(offer.imagePath)!}
   width={600} height={340} alt=""/>}<p>{offer.description}</p><p>{offer.terms}</p>
   <p>Valid {new Date(offer.startsAt).toLocaleString('en-PK',{timeZone:offer.businessTimezone})} to {new Date(offer.expiresAt).toLocaleString('en-PK',{timeZone:offer.businessTimezone})} ({offer.businessTimezone}).</p>
   <p>Branches: {offer.branches.map(branch=>branch.name).join(', ')}</p>
   {BigInt(offer.minimumSpendPaisa)>0n&&<p>Minimum eligible spend: Rs {Number(offer.minimumSpendPaisa)/100}</p>}
   {offer.kind==='discount'&&<p>{offer.discountPercent}% discount{offer.maxDiscountPaisa?` up to Rs ${Number(offer.maxDiscountPaisa)/100}`:''}. Staff confirm the amount applied at checkout.</p>}
   {offer.claimStatus==='fulfilled'?<p>Fulfilled</p>:new Date(offer.expiresAt)<=new Date()?<p>This offer has expired.</p>:
    offer.kind==='informational'?<Link className="button" href={`/app/cards/${offer.membershipId}`}>Open my card</Link>:
    offer.status==='paused'&&!offer.claimId?<p>This offer is paused for new claims.</p>:
    <ClaimOfferButton offerId={offer.id} claimId={offer.claimId} membershipId={offer.membershipId}/>}
   {offer.claimStatus==='claimed'&&<p>Your claim is saved. A staff member must validate the benefit at checkout.</p>}
  </section></main>;
}
