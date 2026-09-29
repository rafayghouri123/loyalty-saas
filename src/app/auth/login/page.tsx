import { emailLoginConfigured } from '@/lib/security/email-login';
import Link from 'next/link';
import { getPublicConfig, getIdentity } from '@/lib/config';
import { LoginForm } from './login-form';
export const dynamic = 'force-dynamic';
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ intent?: string; error?: string; next?: string }> }) {
  const params = await searchParams;
  const trial=params.intent==='business'&&params.next==='/dashboard/onboarding';
  return <main id="main" className="auth-wrap"><Link className="wordmark" href="/">{getIdentity().name}</Link><section className="auth-card"><span className="badge">{params.intent==='business'?'For your business':'For your next visit'}</span><h1 style={{marginTop:24}}>{trial?'Start your cafe trial.':'Welcome back.'}</h1><p className="muted">{trial?'Sign in to create your business and set up your loyalty programme.':params.intent==='business'?'Sign in to manage your business or set up your first cafe.':'Sign in to keep your loyalty cards together.'}</p><LoginForm emailConfigured={emailLoginConfigured()} configured={Boolean(getPublicConfig())} business={params.intent==='business'} callbackError={Boolean(params.error)} next={params.next}/></section></main>;
}
