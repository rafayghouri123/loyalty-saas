'use client';
import { useEffect, useState } from 'react';
import { loyaltyRequest } from './client';

type Version = { id:string;version:number;name:string;status:'draft'|'published';effectiveAt:string;minimumSpendPaisa:string;stampsPerPurchase:number|null;
  spendStepPaisa:string|null;unitsPerStep:number|null;maxBaseUnitsPerPurchase:number;terms:string };
type Config = { programme:{id:string;name:string;type:'stamps'|'points';status:string;rowVersion:number;versions:Version[]};
  rewards:{id:string;name:string;status:string;rowVersion:number;publishedVersionId:string|null;draftVersionId:string|null;
    programmeName:string;unitCost:number|null;branchIds:string[];fulfillmentCount:number;
    draftVersion:{title:string;unitCost:number;description:string;terms:string;estimatedCostPaisa:string|null;branchIds:string[]}|null}[];
  branches:{id:string;name:string}[] };
function toPaisa(value:string){const match=/^(0|[1-9]\d{0,6})(?:\.(\d{1,2}))?$/u.exec(value.trim());if(!match)throw new Error('Enter rupees with at most two decimal places.');
  return (BigInt(match[1]!)*100n+BigInt((match[2]??'').padEnd(2,'0'))).toString();}
