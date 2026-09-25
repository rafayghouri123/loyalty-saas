'use client';
import { useEffect, useState, type InputHTMLAttributes } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { rupeesToPaisa } from '@/lib/validation/primitives';
import { bootstrapSchema, initialProgrammeSchema, hours as hoursSchema, type Configuration } from './contracts';
import { mutate } from './mutate';
import { HoursEditor, type Hours } from './hours-editor';
import { formatPaisa } from '@/lib/formatting';
import { LoyaltyCard } from '@/components/loyalty-card';

export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="field">{label}<input {...props}/></label>;
}
export function OnboardingForm({ plans }: { plans: Configuration['plans'] }) {
  const [step, setStep] = useState(1), [pending, setPending] = useState(false), [error, setError] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [hours, setHours] = useState<Hours>([]);
  const [slugMessage, setSlugMessage] = useState('');
  useEffect(() => { try { const saved = JSON.parse(sessionStorage.getItem('loyalty-business-draft') ?? '{}');
    const storedHours = hoursSchema.safeParse(saved.hours); if (storedHours.success) setHours(storedHours.data);
    if (saved && typeof saved === 'object') setDraft(Object.fromEntries(Object.entries(saved).filter(([key, value]) => ['planVersionId', 'name', 'slug', 'description', 'accentHex', 'branchName', 'address', 'city', 'area', 'mapsUrl', 'phone'].includes(key) && typeof value === 'string')) as Record<string, string>);
  } catch { /* Corrupt/blocked browser storage does not create a business. */ } setLoaded(true); }, []);
  useEffect(() => { if (loaded) { try { sessionStorage.setItem('loyalty-business-draft', JSON.stringify({ ...draft, hours })); } catch { /* Optional browser storage. */ } } }, [draft, hours, loaded]);
  if (!loaded) return <p>Loading your browser-session draft…</p>;
  const selected = plans.find(p => p.id === draft.planVersionId) ?? plans[0];
  return <form key={step} className="stack" aria-busy={pending} onSubmit={async e => {
    e.preventDefault(); setError(''); const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>; const next = { ...draft, ...f };
    setDraft(next); try { sessionStorage.setItem('loyalty-business-draft', JSON.stringify({ ...next, hours })); } catch { /* Storage is optional. */ }
    if (step === 1) { setStep(2); return; }
    setPending(true);
    const parsed = bootstrapSchema.safeParse({ ...next, hours });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the form.'); setPending(false); return; }
    try { const result = await mutate('/api/tenancy/bootstrap', parsed.data); try { sessionStorage.removeItem('loyalty-business-draft'); } catch { /* Persistence already committed. */ } window.location.assign(`/dashboard/${result.businessId}`); }
    catch (err) { setError((err as Error).message); setPending(false); }
  }}>
    <p>Step {step} of 6 · {step === 1 ? 'Business' : 'First branch'}. Your trial starts when branch details are saved.</p>
    {step === 1 ? <><label className="field">Published plan<select name="planVersionId" defaultValue={selected?.id} required onChange={e => setDraft(d => ({ ...d, planVersionId: e.target.value }))}>{plans.map(p => <option key={p.id} value={p.id}>{p.name} · {p.billingPeriod} · {p.trialDays} trial days</option>)}</select></label>
      {selected && <p>{formatPaisa(selected.pricePaisa)} / {selected.billingPeriod}; {selected.branchLimit} branches, {selected.staffLimit} staff. Trial: {selected.trialDays} days from successful setup.</p>}
      <Field name="name" label="Business name" required minLength={2} maxLength={80} defaultValue={draft.name}/>
      <Field name="slug" label="Public URL slug" required pattern="[a-z0-9][a-z0-9-]{1,48}[a-z0-9]" defaultValue={draft.slug} onBlur={async e => {
        const slug = e.target.value; if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/u.test(slug)) return;
        try { const available = await mutate('/api/tenancy/check-slug', { slug }); setSlugMessage(`${slug}: ${available as unknown === true ? 'available now' : 'unavailable'}. Availability is confirmed again when you save.`); }
        catch { setSlugMessage('Availability will be checked when you save.'); }
      }}/><small role="status">{slugMessage || 'Availability is confirmed when you save your first branch.'}</small>
      <label className="field">Description (optional)<textarea name="description" maxLength={500} defaultValue={draft.description}/></label>
      <Field name="accentHex" label="Accent colour" type="color" defaultValue={draft.accentHex ?? '#166534'}/><p>Logo and cover uploads become available after saving branch details.</p>
    </> : <><Field name="branchName" label="Branch name" required minLength={2} maxLength={80} defaultValue={draft.branchName}/>
      <Field name="address" label="Address" required minLength={5} maxLength={300} defaultValue={draft.address}/><Field name="city" label="City" required minLength={2} maxLength={80} defaultValue={draft.city}/>
      <Field name="area" label="Area (optional)" maxLength={80} defaultValue={draft.area}/><Field name="mapsUrl" label="Maps HTTPS link (optional)" type="url" defaultValue={draft.mapsUrl}/>
      <Field name="phone" label="Branch phone (optional)" type="tel" defaultValue={draft.phone}/><HoursEditor value={hours} onChange={setHours}/>
      <Button type="button" variant="secondary" onClick={e => { const form = e.currentTarget.form!; setDraft(d => ({ ...d, ...Object.fromEntries(new FormData(form)) as Record<string, string> })); setStep(1); }}>Back</Button>
    </>}
    <Button type="submit" disabled={pending}>{pending ? 'Saving…' : step === 1 ? 'Continue to branch' : 'Save branch and start trial'}</Button>
    {error && <p className="error-text" role="alert">{error}</p>}
  </form>;
}

