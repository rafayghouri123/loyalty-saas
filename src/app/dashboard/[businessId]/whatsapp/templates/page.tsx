import { whatsappData } from '@/features/whatsapp/data';
import { TemplatesManager } from '@/features/whatsapp/templates-ui';
import type { Config } from '@/features/whatsapp/types';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return <TemplatesManager businessId={businessId} initial={await whatsappData<Config>(businessId, 'whatsapp_configuration')}/>;
}
