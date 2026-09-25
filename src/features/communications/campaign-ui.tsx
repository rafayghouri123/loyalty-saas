'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { communicationRequest } from './client';
import { campaignDraft } from './contracts';
import { readDeviceBinding } from '@/lib/push/browser';
import { MediaUpload } from '@/features/tenancy/media-upload';
import { publicOfferImageUrl } from '@/lib/media/public-url';
import Image from 'next/image';

type Campaign={id:string;name:string;status:string;rowVersion:number;scheduledAt:string|null;startedAt:string|null;completedAt:string|null;
 title:string;body:string;imageAssetId:string|null;destination:'card'|'offer';offerId:string|null;audience:'all_opted_in'|'inactive'|'reward_ready'|'near_reward';
 inactiveDays:number|null;nearRewardUnits:number|null;targetRewardVersionId:string|null;expiresAt:string;branchIds:string[];
 eligibleAudience:number;suppressed:number;deviceAttempts:number;providerAccepted:number;failures:number;observedClicks:number;fulfilledClaims:number};
type Config={businessId:string;businessName:string;timezone:string;branches:{id:string;name:string}[];
 rewards:{id:string;title:string;unitCost:number}[];offers:{id:string;title:string;expiresAt:string}[];
 images:{id:string;path:string}[];campaigns:Campaign[]};
type AudiencePreview={estimatedAt:string;eligibleMembers:number;subscribedDevices:number;excludedNoConsent:number;
 excludedAudienceOrBranch:number;eligibleWithoutDevice:number;cappedNow:number;quietHoursNow:number};
type TestDevices={devices:{id:string;browserLabel:string|null;lastSeenAt:string}[];
 recentTests:{id:string;campaignId:string;status:string;createdAt:string;errorCode:string|null}[]};
const local=(value:string)=>{const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16);};
const dayAfter=(value:string)=>{const date=new Date(`${value}T00:00:00`);date.setDate(date.getDate()+1);return date.getTime();};

