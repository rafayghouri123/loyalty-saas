import {Admin} from '@/features/platform/admin-ui';
import {adminData} from '@/features/platform/data';
export const dynamic='force-dynamic';
export default async function Page(){return <main id="main" className="container"><Admin kind="overview" initial={await adminData('overview')}/></main>;}
