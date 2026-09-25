'use client';
import { useState } from 'react';
import Link from 'next/link';
import { LoyaltyCard } from '@/components/loyalty-card';
import { loyaltyRequest } from './client';

type Version = { id:string;version:number;status:string;startsOn:string;endsOn:string;weekdays:number[];startsAt:string;endsAt:string;
 minimumSpendPaisa:string;memberDailyCap:number|null;maxBonusUnitsPerPurchase:number;effectiveAt:string;branches:string[] };
type Promotion = { id:string;name:string;status:string;rowVersion:number;versions:Version[];attributedPurchases:number;bonusUnits:number };
type PromotionConfig = { timezone:string;businessName:string;accentHex:string;programmeType:'stamps'|'points'|null;
 nextReward:{title:string;unitCost:number}|null;branches:{id:string;name:string}[];promotions:Promotion[] };
const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const dateInZone = (date:Date, zone:string) => {const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const part=(type:string)=>parts.find(value=>value.type===type)?.value??'';return `${part('year')}-${part('month')}-${part('day')}`;};
const localDateTimeInput=(date:Date)=>{const adjusted=new Date(date.getTime()-date.getTimezoneOffset()*60000);return adjusted.toISOString().slice(0,16);};
const paisa = (value:string) => { const match=/^(0|[1-9]\d{0,6})(?:\.(\d{1,2}))?$/u.exec(value.trim());
 if (!match) throw new Error('Enter rupees with at most two decimal places.');
 return (BigInt(match[1]!)*100n+BigInt((match[2]??'').padEnd(2,'0'))).toString(); };
const rupees = (value:string) => `${BigInt(value)/100n}.${(BigInt(value)%100n).toString().padStart(2,'0')}`;
const monthDays=(month:string)=>{const [year,number]=month.split('-').map(Number),first=new Date(Date.UTC(year!,number!-1,1));
 const offset=(first.getUTCDay()+6)%7,count=new Date(Date.UTC(year!,number!,0)).getUTCDate();
 return Array.from({length:Math.ceil((offset+count)/7)*7},(_,index)=>{const date=new Date(Date.UTC(year!,number!-1,index-offset+1));
  return {date:date.toISOString().slice(0,10),day:date.getUTCDate(),weekday:((date.getUTCDay()+6)%7)+1,inMonth:date.getUTCMonth()===number!-1};});};
