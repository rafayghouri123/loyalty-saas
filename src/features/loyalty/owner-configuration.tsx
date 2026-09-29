'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ProgrammeFields, type ProgrammeFieldValues } from './programme-fields';
import { RewardFields, type RewardFieldValues } from './reward-fields';
import { loyaltyRequest } from './client';

type Version = { id:string;version:number;name:string;status:'draft'|'published';effectiveAt:string;minimumSpendPaisa:string;stampsPerPurchase:number|null;
  spendStepPaisa:string|null;unitsPerStep:number|null;maxBaseUnitsPerPurchase:number;terms:string };
type Config = { programme:{id:string;name:string;type:'stamps'|'points';status:string;rowVersion:number;versions:Version[]};
  rewards:{id:string;name:string;status:string;rowVersion:number;publishedVersionId:string|null;draftVersionId:string|null;
    programmeName:string;unitCost:number|null;branchIds:string[];fulfillmentCount:number;
    draftVersion:{title:string;unitCost:number;description:string;terms:string;estimatedCostPaisa:string|null;branchIds:string[]}|null;
    publishedVersion:{title:string;unitCost:number;description:string;terms:string;estimatedCostPaisa:string|null;branchIds:string[]}|null}[];
  branches:{id:string;name:string}[] };
function toPaisa(value:string){const match=/^(0|[1-9]\d{0,6})(?:\.(\d{1,2}))?$/u.exec(value.trim());if(!match)throw new Error('Enter rupees with at most two decimal places.');
  return (BigInt(match[1]!)*100n+BigInt((match[2]??'').padEnd(2,'0'))).toString();}
