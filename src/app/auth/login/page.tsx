import Link from 'next/link';
import { getPublicConfig, getIdentity } from '@/lib/config';
import { LoginForm } from './login-form';
export const dynamic = 'force-dynamic';
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ intent?: string; error?: string }> }) {
  const params = await searchParams;
  return <main id="main" className="auth-wrap"><Link className="wordmark" href="/">{getIdentity().name}</Link><section className="auth-card"><span className="badge">{params.intent==='business'?'For your business':'For your next visit'}</span><h1 style={{marginTop:24}}>Welcome back.</h1><p className="muted">{params.intent==='business'?'Sign in to open your business workspace.':'Sign in to keep your loyalty cards together.'}</p><LoginForm configured={Boolean(getPublicConfig())} business={params.intent==='business'} callbackError={Boolean(params.error)}/></section></main>;
}
