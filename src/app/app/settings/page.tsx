import Link from 'next/link';
import { CustomerFeatureSetup } from '@/components/customer-feature-setup';
import { copy } from '@/lib/copy';
import { verifiedUser } from '@/lib/db/server';
import { redirect } from 'next/navigation';
import { ProfileSettingsForm } from '@/features/tenancy/configuration-forms';
import { OfflineCardSettings } from '@/components/offline-cards';
export const dynamic = 'force-dynamic';
export default async function AccountPage() {
  const {client,user,unavailable}=await verifiedUser();
  if(!unavailable&&!user) redirect('/auth/login');
  if(client&&user){
    const {data,error}=await client.from('profiles').select('display_name,preferred_timezone,birthday_month,birthday_day,row_version').eq('auth_user_id',user.id).single();
    if(error||!data) throw new Error('Profile could not be loaded.');
    return <main id="main" className="container"><h1>Account</h1><p>Verified email: {user.email}</p><ProfileSettingsForm profile={data}/><OfflineCardSettings userId={user.id}/><nav className="actions"><Link href="/app">Manage cafe preferences</Link><Link href="/app/notifications">Device settings and sign out</Link></nav><p>Account export and deletion are connected in the privacy phase.</p></main>;
  }
  return <CustomerFeatureSetup title={copy.customerSetup.account.title}>
    <p>{copy.customerSetup.account.body}</p>
    <Link className="button button-secondary" href="/app/notifications">{copy.customerSetup.notifications}</Link>
  </CustomerFeatureSetup>;
}
