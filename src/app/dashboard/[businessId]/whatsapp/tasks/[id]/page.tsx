import { notFound } from 'next/navigation';
import { z } from 'zod';
import { whatsappData } from '@/features/whatsapp/data';
import { FollowupTask } from '@/features/whatsapp/tasks-ui';
import type { Config, TaskDetail } from '@/features/whatsapp/types';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ businessId: string; id: string }> }) {
  const { businessId, id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const initial = await whatsappData<TaskDetail>(businessId, 'whatsapp_task_detail', { p_task: id });
  return <FollowupTask businessId={businessId} initial={initial} config={await whatsappData<Config>(businessId, 'whatsapp_configuration')}/>;
}
