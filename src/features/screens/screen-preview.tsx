'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LoyaltyCard } from '@/components/loyalty-card';
import { Button } from '@/components/ui/button';
import { ContractField } from '@/components/ui/contract-field';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { ReportFilters } from '@/components/ui/report-filters';
import { allowed, visible, policy, type Access, type Action, type Field, type Screen, type Section } from './contracts';
import { initialValues, validateSections, validPhone, type Values } from './validation';
import { StatePreview } from './states';
import { screenStates, type ScreenState } from './state-copy';
import { OpeningHours, invalidHours, type Interval } from './opening-hours';
import { canView } from './role-shell';
import { EarningPreview } from './earning-preview';
import { TemplatePreview } from './template-preview';

const ScannerShell = dynamic(() => import('./scanner-shell'), { loading: () => <p role="status">Loading scanner controls…</p> });
const operationalStates = new Set<ScreenState>(['offline', 'expired', 'stale', 'invalid', 'processed', 'revoked', 'limited', 'paused', 'provider', 'uncertain', 'forbidden']);

export function ScreenPreview({ screen, access, initialState = 'ready', variant = '' }: { screen: Screen; access: Access; initialState?: ScreenState; variant?: string }) {
  const [values, setValues] = useState<Values>(() => ({ ...initialValues(screen), ...(screen.id === 'S02' ? { mode: variant === 'points' ? 'Points' : 'Stamps' } : {}) }));
  const [errors, setErrors] = useState<Values>({}), [status, setStatus] = useState('');
  const [dialog, setDialog] = useState<Action | null>(null), [state, setState] = useState<ScreenState>(initialState);
  const [tab, setTab] = useState(screen.tabs?.[0] ?? ''), [step, setStep] = useState(0), [restored, setRestored] = useState(false);
  const [dismissInstall, setDismissInstall] = useState(false), [referral, setReferral] = useState(true);
  const [openingHours, setOpeningHours] = useState<Interval[]>([]);
  const sectionTitle = useRef<HTMLHeadingElement>(null);
  const isWizard = screen.id === 'O01';
  const screenAllowed = canView(screen.id, access.role) && (screen.role !== 'owner' || access.role === 'owner' || isWizard) && allowed(access, undefined, screen.capability);
  useEffect(() => {
    if (!isWizard) return;
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem('loyalty-design-onboarding-v1') ?? '{}');
      if (saved && typeof saved === 'object') {
        const safe: Values = {};
        for (const field of screen.sections[0]!.fields ?? []) {
          const value = (saved as Record<string, unknown>)[field.id];
          if (field.kind !== 'file' && typeof value === 'string' && value.length <= 3000) safe[field.id] = value;
        }
        setValues(previous => ({ ...previous, ...safe }));
      }
    } catch { /* Storage can be unavailable in private browsing. The in-memory form still works. */ }
    setRestored(true);
  }, [isWizard, screen]);
  useEffect(() => {
    if (!isWizard || !restored) return;
    const safe = Object.fromEntries((screen.sections[0]!.fields ?? []).filter(field => field.kind !== 'file').map(field => [field.id, values[field.id] ?? '']));
    try { sessionStorage.setItem('loyalty-design-onboarding-v1', JSON.stringify(safe)); } catch { /* No secrets or customer data are stored. */ }
  }, [isWizard, restored, screen, values]);

  function change(id: string, value: string) {
    setValues(previous => ({ ...previous, [id]: value, ...(id === 'phone' ? { whatsapp: 'false' } : {}), ...(id === 'staffRole' && value === 'Cashier' ? { grant0: 'false', grant1: 'false', grant2: 'false', grant3: 'false' } : {}), ...(id === 'birthday' && value === 'false' ? { birthdayPush: 'false' } : {}) }));
    setErrors(previous => { const next = { ...previous }; delete next[id]; return next; }); setStatus('');
  }
  function validate(sections: Section[]) {
    if ((screen.id === 'O17' || (isWizard && step === 1)) && invalidHours(openingHours).length) { setStatus('Correct the overlapping or invalid opening-hour intervals before continuing.'); return false; }
    const next = validateSections(screen, values, access, sections);
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) { setStatus('Review the highlighted fields. Your input has been kept.'); requestAnimationFrame(() => { const element = document.getElementById(first); (element?.matches('fieldset') ? element.querySelector('input') : element)?.focus(); }); return false; }
    return true;
  }
  function perform(item: Action, section: Section) {
    if (item.label === 'Not now') { setDismissInstall(true); return; }
    if (item.label === 'Remove referral') { setReferral(false); return; }
    const validationSections = screen.id === 'O04' && ['Suspend membership', 'Reactivate membership'].includes(item.label) ? [{ ...section, fields: section.fields?.filter(field => field.id === 'adjustmentReason') }] : screen.id === 'O04' && item.label === 'Record WhatsApp opt-out' ? [{ ...section, fields: section.fields?.filter(field => field.id === 'reason') }] : ['O10', 'C07'].includes(screen.id) ? screen.sections : [section];
    if (item.validate && !validate(validationSections)) return;
    if (item.label === 'Confirm number from customer-initiated chat' && values.chatAttestation !== 'true') { setErrors({ chatAttestation: 'Confirm the customer-initiated chat first.' }); document.getElementById('chatAttestation')?.focus(); return; }
    if (item.label === 'Record opt-out' && !values.optoutNote?.trim()) { setErrors({ optoutNote: 'Enter the source and note for this opt-out.' }); document.getElementById('optoutNote')?.focus(); return; }
    if (item.confirm) { setDialog(item); return; }
    if (item.label === 'Refresh') { setStatus('Report unavailable. Previous values are cleared. Retry or narrow the date range.'); return; }
    setStatus(item.validate ? policy.valid : policy.unavailable);
  }
  function showAction(item: Action) {
    if (!allowed(access, item.roles, item.capability) || !visible(item.when, values)) return false;
    if (screen.id === 'P02') {
      if (item.label === 'Open my card') return variant === 'member';
      if (item.label === 'Join loyalty programme') return variant !== 'member' && state !== 'paused';
    }
    if (screen.id === 'C04') {
      if (['Claim offer', 'Show at checkout', 'Cancel claim presentation'].includes(item.label)) return ['discount', 'treat', 'claimed'].includes(variant);
      if (item.label === 'Open my card') return !['discount', 'treat', 'claimed'].includes(variant);
    }
    if (screen.id === 'A04') {
      if (item.label === 'Confirm payment') return values.decision === 'Confirm';
      if (item.label === 'Reject submission') return values.decision === 'Reject';
    }
    return true;
  }
  function showField(id: string) {
    if (screen.id !== 'O15') return true;
    return id === 'programme' ? ['Overview', 'Rewards'].includes(tab) : id === 'reward' ? tab === 'Rewards' : id === 'promotion' ? tab === 'Double slots' : id === 'campaign' ? tab === 'Campaigns' : true;
  }
  function displayField(field: Field): Field {
    if (field.id === 'mode' && screen.id === 'S02') return { ...field, disabled: 'Programme type comes from the authorized checkout context.' };
    if (field.id === 'birthday' && screen.id === 'C07' && variant !== 'birthday') return { ...field, disabled: 'Save a birthday in Account before enabling birthday offers.' };
    if (field.id === 'whatsapp' && !validPhone(values.phone ?? '')) return { ...field, disabled: 'Enter a valid WhatsApp number first.' };
    if (screen.id === 'O11' && field.id === 'terms') return { ...field, required: values.kind !== 'Informational', min: values.kind === 'Informational' ? 0 : 10 };
    if (screen.id === 'O13' && field.id === 'targetReward') return { ...field, required: values.audience === 'Reward ready' || Boolean(values.templateBody?.includes('{{reward_name}}')) };
    if (screen.id === 'O13' && field.id === 'offer') return { ...field, required: Boolean(values.templateBody?.includes('{{public_offer_url}}')) };
    if (screen.id === 'A04' && field.id === 'reviewNote') return { ...field, required: values.decision === 'Reject' };
    if (screen.id === 'S02' && field.id === 'claim') return { ...field, required: false };
    return field;
  }
  let sections = screen.sections.filter(section => allowed(access, section.roles, section.capability) && visible(section.when, values));
  if (screen.id === 'P04' && variant) sections = sections.filter(section => variant === 'mfa' ? section.title === 'Authenticator' : variant === 'invite' ? section.title === 'Invitation' : section.title === 'Your name');
  if (screen.id === 'O08') sections = sections.filter(section => section.title === tab);
  if (isWizard) sections = [screen.sections[step]!];
  if (screen.id === 'P02' && !referral) sections = sections.filter(section => section.title !== 'Join through a friend’s referral');
  if (screen.id === 'C01' && dismissInstall) sections = sections.filter(section => section.title !== 'Keep your cards handy');
  const rejoin = screen.id === 'P05' && variant === 'rejoin';
  const forbidden = !screenAllowed || state === 'forbidden' || state === 'revoked';

  return <main id="main" className="screen-main"><div className="fixture-notice">{policy.preview}</div><header className="screen-heading"><span className="eyebrow">{screen.id} · Design system / Phase 1</span><h1>{screen.title}</h1><p className="muted">{screen.description}</p></header>
    <div className="preview-toolbar"><label>Preview state<select value={state} onChange={event => { setState(event.target.value as ScreenState); setStatus(''); }}>{Object.entries(screenStates).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}</select></label><span className="microcopy">Permission preview: {access.role}. No live authorization is simulated.</span></div>
    <StatePreview state={forbidden ? 'forbidden' : state} onRetry={() => setState('ready')} />
    {!forbidden && state !== 'loading' && <>
      {screen.report && <ReportFilters />}
      {screen.tabs && <div className="tab-list" role="tablist" aria-label={`${screen.title} sections`}>{screen.tabs.map((label, index) => <button key={label} role="tab" id={`tab-${index}`} aria-controls="screen-tab-panel" aria-selected={tab === label} tabIndex={tab === label ? 0 : -1} onClick={() => { setTab(label); setStatus(''); }} onKeyDown={event => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const count = screen.tabs!.length;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (index + (event.key === 'ArrowRight' ? 1 : count - 1)) % count;
        setTab(screen.tabs![next]!); document.getElementById(`tab-${next}`)?.focus();
      }}>{label}</button>)}</div>}
      {isWizard && <nav aria-label="Onboarding steps"><ol className="wizard-steps">{screen.sections.map((section, index) => <li key={section.title} aria-current={index === step ? 'step' : undefined}>{section.title}</li>)}</ol></nav>}
      {['P02', 'C01', 'C02', 'O05', 'O06'].includes(screen.id) && state !== 'empty' && <div className="card-preview"><LoyaltyCard businessName="Sample neighbourhood cafe" accent={values.accent || '#166534'} programme={values.mode === 'Points' ? 'points' : 'stamps'} balance={state === 'stale' ? -4 : 6} rewardCost={8} rewardTitle="A cup on us · Sample reward" serverEligible={false} offlineUpdatedAt={state === 'offline' ? '2026-09-12T09:00:00Z' : undefined} /><p className="microcopy">Illustrative card · Not a real membership or reward.</p></div>}
      {['C02', 'C03'].includes(screen.id) && <div className="qr-placeholder" role="img" aria-label="Non-scannable QR placeholder"><span>QR appears after secure authorization</span><small>No token in this fixture</small></div>}
      {['S01', 'S03'].includes(screen.id) && !operationalStates.has(state) && <ScannerShell intent={screen.id === 'S03'} />}
      {rejoin && <p className="notice">Rejoin this existing membership. Balance and history are preserved. Marketing stays off; another referral reward is unavailable.</p>}
      <div id={screen.tabs ? 'screen-tab-panel' : undefined} role={screen.tabs ? 'tabpanel' : undefined} aria-labelledby={screen.tabs ? `tab-${screen.tabs.indexOf(tab)}` : undefined}>
      {screen.id === 'O15' && <section className="screen-panel"><h2>{tab} report</h2><p>No {tab.toLowerCase()} data loaded. Updated time is unavailable until a database read completes.</p></section>}
      {screen.id === 'O04' && <section className="screen-panel"><h2>{tab}</h2><p>No scoped {tab.toLowerCase()} records loaded.</p></section>}
      {sections.map((section, sectionIndex) => <section key={section.title} className="screen-panel"><h2 ref={sectionTitle} tabIndex={-1}>{section.title}</h2>
        {section.notes?.map(note => <p key={note} className="muted">{note}</p>)}
        {section.readouts && <dl className="readout-grid">{section.readouts.map(label => <div key={label}><dt>{label}</dt><dd>{label.startsWith('Multiplier:') || label.startsWith('Timezone:') || label.startsWith('Currency:') || label.startsWith('Included:') ? 'Fixed launch setting' : 'Not connected'}</dd></div>)}</dl>}
        <form noValidate onSubmit={event => { event.preventDefault(); const item = section.actions?.find(item => item.validate && allowed(access, item.roles, item.capability)); if (item) perform(item, section); }}>
          <div className="form-grid">{section.fields?.filter(field => visible(field.when, values) && allowed(access, field.roles) && showField(field.id) && !(rejoin && ['shareEmail', 'phone', 'whatsapp'].includes(field.id))).map(field => <ContractField key={field.id} field={displayField(field)} value={values[field.id] ?? ''} error={errors[field.id]} onChange={value => change(field.id, value)} disabled={operationalStates.has(state)} />)}</div>
          {section.actions && <div className="actions">{section.actions.filter(showAction).map((item, index) => item.to ? <Button asChild variant={index === 0 ? 'primary' : 'secondary'} key={item.label}><Link href={`/ui-fixtures/screens/${item.to}`}>{item.label}</Link></Button> : <Button key={item.label} type="button" variant={index === 0 ? 'primary' : 'secondary'} disabled={operationalStates.has(state) || (item.label === 'Use this reward' && variant !== 'eligible') || ['Confirm and award', 'Confirm reward given', 'Confirm offer applied', 'Copy referral link', 'Share', 'Publish programme', 'Download QR stand'].includes(item.label)} title={['Confirm and award', 'Confirm reward given', 'Confirm offer applied', 'Copy referral link', 'Share', 'Publish programme', 'Download QR stand'].includes(item.label) ? 'Requires validated, persisted server context.' : undefined} onClick={() => perform(item, section)}>{rejoin && item.label === 'Join and view my card' ? 'Rejoin programme' : item.label}</Button>)}</div>}
        </form>
        {section.columns && <DataTable title={section.title} columns={section.columns} empty={section.empty ?? 'No records loaded. Complete setup to begin.'} />}
        {!section.columns && section.empty && <p className="empty-table">{section.empty}</p>}
        {screen.id === 'O13' && sectionIndex === 0 && <div className="actions" aria-label="Template placeholders">{[['First name', 'first_name'], ['Cafe name', 'business_name'], ['Reward name', 'reward_name'], ['Public offer link', 'public_offer_url']].map(([label, token]) => <Button key={token} variant="ghost" onClick={() => change('templateBody', `${values.templateBody ?? ''}{{${token}}}`)}>{label}</Button>)}</div>}
        {screen.id === 'O13' && sectionIndex === 1 && <TemplatePreview values={values} />}
        {(screen.id === 'O05' || (isWizard && step === 2)) && <EarningPreview values={values} />}
        {screen.id === 'O07' && sectionIndex === 0 && values.view === 'Calendar' && <div className="calendar-grid" aria-label="Weekly slot calendar">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day}><strong>{day}</strong><p>No loaded slots</p></div>)}</div>}
        {['O10', 'O12'].includes(screen.id) && sectionIndex === 0 && <aside className="message-preview"><h3>Notification preview</h3><strong>{values.title || 'Your notification title'}</strong><p>{values.body || 'Your message will appear here.'}</p><small>Preview only. The operating system may truncate text.</small></aside>}
      </section>)}
      </div>
      {(screen.id === 'O17' || (isWizard && step === 1)) && <OpeningHours intervals={openingHours} onChange={setOpeningHours} />}
      {isWizard && <div className="actions"><Button variant="secondary" disabled={step === 0} onClick={() => { setStep(step - 1); setErrors({}); setStatus(''); }}>Back</Button><Button disabled={step === screen.sections.length - 1} onClick={() => { if (step === 4 || validate([screen.sections[step]!])) { setStep(step + 1); setStatus(''); requestAnimationFrame(() => sectionTitle.current?.focus()); } }}>Next step</Button>{step === 0 && <p className="microcopy">Step 1 is saved locally for this browser session. A configured plan is required to continue.</p>}</div>}
      <p role="status" className="screen-status">{status}</p>
    </>}
    {dialog && <ConfirmDialog title={dialog.label} description={dialog.confirm!} onCancel={() => setDialog(null)} onConfirm={() => { if (dialog.label === 'Use bill amount') change('eligible', values.bill ?? ''); setDialog(null); setStatus(policy.valid); }} />}
  </main>;
}
