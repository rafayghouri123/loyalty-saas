import type { ReactNode } from 'react';
import Link from 'next/link';
import { Coffee, ArrowRight, Store, ShieldCheck, Plus } from 'lucide-react';
import { SignOutButton } from '@/components/device-session';
import { Button } from '@/components/ui/button';
import { getIdentity } from '@/lib/config';
import type { z } from 'zod';
import type { workspacesSchema } from './contracts';

export function BusinessShell({ title, description, children }: { title:string; description:string; children:ReactNode }) {
  return <div className="business-shell container">
    <header className="business-header"><Link className="wordmark" href="/"><span className="wordmark-icon"><Coffee size={20} aria-hidden="true"/></span>{getIdentity().name}</Link>
      <div className="business-header-actions"><span className="badge">Business account</span><SignOutButton intent="business"/></div></header>
    <main id="main"><div className="business-heading"><p className="business-eyebrow">For your cafe</p><h1>{title}</h1><p className="muted">{description}</p></div>{children}</main>
  </div>;
}

export function BusinessWorkspaces({ workspaces, admin, canCreateBusiness }: { workspaces:z.infer<typeof workspacesSchema>; admin:boolean; canCreateBusiness:boolean }) {
  return <BusinessShell title="Your businesses" description="Choose a business to manage its loyalty programme or open your staff tools.">
    <div className="business-workspaces">{workspaces.map(w=><article className="business-workspace-card" key={w.id}>
      <span className="business-card-icon"><Store size={24} aria-hidden="true"/></span><div><span className="badge">{w.role==='owner'?'Owner':w.role==='manager'?'Manager':'Cashier'}</span><h2>{w.name}</h2><p className="muted">{w.branches.map(b=>b.name).join(' · ')||'No active branches assigned'}</p></div>
      <Button asChild><Link href={w.role==='cashier'?`/staff/${w.id}`:`/dashboard/${w.id}`}>{w.role==='cashier'?'Open scanner':w.status==='draft'&&w.role==='owner'?'Continue setup':'Open dashboard'}<ArrowRight size={16} aria-hidden="true"/></Link></Button>
    </article>)}</div>
    <nav className="business-tools" aria-label="Business account">{canCreateBusiness&&<Button asChild variant="secondary"><Link href="/dashboard/onboarding"><Plus size={16} aria-hidden="true"/>{workspaces.some(w=>w.role==='owner')?'Create another business':'Create business'}</Link></Button>}<Button asChild variant="ghost"><Link href="/auth/mfa"><ShieldCheck size={16} aria-hidden="true"/>Account security</Link></Button>{admin&&<Button asChild variant="secondary"><Link href="/admin">Administration</Link></Button>}</nav>
  </BusinessShell>;
}

export function BusinessOnboarding({children, securityRequired}:{children:ReactNode;securityRequired:boolean}) {
  return <BusinessShell title="Let's set up your cafe." description="Add your business and first branch, then make your loyalty programme your own.">
    <div className="business-onboarding"><aside className="business-onboarding-guide" aria-label="Setup overview"><span className="business-card-icon"><Store size={26} aria-hidden="true"/></span><h2>Your cafe.<br/>Your regulars.<br/>Your rewards.</h2><p>A few steps to get your loyalty programme ready.</p>
      <ol><li><strong>Business &amp; branch</strong><span>Add your cafe details and start your trial.</span></li><li><strong>Programme &amp; first reward</strong><span>Choose how customers earn and what they can redeem.</span></li><li><strong>Review &amp; publish</strong><span>Check your setup and get your signup QR.</span></li></ol>
      <p className="business-guide-note">Already invited to a team? Open the invitation link from your business owner.</p></aside>
      <section className="business-onboarding-form" aria-label="Create business">
        {securityRequired&&<div className="business-security"><ShieldCheck size={22} aria-hidden="true"/><div><h2>Secure your business account</h2><p>You can fill in your details now. Verify your authenticator before saving your branch and starting the trial.</p><Link className="button button-secondary" href="/auth/mfa?next=/dashboard/onboarding">Set up or verify authenticator</Link></div></div>}
        {children}
      </section>
    </div>
  </BusinessShell>;
}
