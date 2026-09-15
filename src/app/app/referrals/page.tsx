import { CustomerFeatureSetup } from '@/components/customer-feature-setup';
import { copy } from '@/lib/copy';
export const dynamic = 'force-dynamic';
export default function ReferralsPage() {
  return <CustomerFeatureSetup title={copy.customerSetup.referrals.title}><p>{copy.customerSetup.referrals.body}</p></CustomerFeatureSetup>;
}
