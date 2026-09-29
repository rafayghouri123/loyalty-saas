import { notFound } from 'next/navigation';
import { z } from 'zod';
import { whatsappData } from '@/features/whatsapp/data';
import { FollowupTasks } from '@/features/whatsapp/tasks-ui';
import type { Config, TaskList } from '@/features/whatsapp/types';
export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ batch?: string }> }) {
  const { businessId } = await params; const { batch } = await searchParams;
  if (batch && !z.uuid().safeParse(batch).success) notFound();
  const config = await whatsappData<Config>(businessId, 'whatsapp_configuration');
  const initial = await whatsappData<TaskList>(businessId, 'whatsapp_tasks', { p_filters: { batchId: batch ?? null } });
  return <FollowupTasks businessId={businessId} config={config} initial={initial} initialBatch={batch}/>;
}