export function CampaignManager({businessId,initial,editId}:{businessId:string;initial:Config;editId?:string}){
 const [config,setConfig]=useState(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [audiencePreview,setAudiencePreview]=useState<AudiencePreview|null>(null);
 const [testDevices,setTestDevices]=useState<TestDevices|null>(null),[selectedDevice,setSelectedDevice]=useState('');
 const [sendMode,setSendMode]=useState<'now'|'schedule'>('schedule');
 const [statusFilter,setStatusFilter]=useState('all'),[branchFilter,setBranchFilter]=useState('all');
 const [fromFilter,setFromFilter]=useState(''),[toFilter,setToFilter]=useState('');
 const selected=config.campaigns.find(item=>item.id===editId);
 const [form,setForm]=useState({name:selected?.name??'',title:selected?.title??'',body:selected?.body??'',
  imageAssetId:selected?.imageAssetId??'',
  destination:selected?.destination??'card',offerId:selected?.offerId??'',audience:selected?.audience??'all_opted_in',
  inactiveDays:selected?.inactiveDays?.toString()??'30',nearRewardUnits:selected?.nearRewardUnits?.toString()??'2',
  targetRewardVersionId:selected?.targetRewardVersionId??'',branchIds:selected?.branchIds??initial.branches.map(item=>item.id),
  scheduledAt:local(selected?.scheduledAt??new Date(Date.now()+120000).toISOString()),
  expiresAt:local(selected?.expiresAt??new Date(Date.now()+3600000).toISOString())});
 const set=<K extends keyof typeof form>(key:K,value:(typeof form)[K])=>setForm(current=>({...current,[key]:value}));
 const [draft,setDraft]=useState<{campaignId:string;rowVersion:number}|null>(selected?.status==='draft'?{campaignId:selected.id,rowVersion:selected.rowVersion}:null);
 const shownCampaigns=config.campaigns.filter(c=>(statusFilter==='all'||c.status===statusFilter)
  &&(branchFilter==='all'||c.branchIds.includes(branchFilter))
  &&(!fromFilter||Date.parse(c.scheduledAt??c.startedAt??'')>=Date.parse(`${fromFilter}T00:00:00`))
  &&(!toFilter||Date.parse(c.scheduledAt??c.startedAt??'')<dayAfter(toFilter)));
 async function refresh(){setConfig(await communicationRequest<Config>('campaign-configuration',{businessId}));}
 async function previewAudience(){if(!draft)return;setBusy(true);setMessage('');try{
  setAudiencePreview(await communicationRequest<AudiencePreview>('preview-campaign-audience',{businessId,campaignId:draft.campaignId}));
 }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 async function refreshTestDevices(){setBusy(true);try{const next=await communicationRequest<TestDevices>('campaign-test-devices',{businessId});
  setTestDevices(next);setSelectedDevice(current=>next.devices.some(item=>item.id===current)?current:next.devices[0]?.id??'');
 }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 async function registerTestDevice(enabled:boolean){setBusy(true);setMessage('');try{
  const binding=await readDeviceBinding();if(!binding)throw new Error('Enable notifications on this device first, then return to register it for tests.');
  await communicationRequest('set-campaign-test-device',{businessId,installationId:binding.installationId,
   bindingGeneration:binding.bindingGeneration,enabled});
  const next=await communicationRequest<TestDevices>('campaign-test-devices',{businessId});setTestDevices(next);
  setSelectedDevice(next.devices[0]?.id??'');setMessage(enabled?'This browser is registered for your own campaign tests.':'This browser was removed from campaign tests.');
 }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 async function sendTest(){if(!draft||!selectedDevice)return;setBusy(true);setMessage('');try{
  await communicationRequest('request-campaign-test',{businessId,campaignId:draft.campaignId,deviceId:selectedDevice});
  const next=await communicationRequest<TestDevices>('campaign-test-devices',{businessId});setTestDevices(next);
  setMessage('Test queued for your registered device. Refresh status to see provider acceptance; it does not prove display.');
 }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 async function save(event:React.FormEvent){event.preventDefault();setBusy(true);setMessage('');try{
  const input=campaignDraft.parse({businessId,campaignId:selected?.id??null,rowVersion:selected?.rowVersion??null,
   name:form.name,title:form.title,body:form.body,imageAssetId:form.imageAssetId||null,
   destination:form.destination,offerId:form.destination==='offer'?form.offerId:null,
   audience:form.audience,inactiveDays:form.audience==='inactive'?Number(form.inactiveDays):null,
   nearRewardUnits:form.audience==='near_reward'?Number(form.nearRewardUnits):null,
   targetRewardVersionId:['reward_ready','near_reward'].includes(form.audience)?form.targetRewardVersionId:null,
   branchIds:form.branchIds,expiresAt:new Date(form.expiresAt).toISOString()});
  const saved=await communicationRequest<{campaignId:string;rowVersion:number}>('save-campaign',input);
  setDraft(saved);setAudiencePreview(null);await refresh();setMessage('Draft saved. Review the audience and schedule explicitly.');
  if(!selected)window.location.assign(`/dashboard/${businessId}/campaigns/${saved.campaignId}/edit`);
 }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 async function schedule(){if(!draft)return;
  const sendAt=sendMode==='now'?new Date().toISOString():new Date(form.scheduledAt).toISOString();
  if(!confirm(`Schedule ${form.name} for ${config.businessName}?\nAudience: ${form.audience}${audiencePreview?` (${audiencePreview.eligibleMembers} currently eligible)`:''}\nTitle: ${form.title}\nMessage: ${form.body}\nSend: ${sendMode==='now'?'now':new Date(sendAt).toLocaleString('en-PK')}`))return;
  setBusy(true);setMessage('');try{
  await communicationRequest('schedule-campaign',{businessId,campaignId:draft.campaignId,rowVersion:draft.rowVersion,
   scheduledAt:sendAt,idempotencyKey:crypto.randomUUID()});
  await refresh();setDraft(null);setMessage('Campaign scheduled. Recipients will be snapshotted at launch time.');
 }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 async function action(campaign:Campaign,choice:'pause'|'resume'|'cancel'|'duplicate'){
  setBusy(true);setMessage('');try{
   if(choice==='duplicate'){const duplicate=await communicationRequest<{campaignId:string}>('duplicate-campaign',{businessId,campaignId:campaign.id});
    window.location.assign(`/dashboard/${businessId}/campaigns/${duplicate.campaignId}/edit`);return;}
   await communicationRequest('set-campaign-status',{businessId,campaignId:campaign.id,rowVersion:campaign.rowVersion,action:choice});
   await refresh();setMessage(`Campaign ${choice==='pause'?'paused':choice==='resume'?'resumed':'canceled'}.`);
  }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 return <main id="main" className="container"><h1>Campaigns</h1><p>For {config.businessName}. Times are shown in your browser timezone; the cafe uses {config.timezone}.</p>
  <p>Marketing sends follow 21:00–09:00 quiet hours, two per cafe and five platform wide per member per week. Provider acceptance does not prove display or reading.</p>
  <div className="actions"><Link className="button" href={`/dashboard/${businessId}/campaigns/new`}>Create campaign</Link><Link href={`/dashboard/${businessId}`}>Dashboard</Link></div>
  <section className="screen-panel"><h2>Campaign history</h2>
   <div className="actions"><label>Status <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
    <option value="all">All</option>{['draft','scheduled','processing','paused','canceled','completed','completed_with_errors','failed'].map(status=><option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select></label>
    <label>Branch <select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="all">All</option>
     {config.branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
    <label>From <input type="date" value={fromFilter} onChange={e=>setFromFilter(e.target.value)}/></label>
    <label>To <input type="date" value={toFilter} onChange={e=>setToFilter(e.target.value)}/></label></div>
   {!shownCampaigns.length?<p>No campaigns match these filters.</p>:<div className="table-scroll"><table><thead><tr><th>Name</th><th>Status</th><th>Scheduled</th><th>Eligible members</th><th>Device attempts</th><th>Provider accepted</th><th>Failures</th><th>Observed clicks</th><th>Fulfilled claims</th><th>Actions</th></tr></thead><tbody>
   {shownCampaigns.map(c=><tr key={c.id}><th scope="row"><Link href={`/dashboard/${businessId}/campaigns/${c.id}/edit`}>{c.name}</Link></th><td>{c.status}</td>
    <td>{c.scheduledAt?new Date(c.scheduledAt).toLocaleString('en-PK'):'—'}</td><td>{c.eligibleAudience}</td><td>{c.deviceAttempts}</td><td>{c.providerAccepted}</td>
    <td>{c.failures}</td><td>{c.observedClicks}</td><td>{c.fulfilledClaims}</td><td><div className="actions">
     {['scheduled','processing'].includes(c.status)&&<Button variant="secondary" disabled={busy} onClick={()=>action(c,'pause')}>Pause</Button>}
     {c.status==='paused'&&<Button disabled={busy} onClick={()=>action(c,'resume')}>Resume</Button>}
     {['draft','scheduled','processing','paused'].includes(c.status)&&<Button variant="secondary" disabled={busy} onClick={()=>action(c,'cancel')}>Cancel</Button>}
     <Button variant="secondary" disabled={busy} onClick={()=>action(c,'duplicate')}>Duplicate</Button></div></td></tr>)}</tbody></table></div>}</section>
  {(!editId||selected)&&<section className="screen-panel"><h2>{selected?'Campaign detail':'New campaign'}</h2>
   {selected&&selected.status!=='draft'?<><p>{selected.title}</p><p>{selected.body}</p><p>Audience: {selected.audience}; {selected.suppressed} suppressed.</p>
    <p>Snapshot and content cannot be edited after scheduling. Duplicate to create another draft.</p></>:
   <form className="stack" onSubmit={save}><label className="field">Internal name<input required minLength={2} maxLength={100} value={form.name} onChange={e=>set('name',e.target.value)}/></label>
    <label className="field">Notification title <small>{Array.from(form.title.trim()).length}/80</small><input required value={form.title} onChange={e=>set('title',e.target.value)}/></label>
    <label className="field">Notification message <small>{Array.from(form.body.trim()).length}/500</small><textarea required value={form.body} onChange={e=>set('body',e.target.value)}/></label>
    <label className="field">Image (optional)<select value={form.imageAssetId} onChange={e=>set('imageAssetId',e.target.value)}>
     <option value="">No image</option>{config.images.map(image=><option key={image.id} value={image.id}>{image.id.slice(0,8)}</option>)}</select></label>
    <MediaUpload businessId={businessId} kind="offer" onAccepted={assetId=>{set('imageAssetId',assetId);void refresh();}}/>
    <label className="field">Destination<select value={form.destination} onChange={e=>set('destination',e.target.value as typeof form.destination)}><option value="card">My loyalty card</option><option value="offer">Offer</option></select></label>
    {form.destination==='offer'&&<label className="field">Offer<select required value={form.offerId} onChange={e=>set('offerId',e.target.value)}><option value="">Choose offer</option>{config.offers.map(offer=><option key={offer.id} value={offer.id}>{offer.title}</option>)}</select></label>}
    <label className="field">Audience<select value={form.audience} onChange={e=>set('audience',e.target.value as typeof form.audience)}><option value="all_opted_in">All opted in</option><option value="inactive">Inactive</option><option value="reward_ready">Reward ready</option><option value="near_reward">Near reward</option></select></label>
    {form.audience==='inactive'&&<label className="field">Days inactive<input type="number" min={7} max={365} value={form.inactiveDays} onChange={e=>set('inactiveDays',e.target.value)}/></label>}
    {['reward_ready','near_reward'].includes(form.audience)&&<label className="field">Target reward<select required value={form.targetRewardVersionId} onChange={e=>set('targetRewardVersionId',e.target.value)}><option value="">Choose reward</option>{config.rewards.map(reward=><option key={reward.id} value={reward.id}>{reward.title}</option>)}</select></label>}
    {form.audience==='near_reward'&&<label className="field">Units away<input type="number" min={1} max={1000} value={form.nearRewardUnits} onChange={e=>set('nearRewardUnits',e.target.value)}/></label>}
    <fieldset><legend>Recorded branch affiliation</legend><p>Join branch or a non-reversed qualifying purchase; location is not tracked.</p>{config.branches.map(branch=><label className="check-label" key={branch.id}><input type="checkbox" checked={form.branchIds.includes(branch.id)} onChange={e=>set('branchIds',e.target.checked?[...form.branchIds,branch.id]:form.branchIds.filter(id=>id!==branch.id))}/>{branch.name}</label>)}</fieldset>
    <fieldset><legend>Send time</legend><label className="check-label"><input type="radio" name="sendMode" checked={sendMode==='now'} onChange={()=>setSendMode('now')}/>Now</label>
     <label className="check-label"><input type="radio" name="sendMode" checked={sendMode==='schedule'} onChange={()=>setSendMode('schedule')}/>Schedule</label></fieldset>
    {sendMode==='schedule'&&<label className="field">Send at<input type="datetime-local" required value={form.scheduledAt} onChange={e=>set('scheduledAt',e.target.value)}/></label>}
    <label className="field">Stop sending after<input type="datetime-local" required value={form.expiresAt} onChange={e=>set('expiresAt',e.target.value)}/></label>
    <section className="notice"><strong>In-app notification preview</strong>
     {publicOfferImageUrl(config.images.find(image=>image.id===form.imageAssetId)?.path)&&<Image unoptimized
      src={publicOfferImageUrl(config.images.find(image=>image.id===form.imageAssetId)?.path)!} width={320} height={180} alt=""/>}
     <p>{form.title||'Notification title'}</p><p>{form.body||'Notification text'}</p>
     <p>Opens {form.destination==='offer'?config.offers.find(offer=>offer.id===form.offerId)?.title??'selected offer':'the recipient’s loyalty card'}.
      The lock-screen preview uses generic text for privacy. Audience estimates are provisional until the launch snapshot.</p></section>
    {draft&&<section className="screen-panel"><h3>Audience estimate</h3><Button type="button" variant="secondary" disabled={busy} onClick={()=>void previewAudience()}>Preview audience</Button>
     {audiencePreview&&<p>Estimated {audiencePreview.eligibleMembers} eligible members across {audiencePreview.subscribedDevices} active devices.
      {audiencePreview.excludedNoConsent} without marketing push consent; {audiencePreview.excludedAudienceOrBranch} outside the selected audience or branches;
      {audiencePreview.eligibleWithoutDevice} eligible members without an active device; {audiencePreview.cappedNow} currently at a weekly cap;
      {audiencePreview.quietHoursNow} currently in quiet hours. These can change before send.</p>}</section>}
    {draft&&<section className="screen-panel"><h3>Test on your device</h3><p>Only your own separately registered test device can receive a test.
     First <Link href="/app/notifications">enable notifications on this device</Link> if needed.</p>
     <div className="actions"><Button type="button" variant="secondary" disabled={busy} onClick={()=>void registerTestDevice(true)}>Register this browser as my test device</Button>
      <Button type="button" variant="secondary" disabled={busy} onClick={()=>void registerTestDevice(false)}>Remove this browser</Button>
      <Button type="button" variant="secondary" disabled={busy} onClick={()=>void refreshTestDevices()}>Refresh test status</Button></div>
     {testDevices&&<><label className="field">My test device<select value={selectedDevice} onChange={e=>setSelectedDevice(e.target.value)}>
      <option value="">Choose device</option>{testDevices.devices.map(device=><option key={device.id} value={device.id}>{device.browserLabel??'Registered browser'} · {device.id.slice(0,8)}</option>)}</select></label>
      <Button type="button" disabled={busy||!selectedDevice} onClick={()=>void sendTest()}>Send test to my registered test device</Button>
      {testDevices.recentTests.filter(item=>item.campaignId===draft.campaignId).map(item=><p key={item.id}>Test {item.id.slice(0,8)}: {item.status}
       {item.errorCode?` (${item.errorCode})`:''}. Provider acceptance does not prove display or reading.</p>)}</>}</section>}
    <div className="actions"><Button type="submit" disabled={busy}>{busy?'Saving…':'Save draft'}</Button>
     {draft&&<Button type="button" disabled={busy} onClick={schedule}>Review and {sendMode==='now'?'send':'schedule'}</Button>}</div></form>}</section>}
  {message&&<p role="status">{message}</p>}</main>;
}
