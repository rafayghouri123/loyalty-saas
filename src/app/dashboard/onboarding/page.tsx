import { redirect } from 'next/navigation';
import Link from 'next/link';
import { verifiedUser } from '@/lib/db/server';
import { publicConfiguration } from '@/features/tenancy/data';
import { OnboardingForm } from '@/features/tenancy/owner-forms';
import { StatePanel } from '@/components/ui/state-panel';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const { client, user } = await verifiedUser();
  if (!client) return <main id="main" className="container"><StatePanel title="Onboarding needs setup"><p>Authentication and published plans must be configured.</p></StatePanel></main>;
  if (!user) redirect('/auth/login?intent=business&next=/dashboard/onboarding');
  const { plans } = await publicConfiguration();
  return <main id="main" className="container"><h1>Create your cafe</h1><p><Link href="/auth/mfa?next=/dashboard/onboarding">Set up or verify your authenticator</Link> before saving owner changes.</p>{plans.length ? <OnboardingForm plans={plans}/> : <StatePanel title="Contact support for a plan"><p>No published plan is configured. Business creation is unavailable until the operator publishes one.</p></StatePanel>}</main>;
}
