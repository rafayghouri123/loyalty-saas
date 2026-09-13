import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/db/server';
import { pushRegistrationConfigured } from '@/lib/push/server';
import { PushRegistration } from '@/components/push-registration';
import { StatePanel } from '@/components/ui/state-panel';

export const dynamic='force-dynamic';
export default async function NotificationsPage() {
  const {user,unavailable}=await verifiedUser();
  if(unavailable)return <main id="main" className="container"><StatePanel title="Notifications are not configured" href="/app" action="Back to cards"><p>Account and notification setup must be completed before a device can be confirmed.</p></StatePanel></main>;
  if(!user)redirect('/auth/login');
  return <main id="main" className="container"><StatePanel title="Notifications on this device" href="/app" action="Back to cards"><PushRegistration userId={user.id} configured={pushRegistrationConfigured()}/></StatePanel></main>;
}
