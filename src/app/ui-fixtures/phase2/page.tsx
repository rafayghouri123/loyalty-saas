import { notFound } from 'next/navigation';
import { fixturesEnabled } from '@/features/screens/fixture-gate';
import { OnboardingForm, ProgrammeForm, StaffForm, type Setup } from '@/features/tenancy/owner-forms';
import { ProgrammeEditor, RewardsEditor, type Config as ProgrammeConfig } from '@/features/loyalty/owner-configuration';
import { PurchaseCheckout } from '@/features/loyalty/staff-flow';
import { CardDetail, type Card } from '@/features/loyalty/customer-card';
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
const editConfig: ProgrammeConfig = { programme: { id: id(21), name: 'TEST stamps', type: 'stamps', status: 'published', rowVersion: 1, versions: [{ id: id(24), version: 1, name: 'TEST stamps', status: 'published', effectiveAt: '2026-09-21T00:00:00Z', minimumSpendPaisa: '0', stampsPerPurchase: 1, spendStepPaisa: null, unitsPerStep: null, maxBaseUnitsPerPurchase: 1000, terms: 'TEST only: one stamp per qualifying purchase.' }] }, rewards: [], branches: [{ id: id(22), name: 'TEST main branch' }] };
const rewardConfig: ProgrammeConfig = { ...editConfig, rewards: [{ id: id(25), name: 'TEST treat', status: 'draft', rowVersion: 1, publishedVersionId: null, draftVersionId: id(26), programmeName: 'TEST stamps', unitCost: 8, branchIds: [id(22)], fulfillmentCount: 0,
  draftVersion: { title: 'TEST treat', unitCost: 8, description: 'Sample reward', terms: 'TEST only: eight stamps for a treat.', estimatedCostPaisa: '15000', branchIds: [id(22)] }, publishedVersion: null }] };
const publishedRewardConfig: ProgrammeConfig = { ...editConfig, rewards: [{ ...rewardConfig.rewards[0]!, status: 'published', rowVersion: 3,
  publishedVersionId: id(27), draftVersionId: null, draftVersion: null,
  publishedVersion: { title: 'TEST published treat', unitCost: 10, description: 'Published reward', terms: 'TEST only: ten stamps for a treat.', estimatedCostPaisa: '18000', branchIds: [id(22)] } }] };
const customerCard: Card = { id:id(29),businessId:id(20),name:'TEST cafe',memberName:'TEST customer',status:'active',units:'1',ledgerVersion:'1',
  programmeName:'TEST stamps',programmeType:'stamps',rewards:[],activity:[] };
export default async function Page({ searchParams }: { searchParams: Promise<{ form?: string }> }) {
  if (!fixturesEnabled()) notFound();
  const { form = 'onboarding' } = await searchParams;
  return <main id="main" className="container"><p className="notice">Local component test fixture. Sample data only; API results are not simulated by this page.</p><h1>Phase 2 {form} controls</h1>
    {form === 'onboarding' && <OnboardingForm plans={configuration.plans}/>}
    {form === 'programme' && <ProgrammeForm setup={setup}/>}
    {form === 'programme-new' && <ProgrammeForm setup={{ ...setup, business: { ...setup.business, status: 'active' } }} additional/>}
    {form === 'programme-edit' && <ProgrammeEditor businessId={id(20)} initial={editConfig}/>}
    {form === 'reward-new' && <RewardsEditor businessId={id(20)} initial={editConfig}/>}
    {form === 'reward-edit' && <RewardsEditor businessId={id(20)} initial={rewardConfig} editId={id(25)}/>}
    {form === 'reward-edit-published' && <RewardsEditor businessId={id(20)} initial={publishedRewardConfig} editId={id(25)}/>}
    {form === 'staff-checkout' && <PurchaseCheckout businessId={id(20)}/>}
    {form === 'customer-card' && <CardDetail initial={customerCard}/>}
    {form === 'staff' && <StaffForm setup={setup}/>}
    {form === 'join' && <JoinForm cafe={cafe} configuration={configuration} displayName="TEST customer"/>}
    {form === 'preferences' && <PreferencesForm email="fixture@example.invalid" policies={configuration.policies} initial={{ id: id(30), businessName: cafe.name, status: 'active', joinedAt: '2026-09-21T00:00:00Z', hasBirthday: false, contact: { phone: null, phoneStatus: 'unverified', sharedEmail: null, rowVersion: 1 }, consents: [] }}/ >}
    {form === 'branch' && <BranchForm businessId={id(20)}/>}
    {form === 'profile' && <ProfileSettingsForm profile={{ display_name: 'TEST customer', preferred_timezone: 'Asia/Karachi', birthday_month: null, birthday_day: null, row_version: 1 }}/ >}
    {form === 'mfa' && <MfaForm factorId={id(40)} next="/workspace"/>}
    {form === 'push' && <PushRegistration userId={id(30)} configured/>}
  </main>;
}
