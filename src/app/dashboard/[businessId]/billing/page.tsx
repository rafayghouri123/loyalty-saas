import {billingData} from '@/features/platform/data';
import {Billing} from '@/features/platform/billing-ui';
import {getIdentity} from '@/lib/config';
export const dynamic = 'force-dynamic';
export default async function Page({params}:{params:Promise<{businessId:string}>}) {const {businessId}=await params;return <main id="main" className="container"><Billing initial={await billingData(businessId)} supportEmail={getIdentity().supportEmail}/></main>;}
