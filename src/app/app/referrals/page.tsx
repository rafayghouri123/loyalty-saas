import { customerData } from '@/features/tenancy/data';
import { CustomerReferrals } from '@/features/loyalty/phase4-ui';
export const dynamic = 'force-dynamic';
export default async function ReferralsPage() {
  const { memberships } = await customerData('/app/referrals');
  return <CustomerReferrals memberships={memberships.map(m=>({id:m.id,businessName:m.businessName,status:m.status}))}/>;
}
