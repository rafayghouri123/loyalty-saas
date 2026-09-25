import Link from 'next/link';
import { ArrowRight, Coffee, Gift, QrCode, Smartphone, Sparkles, Users, Clock3, ChartNoAxesCombined, MessageCircle, Bell, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getIdentity } from '@/lib/config';
import { publicConfiguration } from '@/features/tenancy/data';
import { formatPaisa } from '@/lib/formatting';
import { LoyaltyCard } from '@/components/loyalty-card';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { plans } = await publicConfiguration();
  const identity = getIdentity();
  const features = [
    [Users, 'Give friends a reason to visit', 'Referral rewards qualify after a purchase, with separate rewards for both friends.'],
    [Clock3, 'Make quiet hours rewarding', 'Schedule double stamps or points for selected days, hours and branches.'],
    [ChartNoAxesCombined, 'See what brings people back', 'Understand recorded loyalty sales, returning customers and rewards used.'],
    [Bell, 'Keep the conversation going', 'Offer inboxes and consent-based push reminders, with quiet hours and limits.'],
    [MessageCircle, 'A personal WhatsApp follow-up', 'Open a prepared chat, review the message, then press Send yourself.'],
    [Gift, 'Rewards that stay with your cafe', 'Your own branding, programme, members and history, in one shared app.'],
  ] as const;
  return <><header className="site-header container"><Link href="/" className="wordmark"><span className="wordmark-icon"><Coffee size={20} aria-hidden="true" /></span>{identity.name}</Link>
    <nav className="site-nav" aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#features">Features</a><a href="#pricing">Pricing</a></nav>
    <Button variant="secondary" asChild><Link href="/auth/login?intent=business">Business sign in <ArrowRight size={15} aria-hidden="true" /></Link></Button></header>
    <main id="main"><section className="hero container"><div><span className="badge"><Coffee size={13} aria-hidden="true" /> Made for cafe regulars</span>
      <h1>A little thank you.<br /><span>A reason to return.</span></h1>
      <p className="hero-copy">Turn the next coffee into the next visit. Give your customers a loyalty card that’s always close at hand.</p>
      <div className="actions"><Button asChild><Link href="/auth/login?intent=business">Start your cafe trial <ArrowRight size={16} aria-hidden="true" /></Link></Button><Button variant="ghost" asChild><a href="#how-it-works">See how it works</a></Button></div>
      <p className="microcopy">One shared app. Your cafe’s own rewards.</p></div>
      <figure className="illustration"><LoyaltyCard businessName="Your neighbourhood cafe" accent="#166534" programme="stamps"
        balance={6} rewardCost={8} rewardTitle="Your next cup is getting closer." serverEligible={false} />
        <figcaption className="illustration-caption">Illustrative card · Example terms, not an active programme</figcaption></figure>
    </section>
    <div className="feature-strip container"><span><QrCode size={18} aria-hidden="true"/> Scan, earn, enjoy</span><span><Smartphone size={18} aria-hidden="true"/> One install for every card</span><span><Sparkles size={18} aria-hidden="true"/> Your brand, your rewards</span><span><Check size={18} aria-hidden="true"/> Built around consent</span></div>
    <section id="how-it-works" className="section container"><div className="section-heading"><p className="eyebrow">Simple at the counter</p><h2>A familiar routine.<br />A more rewarding visit.</h2></div><div className="three-grid">{[
      ['01','Scan the cafe’s QR','Customers see your programme, sign in and join. No required phone number or app-store download.'],
      ['02','Earn with each qualifying visit','Staff scan the customer’s card and confirm a purchase. Stamps or points stay separate for each cafe.'],
      ['03','Enjoy a well-earned reward','Customers choose a reward and show a short-lived code. Staff confirm when the reward is given.'],
    ].map(([number,title,body])=><article className="step-card" key={number}><span className="step-number">{number} /</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>
    <section id="features" className="section container"><div className="section-heading"><p className="eyebrow">The launch product</p><h2>More than a digital stamp card.</h2><p className="muted">The planned launch brings daily checkout, thoughtful follow-ups and useful reporting together.</p></div><div className="three-grid">{features.map(([Icon,title,body])=><article className="feature-card" key={title}><Icon size={24} aria-hidden="true"/><h3>{title}</h3><p>{body}</p></article>)}</div></section>
    <section id="pricing" className="section container"><h2>Plans for your cafe</h2>{plans.length ? <div className="three-grid">{plans.map(plan => <article className="screen-panel" key={plan.id}><h3>{plan.name}</h3><p>{formatPaisa(plan.pricePaisa)} / {plan.billingPeriod}</p><p>{plan.trialDays} trial days · {plan.branchLimit} active branches · {plan.staffLimit} staff</p><p>Includes referrals, double slots, reporting and manual WhatsApp follow-ups.</p><Button asChild><Link href="/auth/login?intent=business">Start your cafe trial</Link></Button></article>)}</div> : <div className="pricing-panel"><p>Published prices and limits will appear here once configured.</p>{identity.supportEmail ? <a href={`mailto:${identity.supportEmail}`}>Contact us for pricing</a> : <span className="badge">Pricing setup pending</span>}</div>}</section>
    <section className="section container faq"><h2>A few good questions.</h2><details><summary>Do customers need another app?</summary><p>Customers can use the website or install the shared Progressive Web App. Each cafe has a separate card. Installation is optional for loyalty participation.</p></details><details><summary>Does this send WhatsApp messages automatically?</summary><p>No. A staff member opens each prepared chat, reviews it and presses Send in the cafe’s WhatsApp account. An opened chat is recorded separately from a message marked as sent.</p></details><details><summary>Can customers keep earning without notifications?</summary><p>Yes. Notifications and marketing consent are optional. Loyalty cards and the offer inbox remain available without push permission.</p></details></section>
    </main><footer className="site-footer container"><span>{identity.name} · Made for the next visit.</span><nav aria-label="Footer">{identity.supportEmail&&<a href={`mailto:${identity.supportEmail}`}>Support</a>}<Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav></footer></>;
}
