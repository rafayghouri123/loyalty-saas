'use client';
import {useState} from 'react';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import type {PrivacyView} from './contracts';
import {platformRequest,platformError} from './client';
import {clearOfflineCards} from '@/lib/offline/cards';
import {clearDeviceState,readDeviceBinding} from '@/lib/push/browser';
export function PrivacyControls({initial,userId,membershipId}:{initial:PrivacyView;userId:string;membershipId?:string}){
 const [view,setView]=useState(initial),[pending,setPending]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[retry,setRetry]=useState<{kind:string;key:string}|null>(null);
 const act=async(action:()=>Promise<void>)=>{setPending(true);setError('');setMessage('');try{await action();}catch(e){setError(platformError(e));}finally{setPending(false);}};
 const request=(kind:'export'|'delete_membership'|'delete_account')=>void act(async()=>{
  const idempotencyKey=retry?.kind===kind?retry.key:crypto.randomUUID();setRetry({kind,key:idempotencyKey});
  const r=await platformRequest<{status:string;errorCode:string|null}>('privacy-request',{kind,membershipId:kind==='delete_membership'?membershipId:null,idempotencyKey});
  setRetry(null);if(r.status==='blocked')setMessage('Deletion blocked: resolve active business ownership or closure with operator support first.');else{setMessage('Request recorded. Refresh to check processing; completion is shown only after the worker finishes.');if(kind!=='export'){await clearOfflineCards();if(kind==='delete_account'&&(await readDeviceBinding())?.userId===userId)await clearDeviceState();}}
  setView(await platformRequest<PrivacyView>('privacy-status',{}));
 });
 return <section className="screen-panel"><h2>{membershipId?'Delete cafe relationship':'Your data'}</h2>
  <p>{membershipId?'Deleting this relationship clears shared contacts and display name, disables marketing and revokes personal handles and intents. Financial history and balance remain with a private account link; this membership cannot be rejoined through normal enrollment.':'Export your personal data as numbered private files, available for 24 hours. Account deletion removes identity, contacts, birthday, staff and device access; accounting and minimal audit history remain pseudonymized.'}</p>
  <p>{view.financialPolicy??'Financial and audit retention policy needs operator configuration.'}</p><p>{view.backupCoverage??'Actual backup coverage and expiry need operator configuration.'}</p>
  {membershipId?<Button disabled={pending} variant="secondary" onClick={()=>{if(window.confirm('Delete this cafe relationship and its shared contact details? Accounting history remains privately retained.'))request('delete_membership');}}>Delete membership data</Button>:<div className="actions"><Button disabled={pending} onClick={()=>request('export')}>Request account export</Button><Button variant="secondary" disabled={pending} onClick={()=>{if(window.confirm('Request whole-account deletion? Recent sign-in is required. Active cafe owners must resolve ownership first. Retained financial/audit categories are listed below.'))request('delete_account');}}>Request account deletion</Button><Link href="/auth/mfa">Verify recent sign-in</Link></div>}
  <Button variant="secondary" disabled={pending} onClick={()=>void act(async()=>setView(await platformRequest<PrivacyView>('privacy-status',{})))}>Refresh privacy requests</Button>
  {message&&<p role="status">{message}</p>}{error&&<p className="error-text" role="alert">{error}</p>}
  {!view.requests.length?<p>No privacy requests yet.</p>:view.requests.filter(r=>!membershipId||r.membershipId===membershipId).map(r=><article key={r.id} className="screen-panel"><h3>{r.kind.replaceAll('_',' ')} · {r.status}</h3><p>Requested {new Date(r.requestedAt).toLocaleString('en-PK')}</p>{r.errorCode&&<p>{r.errorCode==='active_business_owner'?'Resolve active business ownership or closure with operator support.':r.status==='failed'?'Processing failed. Some retained steps may have completed; contact support for recovery.':r.errorCode.replaceAll('_',' ')}</p>}<p>Retained categories: {r.retainedCategories.join('; ')}.</p>{r.status==='completed'&&r.parts.map(p=><p key={p.id}><a href={`/api/privacy/download?artifactId=${p.id}`}>Download {p.part===1?'manifest':`part ${p.part}`} ({p.bytes} bytes)</a></p>)}{r.expiresAt&&<p>Export expires {new Date(r.expiresAt).toLocaleString('en-PK')}</p>}</article>)}
 </section>;
}
