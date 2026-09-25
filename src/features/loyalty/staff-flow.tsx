'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IScannerControls } from '@zxing/browser';
import { idempotencyKey, LoyaltyRequestError, loyaltyRequest, useOnline } from './client';

type Branch = { id: string; name: string };
type Lookup = { contextId: string; checkoutContext: string; kind: 'earning' | 'redemption' | 'offer'; memberName: string; businessId: string; branchId: string;
  branchName?:string;balance: string; rewardTitle: string | null; rewardUnitCost: string | null;
  offerTitle?: string | null; offerKind?: 'treat' | 'discount'; offerMinimumSpendPaisa?: string | null; expiresAt: string };
const storageKey = (businessId: string) => `loyalty-checkout:${businessId}`;

export function StaffScan({ businessId, businessName, branches }: { businessId: string; businessName: string; branches: Branch[] }) {
  const online=useOnline();
  const router = useRouter(), video = useRef<HTMLVideoElement>(null), controls = useRef<IScannerControls | null>(null), active = useRef(false);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? ''), [code, setCode] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { const chosen = sessionStorage.getItem(`loyalty-branch:${businessId}`); if (chosen && branches.some(b => b.id===chosen)) setBranchId(chosen);
    return () => { active.current=false; controls.current?.stop(); }; }, [businessId,branches]);
  function stop() { active.current=false; controls.current?.stop(); controls.current=null; }
  async function resolve(rawValue: string, kind: 'earningHandle'|'redemptionIntent'|'offerIntent'|'typedCode') {
    if (!navigator.onLine) { setMessage('Offline. Reconnect before checkout.'); return; }
    setBusy(true); try { const result=await loyaltyRequest<Lookup>('resolve',{ businessId, branchId, kind, rawValue });
      stop(); sessionStorage.setItem(storageKey(businessId),JSON.stringify({...result,branchName:branches.find(branch=>branch.id===result.branchId)?.name}));
      router.push(result.kind==='earning' ? `/staff/${businessId}/checkout` : `/staff/${businessId}/redeem`);
    } catch(error) { setMessage(error instanceof Error ? error.message : 'Customer lookup failed.'); active.current=true; }
    finally { setBusy(false); }
  }
  async function scan() {
    if (!navigator.onLine) { setMessage('Offline. Reconnect before checkout.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setMessage('Camera unavailable. Enter the customer code.'); return; }
    if (!video.current) return;
    setBusy(true); active.current=true;
    try { const { BrowserQRCodeReader } = await import('@zxing/browser'); const reader=new BrowserQRCodeReader();
      const scannerControls=await reader.decodeFromVideoDevice(undefined,video.current,(result) => {
        if (!result || !active.current) return;
        const value=result.getText();
        const kind=value.startsWith('LOYALTY:EARN:v1:') ? 'earningHandle' : value.startsWith('LOYALTY:REDEEM:v1:') ? 'redemptionIntent'
          : value.startsWith('LOYALTY:OFFER:v1:') ? 'offerIntent' : null;
        if (!kind) { setMessage('Invalid loyalty QR. Ask for a current checkout or reward code.'); return; }
        active.current=false; void resolve(value,kind);
      }); if(active.current){controls.current=scannerControls;setMessage('Point the camera at the customer QR.');}else scannerControls.stop(); }
    catch(error) { stop(); setMessage(error instanceof DOMException && error.name==='NotAllowedError' ? 'Camera permission denied. Allow access in browser settings or enter a code.' : 'Camera unavailable. Enter the customer code.'); }
    finally { setBusy(false); }
  }
  return <main id="main" className="container"><h1>{businessName} checkout</h1><label>Branch <select value={branchId} onChange={event => { stop();setBranchId(event.target.value);
    sessionStorage.setItem(`loyalty-branch:${businessId}`,event.target.value);sessionStorage.removeItem(storageKey(businessId)); }}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <section className="screen-panel"><h2>Scan customer QR</h2><video ref={video} muted playsInline style={{ width:'100%',maxWidth:360 }} aria-label="Camera preview"/>
      <div className="actions"><button type="button" disabled={busy || !online || !branchId} onClick={() => void scan()}>Scan customer QR</button><button type="button" onClick={stop}>Stop camera</button></div></section>
    <section className="screen-panel"><h2>Enter customer code</h2><label>8-character code <input id="lookupCode" maxLength={8} value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/></label>
      <button type="button" disabled={busy || !online || code.length!==8 || !branchId} onClick={() => void resolve(code,'typedCode')}>Look up customer</button></section>
    <p role="status">{!online?'Offline. Reconnect before checkout.':message}</p><a href={`/staff/${businessId}/activity`}>Recent activity</a></main>;
}

function useCheckout(businessId: string, kind: Lookup['kind'] | 'purchase' | 'benefit') {
  const [lookup,setLookup]=useState<Lookup|null>(null);
  useEffect(()=>{ try { const raw=sessionStorage.getItem(storageKey(businessId)); const stored=raw ? JSON.parse(raw) as Lookup : null;
    if (stored && stored.businessId===businessId && (kind==='purchase' ? ['earning','offer'].includes(stored.kind)
      : kind==='benefit' ? ['redemption','offer'].includes(stored.kind) : stored.kind===kind)
      && new Date(stored.expiresAt).getTime()>Date.now()) setLookup(stored);
  } catch { sessionStorage.removeItem(storageKey(businessId)); } },[businessId,kind]);
  return lookup;
}
type PurchaseEffect = { baseUnits: string; promotionBonusUnits: string; referralBonusUnits: string; inviterBonusUnits: string;
  promotionReason: string; referralReason: string; balance: string; qualifiesForLoyalty: boolean;
  capReduced: boolean|null; expectedEffectHash: string; programmeVersionId: string;
  offerClaimId?: string; offerTitle?: string; offerKind?: 'treat' | 'discount'; appliedDiscountPaisa?: string; offerBenefitDescription?: string };
export function PurchaseCheckout({ businessId }: { businessId: string }) {
  const online=useOnline();
  const lookup=useCheckout(businessId,'purchase');
  const [bill,setBill]=useState(''),[eligible,setEligible]=useState(''),[beforeDiscount,setBeforeDiscount]=useState(''),
    [receipt,setReceipt]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [effect,setEffect]=useState<PurchaseEffect|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[key,setKey]=useState('');
  const [result,setResult]=useState<{ purchaseId:string;receiptReference:string|null;balanceAfterAtCommit:string;baseUnits:string;
    promotionBonusUnits:string;referralBonusUnits:string;inviterBonusUnits:string;offerClaimId?:string;appliedDiscountPaisa?:string }|null>(null);
  const amount=(value:string)=>{ const [whole='',decimal='']=value.trim().split('.'); if (!/^\d+$/u.test(whole)||!/^\d{0,2}$/u.test(decimal)) throw new Error('Enter rupees with at most two decimal places.');
    return (BigInt(whole)*100n+BigInt((decimal+'00').slice(0,2))).toString(); };
  const fields=()=>({ recordedBillPaisa:amount(bill),eligibleSpendPaisa:amount(eligible),qualifyingPurchaseConfirmed:confirmed,receiptReference:receipt,
    ...(lookup?.offerKind==='discount' ? {offerEligibleBeforeDiscountPaisa:amount(beforeDiscount)} : {}) });
  async function preview() {
    if (!lookup) return; setBusy(true);setResult(null);
    try { const next=await loyaltyRequest<PurchaseEffect>('preview-purchase',{ checkoutContext:lookup.checkoutContext,...fields() });setEffect(next);setKey(idempotencyKey());setMessage('Review the actual paid bill and calculated award before confirming.'); }
    catch(error){setEffect(null);setMessage(error instanceof Error ? error.message : 'Preview failed.');}finally{setBusy(false);}
  }
  async function commit() {
    if (!lookup || !effect || !key) return;
    if (!confirm(`${effect.offerKind==='treat'?'Confirm the offered item was given. ':effect.offerKind==='discount'
      ?`Confirm the Rs ${(Number(effect.appliedDiscountPaisa??0)/100).toFixed(2)} discount was applied to the paid bill. `:''}Record this checkout and award ${effect.baseUnits} base + ${effect.promotionBonusUnits} slot + ${effect.referralBonusUnits} friend units?${BigInt(effect.inviterBonusUnits)>0n?` The inviter also earns ${effect.inviterBonusUnits}.`:''}`)) return;
    setBusy(true);try{const next=await loyaltyRequest<typeof result>('record-purchase',{checkoutContext:lookup.checkoutContext,...fields(),expectedEffectHash:effect.expectedEffectHash,idempotencyKey:key});
      setResult(next);sessionStorage.removeItem(storageKey(businessId));setMessage('Purchase committed.');}
    catch(error){
      if(error instanceof LoyaltyRequestError && error.code==='conflict' && error.freshPreview){
        setEffect(error.freshPreview as PurchaseEffect);setKey(idempotencyKey());
        setMessage('The award changed. Review the fresh server preview, then confirm again.');return;
      }
      setMessage(error instanceof Error ? error.message : 'Commit uncertain. Check this operation before creating a new key.');
      try {const check=await loyaltyRequest<{result:typeof result}>('result',{businessId,operation:'record_purchase',idempotencyKey:key});if(check.result){setResult(check.result);setMessage('Purchase committed.');sessionStorage.removeItem(storageKey(businessId));}}catch{/* Keep the same key for retry. */}}
    finally{setBusy(false);}
  }
  if (!lookup) return <main id="main" className="container"><h1>Purchase checkout</h1><p>Scan a customer QR or enter a code first.</p><a href={`/staff/${businessId}`}>Scan customer</a></main>;
  return <main id="main" className="container"><h1>{lookup.kind==='offer'?'Offer checkout':'Purchase checkout'}</h1><p>{lookup.memberName} · Balance {lookup.balance}</p>
    {lookup.kind==='offer'&&<p>Claimed offer: {lookup.offerTitle}. {lookup.offerKind==='discount'?'Apply the discount to the paid bill.':'Give the offered item at checkout.'}</p>}
    <p>Branch {lookup.branchName??lookup.branchId} · <a href={`/staff/${businessId}`}>Change branch and scan again</a></p>
    {!result && <section className="screen-panel"><label>Bill total paid (Rs) <input inputMode="decimal" value={bill} onChange={e=>{setBill(e.target.value);setEffect(null);}}/></label>
      <label>Eligible spend (Rs) <input inputMode="decimal" value={eligible} onChange={e=>{setEligible(e.target.value);setEffect(null);}}/></label>
      {lookup.offerKind==='discount'&&<label>Eligible spend before offer discount (Rs) <input inputMode="decimal" value={beforeDiscount}
        onChange={e=>{setBeforeDiscount(e.target.value);setEffect(null);}}/></label>}
      <button type="button" onClick={()=>{if(confirm('Is the whole paid bill eligible under this cafe’s terms?')){setEligible(bill);setEffect(null);}}}>Use bill amount</button>
      <label>Receipt reference (optional) <input maxLength={80} value={receipt} onChange={e=>{setReceipt(e.target.value);setEffect(null);}}/></label>
      <label><input type="checkbox" checked={confirmed} onChange={e=>{setConfirmed(e.target.checked);setEffect(null);}}/> Qualifying purchase confirmed</label>
      <button type="button" disabled={busy||!online} onClick={() => void preview()}>Review purchase</button>
      {effect && <section><h2>Server preview</h2><p>Base {effect.baseUnits} · Bonus {effect.promotionBonusUnits} · Current balance {effect.balance} · After award {(
        BigInt(effect.balance)+BigInt(effect.baseUnits)+BigInt(effect.promotionBonusUnits)+BigInt(effect.referralBonusUnits)).toString()}</p>
        {effect.offerClaimId&&<p>Offer: {effect.offerTitle}. {effect.offerKind==='discount'
          ?`Discount Rs ${(Number(effect.appliedDiscountPaisa??0)/100).toFixed(2)}. Confirm it appears on the paid bill.`
          :`Give the offered item: ${effect.offerBenefitDescription??effect.offerTitle}.`}</p>}
        <p>Double slot: {effect.promotionReason.replaceAll('_',' ')}. Referral: {effect.referralReason.replaceAll('_',' ')}.
          {BigInt(effect.inviterBonusUnits)>0n?` Inviter earns ${effect.inviterBonusUnits} units.`:''}</p>
        {effect.capReduced && <p>Programme cap reduced earning.</p>}<p>{effect.qualifiesForLoyalty ? 'Qualifies for loyalty' : 'No units awarded'}</p>
        <button type="button" disabled={busy||!online} onClick={() => void commit()}>Confirm and award</button></section>}</section>}
    {result && <section className="screen-panel"><h2>Purchase committed</h2><p>Reference {result.receiptReference??result.purchaseId}</p>
      {result.offerClaimId&&<p>Offer fulfilled. {lookup.offerKind==='discount'?`Discount Rs ${(Number(result.appliedDiscountPaisa??0)/100).toFixed(2)} applied.`:lookup.offerTitle}</p>}
      <p>Awarded {result.baseUnits} base + {result.promotionBonusUnits} slot + {result.referralBonusUnits} friend units; balance {result.balanceAfterAtCommit}. {BigInt(result.inviterBonusUnits)>0n?`Inviter earned ${result.inviterBonusUnits}.`:''}</p>
      <a href={`/staff/${businessId}`}>Scan next customer</a></section>}<p role="status">{!online?'Offline. Reconnect before awarding.':message}</p></main>;
}

export function RedemptionCheckout({ businessId }: { businessId: string }) {
  const online=useOnline();
  const lookup=useCheckout(businessId,'benefit');
  const [effect,setEffect]=useState<{rewardTitle:string;unitCost:string;balance:string;balanceAfter:string;expiresAt:string;expectedEffectHash:string}|null>(null),
    [result,setResult]=useState<{redemptionId:string;balanceAfterAtCommit:string}|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[key,setKey]=useState('');
  async function preview(){if(!lookup)return;setBusy(true);try{const current=await loyaltyRequest<typeof effect>('preview-redemption',{checkoutContext:lookup.checkoutContext});setEffect(current);
    setKey(idempotencyKey());setMessage('Confirm the physical reward before finalizing.');}catch(error){setMessage(error instanceof Error?error.message:'Reward unavailable.');}finally{setBusy(false);}}
  async function commit(){if(!lookup||!effect)return;if(!confirm(`Confirm ${effect.rewardTitle} was given to the customer?`))return;
    setBusy(true);try{const current=await loyaltyRequest<typeof result>('finalize-redemption',{checkoutContext:lookup.checkoutContext,expectedEffectHash:effect.expectedEffectHash,idempotencyKey:key});
      setResult(current);sessionStorage.removeItem(storageKey(businessId));setMessage('Reward fulfilled and units deducted.');}
    catch(error){setMessage(error instanceof Error?error.message:'Commit uncertain. Check the operation result.');
      try{const check=await loyaltyRequest<{result:typeof result}>('result',{businessId,operation:'finalize_redemption',idempotencyKey:key});if(check.result){setResult(check.result);sessionStorage.removeItem(storageKey(businessId));}}catch{/* Preserve the original error and retry key. */}}
    finally{setBusy(false);}}
  if(!lookup)return <main id="main" className="container"><h1>Reward or offer fulfillment</h1><p>Scan a customer intent first.</p><a href={`/staff/${businessId}`}>Scan intent</a></main>;
  if(lookup.kind==='offer')return <OfferFulfillment businessId={businessId} lookup={lookup}/>;
  return <main id="main" className="container"><h1>Reward redemption</h1><p>{lookup.memberName} · {lookup.rewardTitle} · {lookup.rewardUnitCost} units</p><p>Branch {lookup.branchName??lookup.branchId} · Intent expires {new Date(lookup.expiresAt).toLocaleTimeString('en-PK')}</p>
    {!result&&<section className="screen-panel"><button type="button" disabled={busy||!online} onClick={()=>void preview()}>Review reward</button>
      {effect&&<><p>Balance {effect.balance} → {effect.balanceAfter}</p><button type="button" disabled={busy||!online} onClick={()=>void commit()}>Confirm reward given</button></>}</section>}
    {result&&<section className="screen-panel"><h2>Reward fulfilled</h2><p>Reference {result.redemptionId}; balance {result.balanceAfterAtCommit}</p><a href={`/staff/${businessId}`}>Scan next customer</a></section>}
    <p role="status">{!online?'Offline. Reconnect before redemption.':message}</p></main>;
}

function OfferFulfillment({businessId,lookup}:{businessId:string;lookup:Lookup}){
  const online=useOnline();
  const [effect,setEffect]=useState<{offerClaimId:string;offerTitle:string;benefitDescription:string;balance:string;
    balanceChange:string;expectedEffectHash:string}|null>(null);
  const [result,setResult]=useState<{offerClaimId:string;status:string;balanceAfterAtCommit:string}|null>(null);
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[key,setKey]=useState('');
  async function preview(){setBusy(true);setMessage('');try{
    const current=await loyaltyRequest<typeof effect>('preview-offer-fulfillment',{checkoutContext:lookup.checkoutContext});
    setEffect(current);setKey(idempotencyKey());setMessage('Review the item and confirm it was handed to the customer.');
  }catch(error){setEffect(null);setMessage(error instanceof Error?error.message:'Offer unavailable.');}finally{setBusy(false);}}
  async function commit(){if(!effect||!key)return;
    if(!confirm(`Confirm ${effect.benefitDescription} was given to ${lookup.memberName}? No units will be deducted.`))return;
    setBusy(true);try{const current=await loyaltyRequest<typeof result>('fulfill-offer',{
      checkoutContext:lookup.checkoutContext,expectedEffectHash:effect.expectedEffectHash,idempotencyKey:key});
      setResult(current);sessionStorage.removeItem(storageKey(businessId));setMessage('Offer fulfilled.');
    }catch(error){setMessage(error instanceof Error?error.message:'Commit uncertain. Check the operation result.');
      try{const check=await loyaltyRequest<{result:typeof result}>('result',{businessId,operation:'fulfill_offer',idempotencyKey:key});
        if(check.result){setResult(check.result);sessionStorage.removeItem(storageKey(businessId));setMessage('Offer fulfilled.');}}
      catch{/* Keep the same key for a safe retry. */}}
    finally{setBusy(false);}}
  const spendRequired=lookup.offerKind==='discount'||BigInt(lookup.offerMinimumSpendPaisa??'0')>0n;
  return <main id="main" className="container"><h1>Offer fulfillment</h1><p>{lookup.memberName} · {lookup.offerTitle}</p>
    <p>Branch {lookup.branchName??lookup.branchId} · Intent expires {new Date(lookup.expiresAt).toLocaleTimeString('en-PK')}</p>
    {spendRequired?<section className="screen-panel"><p>This offer needs a validated paid purchase. Apply the benefit to the cafe bill, then enter the actual paid and eligible amounts.</p>
      <a href={`/staff/${businessId}/checkout`}>Continue to purchase checkout</a></section>
      :!result?<section className="screen-panel"><p>Balance {lookup.balance}; this treat does not deduct units.</p>
        <button type="button" disabled={busy||!online} onClick={()=>void preview()}>Review offer</button>
        {effect&&<><p>Give: {effect.benefitDescription}. Balance after: {effect.balance}.</p>
          <button type="button" disabled={busy||!online} onClick={()=>void commit()}>Confirm offer given</button></>}</section>
      :<section className="screen-panel"><h2>Offer fulfilled</h2><p>Reference {result.offerClaimId}; balance {result.balanceAfterAtCommit}</p>
        <a href={`/staff/${businessId}`}>Scan next customer</a></section>}
    <p role="status">{!online?'Offline. Reconnect before fulfillment.':message}</p></main>;
}
