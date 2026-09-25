import { PolicyPage } from '@/features/tenancy/policy-page';
export const dynamic = 'force-dynamic';
export default async function Privacy({ searchParams }: { searchParams: Promise<{ document?: string }> }) { return <PolicyPage kind="privacy" document={(await searchParams).document}/>; }
