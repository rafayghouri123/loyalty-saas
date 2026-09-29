'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { batchInput } from './contracts';
import { whatsappRequest } from './client';
import { ManualBanner, WhatsAppNav } from './templates-ui';
import type { Config, Preview } from './types';

export function FollowupBatch({ businessId, initial, memberId }: { businessId: string; initial: Config; memberId?: string }) {
  const [name, setName] = useState(''), [templateId, setTemplate] = useState(''), [audience, setAudience] = useState('selected_members');
  const [members, setMembers] = useState(initial.members), [selected, setSelected] = useState<string[]>(memberId ? [memberId] : []), [query, setQuery] = useState(''), [offset, setOffset] = useState(0);
  const [days, setDays] = useState('30'), [reward, setReward] = useState(''), [offer, setOffer] = useState(''), [assignee, setAssignee] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null), [previewHash, setPreviewHash] = useState(''), [key, setKey] = useState(''), [keyInput, setKeyInput] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [confirmation, setConfirmation] = useState(false), [created, setCreated] = useState<string | null>(null);
  const template = initial.templates.find(t => t.id === templateId);
  const raw = { businessId, name, templateId, templateVersion: template?.version ?? 1, audience,
    memberIds: audience === 'selected_members' ? selected : [], inactiveDays: audience === 'inactive' ? Number(days) : null,
    targetRewardVersionId: reward || null, offerId: offer || null, assignedBusinessUserId: assignee || null };
  const hash = JSON.stringify(raw), stale = hash !== previewHash;
  async function inspect() {
    setBusy(true); setMessage(''); setPreview(null); setCreated(null);
    const parsed = batchInput.safeParse(raw);
    if (!parsed.success) { setMessage(parsed.error.issues[0]!.message); setBusy(false); return; }
    if ((audience === 'reward_ready' || template?.body.includes('{{reward_name}}')) && !reward || template?.body.includes('{{public_offer_url}}') && !offer) { setMessage('Select the reward or public offer required by this template.'); setBusy(false); return; }
    try { setPreview(await whatsappRequest<Preview>('preview-batch', parsed.data)); setPreviewHash(hash); if (!key || keyInput !== hash) { setKey(crypto.randomUUID()); setKeyInput(hash); } }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function create() {
    setConfirmation(false); setBusy(true); setMessage('');
    try { const result = await whatsappRequest<{ batchId: string; createdTasks: number; excluded: number }>('create-batch', { ...raw, idempotencyKey: key }); setCreated(result.batchId); setMessage(`${result.createdTasks} manual tasks created; ${result.excluded} excluded. No messages have been sent.`); setPreview(null); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function findMembers(nextOffset: number) {
    setBusy(true); setMessage('');
    try { setMembers(await whatsappRequest<Config['members']>('members', { businessId, query, offset: nextOffset })); setOffset(nextOffset); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <main id="main" className="container manual-followups"><h1>Create manual follow-up</h1><WhatsAppNav businessId={businessId}/><ManualBanner/>
    {!initial.marketingAvailable && <p role="alert">Marketing is unavailable while this cafe, programme or subscription is paused.</p>}
    <section className="screen-panel"><label className="field">Batch name<input value={name} onChange={e => setName(e.target.value)}/></label>
      <label className="field">Template<select value={templateId} onChange={e => setTemplate(e.target.value)}><option value="">Choose template</option>{initial.templates.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name} · v{t.version}</option>)}</select></label>
      <label className="field">Audience<select value={audience} onChange={e => setAudience(e.target.value)}><option value="selected_members">Selected members</option><option value="inactive">Inactive</option><option value="reward_ready">Reward ready</option></select></label>
      {audience === 'selected_members' && <fieldset><legend>Members · {selected.length}/100 selected</legend><label className="field">Search member names<input value={query} onChange={e => setQuery(e.target.value)}/></label><Button disabled={busy} variant="secondary" onClick={() => findMembers(0)}>Search members</Button>
        {!members.length && <p>No members in this scope.</p>}{members.map(m => <label className="check-label" key={m.id}><input type="checkbox" checked={selected.includes(m.id)} disabled={!selected.includes(m.id) && selected.length >= 100} onChange={e => setSelected(all => e.target.checked ? [...all, m.id] : all.filter(id => id !== m.id))}/>{m.name}</label>)}
        <div className="actions">{offset > 0 && <Button disabled={busy} variant="secondary" onClick={() => findMembers(offset - 25)}>Previous members</Button>}{members.length === 25 && <Button disabled={busy} variant="secondary" onClick={() => findMembers(offset + 25)}>Next members</Button>}</div>
      </fieldset>}
      {audience === 'inactive' && <label className="field">Inactive days<input type="number" min={7} max={365} value={days} onChange={e => setDays(e.target.value)}/><small>After the last non-reversed qualifying purchase; never-purchased members are excluded.</small></label>}
      <label className="field">Target reward{audience === 'reward_ready' || template?.body.includes('{{reward_name}}') ? ' (required)' : ' (optional)'}<select value={reward} onChange={e => setReward(e.target.value)}><option value="">Choose reward</option>{initial.rewards.map(r => <option value={r.id} key={r.id}>{r.title}</option>)}</select></label>
      <label className="field">Public offer{template?.body.includes('{{public_offer_url}}') ? ' (required)' : ' (optional)'}<select value={offer} onChange={e => setOffer(e.target.value)}><option value="">No offer</option>{initial.offers.map(o => <option value={o.id} key={o.id}>{o.title}</option>)}</select></label>
      <label className="field">Assign permitted staff (optional)<select value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">Unassigned</option>{initial.assignees.map(s => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}</select></label>
      <p>At most 100 tasks per batch. Each chat needs individual review. The server rechecks eligibility at creation and opening.</p>
      <Button disabled={busy || !initial.marketingAvailable} onClick={inspect}>{busy ? 'Working…' : 'Preview tasks'}</Button>
    </section>
    {preview && <section className="screen-panel"><h2>Eligibility preview</h2><p>{preview.eligible} consent-eligible contacts · {preview.excluded} exclusions · {preview.eligible} manual tasks</p>{stale && <p role="alert">Selections changed. Preview the current selection again.</p>}
      {preview.members.map(m => <article key={m.membershipId} className="notice"><h3>{m.name}</h3>{m.exclusion ? <p>Excluded: {m.exclusion.replaceAll('_', ' ')}</p> : <p style={{ whiteSpace: 'pre-wrap' }}>{m.body}</p>}{m.recentContactWarning && <p>Recent contact in the last 24 hours. A different task cannot open until the contact gate ends.</p>}</article>)}
      <Button disabled={busy || stale} onClick={() => setConfirmation(true)}>Create follow-up tasks</Button>
    </section>}
    <p role="status">{message}</p>{created && <Link href={`/dashboard/${businessId}/whatsapp?batch=${created}`}>View created tasks</Link>}
    {confirmation && <ConfirmDialog title="Create manual tasks?" description={`${preview?.eligible ?? 0} eligible tasks will be created. Each message must be reviewed and sent by a person in WhatsApp.`} confirmLabel="Create tasks" onCancel={() => setConfirmation(false)} onConfirm={() => void create()}/>}
  </main>;
}
