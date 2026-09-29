import {notFound} from 'next/navigation';
import {fixturesEnabled} from '@/features/screens/fixture-gate';
import {Billing} from '@/features/platform/billing-ui';
import {Admin} from '@/features/platform/admin-ui';
import {PrivacyControls} from '@/features/platform/privacy-ui';
import type {BillingView,PrivacyView} from '@/features/platform/contracts';
export const dynamic='force-dynamic';
const id=(n:number)=>`b8000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export default async function Page({searchParams}:{searchParams:Promise<{form?:string}>}){
 if(!fixturesEnabled())notFound();const {form}=await searchParams;
 const billing:BillingView={businessId:id(1),subscription:{id:id(2),plan:'TEST plan',planVersion:1,pricePaisa:'550050',billingPeriod:'monthly',status:'past_due',periodStart:'2026-08-31T05:00:00Z',periodEnd:'2026-09-30T05:00:00Z',graceEndsAt:'2026-10-07T05:00:00Z',cancelAtPeriodEnd:false,limits:{branches:1,staff:2,members:null,campaigns:10}},usage:{branches:1,staff:2,members:17,campaigns:3},instructions:null,invoices:[{id:id(3),reference:'TEST-INV-1',amountPaisa:'550050',periodStart:'2026-09-30T05:00:00Z',periodEnd:'2026-10-31T05:00:00Z',dueAt:'2026-09-30T05:00:00Z',status:'issued',submissions:[]}]};
 const privacy:PrivacyView={retentionConfigured:false,financialPolicy:null,backupCoverage:null,requests:[]};
 return <main id="main" className="container"><p className="notice">Local Phase 8 fixture. Synthetic records; API requests are tested separately.</p>{form==='privacy'?<PrivacyControls initial={privacy} userId={id(4)}/>:form==='plans'?<Admin kind="plans" initial={{rows:[{id:id(5),code:'test-plan',name:'TEST fractional plan',status:'draft',version:1,pricePaisa:'550050',billingPeriod:'monthly',branchLimit:1,staffLimit:2,memberLimit:null,monthlyCampaignLimit:10,trialDays:14}],total:1}}/>:form==='admin'?<Admin kind="billing" initial={{rows:[{...billing.invoices[0],business:'TEST cafe',submissions:[],payments:[]}],total:1}}/>:<Billing initial={billing} invoiceId={id(3)}/> }</main>;
}
