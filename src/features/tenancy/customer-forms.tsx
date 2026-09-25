'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { joinSchema, type Cafe, type Configuration, type Membership } from './contracts';
import { mutate } from './mutate';

export function JoinForm({ cafe, configuration, displayName, membership, initialBranch, referralAttribution = false }: { cafe: Cafe; configuration: Configuration; displayName: string; membership?: Membership; initialBranch?: string; referralAttribution?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [referralSaved, setReferralSaved] = useState(referralAttribution);
  const terms = configuration.policies.find(p => p.kind === 'platform_terms');
  const privacy = configuration.policies.find(p => p.kind === 'privacy');
  const whatsapp = configuration.policies.find(p => p.kind === 'whatsapp_marketing');
  if (membership?.status === 'active') return <Link className="button" href={`/app/cards/${membership.id}`}>Open my card</Link>;
  if (membership && membership.status !== 'left') return <p>This membership cannot currently be reactivated. Contact the cafe.</p>;
  if (!cafe.canJoin || !terms || !privacy) return <p>Enrollment is currently unavailable. Existing cards and history remain accessible.</p>;
  const rejoin = membership?.status === 'left';
  return <form className="stack" aria-busy={pending} onSubmit={async e => {
    e.preventDefault(); setPending(true); setError(''); const f = new FormData(e.currentTarget);
    const parsed = joinSchema.safeParse({ businessSlug: cafe.slug, branchId: String(f.get('branchId') ?? membership?.joinedBranchId ?? cafe.branches[0]?.id),
      displayName: String(f.get('displayName') ?? membership?.displayName), shareVerifiedEmail: f.get('shareEmail') === 'on', phone, whatsappMarketingConsent: f.get('whatsapp') === 'on',
      acceptedProgrammeVersionId: cafe.programme.id, platformTermsDocumentId: terms.id, privacyDocumentId: privacy.id, rejoin });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the form.'); setPending(false); return; }
    try { const result = await mutate('/api/tenancy/join', parsed.data); window.location.assign(String(result.cardRoute)); }
    catch (err) { setError((err as Error).message); setPending(false); }
  }}>
    {rejoin ? <p>Rejoin with your existing {membership.units} {membership.programmeType}. Your history stays linked to this membership. Marketing stays off until you change Preferences.</p> : <>
      <label className="field">Display name<input name="displayName" required maxLength={80} defaultValue={displayName}/></label>
      <label className="field">Branch<select name="branchId" required defaultValue={cafe.branches.some(b => b.id === initialBranch) ? initialBranch : cafe.branches[0]?.id}>{cafe.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="check-label"><input name="shareEmail" type="checkbox"/>Share my verified email with this cafe</label>
      <label className="field">WhatsApp number (optional)<input type="tel" name="phone" value={phone} onChange={e => setPhone(e.target.value)}/><small>Only needed if you want WhatsApp follow-ups. Your number remains unverified.</small></label>
      {whatsapp && <><label className="check-label"><input name="whatsapp" type="checkbox" disabled={!phone.trim()}/>Receive WhatsApp offers from this cafe</label><p className="microcopy">{whatsapp.body} · {whatsapp.version}</p></>}
    </>}
    {referralSaved && !rejoin && <p className="screen-panel">A referral link is saved for this cafe. Benefits apply after your first eligible purchase under the referral terms. <button type="button" className="button button-secondary" onClick={async () => {
      try { await mutate('/api/referral/clear', { businessSlug: cafe.slug }); setReferralSaved(false); } catch (err) { setError((err as Error).message); }
    }}>Clear referral</button></p>}
    <p className="muted">A paused programme or expired subscription stops new earning and enrollment. Existing balances and permitted reward fulfillment remain available.</p>
    <label className="check-label"><input type="checkbox" required/>I accept the programme terms, <Link href={`/terms?document=${terms.id}`}>platform terms ({terms.version})</Link> and <Link href={`/privacy?document=${privacy.id}`}>privacy notice ({privacy.version})</Link>.</label>
    <Button type="submit" disabled={pending}>{pending ? 'Saving…' : rejoin ? 'Rejoin programme' : 'Join and view my card'}</Button>
    {error && <p role="alert" className="error-text">{error}</p>}
  </form>;
}

export type Preferences = { id: string; businessName: string; status: string; joinedAt: string; hasBirthday: boolean; contact: { phone: string | null; phoneStatus: string; sharedEmail: string | null; rowVersion: number }; consents: { channel: string; purpose: string; allowed: boolean; textVersion: string }[] };
const options = [
  ['push', 'marketing', 'push_marketing', 'Promotional push notifications'], ['push', 'reward_updates', 'push_reward', 'Reward update notifications'],
  ['inbox', 'birthday', 'inbox_birthday', 'Birthday offers'], ['push', 'birthday', 'push_birthday', 'Birthday push notifications'], ['whatsapp', 'marketing', 'whatsapp_marketing', 'Allow WhatsApp offers from this cafe'],
] as const;
export function PreferencesForm({ initial, policies, email }: { initial: Preferences; policies: Configuration['policies']; email: string }) {
  const [current, setCurrent] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  async function save(path: string, input: unknown) {
    setPending(true); setError(''); setMessage('');
    try { const result = await mutate(`/api/tenancy/${path}`, input); setCurrent(result as unknown as Preferences); setMessage('Saved.'); }
    catch (err) { setError((err as Error).message); } finally { setPending(false); }
  }
  return <div className="stack"><p>Joined {new Date(current.joinedAt).toLocaleDateString('en-PK')}. Status: {current.status}.</p>
    <form className="stack" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void save('contact', { membershipId: current.id, phone: String(f.get('phone')), shareVerifiedEmail: f.get('email') === 'on', rowVersion: current.contact.rowVersion }); }}>
      <label className="field">WhatsApp number<input type="tel" name="phone" defaultValue={current.contact.phone ?? ''}/><small>{current.contact.phoneStatus}. Changing your number resets WhatsApp consent and verification. Save the number before opting in again.</small></label>
      <label className="check-label"><input name="email" type="checkbox" defaultChecked={Boolean(current.contact.sharedEmail)}/>Share my verified email: {email}</label>
      <Button type="submit" disabled={pending}>Save contact preferences</Button>
    </form>
    <section className="stack"><h2>Consent for {current.businessName}</h2>{options.map(([channel, purpose, kind, label]) => {
      const policy = policies.find(p => p.kind === kind);
      const allowed = current.consents.some(c => c.channel === channel && c.purpose === purpose && c.allowed);
      const birthdayAllowed = current.consents.some(c => c.channel === 'inbox' && c.purpose === 'birthday' && c.allowed);
      return <div key={kind}><label className="check-label"><input type="checkbox" checked={allowed} disabled={pending || !policy || current.status !== 'active' || (channel === 'whatsapp' && !current.contact.phone) || (purpose === 'birthday' && !current.hasBirthday) || (channel === 'push' && purpose === 'birthday' && !birthdayAllowed)}
        onChange={e => void save('consent', { membershipId: current.id, channel, purpose, allowed: e.target.checked, textVersion: policy!.version })}/>{label}</label><p className="microcopy">{policy ? `${policy.body} · ${policy.version}` : 'Consent wording awaits publication.'}</p></div>;
    })}<p className="muted">Birthday offers need a saved birthday. Push delivery also requires a connected device and browser permission.</p><Link href="/app/notifications">Manage this device</Link></section>
    <Button variant="secondary" disabled={pending || current.status !== 'active'} onClick={() => setLeaving(true)}>Leave this loyalty programme</Button>
    {leaving && <ConfirmDialog title="Leave this programme?" description="Your balance and history remain linked to your account. Marketing consent is turned off. Rejoining keeps this same membership." confirmLabel="Leave programme" onCancel={() => setLeaving(false)} onConfirm={async () => {
      setPending(true); setError(''); try { await mutate('/api/tenancy/leave', { membershipId: current.id }); window.location.reload(); } catch (err) { setError((err as Error).message); setPending(false); setLeaving(false); }
    }}/>}
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="error-text">{error}</p>}
  </div>;
}
