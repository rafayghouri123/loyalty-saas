import { PolicyPage } from '@/features/tenancy/policy-page';
export const dynamic = 'force-dynamic';
export default async function Terms({ searchParams }: { searchParams: Promise<{ document?: string }> }) { return <PolicyPage kind="platform_terms" document={(await searchParams).document}/>; }
