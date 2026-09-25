import { SignupSignage } from '@/features/tenancy/signup-signage';
import { getPublicConfig } from '@/lib/config';
import { ownerSetup } from '@/features/tenancy/owner-data';
import { SettingsForm, type BusinessSettings } from '@/features/tenancy/configuration-forms';
import { MediaUpload } from '@/features/tenancy/media-upload';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ businessId: string }> }) {
  const setup = await ownerSetup((await params).businessId);
  return <main id="main" className="container"><h1>{setup.business.display_name} settings</h1><SettingsForm business={setup.business as BusinessSettings}/><MediaUpload businessId={setup.business.id} rowVersion={setup.business.row_version} kind="logo"/><MediaUpload businessId={setup.business.id} rowVersion={setup.business.row_version} kind="cover"/><SignupSignage businessId={setup.business.id} slug={setup.business.slug} origin={new URL(getPublicConfig()!.appUrl).origin} branches={setup.branches}/></main>;
}