export type Setup = { business: { id: string; display_name: string; slug: string; status: string; row_version: number; accent_hex: string; timezone: string; timezone_locked_at: string | null }; branches: { id: string; name: string; status: string }[];
  programme: { type: 'stamps' | 'points'; name: string } | null;
  programmeVersion: { id: string; minimum_spend_paisa: string; stamps_per_purchase: string | null; spend_step_paisa: string | null; units_per_step: string | null; max_base_units_per_purchase: string; terms: string } | null;
  rewardVersion: { id: string; title: string; unit_cost: string; description: string; terms: string; estimated_cost_paisa: string | null; branch_ids: string[] } | null; rewards: { id: string }[];
  subscription: { status: string; periodEnd: string; entitled: boolean; withinGrace?: boolean; graceEndsAt?: string };
  staff: { id: string; name: string; email: string; role: string; status: string; rowVersion: number; branchIds: string[]; canManageCampaigns: boolean; canContactCustomers: boolean; canReverseTransactions: boolean; canExportReports: boolean }[];
  invitations: { id: string; email: string; role: string; status: string; expiresAt: string; rowVersion: number; branchIds: string[] }[] };

export function ProgrammeForm({ setup }: { setup: Setup }) {
  const [step, setStep] = useState(3), [mode, setMode] = useState(setup.programme?.type ?? 'stamps'), [pending, setPending] = useState(false), [error, setError] = useState('');
  const toRupees = (value: string | null | undefined) => value == null ? '' : `${BigInt(value) / 100n}.${(BigInt(value) % 100n).toString().padStart(2, '0')}`;
  const [draft, setDraft] = useState<Record<string, FormDataEntryValue>>((): Record<string, FormDataEntryValue> => setup.programmeVersion ? {
    name: setup.programme?.name ?? '', minimum: toRupees(setup.programmeVersion.minimum_spend_paisa), stamps: setup.programmeVersion.stamps_per_purchase ?? '1',
    spendStep: toRupees(setup.programmeVersion.spend_step_paisa) || '100', units: setup.programmeVersion.units_per_step ?? '1', cap: setup.programmeVersion.max_base_units_per_purchase,
    terms: setup.programmeVersion.terms, rewardTitle: setup.rewardVersion?.title ?? '', rewardCost: setup.rewardVersion?.unit_cost ?? '', rewardDescription: setup.rewardVersion?.description ?? '',
    rewardTerms: setup.rewardVersion?.terms ?? '', estimatedCost: toRupees(setup.rewardVersion?.estimated_cost_paisa),
  } : {});
  const [selectedBranches, setSelectedBranches] = useState(setup.rewardVersion?.branch_ids ?? (setup.branches.length === 1 ? [setup.branches[0]!.id] : []));
  return <form key={step} className="stack" onSubmit={async e => {
    e.preventDefault(); setError(''); const f = new FormData(e.currentTarget); const d = { ...draft, ...Object.fromEntries(f) }; setDraft(d);
    if (step === 3) { setStep(4); return; }
    setPending(true);
    try {
      const parsed = initialProgrammeSchema.parse({ businessId: setup.business.id, rowVersion: setup.business.row_version, type: mode, name: d.name,
        minimumSpendPaisa: rupeesToPaisa(String(d.minimum)), stampsPerPurchase: mode === 'stamps' ? String(d.stamps) : null,
        spendStepPaisa: mode === 'points' ? rupeesToPaisa(String(d.spendStep)) : null, unitsPerStep: mode === 'points' ? String(d.units) : null,
        maxBaseUnitsPerPurchase: String(d.cap), terms: d.terms, rewardTitle: d.rewardTitle, rewardUnitCost: String(d.rewardCost), rewardDescription: d.rewardDescription,
        rewardTerms: d.rewardTerms, rewardBranchIds: f.getAll('branches'), estimatedCostPaisa: d.estimatedCost ? rupeesToPaisa(String(d.estimatedCost)) : null });
      await mutate('/api/tenancy/programme', parsed); window.location.reload();
    } catch (err) { setError(err instanceof Error ? err.message : 'Check the form.'); setPending(false); }
  }}><h2>Step {step}: {step === 3 ? 'Programme' : 'First reward'}</h2>
    {step === 3 ? <><Field label="Programme name" name="name" required minLength={2} maxLength={80} defaultValue={String(draft.name ?? '')}/>
      <label className="field">Programme type<select value={mode} onChange={e => setMode(e.target.value as 'stamps' | 'points')}><option value="stamps">Stamps</option><option value="points">Points</option></select></label>
      <Field label="Minimum eligible spend (Rs)" name="minimum" required inputMode="decimal" defaultValue={String(draft.minimum ?? '0')}/>
      {mode === 'stamps' ? <Field label="Stamps per qualifying purchase" name="stamps" type="number" min={1} max={10} required defaultValue={String(draft.stamps ?? '1')}/> : <><Field label="Spend step (Rs)" name="spendStep" required inputMode="decimal" defaultValue={String(draft.spendStep ?? '100')}/><Field label="Points per step" name="units" type="number" min={1} max={1000} required defaultValue={String(draft.units ?? '1')}/></>}
      <Field label="Maximum base units per purchase" name="cap" type="number" min={1} max={100000} required defaultValue={String(draft.cap ?? '1000')}/>
      <label className="field">Programme terms<textarea name="terms" required minLength={10} maxLength={3000} defaultValue={String(draft.terms ?? '')}/></label>
      <p>Eligible spend is paid eligible goods after discounts, excluding tax and tips. Staff enter and attest purchases; no POS verification is implied.</p>
    </> : <><Field label="Reward title" name="rewardTitle" required minLength={2} maxLength={80} defaultValue={String(draft.rewardTitle ?? '')}/>
      <Field label="Required units" name="rewardCost" type="number" min={1} max={1000000} required defaultValue={String(draft.rewardCost ?? '')}/>
      <label className="field">Description (optional)<textarea name="rewardDescription" maxLength={500} defaultValue={String(draft.rewardDescription ?? '')}/></label>
      <label className="field">Reward terms<textarea name="rewardTerms" required minLength={10} maxLength={2000} defaultValue={String(draft.rewardTerms ?? '')}/></label>
      <fieldset><legend>Eligible branches</legend>{setup.branches.filter(b => b.status === 'active').map(b => <label className="check-label" key={b.id}><input type="checkbox" name="branches" value={b.id} checked={selectedBranches.includes(b.id)} onChange={e => setSelectedBranches(ids => e.target.checked ? [...ids, b.id] : ids.filter(id => id !== b.id))}/>{b.name}</label>)}</fieldset>
      <Field label="Estimated fulfillment cost (Rs, optional)" name="estimatedCost" inputMode="decimal" defaultValue={String(draft.estimatedCost ?? '')}/>
      <Button type="button" variant="secondary" onClick={e => { setDraft(d => ({ ...d, ...Object.fromEntries(new FormData(e.currentTarget.form!)) })); setStep(3); }}>Back</Button>
    </>}
    <Button type="submit" disabled={pending}>{pending ? 'Saving…' : step === 3 ? 'Continue to reward' : 'Save programme and reward drafts'}</Button>{error && <p role="alert" className="error-text">{error}</p>}
  </form>;
}

