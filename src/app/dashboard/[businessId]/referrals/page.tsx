import { notFound, redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/db/server';
import { ReferralManager } from '@/features/loyalty/phase4-ui';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { client, user } = await verifiedUser();
  if (!user || !client) redirect('/auth/login?intent=business');
  const context = await client.rpc('staff_context', { p_business: businessId });
  if (context.error || !context.data) notFound();
  const timezone = (context.data as {timezone:string}).timezone;
  const localDate = (date:Date) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const value = (kind:string) => parts.find(part=>part.type===kind)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  };
  const end = localDate(new Date()), start = localDate(new Date(Date.now()-90*86400000));
  const { data, error } = await client.rpc('referral_configuration', { p_business: businessId, p_start: start, p_end: end,
    p_status: 'all', p_branch: null as never, p_page: 0, p_size: 25 });
  if (error || !data) notFound();
  return <ReferralManager businessId={businessId} initial={data as never}/>;
}
