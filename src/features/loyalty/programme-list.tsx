'use client';
import { useState } from 'react';
import Link from 'next/link';
import { mutate } from '@/features/tenancy/mutate';

export type ProgrammeSummary = { id:string; name:string; type:'stamps'|'points'; status:string; isPrimary:boolean;
  rewardCount:number; cardCount:number; versions:{id:string;version:number;status:string;effectiveAt:string}[] };

export function ProgrammeList({businessId,programmes}:{businessId:string;programmes:ProgrammeSummary[]}) {
  const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState('');
  async function publish(id:string) {
    if (!confirm('Publish this programme and its first reward for customers?')) return;
    setBusy(id);setError('');
    try { await mutate('/api/tenancy/publish-additional-programme',{businessId,programmeId:id});window.location.reload(); }
    catch (cause) { setError(cause instanceof Error?cause.message:'Could not publish programme.');setBusy(null); }
  }
  return <><div className="card-grid">{programmes.map(programme=><section className="screen-panel" key={programme.id}>
    <h2>{programme.name}</h2><p>{programme.type} · {programme.status}{programme.isPrimary?' · Original programme':''}</p>
    <p>{programme.cardCount} cards · {programme.rewardCount} published rewards</p>
    <div className="actions"><Link className="button" href={`/dashboard/${businessId}/programme?programme=${programme.id}`}>Edit Program</Link>
      <Link className="button button-secondary" href={`/dashboard/${businessId}/rewards?programme=${programme.id}`}>Rewards</Link>
      {programme.status==='draft'&&!programme.isPrimary&&<button type="button" disabled={busy!==null} onClick={()=>void publish(programme.id)}>
        {busy===programme.id?'Publishing…':'Publish programme and first reward'}</button>}</div></section>)}</div>
    {error&&<p role="alert" className="error-text">{error}</p>}</>;
}
