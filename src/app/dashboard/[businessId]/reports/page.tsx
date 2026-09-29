import { reportConfig } from '@/features/reports/data';
import { Reports } from '@/features/reports/ui';
export const dynamic = 'force-dynamic';
export default async function Page({params}:{params:Promise<{businessId:string}>}){const {businessId}=await params;return <main id="main" className="container"><Reports businessId={businessId} config={await reportConfig(businessId)}/></main>;}
