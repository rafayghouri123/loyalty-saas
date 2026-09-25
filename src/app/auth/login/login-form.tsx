'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DeviceSessionGuard } from '@/components/device-session';

export function LoginForm({ configured, business, callbackError, next, emailConfigured = false }: { emailConfigured?: boolean; configured: boolean; business: boolean; callbackError: boolean; next?: string }) {
  const [pending,setPending] = useState(false);
  const [error,setError] = useState(callbackError ? 'That sign-in could not be completed. Please try again.' : '');
  const [cooldown, setCooldown] = useState(0), [sent, setSent] = useState(false);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(v => Math.max(0, v - 1)), 1000); return () => clearTimeout(timer); }, [cooldown]);
  async function google() {
    setPending(true); setError('');
    try {
      const response = await fetch('/api/auth/google', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({intent:business?'business':'customer',next}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'Sign-in is temporarily unavailable.');
      window.location.assign(result.data.url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Sign-in is temporarily unavailable.'); setPending(false); }
  }
  return <><DeviceSessionGuard userId={null}/>{!configured && <p className="notice">Authentication is not configured in this development environment. Sign-in is unavailable until setup is complete.</p>}
    <Button className="full-width" variant="secondary" disabled={!configured||pending} onClick={google}>{pending?'Opening Google…':'Continue with Google'}</Button>
    <div className="divider">or use your email</div><form onSubmit={async e => {
      e.preventDefault(); setPending(true); setError('');
      const email = String(new FormData(e.currentTarget).get('email') ?? '');
      try {
        const response = await fetch('/api/auth/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, intent: business ? 'business' : 'customer', next }) });
        const result = await response.json();
        if (!response.ok) { if (result.error?.retryAfterSeconds) setCooldown(result.error.retryAfterSeconds); throw new Error(result.error?.message || 'Email sign-in is unavailable.'); }
        setSent(true); setCooldown(result.data.resendAfterSeconds);
      } catch (err) { setError((err as Error).message); } finally { setPending(false); }
    }}><div className="field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" required autoComplete="email" maxLength={254} disabled={!emailConfigured || pending} aria-describedby="email-setup"/><small id="email-setup">{emailConfigured ? 'Open the link in this browser to continue securely.' : 'Email sign-in is awaiting verified provider delivery and direct-endpoint limits.'}</small></div><Button className="full-width" disabled={!emailConfigured || pending || cooldown > 0}>{cooldown ? `Resend in ${cooldown}s` : 'Send sign-in link'}</Button></form>
    {sent && <p role="status">If this address can sign in, a link has been sent. Check your inbox.</p>}
    {error&&<p className="error-text" role="alert" style={{marginTop:16}}>{error}</p>}<p className="microcopy" style={{marginTop:24}}>Signing in does not subscribe you to marketing messages.</p></>;
}
