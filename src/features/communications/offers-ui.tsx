'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import QRCode from 'qrcode';
import { communicationRequest } from './client';
import { offerDraft } from './contracts';
import { loyaltyRequest } from '@/features/loyalty/client';
import { MediaUpload } from '@/features/tenancy/media-upload';
import { publicOfferImageUrl } from '@/lib/media/public-url';

type Offer={id:string;title:string;kind:'informational'|'discount'|'treat';description:string;terms:string;
 status:string;audience:'all_members'|'recipient_list';startsAt:string;expiresAt:string;isAutomationTemplate:boolean;
 sourceTemplateId:string|null;generatedByRunId:string|null;discountPercent:number|null;minimumSpendPaisa:string;
 maxDiscountPaisa:string|null;imageAssetId:string|null;rowVersion:number;branchIds:string[];recipientIds:string[];claimCount:number;fulfilledCount:number};
type Config={offers:Offer[];branches:{id:string;name:string}[];members:{id:string;name:string}[];images:{id:string;path:string}[]};
const local=(value:string)=>{const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16);};
const pkr=(paisa:string)=>`${BigInt(paisa)/100n}.${(BigInt(paisa)%100n).toString().padStart(2,'0')}`;
const toPaisa=(rupees:string)=>{const match=/^(0|[1-9]\d{0,6})(?:\.(\d{1,2}))?$/.exec(rupees.trim());
 if(!match)throw new Error('Enter rupees with up to two decimal places.');
 return (BigInt(match[1]!)*100n+BigInt((match[2]??'').padEnd(2,'0'))).toString();};