export function PublishControl({ setup }: { setup: Setup }) {
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  return <section className="screen-panel"><h2>Steps 5–6: Staff and publication</h2><Link href={`/dashboard/${setup.business.id}/staff`}>Invite staff (optional)</Link>
    {setup.programme && setup.rewardVersion && <><p>Saved customer-card preview · zero example units, no transaction</p><LoyaltyCard businessName={setup.business.display_name} accent={setup.business.accent_hex} programme={setup.programme.type} balance={0} rewardTitle={setup.rewardVersion.title} rewardCost={Number(setup.rewardVersion.unit_cost)} serverEligible={false}/><p>{setup.programmeVersion?.terms}</p><p>{setup.rewardVersion.terms}</p></>}
    <ul><li>Programme: {setup.programmeVersion ? 'Saved' : 'Required'}</li><li>Rewards: {setup.rewards.length ? 'Saved' : 'Required'}</li><li>Subscription: {setup.subscription.entitled ? 'Available' : 'Participation unavailable'}</li></ul>
    <p>Publishing checks current policies, branch eligibility and subscription limits in one transaction. Demo transactions belong only in a separate test environment.</p>
    <Button disabled={pending || !setup.programmeVersion || !setup.rewards.length} onClick={async () => { setPending(true); setError('');
      try { await mutate('/api/tenancy/publish', { businessId: setup.business.id, rowVersion: setup.business.row_version }); window.location.reload(); }
      catch (err) { setError((err as Error).message); setPending(false); }
    }}>{pending ? 'Publishing…' : 'Publish programme'}</Button>{error && <p role="alert" className="error-text">{error}</p>}</section>;
}

