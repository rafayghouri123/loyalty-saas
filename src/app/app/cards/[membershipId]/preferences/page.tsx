import { notFound } from 'next/navigation';
import { customerData, publicConfiguration } from '@/features/tenancy/data';
import { PreferencesForm, type Preferences } from '@/features/tenancy/customer-forms';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ membershipId: string }> }) {
  const { membershipId } = await params; const { client, user, memberships } = await customerData();
  if (!memberships.some(m => m.id === membershipId)) notFound();
  const { data, error } = await client.rpc('membership_preferences', { p_membership_id: membershipId });
  if (error || !data) throw new Error('Preferences could not be loaded.');
  const initial = data as unknown as Preferences;
  return <main id="main" className="container"><h1>{initial.businessName} preferences</h1><PreferencesForm initial={initial} policies={(await publicConfiguration()).policies} email={user.email ?? ''}/></main>;
}
