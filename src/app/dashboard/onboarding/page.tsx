import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/db/server';
import { publicConfiguration } from '@/features/tenancy/data';
import { OnboardingForm } from '@/features/tenancy/owner-forms';
import { StatePanel } from '@/components/ui/state-panel';
import { BusinessOnboarding } from '@/features/tenancy/business-shell';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const { client, user } = await verifiedUser();
  if (!client) return <main id="main" className="container"><StatePanel title="Onboarding needs setup"><p>Authentication and published plans must be configured.</p></StatePanel></main>;
  if (!user) redirect('/auth/login?intent=business&next=/dashboard/onboarding');
  const creation=await client.rpc('can_bootstrap_business');
  if(creation.error||typeof creation.data!=='boolean') throw new Error('Business creation access could not be checked. Please retry.');
  if(!creation.data) redirect('/workspace');
  const { plans } = await publicConfiguration();
  const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  return <BusinessOnboarding securityRequired={assurance.data?.currentLevel!=='aal2'}>{plans.length ? <OnboardingForm plans={plans}/> : <StatePanel title="Contact support for a plan"><p>No published plan is configured. Business creation is unavailable until the operator publishes one.</p></StatePanel>}</BusinessOnboarding>;
}
