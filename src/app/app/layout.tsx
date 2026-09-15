import { verifiedUser } from '@/lib/db/server';
import { DeviceSessionGuard, SignOutButton } from '@/components/device-session';
import Link from 'next/link';
import { CustomerNavigation } from '@/components/customer-navigation';
import { getIdentity } from '@/lib/config';

export default async function CustomerLayout({children}:{children:React.ReactNode}) {
  const {user}=await verifiedUser();
  return <div className="customer-shell"><DeviceSessionGuard userId={user?.id??null}/>
    <header className="customer-header container"><Link className="wordmark" href="/app">{getIdentity().name}</Link>
      <div className="customer-header-actions"><Link className="button button-ghost" href="/app/settings">Account</Link>{user&&<SignOutButton/>}</div>
    </header>
    {children}<CustomerNavigation/>
  </div>;
}
