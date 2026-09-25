import Link from 'next/link';
import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/db/server';
import { StatePanel } from '@/components/ui/state-panel';
import Image from 'next/image';
import { publicOfferImageUrl } from '@/lib/media/public-url';
export const dynamic='force-dynamic';
type Offer={id:string;businessId:string;title:string;businessName:string;kind:string;status:string;expiresAt:string;
 minimumSpendPaisa:string;claimStatus:string|null;imagePath:string|null};
export default async function OffersPage({searchParams}:{searchParams:Promise<{cafe?:string;view?:string}>}){
 const filters=await searchParams;
 const {client,user}=await verifiedUser();if(!client||!user)redirect('/auth/login');
 const {data,error}=await client.rpc('my_offers' as never,{p_business:null} as never);
 if(error)throw new Error('Your offers could not be loaded.');
 const offers=data as Offer[];
 const cafe=filters.cafe??'',requestedView=filters.view??'active';
 const view=['active','claimed','past','all'].includes(requestedView)?requestedView:'active';
 const cafes=[...new Map(offers.map(offer=>[offer.businessId,offer.businessName])).entries()];
 const now=Date.now();
 const shown=offers.filter(offer=>(!cafe||offer.businessId===cafe)&&(
  view==='all'||view==='claimed'&&offer.claimStatus==='claimed'&&Date.parse(offer.expiresAt)>now
  ||view==='past'&&(offer.claimStatus==='fulfilled'||Date.parse(offer.expiresAt)<=now)
  ||view==='active'&&offer.status==='published'&&Date.parse(offer.expiresAt)>now&&offer.claimStatus!=='fulfilled'));
 const link=(nextView:string,nextCafe:string)=>`/app/offers?view=${encodeURIComponent(nextView)}${nextCafe?`&cafe=${encodeURIComponent(nextCafe)}`:''}`;
 return <main id="main" className="container"><h1>Offers</h1><p>These offers are available through your joined cafes. Claiming a benefit does not fulfill it.</p>
  <nav className="actions" aria-label="Offer views"><Link href={link('active',cafe)}>Active</Link><Link href={link('claimed',cafe)}>Claimed</Link>
   <Link href={link('past',cafe)}>Past</Link><Link href={link('all',cafe)}>All</Link></nav>
  <nav className="actions" aria-label="Cafe offers"><Link href={link(view,'')}>All my cafes</Link>{cafes.map(([id,name])=><Link key={id} href={link(view,id)}>{name}</Link>)}</nav>
  {!shown.length?<StatePanel title="No offers in this view"><p>Check back later. Your loyalty cards remain available without notifications.</p></StatePanel>:
   <div className="card-grid">{shown.map(offer=><section className="screen-panel" key={offer.id}>
    {publicOfferImageUrl(offer.imagePath)&&<Image unoptimized src={publicOfferImageUrl(offer.imagePath)!} width={320} height={180} alt=""/>}
    <h2>{offer.title}</h2><p>{offer.businessName}</p>
    <p>{offer.kind} · Ends {new Date(offer.expiresAt).toLocaleString('en-PK')}</p>
    {offer.claimStatus&&<p>Claim: {offer.claimStatus}</p>}<Link className="button" href={`/app/offers/${offer.id}`}>View offer</Link></section>)}</div>}
 </main>;
}
