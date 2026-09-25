'use client';
import { useState } from 'react';
import { idempotencyKey, loyaltyRequest } from './client';

type Detail={id:string;displayName:string;status:string;joinedAt:string;joinedBranchId:string|null;lastQualifyingPurchaseAt:string|null;
  balance:string;ledgerVersion:string;activity:{id:string;kind:string;units:string;occurredAt:string;purchaseId:string|null;redemptionId:string|null}[]};
export function OwnerMember({businessId,initial}:{businessId:string;initial:Detail}){
  const [detail,setDetail]=useState(initial),[units,setUnits]=useState(''),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[key,setKey]=useState('');
  async function adjust(){if(!/^-?[1-9]\d{0,5}$/u.test(units)||reason.trim().length<10){setMessage('Enter a nonzero adjustment and a reason of at least 10 characters.');return;}
    if(!confirm(`Adjust ${detail.displayName} by ${units} units?`))return;
    const requestKey=key||idempotencyKey();setKey(requestKey);setBusy(true);
    try{await loyaltyRequest('adjust',{businessId,membershipId:detail.id,units,reason,expectedLedgerVersion:detail.ledgerVersion,idempotencyKey:requestKey});
      setDetail(await loyaltyRequest<Detail>('owner-member',{businessId,membershipId:detail.id}));setUnits('');setReason('');setKey('');setMessage('Adjustment committed.');}
    catch(error){setMessage(error instanceof Error?error.message:'Adjustment uncertain. Check the operation result before trying a new key.');
      try{const check=await loyaltyRequest<{result:unknown}>('result',{businessId,operation:'adjust_units',idempotencyKey:requestKey});if(check.result){
        setDetail(await loyaltyRequest<Detail>('owner-member',{businessId,membershipId:detail.id}));setMessage('Adjustment committed.');setKey('');}}
      catch{/* Preserve the original failure and retry key. */}}
    finally{setBusy(false);}}
  return <main id="main" className="container"><h1>{detail.displayName}</h1><p>{detail.status} · Joined {new Date(detail.joinedAt).toLocaleDateString('en-PK')}</p>
    <section className="screen-panel"><h2>Balance</h2><p>{detail.balance} units</p><p>Ledger version {detail.ledgerVersion}</p></section>
    <section className="screen-panel"><h2>Adjust units</h2><p>Owner MFA is required. Adjustments of 1,000 units or more require recent reauthentication.</p>
      <label>Signed units <input inputMode="numeric" value={units} onChange={e=>{setUnits(e.target.value);setKey('');}}/></label>
      <label>Reason <textarea minLength={10} maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);setKey('');}}/></label>
      {/^[-]?[1-9]\d{0,5}$/u.test(units)&&<p>Resulting balance: {(BigInt(detail.balance)+BigInt(units)).toString()} units</p>}
      <button type="button" disabled={busy} onClick={()=>void adjust()}>Confirm adjustment</button><p role="status">{message}</p></section>
    <section className="screen-panel"><h2>Recent ledger activity</h2>{detail.activity.length===0?<p>No activity yet.</p>:<ul>{detail.activity.map(e=><li key={e.id}>
      {new Date(e.occurredAt).toLocaleString('en-PK')} · {e.kind} · {e.units}</li>)}</ul>}</section></main>;
}
export type { Detail };
