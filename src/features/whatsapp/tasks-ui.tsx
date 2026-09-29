'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { taskAction, taskFilters } from './contracts';
import { whatsappRequest } from './client';
import { ManualBanner, WhatsAppNav } from './templates-ui';
import type { Config, TaskDetail, TaskList } from './types';

const states = ['pending', 'assigned', 'opened', 'staff_marked_sent', 'skipped', 'opted_out'];
const label = (state: string) => state.replaceAll('_', ' ');
const time = (value: string | null) => value ? new Date(value).toLocaleString('en-PK') : 'Never';
export function FollowupTasks({ businessId, config, initial, initialBatch = '' }: { businessId: string; config: Config; initial: TaskList; initialBatch?: string }) {
  const [data, setData] = useState<TaskList | null>(initial), [batch, setBatch] = useState(initialBatch), [state, setState] = useState(''), [assignee, setAssignee] = useState('');
  const [startDate, setStart] = useState(''), [endDate, setEnd] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function load(offset = 0) {
    setBusy(true); setMessage(''); setData(null);
    const parsed = taskFilters.safeParse({ businessId, batchId: batch || null, state: state || null, assigneeId: assignee || null, startDate: startDate || null, endDate: endDate || null, offset });
    if (!parsed.success) { setMessage('Check the filters and date range.'); setBusy(false); return; }
    try { setData(await whatsappRequest<TaskList>('tasks', parsed.data)); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <main id="main" className="container manual-followups"><h1>Manual WhatsApp follow-ups</h1><WhatsAppNav businessId={businessId}/><ManualBanner/>
    <section className="screen-panel"><h2>Filters</h2><form onSubmit={e => { e.preventDefault(); void load(); }}>
      <label className="field">Batch<select value={batch} onChange={e => { setBatch(e.target.value); setData(null); }}><option value="">All batches</option>{config.batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="field">Status<select value={state} onChange={e => { setState(e.target.value); setData(null); }}><option value="">All statuses</option>{states.map(s => <option value={s} key={s}>{label(s)}</option>)}</select></label>
      <label className="field">Assignee<select value={assignee} onChange={e => { setAssignee(e.target.value); setData(null); }}><option value="">All permitted staff</option>{config.assignees.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
      <label className="field">From date<input type="date" value={startDate} onChange={e => { setStart(e.target.value); setData(null); }}/></label>
      <label className="field">Through date<input type="date" value={endDate} onChange={e => { setEnd(e.target.value); setData(null); }}/></label><small>Optional range, at most 90 calendar days in the cafe timezone.</small>
      <Button disabled={busy}>{busy ? 'Loading…' : 'Apply filters / Refresh'}</Button></form></section>
    {message && <p role="alert">{message} <Button disabled={busy} variant="secondary" onClick={() => load()}>Retry</Button></p>}
    {data && <section className="screen-panel"><h2>Task activity</h2><p>{data.counts.opened} opened tasks · {data.counts.staffMarkedSent} staff-marked-sent tasks</p><p>Opening a chat does not confirm that a message was sent. Updated {time(data.dataAsOf)}.</p>
      {!data.tasks.length ? <p>No tasks match these filters. Create a follow-up to get started.</p> : <div className="table-scroll"><table><thead><tr><th>Customer</th><th>Batch</th><th>Assigned staff</th><th>Last contact</th><th>Status</th></tr></thead><tbody>{data.tasks.map(t => <tr key={t.id}><td><Link href={`/dashboard/${businessId}/whatsapp/tasks/${t.id}`}>{t.name}</Link></td><td>{t.batchName}</td><td>{t.assignedName ?? 'Unassigned'}</td><td>{time(t.lastContactAt)}</td><td>{label(t.state)}</td></tr>)}</tbody></table></div>}
      <div className="actions">{data.offset > 0 && <Button disabled={busy} variant="secondary" onClick={() => load(data.offset - 25)}>Previous tasks</Button>}{data.tasks.length === 25 && <Button disabled={busy} variant="secondary" onClick={() => load(data.offset + 25)}>Next tasks</Button>}</div>
    </section>}</main>;
}
export function FollowupTask({ businessId, config, initial }: { businessId: string; config: Config; initial: TaskDetail }) {
  const [task, setTask] = useState(initial), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [sent, setSent] = useState(false), [note, setNote] = useState(''), [assignee, setAssignee] = useState(initial.assignedId ?? ''), [confirming, setConfirming] = useState<'mark_sent' | 'skip' | 'opt_out' | 'reassign' | null>(null);
  const closed = !['pending', 'assigned', 'opened'].includes(task.state);
  const assignedElsewhere = Boolean(task.assignedId && task.assignedId !== task.staffId);
  const leaseElsewhere = Boolean(task.leaseOwnerId && task.leaseOwnerId !== task.staffId && task.leaseExpiresAt && Date.parse(task.leaseExpiresAt) > Date.now());
  const available = !closed && !assignedElsewhere && !leaseElsewhere && task.consent && task.memberActive && task.marketingAvailable && !task.contactStale && Boolean(task.body && task.phone);
  async function refresh() { setBusy(true); setMessage(''); try { setTask(await whatsappRequest<TaskDetail>('task-detail', { businessId, taskId: task.id })); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }
  async function open() {
    // Reserve a popup synchronously on this click; never auto-open after a timer.
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    setBusy(true); setMessage('');
    try {
      const result = await whatsappRequest<{ url: string; rowVersion: number; leaseExpiresAt: string }>('open-task', { businessId, taskId: task.id, rowVersion: task.rowVersion });
      const destination = new URL(result.url);
      if (destination.origin !== 'https://wa.me' || !/^\/[1-9][0-9]{7,14}$/u.test(destination.pathname)) throw new Error('The chat link is unavailable.');
      setTask(value => ({ ...value, state: 'opened', assignedId: task.staffId, leaseOwnerId: task.staffId, leaseExpiresAt: result.leaseExpiresAt, rowVersion: result.rowVersion }));
      setMessage('Chat opened. Review the message and press Send in WhatsApp; return here to record the result.');
      if (popup) popup.location.href = destination.href; else window.location.assign(destination.href);
    } catch (error) { popup?.close(); setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function act(action: NonNullable<typeof confirming>) {
    setConfirming(null); setBusy(true); setMessage('');
    const parsed = taskAction.safeParse({ businessId, taskId: task.id, rowVersion: task.rowVersion, action, attestsSent: sent, note, assignedBusinessUserId: assignee || null });
    if (!parsed.success) { setMessage(parsed.error.issues[0]!.message); setBusy(false); return; }
    try { setTask(await whatsappRequest<TaskDetail>('task-action', parsed.data)); setSent(false); setMessage(action === 'mark_sent' ? 'Recorded your human attestation. Delivery and reading are unknown.' : action === 'opt_out' ? 'WhatsApp marketing consent revoked. Pending tasks are suppressed.' : 'Task updated.'); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <main id="main" className="container manual-followups"><h1>Follow-up for {task.name}</h1><WhatsAppNav businessId={businessId}/><ManualBanner/>
    <section className="screen-panel"><h2>{task.batchName}</h2><p>Status: {label(task.state)}</p><p>Consent: {task.consent ? 'Allowed' : 'Opted out'} · Number: {task.phone ?? 'Not shared'} · {label(task.phoneStatus)}</p>
      <p>Opened: {time(task.openedAt)} · Staff-marked sent: {time(task.markedSentAt)}</p>
      {task.contactStale && <p role="alert">The contact changed. Skip this task and create a fresh task; this task cannot target the new number.</p>}
      {assignedElsewhere && <p>This task is assigned to another staff member.</p>}{leaseElsewhere && <p>Another staff member has a lease until {time(task.leaseExpiresAt)}.</p>}
      <h3>Saved message preview</h3><p style={{ whiteSpace: 'pre-wrap' }}>{task.body ?? 'Message content expired under the 90-day retention policy.'}</p>
      <div className="actions"><Button disabled={busy || !available} onClick={open}>Open WhatsApp</Button><Button disabled={busy} variant="secondary" onClick={refresh}>Refresh task</Button></div>
      <label className="check-label"><input type="checkbox" checked={sent} onChange={e => setSent(e.target.checked)}/>I personally sent this message in the cafe&apos;s WhatsApp account</label>
      <p>You can attest to already-sent manual work. The app does not observe the Send button.</p>
      <Button disabled={busy || !available || !sent} onClick={() => setConfirming('mark_sent')}>Mark as sent</Button>
      <label className="field">Source / note (required for opt-out; optional for skip)<textarea value={note} onChange={e => setNote(e.target.value)}/></label>
      <div className="actions"><Button disabled={busy || closed || assignedElsewhere || leaseElsewhere} variant="secondary" onClick={() => setConfirming('skip')}>Skip</Button><Button disabled={busy || note.trim().length < 2} variant="secondary" onClick={() => setConfirming('opt_out')}>Record opt-out</Button></div>
      <label className="field">Reassign permitted staff<select value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">Unassigned</option>{config.assignees.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><Button disabled={busy || closed || leaseElsewhere} variant="secondary" onClick={() => setConfirming('reassign')}>Reassign</Button>
      <p role="status">{message}</p>
    </section><section className="screen-panel"><h2>Recent communication history</h2>{!task.history.length ? <p>No recorded manual contact yet.</p> : <ul>{task.history.map((event, i) => <li key={i}>{time(event.occurredAt)} · {label(event.action)} · {event.actorName ?? 'Staff'}{event.note ? ` · ${event.note}` : ''}</li>)}</ul>}</section>
    {confirming && <ConfirmDialog title={confirming === 'mark_sent' ? 'Record message as sent?' : confirming === 'opt_out' ? 'Record WhatsApp opt-out?' : 'Update this task?'} description={confirming === 'mark_sent' ? 'This records your personal attestation only. It does not confirm delivery or reading.' : confirming === 'opt_out' ? 'This immediately turns off WhatsApp marketing consent and suppresses pending tasks for this customer at this cafe.' : 'This changes the task assignment or records it as skipped.'} confirmLabel="Confirm action" onCancel={() => setConfirming(null)} onConfirm={() => void act(confirming)}/>}
  </main>;
}
