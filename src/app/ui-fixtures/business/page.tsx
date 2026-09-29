import { notFound } from 'next/navigation';
import { fixturesEnabled } from '@/features/screens/fixture-gate';
import { BusinessOnboarding, BusinessWorkspaces } from '@/features/tenancy/business-shell';
import { OnboardingForm } from '@/features/tenancy/owner-forms';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{view?:string}>}) {
  if(!fixturesEnabled())notFound();
  const {view}=await searchParams;
  if(view==='workspaces'||view==='workspaces-granted')return <BusinessWorkspaces admin={false} canCreateBusiness={view==='workspaces-granted'} workspaces={[
    {id:'b2000000-0000-4000-8000-000000000001',name:'TEST first cafe',role:'owner',status:'draft',branches:[{id:'b2000000-0000-4000-8000-000000000011',name:'TEST main branch'}]},
    {id:'b2000000-0000-4000-8000-000000000002',name:'TEST second cafe',role:'cashier',status:'active',branches:[{id:'b2000000-0000-4000-8000-000000000012',name:'TEST counter'}]},
  ]}/>;
  return <BusinessOnboarding securityRequired><OnboardingForm plans={[{id:'b2000000-0000-4000-8000-000000000001',name:'TEST plan — not an offer',pricePaisa:'100',billingPeriod:'monthly',trialDays:14,branchLimit:1,staffLimit:5}]}/></BusinessOnboarding>;
}
