import {notFound,redirect} from 'next/navigation';
import {z} from 'zod';
import {verifiedUser} from '@/lib/db/server';
import type {AdminData,BillingView,PrivacyView} from './contracts';
export async function platformData<T>(name:string,args:Record<string,unknown>):Promise<T>{
 const {client,user}=await verifiedUser();if(!client||!user)redirect('/auth/login?intent=business');
 const {data,error}=await client.rpc(name as never,args as never);
 if(error?.code==='42501'||error?.code==='P0002')notFound();
 if(error||!data)throw new Error('This information could not be loaded. Retry.');return data as T;
}
export async function billingData(businessId:string,invoiceId?:string){if(!z.uuid().safeParse(businessId).success||invoiceId&&!z.uuid().safeParse(invoiceId).success)notFound();return platformData<BillingView>('billing_view',{p_business:businessId,p_invoice:invoiceId});}
export const adminData=(kind:string,businessId?:string)=>platformData<AdminData>('admin_read',{p_kind:kind,p_filters:businessId?{businessId}:{}});
export const privacyData=()=>platformData<PrivacyView>('my_privacy_requests',{});