function fromPaisa(value:string|null|undefined){if(!value)return '0';return `${BigInt(value)/100n}.${(BigInt(value)%100n).toString().padStart(2,'0')}`;}
export function ProgrammeEditor({businessId,initial,programmeId=initial.programme.id}:{businessId:string;initial:Config;programmeId?:string}){
  const [config,setConfig]=useState(initial), latestPublished=initial.programme.versions.find(v=>v.status==='published'),
    savedDraft=initial.programme.versions.find(v=>v.status==='draft'&&v.version>(latestPublished?.version??0)),
    current=savedDraft??latestPublished;
  const [name,setName]=useState(current?.name??initial.programme.name),[mode,setMode]=useState(current?(current.stampsPerPurchase===null?'points':'stamps'):initial.programme.type),
    [minimum,setMinimum]=useState(fromPaisa(current?.minimumSpendPaisa)),
    [stamps,setStamps]=useState(String(current?.stampsPerPurchase??1)),[step,setStep]=useState(fromPaisa(current?.spendStepPaisa??'10000')),
    [perStep,setPerStep]=useState(String(current?.unitsPerStep??1)),[cap,setCap]=useState(String(current?.maxBaseUnitsPerPurchase??1000)),[terms,setTerms]=useState(current?.terms??''),
    [exampleSpend,setExampleSpend]=useState('100'),[example,setExample]=useState<{qualifiesForLoyalty:boolean;rawBaseUnits:string;baseUnits:string;capReduced:boolean}|null>(null),
    [exampleError,setExampleError]=useState(''),
    [effective,setEffective]=useState(()=>{const date=new Date(savedDraft?.effectiveAt??Date.now()+120000);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}),
    [draft,setDraft]=useState<{programmeVersionId:string;rowVersion:number}|null>(savedDraft?{programmeVersionId:savedDraft.id,rowVersion:initial.programme.rowVersion}:null),
    [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const formSignature=JSON.stringify({name,mode,minimum,stamps,step,perStep,cap,terms,effective});
  const [savedSignature,setSavedSignature]=useState(formSignature);
  useEffect(()=>{let active=true;const timer=setTimeout(async()=>{
    try{const result=await loyaltyRequest<{qualifiesForLoyalty:boolean;rawBaseUnits:string;baseUnits:string;capReduced:boolean}>('programme-example',{
      businessId,type:mode,minimumSpendPaisa:toPaisa(minimum),stampsPerPurchase:mode==='stamps'?Number(stamps):null,
      spendStepPaisa:mode==='points'?toPaisa(step):null,unitsPerStep:mode==='points'?Number(perStep):null,
      maxBaseUnitsPerPurchase:Number(cap),exampleEligibleSpendPaisa:toPaisa(exampleSpend)});
      if(active){setExample(result);setExampleError('');}
    }catch{if(active){setExample(null);setExampleError('Enter valid draft values to preview.');}}
  },350);return()=>{active=false;clearTimeout(timer);};
  },[businessId,mode,minimum,stamps,step,perStep,cap,exampleSpend]);
  async function save(){setBusy(true);try{const saved=await loyaltyRequest<{programmeVersionId:string;rowVersion:number}>('save-programme',{
    businessId,programmeId,rowVersion:config.programme.rowVersion,name,type:mode,minimumSpendPaisa:toPaisa(minimum),stampsPerPurchase:mode==='stamps'?Number(stamps):null,
    spendStepPaisa:mode==='points'?toPaisa(step):null,unitsPerStep:mode==='points'?Number(perStep):null,maxBaseUnitsPerPurchase:Number(cap),terms,
    effectiveAt:mode===config.programme.type?new Date(effective).toISOString():new Date().toISOString()});setDraft(saved);
    setMessage(mode===config.programme.type?'Draft version saved. Publish explicitly to use it for future purchases.':
      'Mode-change draft saved. Before the first ledger entry, publishing activates it immediately.');
    setConfig(await loyaltyRequest<Config>('programme-configuration',{businessId,programmeId}));setSavedSignature(formSignature);}catch(error){setMessage(error instanceof Error?error.message:'Could not save.');}finally{setBusy(false);}}
  async function publish(){if(!draft)return;if(!confirm(mode===config.programme.type?'Publish these earning rules for purchases at the selected effective time?':
    'Switch programme type immediately? This is allowed only before the first ledger entry.'))return;setBusy(true);
    try{await loyaltyRequest('publish-programme',{businessId,programmeVersionId:draft.programmeVersionId,rowVersion:draft.rowVersion});setDraft(null);
      setConfig(await loyaltyRequest<Config>('programme-configuration',{businessId,programmeId}));setMessage('Earning version published. Earlier purchases retain their original version.');}
    catch(error){setMessage(error instanceof Error?error.message:'Could not publish.');}finally{setBusy(false);}}
  async function changeStatus(){const status=config.programme.status==='paused'?'published':'paused';
    if(!confirm(status==='paused'?'Pause new enrollment and earning? Existing rewards remain redeemable.':'Resume new enrollment and earning?'))return;
    setBusy(true);try{await loyaltyRequest('programme-status',{businessId,programmeId,status,rowVersion:config.programme.rowVersion});
      setConfig(await loyaltyRequest<Config>('programme-configuration',{businessId,programmeId}));setMessage(status==='paused'?'Earning paused. Existing rewards remain available.':'Earning resumed.');}
    catch(error){setMessage(error instanceof Error?error.message:'Could not change programme status.');}finally{setBusy(false);}}
  const values:ProgrammeFieldValues={name,minimum,stamps,spendStep:step,units:perStep,cap,terms};
  function updateField(field:keyof ProgrammeFieldValues,value:string){
    switch(field){case 'name':setName(value);break;case 'minimum':setMinimum(value);break;case 'stamps':setStamps(value);break;
      case 'spendStep':setStep(value);break;case 'units':setPerStep(value);break;case 'cap':setCap(value);break;case 'terms':setTerms(value);break;}
  }
  return <main id="main" className="container"><nav className="actions" aria-label="Business tools"><Link href={`/dashboard/${businessId}/programmes`}>Programmes</Link></nav>
    <h1>Edit programme</h1><p>Update {config.programme.name}. Save a draft, then publish it when the new rules are ready.</p>
    <form className="stack programme-form" onSubmit={e=>{e.preventDefault();void save();}}>
      <h2>Programme</h2>
      <ProgrammeFields mode={mode} values={values} onModeChange={setMode} onFieldChange={updateField}/>
      <label className="field">Effective date and time<input type="datetime-local" value={effective} disabled={mode!==config.programme.type} onChange={e=>setEffective(e.target.value)}/></label>
      {mode!==config.programme.type&&<p>Before the first ledger entry, a type change activates when published. Existing earning continues while the draft is open.</p>}
      <div className="actions"><Button type="submit" disabled={busy}>{busy?'Saving…':'Save draft'}</Button>
        <Button type="button" variant="secondary" disabled={busy||!draft||savedSignature!==formSignature||config.programme.status==='draft'} onClick={()=>void publish()}>Publish new earning rules</Button></div>
      {draft&&savedSignature!==formSignature&&<p className="microcopy">Save your changes before publishing.</p>}
      {config.programme.status==='draft'&&<p>Publish the complete programme and first reward from <Link href={`/dashboard/${businessId}/programmes`}>All programmes</Link>.</p>}
      {message&&<p role="status">{message}</p>}
    </form>
    <details className="screen-panel programme-detail"><summary>Example earning preview</summary><div className="stack"><label className="field">Example eligible spend (Rs)<input inputMode="decimal" value={exampleSpend} onChange={e=>setExampleSpend(e.target.value)}/></label>
      {example?<><p>{example.qualifiesForLoyalty?`${example.baseUnits} ${mode} earned`:'No units: the example does not meet the minimum.'}</p>
        <p>{mode==='points'?`floor(eligible spend ÷ step) × points per step = ${example.rawBaseUnits} before cap.`:`${stamps} stamps per qualifying purchase.`}
          {example.capReduced?' Programme cap reduced the award.':''}</p></>:<p role="status">{exampleError||'Calculating example…'}</p>}
      <p>Actual checkout uses the published rules at purchase time.</p></div></details>
    {['published','paused'].includes(config.programme.status)&&<section className="screen-panel programme-detail"><h2>Programme status</h2><p>{config.programme.status==='paused'?'Earning is paused.':'Earning is active.'}</p>
      <Button type="button" variant="secondary" disabled={busy} onClick={()=>void changeStatus()}>{config.programme.status==='paused'?'Resume earning':'Pause earning'}</Button></section>}
    <details className="screen-panel programme-detail"><summary>Version history</summary><ul>{config.programme.versions.map(v=><li key={v.id}>v{v.version} · {v.name} · {v.stampsPerPurchase===null?'points':'stamps'} · {v.status} · effective {new Date(v.effectiveAt).toLocaleString('en-PK')}</li>)}</ul></details>
  </main>;
}

export function RewardsEditor({businessId,initial,editId,programmeId=initial.programme.id}:{businessId:string;initial:Config;editId?:string;programmeId?:string}){
  const editing=initial.rewards.find(r=>r.id===editId)??null;
  const initialFields=editing?.draftVersion??editing?.publishedVersion;
  const [config,setConfig]=useState(initial),[title,setTitle]=useState(initialFields?.title??''),[cost,setCost]=useState(String(initialFields?.unitCost??1)),
    [description,setDescription]=useState(initialFields?.description??''),[terms,setTerms]=useState(initialFields?.terms??''),
    [estimate,setEstimate]=useState(initialFields?.estimatedCostPaisa?fromPaisa(initialFields.estimatedCostPaisa):''),
    [branchIds,setBranchIds]=useState<string[]>(initialFields?.branchIds??[]),
    [draft,setDraft]=useState<{rewardId:string;rowVersion:number}|null>(editing?.draftVersion?{rewardId:editing.id,rowVersion:editing.rowVersion}:null),[selected,setSelected]=useState(editing),
    [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const formSignature=JSON.stringify({title,cost,description,terms,estimate,branchIds});
  const [savedSignature,setSavedSignature]=useState(formSignature);
  function edit(id:string){const row=config.rewards.find(r=>r.id===id);if(!row)return;
    const fields=row.draftVersion??row.publishedVersion;if(!fields)return;
    const estimated=fields.estimatedCostPaisa?fromPaisa(fields.estimatedCostPaisa):'';
    setSelected(row);setTitle(fields.title);setCost(String(fields.unitCost));setDescription(fields.description);
    setTerms(fields.terms);setEstimate(estimated);setBranchIds(fields.branchIds);
    setDraft(row.draftVersion?{rewardId:row.id,rowVersion:row.rowVersion}:null);
    setSavedSignature(JSON.stringify({title:fields.title,cost:String(fields.unitCost),description:fields.description,terms:fields.terms,estimate:estimated,branchIds:fields.branchIds}));
    setMessage('');
  }
  function reset(){setSelected(null);setDraft(null);setTitle('');setCost('1');setDescription('');setTerms('');setEstimate('');setBranchIds([]);setSavedSignature('');setMessage('');}
  function updateField(field:keyof RewardFieldValues,value:string){
    switch(field){case 'title':setTitle(value);break;case 'cost':setCost(value);break;case 'description':setDescription(value);break;
      case 'terms':setTerms(value);break;case 'estimate':setEstimate(value);break;}
  }
  async function save(){setBusy(true);try{const saved=await loyaltyRequest<{rewardId:string;rowVersion:number}>('save-reward',{
    businessId,programmeId,...(draft?{rewardId:draft.rewardId,rowVersion:draft.rowVersion}:selected?{rewardId:selected.id,rowVersion:selected.rowVersion}:{}),title,unitCost:Number(cost),description,terms,estimatedCostPaisa:estimate.trim()?toPaisa(estimate):null,branchIds});setDraft(saved);
    const updated=await loyaltyRequest<Config>('programme-configuration',{businessId,programmeId});setConfig(updated);setSelected(updated.rewards.find(r=>r.id===saved.rewardId)??null);
    setSavedSignature(formSignature);setMessage('Reward draft saved. Publish it for customers to use.');}
    catch(error){setMessage(error instanceof Error?error.message:'Could not save reward.');}finally{setBusy(false);}}
  async function publish(){if(!draft)return;if(!confirm('Publish these reward terms for future redemptions? Existing redemption history keeps its original terms.'))return;setBusy(true);
    try{await loyaltyRequest('publish-reward',{businessId,rewardId:draft.rewardId,rowVersion:draft.rowVersion});setDraft(null);
      const updated=await loyaltyRequest<Config>('programme-configuration',{businessId,programmeId});setConfig(updated);
      const published=updated.rewards.find(r=>r.id===draft.rewardId)??null;setSelected(published);
      setMessage('Reward updated. Earlier redemptions keep their original version.');}
    catch(error){setMessage(error instanceof Error?error.message:'Could not publish reward.');}finally{setBusy(false);}}
  const values:RewardFieldValues={title,cost,description,terms,estimate};
  return <main id="main" className="container"><nav className="actions" aria-label="Business tools"><Link href={`/dashboard/${businessId}/programmes`}>Programmes</Link><Link href={`/dashboard/${businessId}/programme?programme=${programmeId}`}>Programme</Link></nav>
    <h1>{selected?'Edit reward':'Create reward'}</h1><p>For {config.programme.name}. Save a draft, then publish it when the reward is ready.</p>
    <form className="stack programme-form" onSubmit={e=>{e.preventDefault();void save();}}>
      <h2>Reward</h2>
      <RewardFields values={values} branches={config.branches} branchIds={branchIds} onFieldChange={updateField} onBranchIdsChange={setBranchIds}/>
      <div className="actions"><Button type="submit" disabled={busy||branchIds.length===0}>{busy?'Saving…':'Save draft'}</Button>
        <Button type="button" variant="secondary" disabled={busy||!draft||savedSignature!==formSignature||config.programme.status==='draft'} onClick={()=>void publish()}>Publish reward</Button>
        {selected&&<Button type="button" variant="ghost" disabled={busy} onClick={reset}>Add another reward</Button>}</div>
      {branchIds.length===0&&<p className="microcopy">Choose at least one eligible branch to save the reward.</p>}
      {draft&&savedSignature!==formSignature&&<p className="microcopy">Save your changes before publishing.</p>}
      {config.programme.status==='draft'&&<p>Publish the complete programme and first reward from <Link href={`/dashboard/${businessId}/programmes`}>All programmes</Link>.</p>}
      {message&&<p role="status">{message}</p>}
    </form>
    <details className="screen-panel programme-detail"><summary>Customer reward preview</summary><div className="stack"><p>{title||'Reward title'} · {cost||'0'} units</p><p>{description}</p><p>{terms||'Reward terms'}</p>
      <p>Eligible branches: {config.branches.filter(branch=>branchIds.includes(branch.id)).map(branch=>branch.name).join(', ')||'Select a branch'}</p></div></details>
    <details className="screen-panel programme-detail"><summary>Published and draft rewards</summary>{config.rewards.length===0?<p>No rewards yet.</p>:
      <ul>{config.rewards.map(r=><li key={r.id}>{r.name} · {r.status} · {r.unitCost??'—'} units · {r.branchIds.length} branches · {r.fulfillmentCount} fulfilled
        <Button type="button" variant="secondary" disabled={busy} onClick={()=>edit(r.id)}>Edit reward</Button></li>)}</ul>}
      <p>Changes to a published reward take effect after publishing a new version. Earlier redemption history retains its original terms.</p></details>
  </main>;
}
export type { Config };
