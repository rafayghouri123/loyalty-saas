'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { idempotencyKey, loyaltyRequest } from './client';

type Branch = { id:string;name:string };
type Row = {id:string;type:'purchase'|'redemption'|'reversal';sourceType:'purchase'|'redemption';occurredAt:string;branchId:string;memberName:string;reference:string;recordedBillPaisa:string|null;
  signedUnits:string;status:string;staffUserId:string};
const dateInZone=(date:Date,zone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function StaffActivity({businessId,zone,branches}:{businessId:string;zone:string;branches:Branch[]}){
  const [start,setStart]=useState(()=>dateInZone(new Date(Date.now()-29*86400000),zone)),[end,setEnd]=useState(()=>dateInZone(new Date(),zone)),
    [branch,setBranch]=useState(''),[type,setType]=useState<'all'|'purchase'|'redemption'|'reversal'>('all'),[size,setSize]=useState<25|50|100>(25),[page,setPage]=useState(0),[rows,setRows]=useState<Row[]>([]),
    [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function load(nextPage=page){setBusy(true);try{const data=await loyaltyRequest<{rows:Row[];dataAsOf:string}>('activity',{
    businessId,branchId:branch||null,type,startDate:start,endDate:end,pageSize:size,page:nextPage});setRows(data.rows);setPage(nextPage);
    setMessage(`Updated ${new Date(data.dataAsOf).toLocaleString('en-PK')}.`);}catch(error){setMessage(error instanceof Error?error.message:'Activity unavailable.');}finally{setBusy(false);}}
  useEffect(()=>{void load(0);/* Initial authenticated read only. */},[]);
  return <main id="main" className="container"><h1>Recent activity</h1><section className="screen-panel"><div className="actions">
    <label>Start <input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
    <label>End <input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
    <label>Branch <select value={branch} onChange={e=>setBranch(e.target.value)}><option value="">All assigned branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <label>Type <select value={type} onChange={e=>setType(e.target.value as typeof type)}><option value="all">All</option><option value="purchase">Purchase</option><option value="redemption">Redemption</option><option value="reversal">Reversal</option></select></label>
    <label>Rows <select value={size} onChange={e=>setSize(Number(e.target.value) as 25|50|100)}><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>
    <button type="button" disabled={busy} onClick={()=>void load(0)}>Refresh</button></div><p role="status">{message}</p>
    {rows.length===0?<p>No activity for this range.</p>:<div className="table-scroll"><table><thead><tr><th>Time</th><th>Reference</th><th>Customer</th><th>Type</th><th>Paid</th><th>Units</th><th>Status</th></tr></thead><tbody>
    {rows.map(r=><tr key={r.type+r.id+r.occurredAt}><td>{new Date(r.occurredAt).toLocaleString('en-PK',{timeZone:zone})}</td>
      <td><Link href={`/staff/${businessId}/transactions/${r.id}?type=${r.sourceType}`}>{r.reference}</Link></td><td>{r.memberName}</td><td>{r.type}</td>
      <td>{r.recordedBillPaisa===null?'—':`Rs ${(BigInt(r.recordedBillPaisa)/100n).toString()}.${(BigInt(r.recordedBillPaisa)%100n).toString().padStart(2,'0')}`}</td>
      <td>{r.signedUnits}</td><td>{r.status}</td></tr>)}</tbody></table></div>}
    <div className="actions"><button type="button" disabled={busy||page===0} onClick={()=>void load(page-1)}>Previous</button><span>Page {page+1}</span>
      <button type="button" disabled={busy||rows.length<size} onClick={()=>void load(page+1)}>Next</button></div></section></main>;
}
type Detail = {type:'purchase'|'redemption';source:Record<string,unknown>;memberName:string;balance:string;ledgerVersion:string;
  ledger:{id:string;kind:string;units:string;occurredAt:string}[];reversal:{id:string;reason:string;reversedAt:string}|null;canReverse:boolean};
export function StaffTransaction({businessId,type,id,initial}:{businessId:string;type:'purchase'|'redemption';id:string;initial:Detail}){
  const [detail,setDetail]=useState(initial),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[key,setKey]=useState('');
  const originalUnits=detail.ledger.filter(entry=>type==='purchase'?['purchase_base','promotion_bonus','referral_bonus'].includes(entry.kind):entry.kind==='redemption')
    .reduce((total,entry)=>total+BigInt(entry.units),0n);
  async function reverse(){if(reason.trim().length<10)return;if(!confirm(type==='purchase'
    ?`Reverse the entire purchase and remove ${originalUnits} earned units?`:`Confirm this reward was not physically fulfilled and restore ${-originalUnits} units?`))return;
    const requestKey=key||idempotencyKey();setKey(requestKey);setBusy(true);
    try{await loyaltyRequest(type==='purchase'?'reverse-purchase':'reverse-redemption',{businessId,sourceId:id,reason,expectedLedgerVersion:detail.ledgerVersion,idempotencyKey:requestKey});
      const current=await loyaltyRequest<Detail>('activity-detail',{businessId,type,id});setDetail(current);setMessage('Reversal committed.');}
    catch(error){setMessage(error instanceof Error?error.message:'Reversal uncertain. Check the operation result with the same key.');
      try{const result=await loyaltyRequest<{result:unknown}>('result',{businessId,operation:type==='purchase'?'reverse_purchase':'reverse_redemption',idempotencyKey:requestKey});
        if(result.result){setDetail(await loyaltyRequest<Detail>('activity-detail',{businessId,type,id}));setMessage('Reversal committed.');}}catch{/* Preserve the original failure and retry key. */}}
    finally{setBusy(false);}}
  return <main id="main" className="container"><h1>{type==='purchase'?'Purchase':'Reward'} detail</h1><p>{detail.memberName} · Balance {detail.balance}</p>
    <section className="screen-panel"><h2>Original record</h2><dl>{Object.entries(detail.source).filter(([name])=>
      ['id','occurred_at','fulfilled_at','recorded_bill_paisa','eligible_spend_paisa','base_units','promotion_bonus_units','qualifies_for_loyalty','programme_version_id','reward_version_id','branch_id','status','receipt_reference'].includes(name))
      .map(([name,value])=><div key={name}><dt>{name.replaceAll('_',' ')}</dt><dd>{String(value??'—')}</dd></div>)}</dl></section>
    <section className="screen-panel"><h2>Ledger</h2><ul>{detail.ledger.map(entry=><li key={entry.id}>{entry.kind}: {entry.units} · {new Date(entry.occurredAt).toLocaleString('en-PK')}</li>)}</ul>
      {detail.reversal&&<p>Reversed: {detail.reversal.reason}</p>}
      {detail.canReverse&&!detail.reversal&&<><label>Reversal reason <textarea minLength={10} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <button type="button" disabled={busy||reason.trim().length<10} onClick={()=>void reverse()}>{type==='purchase'?'Reverse purchase':'Undo unfulfilled redemption'}</button></>}
      <p role="status">{message}</p></section><Link href={`/staff/${businessId}/activity`}>Back to activity</Link></main>;
}
