import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {verifiedUser} from '@/lib/db/server';
import {PRIVATE_HEADERS,failure} from '@/lib/security/http';
import type {BillingView} from '@/features/platform/contracts';
import {formatPaisa} from '@/lib/formatting';
export async function GET(request:Request){
 const correlation=randomUUID(),{client,user}=await verifiedUser();if(!client||!user)return failure('unauthenticated','Sign in to download an invoice.',correlation);
 try{const q=new URL(request.url).searchParams,business=z.uuid().parse(q.get('businessId')),invoice=z.uuid().parse(q.get('invoiceId'));const {data,error}=await client.rpc('billing_view' as never,{p_business:business,p_invoice:invoice} as never);if(error)return failure('forbidden','This invoice is unavailable.',correlation);const view=data as BillingView,i=view.invoices[0];if(!i)throw new Error('missing_invoice');
  return new Response([i.reference,`PKR invoice · ${view.subscription.plan}`,`Covered period: ${i.periodStart} to ${i.periodEnd}`,`Amount: ${formatPaisa(i.amountPaisa)}`,`Due: ${i.dueAt}`,`Status: ${i.status}`,'Payment evidence is not confirmation.',view.instructions??'Payment instructions need operator configuration.'].join('\n'),{headers:{...PRIVATE_HEADERS,'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="${i.reference}.txt"`}});
 }catch{return failure('invalid_input','Invalid invoice reference.',correlation);}
}
