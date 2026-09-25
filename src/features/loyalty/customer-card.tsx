'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';
import { loyaltyRequest, useOnline } from './client';

type Reward = { id: string; title: string; description: string; terms: string; unitCost: string; available: boolean;
  branchIds: string[]; eligibleBranches:string[] };
type IntentStatus = { intentId:string;status:'active'|'expired'|'canceled'|'fulfilled'|'reversed';expiresAt:string;
  fulfilledAt:string|null;branchName:string|null;unitCost:string;balance:string };
export type Card = { id: string; businessId: string; name: string; memberName: string; status: string; units: string; ledgerVersion: string;
  programmeType: 'stamps' | 'points'; rewards: Reward[]; activity: { id: string; kind: string; units: string; occurredAt: string }[] };

export function CardDetail({ initial }: { initial: Card }) {
  const online=useOnline();
  const [card, setCard] = useState(initial), [qr, setQr] = useState(''), [code, setCode] = useState(''), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void (async () => {
    try { const result = await loyaltyRequest<{ qrValue: string }>('handle', { membershipId: initial.id, rotate: false }); setQr(await QRCode.toDataURL(result.qrValue,{ margin: 2, width: 300 })); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Checkout QR unavailable.'); }
  })(); }, [initial.id]);
  async function refresh() { const current = await loyaltyRequest<Card>('card', { membershipId: initial.id }); setCard(current); }
  async function getCode() {
    if (!navigator.onLine) { setMessage('Reconnect to generate a customer code.'); return; }
    setBusy(true); try { const result = await loyaltyRequest<{ code: string; expiresAt: string }>('scanner-code', { membershipId: card.id, purpose: 'membership_lookup' });
      setCode(result.code); setMessage(`Code expires ${new Date(result.expiresAt).toLocaleTimeString('en-PK')}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Code unavailable.'); } finally { setBusy(false); }
  }
  async function rotate() {
    if (!confirm('Replace your checkout QR? Saved screenshots will stop working.')) return;
    setBusy(true); try { const result = await loyaltyRequest<{ qrValue: string }>('handle', { membershipId: card.id, rotate: true });
      setQr(await QRCode.toDataURL(result.qrValue,{ margin: 2, width: 300 })); setMessage('Checkout QR replaced.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'QR replacement failed.'); } finally { setBusy(false); }
  }
  const nextReward=card.rewards.find(reward=>BigInt(reward.unitCost)>BigInt(card.units))??card.rewards[0];
  return <main id="main" className="container"><h1>{card.name}</h1><p>{card.memberName} · {card.status}</p>
    <section className="screen-panel"><h2>{card.units} {card.programmeType}</h2>
      {nextReward&&<p>{nextReward.available?`${nextReward.title} is available.`:`${nextReward.title}: ${(
        BigInt(nextReward.unitCost)-BigInt(card.units)).toString()} more ${card.programmeType} needed.`}</p>}
      {BigInt(card.units)<0n && <p>An adjustment changed your balance to {card.units} {card.programmeType}. New earnings will offset this before your next reward.</p>}
      {qr && <><Image unoptimized src={qr} width={300} height={300} alt="Personal earning QR for staff checkout"/><p>Show this at checkout.</p></>}
      <div className="actions"><button type="button" disabled={busy||!online} onClick={getCode}>Get checkout code</button><button type="button" disabled={busy||!online} onClick={rotate}>Replace checkout QR</button>
        <button type="button" disabled={busy||!online} onClick={() => void refresh()}>Refresh balance</button></div>
      {!online&&<p>Offline. Showing the last loaded balance; reconnect for new codes or transactions.</p>}
      {code && <p>Customer code: <strong>{code}</strong></p>}<p role="status">{message}</p></section>
    <section className="screen-panel"><h2>Rewards</h2>{card.rewards.length===0 && <p>No rewards are published yet.</p>}
      {card.rewards.map(r => <p key={r.id}>{r.title} · {r.unitCost} {card.programmeType} · {r.available ? 'Available' : 'Keep earning'} · {r.terms}</p>)}
      <a href={`/app/cards/${card.id}/rewards`}>View rewards</a></section>
    <section className="screen-panel"><h2>Recent activity</h2>{card.activity.length===0 && <p>No activity yet.</p>}
      <ul>{card.activity.map(e => <li key={e.id}>{new Date(e.occurredAt).toLocaleString('en-PK')} · {e.kind} · {e.units}</li>)}</ul></section></main>;
}

export function RewardIntent({ initial }: { initial: Card }) {
  const online=useOnline();
  const [card, setCard] = useState(initial), [qr, setQr] = useState(''), [code, setCode] = useState(''),
    [intentId, setIntentId] = useState(''), [expiry, setExpiry] = useState(''), [now, setNow] = useState(Date.now()),
    [settlement,setSettlement] = useState<IntentStatus|null>(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()),1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!intentId || ['fulfilled','reversed','expired','canceled'].includes(settlement?.status??'')) return;
    let active=true;
    const refresh=async()=>{try{const current=await loyaltyRequest<IntentStatus>('intent-status',{intentId});if(!active)return;
      setSettlement(current);
      if(current.status==='fulfilled'||current.status==='reversed'){
        const updated=await loyaltyRequest<Card>('card',{membershipId:card.id});if(active)setCard(updated);
      }}catch{/* Keep the displayed intent until a verified status is available. */}};
    void refresh();const timer=setInterval(()=>void refresh(),5000);
    window.addEventListener('focus',refresh);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[intentId,settlement?.status,card.id]);
  const remaining = expiry ? Math.max(0,Math.ceil((new Date(expiry).getTime()-now)/1000)) : 0;
  async function create(rewardVersionId: string) {
    if (!navigator.onLine) { setMessage('Reconnect before using a reward.'); return; }
    setBusy(true); try { const result = await loyaltyRequest<{ intentId: string; qrValue: string; expiresAt: string }>('create-intent', { membershipId: card.id, rewardVersionId });
      setIntentId(result.intentId);setSettlement(null); setQr(await QRCode.toDataURL(result.qrValue,{ margin: 2, width: 300 })); setExpiry(result.expiresAt); setCode('');
      setMessage('No points deducted yet. Show this to staff within two minutes.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Reward unavailable.');
      setCard(await loyaltyRequest<Card>('card', { membershipId: card.id })); } finally { setBusy(false); }
  }
  async function fallback() {
    setBusy(true); try { const result = await loyaltyRequest<{ code: string }>('scanner-code', { membershipId: card.id, purpose: 'redemption_lookup', intentId }); setCode(result.code); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Code unavailable.'); } finally { setBusy(false); }
  }
  async function cancel() { setBusy(true); try { await loyaltyRequest('cancel-intent',{ intentId }); setIntentId('');setSettlement(null);setQr('');setCode('');setMessage('Intent canceled. No units deducted.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not cancel.'); } finally { setBusy(false); } }
  return <main id="main" className="container"><h1>{card.name} rewards</h1><p>Balance: {card.units} {card.programmeType}</p>
    {card.rewards.map(r => <section className="screen-panel" key={r.id}><h2>{r.title}</h2><p>{r.description}</p><p>{r.unitCost} {card.programmeType} · {r.terms}</p>
      <p>Eligible at {r.eligibleBranches.join(', ')||'no active branches'}.</p>
      <button type="button" disabled={busy || !online || !r.available || card.status!=='active'} onClick={() => void create(r.id)}>Use this reward</button></section>)}
    {intentId && <section className="screen-panel"><h2>{settlement?.status==='fulfilled'?'Reward redeemed':'Show this to staff'}</h2>
      {settlement?.status==='fulfilled'?<p>Redeemed {new Date(settlement.fulfilledAt!).toLocaleString('en-PK')} at {card.name} · {settlement.branchName}. {settlement.unitCost} {card.programmeType} deducted; balance {settlement.balance}.</p>:
      settlement?.status==='reversed'?<p>Redemption undone. Current balance {settlement.balance} {card.programmeType}.</p>:
      remaining>0 && settlement?.status!=='expired' && settlement?.status!=='canceled' ? <><Image unoptimized src={qr} width={300} height={300} alt="Single-use reward redemption QR"/>
      <p>Expires in {remaining} seconds. No points deducted yet.</p><button type="button" disabled={busy||!online} onClick={() => void fallback()}>Get short code</button>{code && <p>Code: <strong>{code}</strong></p>}
      <button type="button" disabled={busy||!online} onClick={() => void cancel()}>Cancel</button></> : <><p>{settlement?.status==='canceled'?'Code canceled.':'Code expired.'}</p>
      <button type="button" disabled={busy||!online} onClick={() => { const reward = card.rewards.find(r => r.available); if (reward) void create(reward.id); }}>Generate a new code</button></>}
      </section>}<p role="status">{message}</p></main>;
}
