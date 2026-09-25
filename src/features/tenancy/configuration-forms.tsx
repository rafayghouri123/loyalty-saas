'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from './owner-forms';
import { branchSchema, settingsSchema, profileSchema } from './contracts';
import { HoursEditor } from './hours-editor';
import { mutate } from './mutate';

export type Branch = { id: string; row_version: number; name: string; address: string; city: string; area: string | null; maps_url: string | null; phone: string | null; status: 'active' | 'inactive'; hours: { weekday: number; opensAt: string; closesAt: string }[] };
export function BranchForm({ businessId, initial }: { businessId: string; initial?: Branch }) {
  const [intervals, setIntervals] = useState(initial?.hours ?? []), [pending, setPending] = useState(false), [error, setError] = useState('');
  return <form className="stack" onSubmit={async e => { e.preventDefault(); setPending(true); setError(''); const f = Object.fromEntries(new FormData(e.currentTarget));
    try { const input = branchSchema.parse({ ...f, businessId, id: initial?.id ?? null, rowVersion: initial?.row_version ?? null, hours: intervals }); await mutate('/api/tenancy/branch', input); window.location.assign(`/dashboard/${businessId}/branches`); }
    catch (err) { setError((err as Error).message); setPending(false); }
  }}><Field name="name" label="Branch name" required minLength={2} maxLength={80} defaultValue={initial?.name}/><Field name="address" label="Address" required minLength={5} maxLength={300} defaultValue={initial?.address}/>
    <Field name="city" label="City" required minLength={2} maxLength={80} defaultValue={initial?.city}/><Field name="area" label="Area (optional)" maxLength={80} defaultValue={initial?.area ?? ''}/>
    <Field name="mapsUrl" label="Maps HTTPS URL (optional)" type="url" defaultValue={initial?.maps_url ?? ''}/><Field name="phone" label="Phone (optional)" type="tel" defaultValue={initial?.phone ?? ''}/>
    <label className="field">Status<select name="status" defaultValue={initial?.status ?? 'active'}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
    <p>Deactivate stops transactions at this branch. Pause participation before deactivating the last active branch. Historical records remain.</p><HoursEditor value={intervals} onChange={setIntervals}/>
    <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save branch'}</Button>{error && <p className="error-text" role="alert">{error}</p>}
  </form>;
}
export type BusinessSettings = { id: string; row_version: number; display_name: string; slug: string; status: string; description: string | null; accent_hex: string; public_contact_phone: string | null; support_email: string | null; menu_url: string | null; review_url: string | null; timezone: string; timezone_locked_at: string | null };
export function SettingsForm({ business: b }: { business: BusinessSettings }) {
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [confirm, setConfirm] = useState(false);
  return <div className="stack"><form className="stack" onSubmit={async e => { e.preventDefault(); setPending(true); setError('');
    try { const input = settingsSchema.parse({ ...Object.fromEntries(new FormData(e.currentTarget)), businessId: b.id, rowVersion: b.row_version }); await mutate('/api/tenancy/settings', input); window.location.reload(); }
    catch (err) { setError((err as Error).message); setPending(false); }
  }}><Field label="Business name" name="name" required minLength={2} maxLength={80} defaultValue={b.display_name}/><p>Slug: {b.slug} · PKR · Asia/Karachi</p><label className="field">Description<textarea name="description" maxLength={500} defaultValue={b.description ?? ''}/></label>
    <Field label="Accent colour" name="accentHex" type="color" defaultValue={b.accent_hex}/><Field label="Public phone" name="phone" type="tel" defaultValue={b.public_contact_phone ?? ''}/><Field label="Support email" name="supportEmail" type="email" defaultValue={b.support_email ?? ''}/>
    <Field label="Menu HTTPS URL" name="menuUrl" type="url" defaultValue={b.menu_url ?? ''}/><Field label="Neutral review HTTPS URL" name="reviewUrl" type="url" defaultValue={b.review_url ?? ''}/><p>Review links never award loyalty units.</p><Button type="submit" disabled={pending}>Save settings</Button></form>
    {['active', 'paused'].includes(b.status) && <Button variant="secondary" disabled={pending} onClick={() => setConfirm(true)}>{b.status === 'active' ? 'Pause participation' : 'Resume participation'}</Button>}
    {confirm && <ConfirmDialog title={`${b.status === 'active' ? 'Pause' : 'Resume'} participation?`} description="Pausing stops new enrollment, earning and marketing. Existing balances, history and permitted reward fulfillment remain available." confirmLabel="Confirm change" onCancel={() => setConfirm(false)} onConfirm={async () => {
      setPending(true); setError(''); try { await mutate('/api/tenancy/participation', { businessId: b.id, rowVersion: b.row_version, status: b.status === 'active' ? 'paused' : 'active' }); window.location.reload(); } catch (err) { setError((err as Error).message); setPending(false); setConfirm(false); }
    }}/>}{error && <p role="alert" className="error-text">{error}</p>}
  </div>;
}
export function ProfileSettingsForm({ profile }: { profile: { display_name: string; preferred_timezone: string; birthday_month: number | null; birthday_day: number | null; row_version: number } }) {
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  return <form className="stack" onSubmit={async e => { e.preventDefault(); setPending(true); setError(''); const f = new FormData(e.currentTarget);
    try { const input = profileSchema.parse({ displayName: f.get('name'), timezone: f.get('timezone'), birthdayMonth: f.get('month') ? Number(f.get('month')) : null, birthdayDay: f.get('day') ? Number(f.get('day')) : null, updateMembershipNames: f.has('names'), rowVersion: profile.row_version }); await mutate('/api/tenancy/profile', input); window.location.reload(); }
    catch (err) { setError((err as Error).message); setPending(false); }
  }}><Field label="Display name" name="name" required maxLength={80} defaultValue={profile.display_name}/><label className="check-label"><input name="names" type="checkbox"/>Also update my display name at my cafes</label>
    <Field label="Timezone" name="timezone" required list="timezones" defaultValue={profile.preferred_timezone}/><datalist id="timezones">{Intl.supportedValuesOf('timeZone').map(t => <option key={t} value={t}/>)}</datalist>
    <Field label="Birthday month (optional)" name="month" type="number" min={1} max={12} defaultValue={profile.birthday_month ?? ''}/><Field label="Birthday day (optional)" name="day" type="number" min={1} max={31} defaultValue={profile.birthday_day ?? ''}/>
    <p>Birthday changes are limited to once every 365 days after the first saved date. You can clear it at any time; clearing does not reset the cooldown. This does not enable marketing or share your birthday with cafes.</p>
    <Button type="submit" disabled={pending}>Save profile</Button>{error && <p role="alert" className="error-text">{error}</p>}
  </form>;
}
