import {Admin} from '@/features/platform/admin-ui';
import {adminData} from '@/features/platform/data';
import {notFound} from 'next/navigation';
import {z} from 'zod';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();const data=await adminData('businesses',id);if(!data.rows?.length)notFound();return <main id="main" className="container"><Admin kind="businesses" initial={data} businessId={id}/></main>;}
