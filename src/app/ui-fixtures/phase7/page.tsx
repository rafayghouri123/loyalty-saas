import {notFound} from 'next/navigation';
import {fixturesEnabled} from '@/features/screens/fixture-gate';
import {Reports} from '@/features/reports/ui';
import type {Config} from '@/features/reports/contracts';
export const dynamic='force-dynamic';
const id=(n:number)=>`b7000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export default async function Page({searchParams}:{searchParams:Promise<{role?:string}>}){
 if(!fixturesEnabled())notFound();const {role}=await searchParams;
 const manager=role==='manager';const config:Config={businessName:'TEST reporting cafe',timezone:'Asia/Karachi',role:manager?'manager':'owner',canExport:!manager,canExportContacts:!manager,
 branches:[{id:id(2),name:'TEST branch'}],programmes:[{id:id(3),name:'TEST programme version 1'}],rewards:[{id:id(4),name:'TEST coffee'}],promotions:[{id:id(5),name:'TEST double slot'}],campaigns:[{id:id(6),name:'TEST campaign'}]};
 return <main id="main" className="container"><p className="notice">Local Phase 7 component fixture. Synthetic configuration; API results are not simulated by this page.</p><Reports businessId={id(1)} config={config}/></main>;
}