function fromPaisa(value:string|null|undefined){if(!value)return '0';return `${BigInt(value)/100n}.${(BigInt(value)%100n).toString().padStart(2,'0')}`;}
export function ProgrammeEditor({businessId,initial}:{businessId:string;initial:Config}){
  const [config,setConfig]=useState(initial), latestPublished=initial.programme.versions.find(v=>v.status==='published'),
    savedDraft=initial.programme.versions.find(v=>v.status==='draft'&&v.version>(latestPublished?.version??0)),
    current=savedDraft??latestPublished;
  const [name,setName]=useState(current?.name??initial.programme.name),[mode,setMode]=useState(current?(current.stampsPerPurchase===null?'points':'stamps'):initial.programme.type),
    [minimum,setMinimum]=useState(fromPaisa(current?.minimumSpendPaisa)),
    [stamps,setStamps]=useState(current?.stampsPerPurchase??1),[step,setStep]=useState(fromPaisa(current?.spendStepPaisa??'10000')),
    [perStep,setPerStep]=useState(current?.unitsPerStep??1),[cap,setCap]=useState(current?.maxBaseUnitsPerPurchase??1000),[terms,setTerms]=useState(current?.terms??''),
    [exampleSpend,setExampleSpend]=useState('100'),[example,setExample]=useState<{qualifiesForLoyalty:boolean;rawBaseUnits:string;baseUnits:string;capReduced:boolean}|null>(null),
    [exampleError,setExampleError]=useState(''),
    [effective,setEffective]=useState(()=>{const date=new Date(savedDraft?.effectiveAt??Date.now()+120000);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}),
    [draft,setDraft]=useState<{programmeVersionId:string;rowVersion:number}|null>(savedDraft?{programmeVersionId:savedDraft.id,rowVersion:initial.programme.rowVersion}:null),
    [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;const timer=setTimeout(async()=>{
    try{const result=await loyaltyRequest<{qualifiesForLoyalty:boolean;rawBaseUnits:string;baseUnits:string;capReduced:boolean}>('programme-example',{
      businessId,type:mode,minimumSpendPaisa:toPaisa(minimum),stampsPerPurchase:mode==='stamps'?stamps:null,
      spendStepPaisa:mode==='points'?toPaisa(step):null,unitsPerStep:mode==='points'?perStep:null,
      maxBaseUnitsPerPurchase:cap,exampleEligibleSpendPaisa:toPaisa(exampleSpend)});
      if(active){setExample(result);setExampleError('');}
    }catch{if(active){setExample(null);setExampleError('Enter valid draft values to preview.');}}
  },350);return()=>{active=false;clearTimeout(timer);};
  },[businessId,mode,minimum,stamps,step,perStep,cap,exampleSpend]);
  async function save(){setBusy(true);try{const saved=await loyaltyRequest<{programmeVersionId:string;rowVersion:number}>('save-programme',{
    businessId,rowVersion:config.programme.rowVersion,name,type:mode,minimumSpendPaisa:toPaisa(minimum),stampsPerPurchase:mode==='stamps'?stamps:null,
    spendStepPaisa:mode==='points'?toPaisa(step):null,unitsPerStep:mode==='points'?perStep:null,maxBaseUnitsPerPurchase:cap,terms,
    effectiveAt:mode===config.programme.type?new Date(effective).toISOString():new Date().toISOString()});setDraft(saved);
    setMessage(mode===config.programme.type?'Draft version saved. Publish explicitly to use it for future purchases.':
      'Mode-change draft saved. Before the first ledger entry, publishing activates it immediately.');
    setConfig(await loyaltyRequest<Config>('configuration',{businessId}));}catch(error){setMessage(error instanceof Error?error.message:'Could not save.');}finally{setBusy(false);}}
  async function publish(){if(!draft)return;if(!confirm(mode===config.programme.type?'Publish these earning rules for purchases at the selected effective time?':
    'Switch programme type immediately? This is allowed only before the first ledger entry.'))return;setBusy(true);
    try{await loyaltyRequest('publish-programme',{businessId,programmeVersionId:draft.programmeVersionId,rowVersion:draft.rowVersion});setDraft(null);
      setConfig(await loyaltyRequest<Config>('configuration',{businessId}));setMessage('Earning version published. Earlier purchases retain their original version.');}
    catch(error){setMessage(error instanceof Error?error.message:'Could not publish.');}finally{setBusy(false);}}
  async function changeStatus(){const status=config.programme.status==='paused'?'published':'paused';
    if(!confirm(status==='paused'?'Pause new enrollment and earning? Existing rewards remain redeemable.':'Resume new enrollment and earning?'))return;
    setBusy(true);try{await loyaltyRequest('programme-status',{businessId,status,rowVersion:config.programme.rowVersion});
      setConfig(await loyaltyRequest<Config>('configuration',{businessId}));setMessage(status==='paused'?'Earning paused. Existing rewards remain available.':'Earning resumed.');}
    catch(error){setMessage(error instanceof Error?error.message:'Could not change programme status.');}finally{setBusy(false);}}
  return <main id="main" className="container"><h1>Programme settings</h1><section className="screen-panel"><p>Current mode: {config.programme.type}. Changes apply at an explicit effective time.</p>
    <label>Programme name <input value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label>
    <label>Programme type <select value={mode} onChange={e=>setMode(e.target.value as 'stamps'|'points')}><option value="stamps">Stamps</option><option value="points">Points</option></select></label>
    <label>Minimum eligible spend (Rs) <input inputMode="decimal" value={minimum} onChange={e=>setMinimum(e.target.value)}/></label>
    {mode==='stamps'?<label>Stamps per qualifying purchase <input type="number" min={1} max={10} value={stamps} onChange={e=>setStamps(Number(e.target.value))}/></label>:
      <><label>Spend step (Rs) <input inputMode="decimal" value={step} onChange={e=>setStep(e.target.value)}/></label>
      <label>Points per step <input type="number" min={1} max={1000} value={perStep} onChange={e=>setPerStep(Number(e.target.value))}/></label></>}
    <label>Maximum base units per purchase <input type="number" min={1} max={100000} value={cap} onChange={e=>setCap(Number(e.target.value))}/></label>
    <section className="screen-panel"><h2>Example earning preview</h2><label>Example eligible spend (Rs) <input inputMode="decimal" value={exampleSpend} onChange={e=>setExampleSpend(e.target.value)}/></label>
      {example?<><p>{example.qualifiesForLoyalty?`${example.baseUnits} ${mode} earned`:'No units: the example does not meet the minimum.'}</p>
        <p>{mode==='points'?`floor(eligible spend ÷ step) × points per step = ${example.rawBaseUnits} before cap.`:`${stamps} stamps per qualifying purchase.`}
          {example.capReduced?' Programme cap reduced the award.':''}</p></>:<p role="status">{exampleError||'Calculating example…'}</p>}
      <p>Actual checkout uses the published rules at purchase time.</p></section>
    <label>Programme terms <textarea minLength={10} maxLength={3000} value={terms} onChange={e=>setTerms(e.target.value)}/></label>
    <label>Effective date and time <input type="datetime-local" value={effective} disabled={mode!==config.programme.type} onChange={e=>setEffective(e.target.value)}/></label>
    {mode!==config.programme.type&&<p>Before the first ledger entry, a type change activates when published. Existing earning continues while the draft is open.</p>}
    <div className="actions"><button type="button" disabled={busy} onClick={()=>void save()}>Save draft</button><button type="button" disabled={busy||!draft} onClick={()=>void publish()}>Publish new earning rules</button>
      {['published','paused'].includes(config.programme.status)&&<button type="button" disabled={busy} onClick={()=>void changeStatus()}>{config.programme.status==='paused'?'Resume earning':'Pause earning'}</button>}</div>
    <p role="status">{message}</p></section><section className="screen-panel"><h2>Version history</h2><ul>{config.programme.versions.map(v=><li key={v.id}>v{v.version} · {v.name} · {v.stampsPerPurchase===null?'points':'stamps'} · {v.status} · effective {new Date(v.effectiveAt).toLocaleString('en-PK')}</li>)}</ul></section></main>;
}

