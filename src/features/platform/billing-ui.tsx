'use client';
import Link from 'next/link';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {MediaUpload} from '@/features/tenancy/media-upload';
import {formatPaisa} from '@/lib/formatting';
import type {BillingView} from './contracts';
import {evidence} from './contracts';
import {formPaisa,platformRequest,platformError} from './client';

const date=(v:string)=>new Date(v).toLocaleString('en-PK',{timeZone:'Asia/Karachi',dateStyle:'medium',timeStyle:'short'});
export function Billing({initial,invoiceId,supportEmail}:{initial:BillingView;invoiceId?:string;supportEmail?:string}){
 const [view,setView]=useState(initial),[pending,setPending]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[proof,setProof]=useState<string|null>(null),[requestKey,setRequestKey]=useState('');
 const refresh=async()=>setView(await platformRequest<BillingView>('billing',{businessId:view.businessId,invoiceId}));
 const act=async(action:()=>Promise<void>)=>{setPending(true);setError('');setMessage('');try{await action();}catch(e){setError(platformError(e));}finally{setPending(false);}};
 const s=view.subscription,invoice=invoiceId?view.invoices.find(i=>i.id===invoiceId):null;
 return <><nav className="actions"><Link href={`/dashboard/${view.businessId}`}>Dashboard</Link><Link href={`/dashboard/${view.businessId}/billing`}>Billing</Link></nav><h1>{invoice?'Invoice':'Billing'}</h1>
  <section className="screen-panel"><h2>{s.plan} · version {s.planVersion}</h2><p>{formatPaisa(s.pricePaisa)} / {s.billingPeriod} · <strong>{s.status.replaceAll('_',' ')}</strong></p><p>Covered period: {date(s.periodStart)} – {date(s.periodEnd)}</p>{s.graceEndsAt&&<p>Grace ends: {date(s.graceEndsAt)}</p>}
   <p>Subscription changes preserve customer balances and history. Suspension blocks new enrollment, earning and marketing. Already-issued benefits and audited reversals remain available.</p>
   <dl className="platform-usage">{(['branches','staff','members','campaigns'] as const).map(k=><div key={k}><dt>{k==='staff'?'Staff including pending invitations':k==='members'?'Loyalty cards (one per customer per programme)':k==='campaigns'?'Campaigns this month':k}</dt><dd>{view.usage[k]} / {s.limits[k]??'Unlimited by plan'}</dd></div>)}</dl>
   {s.cancelAtPeriodEnd?<p role="status">Renewal canceled. Access ends at the covered period end without further grace.</p>:<Button disabled={pending} variant="secondary" onClick={()=>{if(window.confirm('Cancel renewal at the covered period end? Balances and history remain; new earning and marketing stop when access ends.'))void act(async()=>{await platformRequest('cancel-renewal',{businessId:view.businessId});await refresh();setMessage('Renewal canceled.');});}}>Cancel renewal</Button>}
   {supportEmail?<a className="button button-secondary" href={`mailto:${supportEmail}?subject=${encodeURIComponent('Plan change request')}`}>Request plan change</a>:<p>Plan changes require operator support. The support channel needs configuration.</p>}
  </section>
  <section className="screen-panel"><h2>Payment instructions</h2>{view.instructions?<p className="preserve-lines">{view.instructions}</p>:<p>Payment instructions need operator configuration. Contact support before transferring money.</p>}<p>Your plan updates after payment is verified against the actual bank or merchant record.</p></section>
  <section className="screen-panel"><h2>Invoices</h2>{!view.invoices.length?<p>No invoices have been issued yet.</p>:<div className="table-scroll"><table><thead><tr><th>Reference</th><th>Covered period</th><th>Amount</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead><tbody>{view.invoices.map(i=><tr key={i.id}><td>{i.reference}</td><td>{date(i.periodStart)} – {date(i.periodEnd)}</td><td>{formatPaisa(i.amountPaisa)}</td><td>{date(i.dueAt)}</td><td>{i.status}</td><td><Link href={`/dashboard/${view.businessId}/billing/invoices/${i.id}`}>View</Link>{' · '}<a href={`/api/platform/invoice?businessId=${view.businessId}&invoiceId=${i.id}`}>Download</a></td></tr>)}</tbody></table></div>}</section>
  {invoice&&<section className="screen-panel"><h2>Payment evidence</h2>{invoice.submissions.map(x=><p key={x.id}>{date(x.createdAt)} · {x.status.replaceAll('_',' ')}{x.reviewNote&&` · ${x.reviewNote}`}</p>)}
   {['issued','overdue'].includes(invoice.status)?<><form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void act(async()=>{const idempotencyKey=requestKey||crypto.randomUUID();setRequestKey(idempotencyKey);const input=evidence.parse({businessId:view.businessId,invoiceId:invoice.id,idempotencyKey,input:{claimedAmountPaisa:formPaisa(form.get('amount')),method:form.get('method'),reference:form.get('reference'),proofAssetId:proof}});await platformRequest('evidence',input);setRequestKey('');await refresh();setMessage('Evidence submitted for review. Payment has not been confirmed.');});}} onChange={()=>setRequestKey('')}>
    <label className="field">Claimed amount (Rs)<input name="amount" inputMode="decimal" required/></label><label className="field">Method<select name="method"><option value="bank_transfer">Bank transfer</option><option value="merchant_wallet">Merchant wallet</option></select></label><label className="field">Transfer reference<input name="reference" maxLength={200} required/></label><p>Proof image is optional. An uploaded image does not activate your plan.</p><Button disabled={pending}>Submit for review</Button></form><MediaUpload businessId={view.businessId} kind="payment_proof" onAccepted={id=>{setProof(id);setRequestKey('');}}/>{proof&&<p role="status">Validated private proof selected.</p>}</>:<p>This invoice is {invoice.status} and cannot accept new evidence.</p>}
  </section>}
  <Button variant="secondary" disabled={pending} onClick={()=>void act(refresh)}>Refresh billing</Button>{message&&<p role="status">{message}</p>}{error&&<p role="alert" className="error-text">{error}</p>}
 </>;
}
