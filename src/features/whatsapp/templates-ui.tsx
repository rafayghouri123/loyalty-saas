'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { codePointLength } from '@/lib/validation/primitives';
import { placeholders, renderTemplate, templateInput, templateError } from './contracts';
import { whatsappRequest } from './client';
import type { Config, Template } from './types';

export function ManualBanner() { return <p className="notice">Messages are sent manually. Open each chat, review the text, and press Send in the cafe&apos;s WhatsApp account. This app cannot inspect which WhatsApp account is signed in, or confirm delivery or reading.</p>; }
export function WhatsAppNav({ businessId }: { businessId: string }) { return <nav className="actions" aria-label="WhatsApp tools"><Link href={`/dashboard/${businessId}/whatsapp`}>Follow-up tasks</Link><Link href={`/dashboard/${businessId}/whatsapp/templates`}>Templates</Link><Link href={`/dashboard/${businessId}/whatsapp/new`}>Create follow-up</Link></nav>; }
export function TemplatesManager({ businessId, initial }: { businessId: string; initial: Config }) {
  const [config, setConfig] = useState(initial), [editing, setEditing] = useState<Template | null>(null);
  const [name, setName] = useState(''), [body, setBody] = useState(''), [active, setActive] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const invalid = templateError(body);
  const preview = renderTemplate(body, { first_name: 'Sample', business_name: config.businessName });
  function edit(t: Template | null) { setEditing(t); setName(t?.name ?? ''); setBody(t?.body ?? ''); setActive(t?.active ?? true); setMessage(''); }
  async function save() {
    setBusy(true); setMessage('');
    const parsed = templateInput.safeParse({ businessId, templateId: editing?.id ?? null, rowVersion: editing?.rowVersion ?? null, name, body, active });
    if (!parsed.success) { setMessage(parsed.error.issues[0]!.message); setBusy(false); return; }
    try { await whatsappRequest('save-template', parsed.data); setConfig(await whatsappRequest<Config>('configuration', { businessId })); edit(null); setMessage('Template saved. Existing tasks retain their saved version.'); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <main id="main" className="container manual-followups"><h1>WhatsApp templates</h1><WhatsAppNav businessId={businessId}/><ManualBanner/>
    <section className="screen-panel"><h2>Saved templates</h2>{!config.templates.length ? <p>Create your first follow-up template.</p> : <ul>{config.templates.map(t => <li key={t.id}>{t.name} · Version {t.version} · {t.active ? 'Active' : 'Inactive'} <Button variant="secondary" onClick={() => edit(t)}>Edit {t.name}</Button></li>)}</ul>}<Button variant="secondary" onClick={() => edit(null)}>New template</Button></section>
    <section className="screen-panel"><h2>{editing ? 'Edit template' : 'Create template'}</h2><form onSubmit={e => { e.preventDefault(); void save(); }}>
      <label className="field">Template name<input required value={name} onChange={e => setName(e.target.value)}/></label>
      <label className="field">Message body <small>{codePointLength(body.trim())}/1000 characters</small><textarea required aria-invalid={Boolean(invalid)} aria-describedby="template-error" value={body} onChange={e => setBody(e.target.value)}/></label>
      <p id="template-error" className="error-text" role="status">{invalid}</p>
      <div className="actions">{placeholders.map((p, i) => <Button type="button" key={p} variant="secondary" onClick={() => setBody(value => value + `{{${p}}}`)}>{['First name', 'Cafe name', 'Reward name', 'Public offer link'][i]}</Button>)}</div>
      <label className="check-label"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/>Active template</label>
      <aside className="notice"><strong>Sample preview</strong><p>{preview.body ?? preview.error}</p><small>Sample name only. A reward or public offer placeholder needs its real selection on the batch form.</small></aside>
      <Button disabled={busy || Boolean(invalid)}>{busy ? 'Saving…' : 'Save template'}</Button><p role="status">{message}</p>
    </form></section></main>;
}
