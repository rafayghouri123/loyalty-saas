import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/db/server';
import { safeReturnPath } from '@/lib/security/http';
import { StatePanel } from '@/components/ui/state-panel';
import { MfaForm } from '@/features/tenancy/mfa-form';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { client, user } = await verifiedUser();
  const next = safeReturnPath((await searchParams).next, '/workspace');
  if (!client) return <main id="main" className="container"><StatePanel title="Authenticator setup unavailable"><p>Authentication needs configuration.</p></StatePanel></main>;
  if (!user) redirect('/auth/login?intent=business');
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) return <main id="main" className="container"><StatePanel title="Authenticator unavailable"><p>Please retry after signing in again.</p></StatePanel></main>;
  return <main id="main" className="auth-wrap"><section className="auth-card"><h1>Verify your authenticator</h1><p>Owner changes require a verified second factor.</p><MfaForm factorId={data.totp.find(f => f.status === 'verified')?.id} next={next}/></section></main>;
}