export function StaffForm({ setup }: { setup: Setup }) {
  const [role, setRole] = useState('cashier'), [pending, setPending] = useState(false), [error, setError] = useState(''), [inviteUrl, setInviteUrl] = useState('');
  const [current, setCurrent] = useState(setup);
  const [editing, setEditing] = useState<Setup['staff'][number] | null>(null);
  async function revoke(id: string, rowVersion: number, action: string) {
    setPending(true); setError('');
    try { await mutate('/api/tenancy/staff', { businessId: setup.business.id, id, rowVersion, action }); window.location.reload(); }
    catch (err) { setError((err as Error).message); setPending(false); }
  }
  async function resend(id: string, rowVersion: number) {
    setPending(true); setError(''); setInviteUrl('');
    try { const result = await mutate('/api/tenancy/resend-invite', { businessId: setup.business.id, invitationId: id, rowVersion });
      setInviteUrl(`${window.location.origin}/invite/${result.token}`);
      setCurrent(s => ({ ...s, invitations: s.invitations.map(i => i.id === id ? { ...i, expiresAt: String(result.expiresAt), rowVersion: Number(result.rowVersion) } : i) }));
    } catch (err) { setError((err as Error).message); } finally { setPending(false); }
  }
  return <div className="stack"><form key={editing?.id ?? 'invite'} className="stack" onSubmit={async e => { e.preventDefault(); setPending(true); setError(''); setInviteUrl(''); const f = new FormData(e.currentTarget);
    try { const fields = { businessId: setup.business.id, role, branchIds: f.getAll('branches'), canManageCampaigns: role === 'manager' && f.has('campaigns'), canContactCustomers: role === 'manager' && f.has('contacts'), canReverseTransactions: role === 'manager' && f.has('reversals'), canExportReports: role === 'manager' && f.has('exports') };
      if (editing) { await mutate('/api/tenancy/staff', { ...fields, id: editing.id, rowVersion: editing.rowVersion, action: 'edit' }); window.location.reload(); return; }
      const result = await mutate('/api/tenancy/invite', { ...fields, email: f.get('email') });
      setInviteUrl(`${window.location.origin}/invite/${result.token}`); setCurrent(s => ({ ...s, invitations: [...s.invitations, { id: String(result.invitationId), email: String(f.get('email')), role, status: 'pending', expiresAt: String(result.expiresAt), rowVersion: 1, branchIds: f.getAll('branches').map(String) }] }));
    } catch (err) { setError((err as Error).message); } finally { setPending(false); }
  }}><h2>{editing ? 'Edit assignment' : 'Invite staff'}</h2><Field label="Staff email" name="email" type="email" required maxLength={254} defaultValue={editing?.email} readOnly={Boolean(editing)}/><label className="field">Role<select value={role} onChange={e => setRole(e.target.value)}><option value="cashier">Cashier</option><option value="manager">Manager</option></select></label>
    <fieldset><legend>Assigned branches</legend>{setup.branches.filter(b => b.status === 'active').map(b => <label className="check-label" key={b.id}><input name="branches" type="checkbox" value={b.id} defaultChecked={editing?.branchIds.includes(b.id)}/>{b.name}</label>)}</fieldset>
    {role === 'manager' && <fieldset><legend>Additional manager permissions</legend>{[['campaigns', 'Campaign management', editing?.canManageCampaigns], ['contacts', 'Customer follow-ups', editing?.canContactCustomers], ['reversals', 'Transaction reversals', editing?.canReverseTransactions], ['exports', 'Report exports', editing?.canExportReports]].map(([key, label, checked]) => <label className="check-label" key={String(key)}><input type="checkbox" name={String(key)} defaultChecked={Boolean(checked)}/>{label}</label>)}</fieldset>}
    <Button type="submit" disabled={pending}>{pending ? 'Saving…' : editing ? 'Save assignment' : 'Create invitation'}</Button>{editing && <Button type="button" variant="secondary" onClick={() => { setEditing(null); setRole('cashier'); }}>Cancel editing</Button>}
  </form>{inviteUrl && <section className="notice"><p>Invitation created. Share this one-time link privately with the invited person. No email was sent.</p><input aria-label="Private invitation link" readOnly value={inviteUrl}/></section>}
    <h2>Staff</h2>{current.staff.map(s => <section key={s.id} className="screen-panel"><strong>{s.name}</strong><p>{s.email} · {s.role} · {s.status}</p><p>{s.branchIds.map(id => setup.branches.find(b => b.id === id)?.name).join(', ')}</p><p>{[s.canManageCampaigns && 'Campaigns', s.canContactCustomers && 'Contact', s.canReverseTransactions && 'Reversals', s.canExportReports && 'Exports'].filter(Boolean).join(' · ')}</p>{s.role !== 'owner' && s.status === 'active' && <div className="actions"><Button disabled={pending} variant="secondary" onClick={() => { setEditing(s); setRole(s.role); }}>Edit assignment</Button><Button disabled={pending} variant="secondary" onClick={() => void revoke(s.id, s.rowVersion, 'revoke')}>Revoke access</Button></div>}</section>)}
    <h2>Invitations</h2>{current.invitations.map(i => <section key={i.id} className="screen-panel"><p>{i.email} · {i.role} · {i.status}</p><p>Expires {new Date(i.expiresAt).toLocaleString('en-PK')}</p>{i.status === 'pending' && <div className="actions"><Button disabled={pending} variant="secondary" onClick={() => void resend(i.id, i.rowVersion)}>Replace invitation link</Button><Button disabled={pending} variant="secondary" onClick={() => void revoke(i.id, i.rowVersion, 'revoke_invite')}>Revoke invitation</Button></div>}</section>)}
    {error && <p role="alert" className="error-text">{error}</p>}
  </div>;
}

export function AcceptInvitation({ token }: { token: string }) {
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  return <><Button disabled={pending} onClick={async () => { setPending(true); setError(''); try { await mutate('/api/tenancy/accept-invite', { token }); window.location.assign('/workspace'); } catch (err) { setError((err as Error).message); setPending(false); } }}>{pending ? 'Accepting…' : 'Accept invitation'}</Button>{error && <p role="alert" className="error-text">{error}</p>}</>;
}