export function OfferManager({businessId,initial,editId}:{businessId:string;initial:Config;editId?:string}){
 const [config,setConfig]=useState(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const selected=config.offers.find(offer=>offer.id===editId);
 const [form,setForm]=useState({kind:selected?.kind??'treat',title:selected?.title??'',description:selected?.description??'',
  terms:selected?.terms??'',startsAt:local(selected?.startsAt??new Date(Date.now()+3600000).toISOString()),
  expiresAt:local(selected?.expiresAt??new Date(Date.now()+7*86400000).toISOString()),
  audience:selected?.audience??'all_members',branchIds:selected?.branchIds??initial.branches.map(branch=>branch.id),
  recipientIds:selected?.recipientIds??[],isAutomationTemplate:selected?.isAutomationTemplate??false,
  imageAssetId:selected?.imageAssetId??'',
  discountPercent:selected?.discountPercent?.toString()??'10',minimumSpendRupees:pkr(selected?.minimumSpendPaisa??'0'),
  maxDiscountRupees:selected?.maxDiscountPaisa?pkr(selected.maxDiscountPaisa):''});
 const set=<K extends keyof typeof form>(key:K,value:(typeof form)[K])=>setForm(current=>({...current,[key]:value}));
 async function refresh(){setConfig(await communicationRequest<Config>('offer-configuration',{businessId}));}
 async function save(event:React.FormEvent){event.preventDefault();setBusy(true);setMessage('');try{
  const input=offerDraft.parse({businessId,offerId:selected?.id??null,rowVersion:selected?.rowVersion??null,
   kind:form.kind,title:form.title,description:form.description,terms:form.terms,
   startsAt:new Date(form.startsAt).toISOString(),expiresAt:new Date(form.expiresAt).toISOString(),
   audience:form.audience,branchIds:form.branchIds,recipientIds:form.audience==='recipient_list'?form.recipientIds:[],
   isAutomationTemplate:form.isAutomationTemplate,imageAssetId:form.imageAssetId||null,
   discountPercent:form.kind==='discount'?Number(form.discountPercent):null,
   minimumSpendPaisa:form.kind==='informational'?'0':toPaisa(form.minimumSpendRupees),
   maxDiscountPaisa:form.kind==='discount'&&form.maxDiscountRupees?toPaisa(form.maxDiscountRupees):null});
  const saved=await communicationRequest<{offerId:string}>('save-offer',input);await refresh();
  setMessage('Draft saved. Publish it explicitly to show it to customers.');
  if(!selected)window.location.assign(`/dashboard/${businessId}/offers/${saved.offerId}`);
 }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 async function changeStatus(offer:Offer,status:'published'|'paused'){
  setBusy(true);setMessage('');try{await communicationRequest('set-offer-status',{businessId,offerId:offer.id,
   rowVersion:offer.rowVersion,status});await refresh();setMessage(`Offer ${status}.`);}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 async function duplicate(offer:Offer){setBusy(true);setMessage('');try{
  const copy=await communicationRequest<{offerId:string}>('duplicate-offer',{businessId,offerId:offer.id});
  window.location.assign(`/dashboard/${businessId}/offers/${copy.offerId}`);
 }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 return <main id="main" className="container"><h1>Offers</h1><p>Published offer terms stay fixed. Duplicate an offer to change its benefit.</p>
  <div className="actions"><Link className="button" href={`/dashboard/${businessId}/offers/new`}>Create offer</Link><Link href={`/dashboard/${businessId}`}>Dashboard</Link></div>
  <section className="screen-panel"><h2>Offer list</h2>{config.offers.length===0?<p>No offers yet.</p>:<ul>{config.offers.map(offer=><li key={offer.id}>
   <Link href={`/dashboard/${businessId}/offers/${offer.id}`}>{offer.title}</Link> · {offer.kind} · {offer.status}
   {offer.isAutomationTemplate?' · Birthday template':''} · Ends {new Date(offer.expiresAt).toLocaleString('en-PK')}
   · Branches {offer.branchIds.map(id=>config.branches.find(branch=>branch.id===id)?.name??id.slice(0,8)).join(', ')}
   · {offer.claimCount} claims · {offer.fulfilledCount} fulfilled
   <Button type="button" variant="secondary" disabled={busy} onClick={()=>void duplicate(offer)}>Duplicate</Button>
   {offer.status==='draft'&&<Button type="button" disabled={busy} onClick={()=>changeStatus(offer,'published')}>Publish</Button>}
   {offer.status==='published'&&!offer.isAutomationTemplate&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>changeStatus(offer,'paused')}>Pause</Button>}
   {offer.status==='paused'&&<Button type="button" disabled={busy} onClick={()=>changeStatus(offer,'published')}>Resume</Button>}
  </li>)}</ul>}</section>
  {(!editId||selected)&&<section className="screen-panel"><h2>{selected?'Edit draft':'Create draft'}</h2>
   {selected?.status!=='draft'&&selected?<p>This published offer is read only. Its benefit and recipients stay fixed.</p>:
   <form className="stack" onSubmit={save}><label className="field">Title<input required minLength={2} maxLength={80} value={form.title} onChange={e=>set('title',e.target.value)}/></label>
    <label className="field">Kind<select value={form.kind} onChange={e=>set('kind',e.target.value as typeof form.kind)}><option value="informational">Information</option><option value="discount">Discount</option><option value="treat">Treat</option></select></label>
    <label className="field">Description<textarea required maxLength={1000} value={form.description} onChange={e=>set('description',e.target.value)}/></label>
    <label className="field">Terms<textarea maxLength={2000} value={form.terms} onChange={e=>set('terms',e.target.value)}/></label>
    <label className="field">Image (optional)<select value={form.imageAssetId} onChange={e=>set('imageAssetId',e.target.value)}>
     <option value="">No image</option>{config.images.map(image=><option key={image.id} value={image.id}>{image.id.slice(0,8)}</option>)}</select></label>
    {form.imageAssetId&&<>{publicOfferImageUrl(config.images.find(image=>image.id===form.imageAssetId)?.path)&&
     <Image unoptimized src={publicOfferImageUrl(config.images.find(image=>image.id===form.imageAssetId)?.path)!}
      width={320} height={180} alt="Selected offer image"/>}</>}
    <MediaUpload businessId={businessId} kind="offer" onAccepted={assetId=>{set('imageAssetId',assetId);void refresh();}}/>
    <label className="field">Starts<input type="datetime-local" required value={form.startsAt} onChange={e=>set('startsAt',e.target.value)}/></label>
    <label className="field">Ends<input type="datetime-local" required value={form.expiresAt} onChange={e=>set('expiresAt',e.target.value)}/></label>
    <fieldset><legend>Branches</legend>{config.branches.map(branch=><label className="check-label" key={branch.id}><input type="checkbox" checked={form.branchIds.includes(branch.id)} onChange={e=>set('branchIds',e.target.checked?[...form.branchIds,branch.id]:form.branchIds.filter(id=>id!==branch.id))}/>{branch.name}</label>)}</fieldset>
    <label className="field">Audience<select value={form.audience} onChange={e=>set('audience',e.target.value as typeof form.audience)}><option value="all_members">All joined members</option><option value="recipient_list">Selected recipients</option></select></label>
    {form.audience==='recipient_list'&&<fieldset><legend>Recipients (maximum 1,000)</legend>{config.members.map(member=><label className="check-label" key={member.id}><input type="checkbox" checked={form.recipientIds.includes(member.id)} onChange={e=>set('recipientIds',e.target.checked?[...form.recipientIds,member.id]:form.recipientIds.filter(id=>id!==member.id))}/>{member.name}</label>)}</fieldset>}
    {form.kind!=='informational'&&<label className="field">Minimum eligible spend (Rs)<input inputMode="decimal" value={form.minimumSpendRupees} onChange={e=>set('minimumSpendRupees',e.target.value)}/></label>}
    {form.kind==='discount'&&<><label className="field">Discount percent<input type="number" min={1} max={100} value={form.discountPercent} onChange={e=>set('discountPercent',e.target.value)}/></label>
     <label className="field">Maximum discount (Rs, optional)<input inputMode="decimal" value={form.maxDiscountRupees} onChange={e=>set('maxDiscountRupees',e.target.value)}/></label></>}
    <label className="check-label"><input type="checkbox" checked={form.isAutomationTemplate} onChange={e=>set('isAutomationTemplate',e.target.checked)}/>Birthday automation template (recipient list only)</label>
    <Button type="submit" disabled={busy}>{busy?'Saving…':'Save draft'}</Button></form>}</section>}
  {message&&<p role="status">{message}</p>}</main>;
}

export function ClaimOfferButton({offerId,claimId,membershipId}:{offerId:string;claimId:string|null;membershipId:string}){
 const [currentClaim,setCurrentClaim]=useState(claimId),[pending,setPending]=useState(false),[error,setError]=useState('');
 const [intent,setIntent]=useState<{intentId:string;expiresAt:string;qr:string}|null>(null),[code,setCode]=useState('');
 async function claim(){setPending(true);setError('');try{const result=await communicationRequest<{claimId:string}>('claim-offer',{id:offerId});
  setCurrentClaim(result.claimId);}catch(e){setError((e as Error).message);}finally{setPending(false);}}
 async function present(){if(!currentClaim)return;setPending(true);setError('');try{
  const result=await communicationRequest<{intentId:string;expiresAt:string;qrValue:string}>('create-offer-intent',{claimId:currentClaim});
  setIntent({intentId:result.intentId,expiresAt:result.expiresAt,qr:await QRCode.toDataURL(result.qrValue,{margin:2,width:300})});setCode('');
 }catch(e){setError((e as Error).message);}finally{setPending(false);}}
 async function shortCode(){if(!intent)return;setPending(true);setError('');try{
  const result=await loyaltyRequest<{code:string}>('scanner-code',{membershipId,purpose:'offer_lookup',intentId:intent.intentId});setCode(result.code);
 }catch(e){setError((e as Error).message);}finally{setPending(false);}}
 async function cancel(){if(!intent)return;setPending(true);try{await communicationRequest('cancel-offer-intent',{intentId:intent.intentId});
  setIntent(null);setCode('');}catch(e){setError((e as Error).message);}finally{setPending(false);}}
 return <div>{!currentClaim?<Button disabled={pending} onClick={claim}>{pending?'Claiming…':'Claim offer'}</Button>:
  <Button disabled={pending} onClick={present}>{intent?'Replace checkout code':'Show at checkout'}</Button>}
  {intent&&<section className="screen-panel"><h2>Show this to staff</h2><Image unoptimized src={intent.qr} width={300} height={300} alt="Single-use offer claim QR"/>
   <p>Expires {new Date(intent.expiresAt).toLocaleTimeString('en-PK')}. Claiming does not fulfill the offer.</p>
   <div className="actions"><Button variant="secondary" disabled={pending} onClick={shortCode}>Get short code</Button><Button variant="secondary" disabled={pending} onClick={cancel}>Cancel code</Button></div>
   {code&&<p>Code: <strong>{code}</strong></p>}</section>}{error&&<p role="alert" className="error-text">{error}</p>}</div>;
}
