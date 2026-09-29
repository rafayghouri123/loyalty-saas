import {Admin} from '@/features/platform/admin-ui';
import {platformData} from '@/features/platform/data';
import type {AdminData} from '@/features/platform/contracts';
export const dynamic='force-dynamic';
export default async function Page(){return <main id="main" className="container"><Admin kind="privacy" initial={await platformData<AdminData>('admin_privacy_queue',{})}/></main>;}
