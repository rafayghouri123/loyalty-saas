import Link from 'next/link';
import { CustomerFeatureSetup } from '@/components/customer-feature-setup';
import { copy } from '@/lib/copy';
export const dynamic = 'force-dynamic';
export default function AccountPage() {
  return <CustomerFeatureSetup title={copy.customerSetup.account.title}>
    <p>{copy.customerSetup.account.body}</p>
    <Link className="button button-secondary" href="/app/notifications">{copy.customerSetup.notifications}</Link>
  </CustomerFeatureSetup>;
}
