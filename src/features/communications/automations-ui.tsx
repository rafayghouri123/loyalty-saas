'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { communicationRequest } from './client';
import { automationRule } from './contracts';

type Kind='reward_available'|'inactivity'|'birthday';
type Rule={id:string;kind:Kind;enabled:boolean;titleTemplate:string;bodyTemplate:string;inactiveDays:number|null;
 rewardVersionId:string|null;offerId:string|null;birthdayValidityDays:number|null;version:number;lastRun:string|null;suppressed:number;failed:number};
type Config={businessName:string;rules:Rule[];rewards:{id:string;title:string;unitCost:number}[];
 offers:{id:string;title:string;isTemplate:boolean;kind:string;expiresAt:string}[];
 history:{id:string;kind:Kind;state:string;scheduledAt:string;suppressionReason:string|null}[]};
const labels:Record<Kind,string>={reward_available:'Reward available',inactivity:'Inactivity',birthday:'Birthday'};
function rendered(template:string,business:string,reward:string){return template.replaceAll('{{business_name}}',business)
 .replaceAll('{{reward_name}}',reward);}
export function AutomationsManager({businessId,initial}:{businessId:string;initial:Config}){
 const [config,setConfig]=useState(initial),[editing,setEditing]=useState<Kind>('reward_available'),
  [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const current=config.rules.find(rule=>rule.kind===editing);
 const drafts:Record<Kind,{enabled:boolean;title:string;body:string;days:string;rewardId:string;offerId:string;validity:string}> = {
  reward_available:{enabled:false,title:'Reward available at {{business_name}}',body:'Your {{reward_name}} is ready on your loyalty card.',days:'30',rewardId:'',offerId:'',validity:'7'},
  inactivity:{enabled:false,title:'Visit {{business_name}} again',body:'Your loyalty card is ready when you visit us again.',days:'30',rewardId:'',offerId:'',validity:'7'},
  birthday:{enabled:false,title:'Birthday offer from {{business_name}}',body:'A birthday offer is waiting in your loyalty app.',days:'30',rewardId:'',offerId:'',validity:'7'}};
 const form=current?{enabled:current.enabled,title:current.titleTemplate,body:current.bodyTemplate,
  days:String(current.inactiveDays??30),rewardId:current.rewardVersionId??'',offerId:current.offerId??'',
  validity:String(current.birthdayValidityDays??7)}:drafts[editing];
 const [edits,setEdits]=useState<Record<string,typeof form>>({});
 const active=edits[editing]??form;
 const set=<K extends keyof typeof active>(key:K,value:(typeof active)[K])=>setEdits(all=>({...all,[editing]:{...active,[key]:value}}));
 async function refresh(){setConfig(await communicationRequest<Config>('automation-configuration',{businessId}));}
 async function save(enabled=active.enabled){setBusy(true);setMessage('');try{
  const input=automationRule.parse({businessId,kind:editing,enabled,titleTemplate:active.title,bodyTemplate:active.body,
   inactiveDays:editing==='inactivity'?Number(active.days):null,
   rewardVersionId:editing==='reward_available'?active.rewardId:null,
   offerId:editing==='reward_available'?null:active.offerId||null,
   birthdayValidityDays:editing==='birthday'?Number(active.validity):null,version:current?.version??null});
  await communicationRequest('save-automation-rule',input);await refresh();setEdits(all=>{const next={...all};delete next[editing];return next;});
  setMessage(`${labels[editing]} rule saved. Existing runs retain their captured terms.`);
 }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 const rewardName=config.rewards.find(reward=>reward.id===active.rewardId)?.title??'Sample reward';
 const previewTitle=rendered(active.title,config.businessName,rewardName),previewBody=rendered(active.body,config.businessName,rewardName);
 return <main id="main" className="container"><h1>Automations</h1><p>Rules run for consenting members. Quiet hours and frequency limits apply to optional push messages. Birthday inbox offers can still be created without push permission.</p>
  <div className="card-grid">{(['reward_available','inactivity','birthday'] as Kind[]).map(kind=>{const rule=config.rules.find(item=>item.kind===kind);
   return <section className="screen-panel" key={kind}><h2>{labels[kind]}</h2><p>{rule?.enabled?'Enabled':'Off'}</p>
    <p>Last run: {rule?.lastRun?new Date(rule.lastRun).toLocaleString('en-PK'):'Never'}</p><p>{rule?.suppressed??0} suppressed · {rule?.failed??0} failed</p>
    <Button variant="secondary" onClick={()=>{setEditing(kind);setMessage('');}}>Configure</Button></section>;})}</div>
  <section className="screen-panel"><h2>Configure {labels[editing]}</h2>
   {editing==='reward_available'&&<p>Triggers only when a positive purchase earning crosses the selected reward threshold. Rule edits and owner adjustments do not trigger old balances.</p>}
   {editing==='inactivity'&&<p>After the last non-reversed qualifying purchase; once until the next qualifying purchase.</p>}
   {editing==='birthday'&&<p>Requires the customer’s birthday and inbox consent saved before that day starts. A separate annual offer is created per eligible member.</p>}
   <label className="check-label"><input type="checkbox" checked={active.enabled} onChange={e=>set('enabled',e.target.checked)}/>Enabled</label>
   <label className="field">Title template <small>{Array.from(active.title.trim()).length}/80</small><input value={active.title} onChange={e=>set('title',e.target.value)}/></label>
   <label className="field">Message template <small>{Array.from(active.body.trim()).length}/500</small><textarea value={active.body} onChange={e=>set('body',e.target.value)}/></label>
   <p>Supported placeholders: {'{{business_name}}'}{editing==='reward_available'?', {{reward_name}}':''}.</p>
   {editing==='reward_available'&&<label className="field">Target reward<select value={active.rewardId} onChange={e=>set('rewardId',e.target.value)}><option value="">Choose reward</option>{config.rewards.map(reward=><option value={reward.id} key={reward.id}>{reward.title} · {reward.unitCost} units</option>)}</select></label>}
   {editing==='inactivity'&&<><label className="field">Inactive days<input type="number" min={7} max={365} value={active.days} onChange={e=>set('days',e.target.value)}/></label>
    <label className="field">Offer (optional)<select value={active.offerId} onChange={e=>set('offerId',e.target.value)}><option value="">No offer</option>{config.offers.filter(offer=>!offer.isTemplate).map(offer=><option value={offer.id} key={offer.id}>{offer.title}</option>)}</select></label></>}
   {editing==='birthday'&&<><label className="field">Published birthday offer template<select value={active.offerId} onChange={e=>set('offerId',e.target.value)}><option value="">Choose template</option>{config.offers.filter(offer=>offer.isTemplate).map(offer=><option value={offer.id} key={offer.id}>{offer.title}</option>)}</select></label>
    <label className="field">Validity in calendar days<input type="number" min={1} max={30} value={active.validity} onChange={e=>set('validity',e.target.value)}/></label>
    <Link href={`/dashboard/${businessId}/offers/new`}>Create birthday template</Link></>}
   <section className="notice"><strong>Sample preview</strong><p>{previewTitle}</p><p>{previewBody}</p></section>
   <div className="actions"><Button disabled={busy} onClick={()=>save()}>{busy?'Saving…':'Save rule'}</Button>
    {current?.enabled&&<Button variant="secondary" disabled={busy} onClick={()=>save(false)}>Disable</Button>}</div>
   {message&&<p role="status">{message}</p>}
  </section>
  <section className="screen-panel"><h2>Recent runs</h2>{!config.history.length?<p>No eligible recipients yet.</p>:<ul>{config.history.map(run=><li key={run.id}>{labels[run.kind]} · {run.state} · {new Date(run.scheduledAt).toLocaleString('en-PK')}{run.suppressionReason?` · ${run.suppressionReason}`:''}</li>)}</ul>}</section>
 </main>;
}
