'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { mutate } from './mutate';
export function MfaForm({ factorId: initialId, next }: { factorId?: string; next: string }) {
  const [factorId, setFactorId] = useState(initialId);
  const [setup, setSetup] = useState<{ qrCode: string; secret: string }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function enroll() {
    setPending(true); setError('');
    try { const data = await mutate('/api/auth/mfa', { action: 'enroll' }); setFactorId(String(data.factorId)); setSetup({ qrCode: String(data.qrCode), secret: String(data.secret) }); }
    catch (e) { setError((e as Error).message); } finally { setPending(false); }
  }
  return <div className="stack">{!factorId && <Button disabled={pending} onClick={enroll}>Set up authenticator</Button>}
    {setup && <><p>Scan this QR in your authenticator app, or enter the manual setup key. Keep the key private.</p>
      {/* Provider-generated data image; never inject SVG markup into the document. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qrCode} alt="Authenticator setup QR" width={240} height={240}/><code style={{ overflowWrap: 'anywhere' }}>{setup.secret}</code></>}
    {factorId && <form className="stack" onSubmit={async e => { e.preventDefault(); setPending(true); setError(''); const form = new FormData(e.currentTarget);
      try { await mutate('/api/auth/mfa', { action: 'verify', factorId, code: String(form.get('code')) }); window.location.assign(next); }
      catch (err) { setError((err as Error).message); setPending(false); }
    }}><label className="field">Six-digit verification code<input name="code" required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code"/></label>
      <Button disabled={pending} type="submit">{pending ? 'Verifying…' : 'Verify and continue'}</Button></form>}
    {error && <p role="alert" className="error-text">{error}</p>}
    <p className="muted">Lost access to your authenticator? Contact configured support for the provider recovery process.</p>
  </div>;
}
