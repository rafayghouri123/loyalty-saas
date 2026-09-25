import { notFound } from 'next/navigation';
import { fixturesEnabled } from '@/features/screens/fixture-gate';
import { OnboardingForm, ProgrammeForm, StaffForm, type Setup } from '@/features/tenancy/owner-forms';
import { JoinForm, PreferencesForm } from '@/features/tenancy/customer-forms';
import { BranchForm, ProfileSettingsForm } from '@/features/tenancy/configuration-forms';
import { MfaForm } from '@/features/tenancy/mfa-form';
import { PushRegistration } from '@/components/push-registration';
import type { Cafe, Configuration } from '@/features/tenancy/contracts';
export const dynamic = 'force-dynamic';
const id = (n: number) => `b2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const configuration: Configuration = { plans: [{ id: id(1), name: 'TEST plan — not an offer', pricePaisa: '100', billingPeriod: 'monthly', trialDays: 14, branchLimit: 2, staffLimit: 5 }],
  policies: ['platform_terms', 'privacy', 'whatsapp_marketing', 'push_marketing', 'push_reward', 'inbox_birthday', 'push_birthday'].map((kind, i) => ({ id: id(10 + i), kind, version: 'fixture-v1', body: 'TEST wording only. Not a published legal notice.', publishedAt: '2026-09-21T00:00:00Z' })) };
const cafe: Cafe = { id: id(20), slug: 'test-cafe', name: 'TEST cafe', description: 'Local UI fixture', accentHex: '#166534', status: 'active', timezone: 'Asia/Karachi', canJoin: true, menuUrl: null, reviewUrl: null, phone: null,
  programme: { id: id(21), name: 'TEST stamps', type: 'stamps', terms: 'TEST only: one stamp per qualifying purchase.', minimumSpendPaisa: '0', stampsPerPurchase: '1', spendStepPaisa: null, unitsPerStep: null, maxBaseUnitsPerPurchase: '1000' },
  branches: [{ id: id(22), name: 'TEST main branch', address: 'Fictional address', city: 'Lahore', mapsUrl: null, hours: [] }], rewards: [{ id: id(23), title: 'TEST treat', unitCost: '8', description: '', terms: 'TEST only: eight stamps for a treat.', branchIds: [id(22)] }] };
const setup: Setup = { business: { id: id(20), display_name: cafe.name, slug: cafe.slug, status: 'draft', row_version: 1, accent_hex: '#166534', timezone: 'Asia/Karachi', timezone_locked_at: null }, branches: [{ id: id(22), name: 'TEST main branch', status: 'active' }], programme: null, programmeVersion: null, rewardVersion: null, rewards: [], staff: [], invitations: [], subscription: { status: 'trial', periodEnd: '2026-10-05T00:00:00Z', entitled: true } };
export default async function Page({ searchParams }: { searchParams: Promise<{ form?: string }> }) {
  if (!fixturesEnabled()) notFound();
  const { form = 'onboarding' } = await searchParams;
  return <main id="main" className="container"><p className="notice">Local component test fixture. Sample data only; API results are not simulated by this page.</p><h1>Phase 2 {form} controls</h1>
    {form === 'onboarding' && <OnboardingForm plans={configuration.plans}/>}
    {form === 'programme' && <ProgrammeForm setup={setup}/>}
    {form === 'staff' && <StaffForm setup={setup}/>}
    {form === 'join' && <JoinForm cafe={cafe} configuration={configuration} displayName="TEST customer"/>}
    {form === 'preferences' && <PreferencesForm email="fixture@example.invalid" policies={configuration.policies} initial={{ id: id(30), businessName: cafe.name, status: 'active', joinedAt: '2026-09-21T00:00:00Z', hasBirthday: false, contact: { phone: null, phoneStatus: 'unverified', sharedEmail: null, rowVersion: 1 }, consents: [] }}/ >}
    {form === 'branch' && <BranchForm businessId={id(20)}/>}
    {form === 'profile' && <ProfileSettingsForm profile={{ display_name: 'TEST customer', preferred_timezone: 'Asia/Karachi', birthday_month: null, birthday_day: null, row_version: 1 }}/ >}
    {form === 'mfa' && <MfaForm factorId={id(40)} next="/workspace"/>}
    {form === 'push' && <PushRegistration userId={id(30)} configured/>}
  </main>;
}
