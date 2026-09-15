import { CustomerFeatureSetup } from '@/components/customer-feature-setup';
import { copy } from '@/lib/copy';
export const dynamic = 'force-dynamic';
export default function OffersPage() {
  return <CustomerFeatureSetup title={copy.customerSetup.offers.title}><p>{copy.customerSetup.offers.body}</p></CustomerFeatureSetup>;
}
