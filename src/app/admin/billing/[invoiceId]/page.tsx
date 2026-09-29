import {Admin} from '@/features/platform/admin-ui';
import {platformData} from '@/features/platform/data';
import type {AdminData} from '@/features/platform/contracts';
import {notFound} from 'next/navigation';
import {z} from 'zod';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{invoiceId:string}>}){const {invoiceId}=await params;if(!z.uuid().safeParse(invoiceId).success)notFound();const data=await platformData<AdminData>('admin_invoice_view',{p_invoice:invoiceId});return <main id="main" className="container"><Admin kind="billing" initial={data} invoiceId={invoiceId}/></main>;}