function PromotionCalendar({config,businessId}:{config:PromotionConfig;businessId:string}){
 const [month,setMonth]=useState(dateInZone(new Date(),config.timezone).slice(0,7));
 const days=monthDays(month);
 const shift=(by:number)=>{const [year,number]=month.split('-').map(Number);setMonth(new Date(Date.UTC(year!,number!-1+by,1)).toISOString().slice(0,7));};
 const label=new Intl.DateTimeFormat('en-PK',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${month}-01T00:00:00Z`));
 return <><div className="actions"><button type="button" onClick={()=>shift(-1)} aria-label="Previous month">Previous</button><h3>{label}</h3><button type="button" onClick={()=>shift(1)} aria-label="Next month">Next</button></div>
 <p>Dates and weekdays use {config.timezone}. Paused slots remain visible for planning.</p>
 <div className="promotion-calendar" role="grid" aria-label={`${label} promotion schedule`}>
 {dayNames.map(day=><div className="promotion-calendar-heading" key={day} role="columnheader">{day}</div>)}
 {days.map(day=>{const slots=config.promotions.flatMap(p=>{if(p.status==='archived')return [];
  const v=p.versions.find(version=>version.status==='published'&&dateInZone(new Date(version.effectiveAt),config.timezone)<=day.date);
  if(!v||day.date<v.startsOn||day.date>v.endsOn||!v.weekdays.includes(day.weekday))return [];
  return [{promotion:p,version:v}];});
  return <div className={`promotion-calendar-day${day.inMonth?'':' is-outside'}`} key={day.date} role="gridcell" aria-label={day.date}>
   <strong>{day.day}</strong>{slots.map(({promotion,version})=><Link key={promotion.id} className="promotion-calendar-slot" href={`/dashboard/${businessId}/promotions/${promotion.id}`}>
    <span>{promotion.name}{promotion.status==='paused'?' · paused':''}</span><small>{version.startsAt.slice(0,5)}–{version.endsAt.slice(0,5)} · {version.branches.map(id=>config.branches.find(b=>b.id===id)?.name??'Branch').join(', ')}</small>
   </Link>)}
  </div>;})}</div></>;
}

export function PromotionManager({businessId,initial,editId}:{businessId:string;initial:PromotionConfig;editId?:string}) {
 const [config,setConfig]=useState(initial), selected=config.promotions.find(p=>p.id===editId);
 const latest=selected?.versions[0];
 const [name,setName]=useState(selected?.name??''),[branches,setBranches]=useState<string[]>(latest?.branches??initial.branches.map(b=>b.id)),
 [startsOn,setStartsOn]=useState(latest?.startsOn??dateInZone(new Date(),initial.timezone)),
 [endsOn,setEndsOn]=useState(latest?.endsOn??dateInZone(new Date(),initial.timezone)),
 [days,setDays]=useState<number[]>(latest?.weekdays??[1,2,3,4,5,6,7]),
 [startsAt,setStartsAt]=useState(latest?.startsAt.slice(0,5)??'15:00'),[endsAt,setEndsAt]=useState(latest?.endsAt.slice(0,5)??'18:00'),
 [minimum,setMinimum]=useState(rupees(latest?.minimumSpendPaisa??'0')),
 [dailyCap,setDailyCap]=useState(latest?.memberDailyCap?.toString()??''),[bonusCap,setBonusCap]=useState(latest?.maxBonusUnitsPerPurchase??1000),
 [effective,setEffective]=useState(localDateTimeInput(new Date(Date.now()+120000))),
 [exampleBase,setExampleBase]=useState(1),[draft,setDraft]=useState<{promotionId:string;promotionVersionId:string;rowVersion:number}|null>(null),
 [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[view,setView]=useState<'list'|'calendar'>('list');
 const refresh=async()=>setConfig(await loyaltyRequest<PromotionConfig>('promotion-configuration',{businessId}));
 async function save(){setBusy(true);setMessage('');try{
  const saved=await loyaltyRequest<{promotionId:string;promotionVersionId:string;rowVersion:number}>('save-promotion',{
   businessId,...(selected?{promotionId:selected.id,rowVersion:config.promotions.find(p=>p.id===selected.id)?.rowVersion}:{}),
   name,branchIds:branches,startsOn,endsOn,weekdays:[...days].sort((a,b)=>a-b),startsAt,endsAt,
   minimumSpendPaisa:paisa(minimum),memberDailyCap:dailyCap?Number(dailyCap):null,maxBonusUnitsPerPurchase:bonusCap,
   effectiveAt:new Date(effective).toISOString()});
  setDraft(saved);await refresh();setMessage('Draft saved. Publish it explicitly to schedule this slot.');
 }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 async function publish(){if(!draft)return;setBusy(true);try{
  await loyaltyRequest('publish-promotion',{businessId,promotionId:draft.promotionId,promotionVersionId:draft.promotionVersionId,
   rowVersion:draft.rowVersion,enable:true});await refresh();setDraft(null);setMessage('Slot published. Future checkouts use the version effective at purchase time.');
 }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 async function status(p:Promotion){setBusy(true);try{await loyaltyRequest('promotion-status',{businessId,promotionId:p.id,rowVersion:p.rowVersion,
  status:p.status==='enabled'?'paused':'enabled'});await refresh();setMessage('Slot status updated.');}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 const sampleBonus=Math.min(Math.max(exampleBase,0),bonusCap);
 return <main id="main" className="container"><h1>Double earn slots</h1><p>All times use {config.timezone}. A 2x slot adds up to the disclosed bonus cap to base earning. Scheduled changes never alter past purchases.</p>
 <div className="actions"><button type="button" onClick={()=>setView('list')} aria-pressed={view==='list'}>List</button><button type="button" onClick={()=>setView('calendar')} aria-pressed={view==='calendar'}>Calendar</button><Link className="button" href={`/dashboard/${businessId}/promotions`}>Create slot</Link></div>
 <section className="screen-panel"><h2>{view==='list'?'Slots':'Schedule by date'}</h2>{view==='calendar'?<PromotionCalendar config={config} businessId={businessId}/>:config.promotions.length===0?<p>No slots yet.</p>:<ul>{config.promotions.map(p=>{
  const v=p.versions.find(v=>v.status==='published')??p.versions[0];return <li key={p.id}><Link href={`/dashboard/${businessId}/promotions/${p.id}`}>{p.name}</Link> · {p.status}
   {v&&<> · {v.startsOn}–{v.endsOn} · {v.weekdays.map(d=>dayNames[d-1]).join(', ')} {v.startsAt.slice(0,5)}–{v.endsAt.slice(0,5)}
   · {v.branches.map(id=>config.branches.find(b=>b.id===id)?.name??'Unknown branch').join(', ')}</>}
   · {p.attributedPurchases} purchases · {p.bonusUnits} bonus units
   {p.versions.some(v=>v.status==='published')&&<button type="button" disabled={busy} onClick={()=>void status(p)}>{p.status==='enabled'?'Pause':'Enable'}</button>}</li>;
 })}</ul>}</section>
 <section className="screen-panel"><h2>{selected?`New version of ${selected.name}`:'Create slot'}</h2>
 <label>Name <input minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Afternoon double stamps"/></label>
 <fieldset><legend>Branches</legend>{config.branches.map(b=><label key={b.id}><input type="checkbox" checked={branches.includes(b.id)} onChange={e=>setBranches(e.target.checked?[...branches,b.id]:branches.filter(id=>id!==b.id))}/>{b.name}</label>)}</fieldset>
 <label>Start date <input type="date" value={startsOn} onChange={e=>setStartsOn(e.target.value)}/></label>
 <label>End date <input type="date" value={endsOn} onChange={e=>setEndsOn(e.target.value)}/></label>
 <fieldset><legend>Local weekdays</legend>{dayNames.map((label,index)=><label key={label}><input type="checkbox" checked={days.includes(index+1)} onChange={e=>setDays(e.target.checked?[...days,index+1]:days.filter(day=>day!==index+1))}/>{label}</label>)}</fieldset>
 <label>Start time <input type="time" value={startsAt} onChange={e=>setStartsAt(e.target.value)}/></label>
 <label>End time <input type="time" value={endsAt} onChange={e=>setEndsAt(e.target.value)}/></label>
 <label>Rule effective date and time (your device timezone) <input type="datetime-local" value={effective} onChange={e=>setEffective(e.target.value)}/></label>
 <p>Same day only. Split an overnight offer into two dated weekday slots. Times include the start and exclude the end.</p>
 <label>Minimum eligible spend (Rs) <input inputMode="decimal" value={minimum} onChange={e=>setMinimum(e.target.value)}/></label>
 <label>Max uses per member per day (optional) <input type="number" min={1} max={100} value={dailyCap} onChange={e=>setDailyCap(e.target.value)}/></label>
 <label>Maximum bonus units per purchase <input type="number" min={1} max={100000} value={bonusCap} onChange={e=>setBonusCap(Number(e.target.value))}/></label>
 <section className="screen-panel"><h3>Example card and purchase</h3><p>{name||'Your slot'} · 2x base earn, up to {bonusCap} extra units.</p>
  <label>Example base units <input type="number" min={0} max={100000} value={exampleBase} onChange={e=>setExampleBase(Number(e.target.value))}/></label>
  <p>Eligible: {exampleBase} base + {sampleBonus} bonus = {exampleBase+sampleBonus} units. {sampleBonus<exampleBase?'The bonus cap limits the 2x offer.':''}</p>
  <p>Outside the window, below Rs {minimum||'0'}, at another branch, or after the daily cap: {exampleBase} base + 0 bonus.</p>
  <p>{name||'This slot'}: {[...days].sort((a,b)=>a-b).map(day=>dayNames[day-1]).join(', ')}, {startsAt}–{endsAt} in {config.timezone}, {startsOn}–{endsOn}, at {branches.map(id=>config.branches.find(branch=>branch.id===id)?.name??'Unknown branch').join(', ')||'no branch selected'}.</p>
  <div className="card-preview"><LoyaltyCard businessName={config.businessName} accent={config.accentHex} programme={config.programmeType??'stamps'}
    balance={exampleBase+sampleBonus} rewardTitle={config.nextReward?.title??'Next reward'} rewardCost={config.nextReward?.unitCost??4} serverEligible={false}/>
   <p className="microcopy">Illustrative card after the sample eligible purchase. Live balances and rewards come from the server.</p></div></section>
 <div className="actions"><button type="button" disabled={busy||!branches.length||!days.length} onClick={()=>void save()}>Save draft</button>
 <button type="button" disabled={busy||!draft} onClick={()=>void publish()}>Enable slot</button></div><p role="status">{message}</p></section>
 {selected&&<section className="screen-panel"><h2>Version history</h2><ul>{selected.versions.map(v=><li key={v.id}>v{v.version} · {v.status} · effective {new Date(v.effectiveAt).toLocaleString('en-PK')}</li>)}</ul></section>}
 </main>;
}

type ReferralRule = { id:string;version:number;enabled:boolean;inviterBonusUnits:number;friendBonusUnits:number;
 minimumSpendPaisa:string;monthlyInviterCap:number;attributionDays:number;qualificationDays:number };
type ReferralRow = { id:string;enrolledAt:string;status:string;friendLabel:string;branchId:string|null;
 qualifyingPurchaseId:string|null;qualifyingReceipt:string|null;inviterUnits:number;friendUnits:number;suppression:string;reviewSignal:string };
type ReferralConfig = { rule:ReferralRule|null;timezone:string;startDate:string;endDate:string;canEdit:boolean;
 branches:{id:string;name:string}[];metrics:{signups:number;qualified:number;pending:number;expired:number;reversed:number;inviterUnits:number;friendUnits:number;visits:number|null};
 total:number;page:number;pageSize:number;results:ReferralRow[] };
export function ReferralManager({businessId,initial}:{businessId:string;initial:ReferralConfig}) {
 const rule=initial.rule,[config,setConfig]=useState(initial),[tab,setTab]=useState<'rules'|'results'>('rules'),
 [enabled,setEnabled]=useState(rule?.enabled??true),[inviter,setInviter]=useState(rule?.inviterBonusUnits??1),[friend,setFriend]=useState(rule?.friendBonusUnits??1),
 [minimum,setMinimum]=useState(rupees(rule?.minimumSpendPaisa??'0')),[cap,setCap]=useState(rule?.monthlyInviterCap??10),
 [attribution,setAttribution]=useState(rule?.attributionDays??7),[qualification,setQualification]=useState(rule?.qualificationDays??30),
 [start,setStart]=useState(initial.startDate),[end,setEnd]=useState(initial.endDate),[branchId,setBranchId]=useState<string|null>(null),
 [status,setStatus]=useState('all'),[page,setPage]=useState(0),[pageSize,setPageSize]=useState<25|50|100>(25),
 [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function refresh(nextPage=page){const next=await loyaltyRequest<ReferralConfig>('referral-configuration',{
  businessId,startDate:start,endDate:end,status,branchId,page:nextPage,pageSize});setConfig(next);setPage(nextPage);}
 async function save(nextEnabled=enabled){setBusy(true);try{
  await loyaltyRequest('save-referral-rules',{businessId,enabled:nextEnabled,inviterBonusUnits:inviter,friendBonusUnits:friend,
   minimumSpendPaisa:paisa(minimum),monthlyInviterCap:cap,attributionDays:attribution,qualificationDays:qualification});
  setEnabled(nextEnabled);await refresh();setMessage(`Referral rules version published. Existing claims retain their enrolled rules.`);
 }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
  const counts=config.metrics;
 return <main id="main" className="container"><h1>Referrals</h1><div className="actions"><button type="button" aria-pressed={tab==='rules'} onClick={()=>setTab('rules')}>Rules</button><button type="button" aria-pressed={tab==='results'} onClick={()=>setTab('results')}>Results</button></div>
 {tab==='rules'?<section className="screen-panel"><h2>Purchase qualified rewards</h2><p>Current rule: {config.rule?`v${config.rule.version} · ${config.rule.enabled?'enabled':'paused'}`:'not configured'}.</p>
  {config.canEdit&&<><label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Enable new referrals</label>
 <label>Inviter bonus units <input type="number" min={1} max={1000} value={inviter} onChange={e=>setInviter(Number(e.target.value))}/></label>
 <label>Friend bonus units <input type="number" min={1} max={1000} value={friend} onChange={e=>setFriend(Number(e.target.value))}/></label>
 <label>Minimum qualifying spend (Rs) <input inputMode="decimal" value={minimum} onChange={e=>setMinimum(e.target.value)}/></label>
 <label>Inviter monthly cap <input type="number" min={1} max={1000} value={cap} onChange={e=>setCap(Number(e.target.value))}/></label>
 <label>Attribution days <input type="number" min={1} max={30} value={attribution} onChange={e=>setAttribution(Number(e.target.value))}/></label>
 <label>Qualification days <input type="number" min={1} max={90} value={qualification} onChange={e=>setQualification(Number(e.target.value))}/></label>
 <p>Both people benefit after the friend’s first qualifying purchase. Existing members and self referrals do not qualify. If the inviter reaches the cap, the friend still earns. A full purchase reversal reverses both awards.</p>
  <div className="actions"><button type="button" disabled={busy} onClick={()=>void save()}>Save new rules</button>{config.rule?.enabled&&<button type="button" disabled={busy} onClick={()=>void save(false)}>Pause new referrals</button>}</div></>}</section>:
 <section className="screen-panel"><h2>Referral results</h2><div className="actions"><label>From <input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>To <input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
  <label>Branch <select value={branchId??''} onChange={e=>setBranchId(e.target.value||null)}><option value="">All permitted branches</option>{config.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
  <label>Status <select value={status} onChange={e=>setStatus(e.target.value)}>{['all','pending','qualified','expired','reversed'].map(s=><option key={s} value={s}>{s}</option>)}</select></label>
  <label>Rows <select value={pageSize} onChange={e=>setPageSize(Number(e.target.value) as 25|50|100)}>{[25,50,100].map(size=><option key={size} value={size}>{size}</option>)}</select></label>
  <button type="button" disabled={busy} onClick={()=>void refresh(0)}>Refresh</button></div><p>Dates use {config.timezone}.</p>
 <p>{counts.visits===null?'':`${counts.visits} approximate link visits · `}{counts.signups} signups · {counts.qualified} qualified · {counts.pending} pending · {counts.expired} expired · {counts.reversed} reversed</p>
  <p>Inviter units: {counts.inviterUnits} · Friend units: {counts.friendUnits}</p>
  {config.results.length?<div style={{overflowX:'auto'}}><table><thead><tr><th>Enrolled</th><th>Friend</th><th>Branch</th><th>Status</th><th>Receipt</th><th>Inviter</th><th>Friend units</th><th>Reason</th><th>Review</th></tr></thead><tbody>{config.results.map(r=><tr key={r.id}><td>{new Date(r.enrolledAt).toLocaleDateString('en-PK',{timeZone:config.timezone})}</td><td>{r.friendLabel}</td>
  <td>{config.branches.find(b=>b.id===r.branchId)?.name??'—'}</td><td>{r.status}</td><td>{r.qualifyingPurchaseId?<Link href={`/staff/${businessId}/transactions/${r.qualifyingPurchaseId}`}>{r.qualifyingReceipt??'View transaction'}</Link>:'—'}</td><td>{r.inviterUnits}</td><td>{r.friendUnits}</td><td>{r.suppression.replaceAll('_',' ')}</td><td>{r.reviewSignal==='shared_unverified_phone'?'Shared phone; review only':'—'}</td></tr>)}</tbody></table></div>:<p>No referral claims match these filters.</p>}
  <div className="actions"><span>{config.total} matching claims · page {page+1}</span><button type="button" disabled={page===0||busy} onClick={()=>void refresh(page-1)}>Previous</button>
  <button type="button" disabled={(page+1)*pageSize>=config.total||busy} onClick={()=>void refresh(page+1)}>Next</button></div>
 <p>Friend identities are hidden in this report.</p></section>}
 <p role="status">{message}</p></main>;
}

type CustomerReferral = {available:boolean;code?:string;stats?:{signups:number;qualified:number;pending:number;expired:number;reversed:number;earnedUnits:number}};
export function CustomerReferrals({memberships}:{memberships:{id:string;businessName:string;status:string}[]}) {
 const [selected,setSelected]=useState(memberships.find(m=>m.status==='active')?.id??memberships[0]?.id??''),[result,setResult]=useState<CustomerReferral|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function load(id=selected){if(!id)return;setBusy(true);try{setResult(await loyaltyRequest<CustomerReferral>('my-referral-code',{membershipId:id}));setMessage('');}
 catch(error){setMessage((error as Error).message);setResult(null);}finally{setBusy(false);}}
 const link=result?.code&&typeof window!=='undefined'?`${window.location.origin}/r/${result.code}`:'';
 return <main id="main" className="container"><h1>Invite a friend</h1><p>Each cafe has its own referral link. Your friend joins first and earns a reward after a qualifying purchase.</p>
  <label>Cafe <select value={selected} onChange={e=>{setSelected(e.target.value);setResult(null);}}>{memberships.map(m=><option key={m.id} value={m.id}>{m.businessName}{m.status==='active'?'':` · ${m.status}`}</option>)}</select></label>
 <button type="button" disabled={busy||!selected} onClick={()=>void load()}>Show my referral link</button>
 {result?.available&&link?<section className="screen-panel"><label>Referral link <input readOnly value={link}/></label>
 <div className="actions"><button type="button" onClick={()=>void navigator.clipboard.writeText(link).then(()=>setMessage('Link copied.')).catch(()=>setMessage('Copy the link manually.'))}>Copy link</button>
 {typeof navigator!=='undefined'&&'share' in navigator&&<button type="button" onClick={()=>void navigator.share({url:link}).catch(()=>{})}>Share link</button>}</div>
  </section>:result&&!result.available?<p>New referral links are not currently available for this cafe.</p>:null}
  {result&&<section className="screen-panel"><h2>Referral status</h2><p>{result.stats?.signups??0} signups · {result.stats?.qualified??0} qualified · {result.stats?.pending??0} pending · {result.stats?.expired??0} expired · {result.stats?.reversed??0} reversed</p>
  <p>{result.stats?.earnedUnits??0} bonus units currently earned.</p></section>}
 <p role="status">{message}</p></main>;
}