export function RewardsEditor({businessId,initial,editId}:{businessId:string;initial:Config;editId?:string}){
  const editing=initial.rewards.find(r=>r.id===editId&&r.status==='draft')??null;
  const [config,setConfig]=useState(initial),[title,setTitle]=useState(editing?.draftVersion?.title??''),[cost,setCost]=useState(editing?.draftVersion?.unitCost??1),
    [description,setDescription]=useState(editing?.draftVersion?.description??''),[terms,setTerms]=useState(editing?.draftVersion?.terms??''),
    [estimate,setEstimate]=useState(editing?.draftVersion?.estimatedCostPaisa?fromPaisa(editing.draftVersion.estimatedCostPaisa):''),
    [branchIds,setBranchIds]=useState<string[]>(editing?.draftVersion?.branchIds??[]),
    [draft,setDraft]=useState<{rewardId:string;rowVersion:number}|null>(editing?{rewardId:editing.id,rowVersion:editing.rowVersion}:null),[selected,setSelected]=useState(editing),
    [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  function edit(id:string){const row=config.rewards.find(r=>r.id===id&&r.status==='draft');if(!row?.draftVersion)return;
    setSelected(row);setTitle(row.draftVersion.title);setCost(row.draftVersion.unitCost);setDescription(row.draftVersion.description);
    setTerms(row.draftVersion.terms);setEstimate(row.draftVersion.estimatedCostPaisa?fromPaisa(row.draftVersion.estimatedCostPaisa):'');
    setBranchIds(row.draftVersion.branchIds);setDraft({rewardId:row.id,rowVersion:row.rowVersion});}
  async function save(){setBusy(true);try{const saved=await loyaltyRequest<{rewardId:string;rowVersion:number}>('save-reward',{
    businessId,...(selected?{rewardId:selected.id,rowVersion:selected.rowVersion}:{}),title,unitCost:cost,description,terms,estimatedCostPaisa:estimate.trim()?toPaisa(estimate):null,branchIds});setDraft(saved);
    const updated=await loyaltyRequest<Config>('configuration',{businessId});setConfig(updated);setSelected(updated.rewards.find(r=>r.id===saved.rewardId)??null);
    setMessage('Reward draft saved. Publish it for customers to use.');}
    catch(error){setMessage(error instanceof Error?error.message:'Could not save reward.');}finally{setBusy(false);}}
  async function publish(){if(!draft)return;if(!confirm('Publish this reward and preserve its cost and terms for customers?'))return;setBusy(true);
    try{await loyaltyRequest('publish-reward',{businessId,rewardId:draft.rewardId,rowVersion:draft.rowVersion});setDraft(null);
      setConfig(await loyaltyRequest<Config>('configuration',{businessId}));setSelected(null);setMessage('Reward published.');}
    catch(error){setMessage(error instanceof Error?error.message:'Could not publish reward.');}finally{setBusy(false);}}
  return <main id="main" className="container"><h1>Rewards</h1><section className="screen-panel"><h2>Published and draft rewards</h2>
    <ul>{config.rewards.map(r=><li key={r.id}>{r.name} · {r.status} · {r.programmeName} · {r.unitCost??'—'} units · {r.branchIds.length} branches · {r.fulfillmentCount} fulfilled
      {r.status==='draft'&&<button type="button" onClick={()=>edit(r.id)}>Edit draft</button>}</li>)}</ul>
    <p>Published reward costs and terms are protected. Add a separate reward for an economic change.</p></section>
    <section className="screen-panel"><h2>{selected?'Edit draft reward':'Add reward'}</h2><label>Title <input minLength={2} maxLength={80} value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label>Required units <input type="number" min={1} max={1000000} value={cost} onChange={e=>setCost(Number(e.target.value))}/></label>
    <label>Description (optional) <textarea maxLength={500} value={description} onChange={e=>setDescription(e.target.value)}/></label>
    <label>Terms <textarea minLength={10} maxLength={2000} value={terms} onChange={e=>setTerms(e.target.value)}/></label>
    <label>Estimated merchant cost (Rs, optional) <input inputMode="decimal" value={estimate} onChange={e=>setEstimate(e.target.value)}/></label>
    <fieldset><legend>Eligible branches</legend>{config.branches.map(b=><label key={b.id}><input type="checkbox" checked={branchIds.includes(b.id)}
      onChange={e=>setBranchIds(e.target.checked?[...branchIds,b.id]:branchIds.filter(id=>id!==b.id))}/>{b.name}</label>)}</fieldset>
    <section className="screen-panel"><h3>Customer reward preview</h3><p>{title||'Reward title'} · {cost} units</p><p>{description}</p><p>{terms||'Reward terms'}</p>
      <p>Eligible branches: {config.branches.filter(branch=>branchIds.includes(branch.id)).map(branch=>branch.name).join(', ')||'Select a branch'}</p></section>
    <div className="actions">{selected&&<button type="button" onClick={()=>{setSelected(null);setDraft(null);setTitle('');setCost(1);setDescription('');setTerms('');setEstimate('');setBranchIds([]);}}>Add another reward</button>}
      <button type="button" disabled={busy||branchIds.length===0} onClick={()=>void save()}>Save draft</button>
      <button type="button" disabled={busy||!draft} onClick={()=>void publish()}>Publish reward</button></div><p role="status">{message}</p></section></main>;
}
export type { Config };
