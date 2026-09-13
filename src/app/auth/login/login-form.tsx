'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function LoginForm({ configured, business, callbackError }: { configured: boolean; business: boolean; callbackError: boolean }) {
  const [pending,setPending] = useState(false);
  const [error,setError] = useState(callbackError ? 'That sign-in could not be completed. Please try again.' : '');
  async function google() {
    setPending(true); setError('');
    try {
      const response = await fetch('/api/auth/google', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({intent:business?'business':'customer'}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'Sign-in is temporarily unavailable.');
      window.location.assign(result.data.url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Sign-in is temporarily unavailable.'); setPending(false); }
  }
  return <>{!configured && <p className="notice">Authentication is not configured in this development environment. Sign-in is unavailable until setup is complete.</p>}
    <Button className="full-width" variant="secondary" disabled={!configured||pending} onClick={google}>{pending?'Opening Google…':'Continue with Google'}</Button>
    <div className="divider">or use your email</div><form onSubmit={e=>e.preventDefault()}><div className="field"><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" maxLength={254} disabled aria-describedby="email-setup"/><small id="email-setup">Email sign-in will be enabled after the shared request limiter and sender are configured.</small></div><Button className="full-width" disabled>Send sign-in link</Button></form>
    {error&&<p className="error-text" role="alert" style={{marginTop:16}}>{error}</p>}<p className="microcopy" style={{marginTop:24}}>Signing in does not subscribe you to marketing messages.</p></>;
}
