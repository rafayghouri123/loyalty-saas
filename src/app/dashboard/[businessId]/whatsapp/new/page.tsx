import { z } from 'zod';
import { notFound } from 'next/navigation';
import { whatsappData } from '@/features/whatsapp/data';
import { FollowupBatch } from '@/features/whatsapp/batch-ui';
import type { Config } from '@/features/whatsapp/types';
export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ member?: string }> }) {
  const { businessId } = await params; const { member } = await searchParams;
  if (member && !z.uuid().safeParse(member).success) notFound();
  if (member) await whatsappData(businessId, 'whatsapp_member_contact', { p_membership: member });
  return <FollowupBatch businessId={businessId} memberId={member} initial={await whatsappData<Config>(businessId, 'whatsapp_configuration')}/>;
}
