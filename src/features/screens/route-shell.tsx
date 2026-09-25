import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/db/server';
import { StatePanel } from '@/components/ui/state-panel';
import { screenById } from './catalog';
import { fixturesEnabled } from './fixture-gate';

// Until the relevant phase supplies authoritative record/branch/role checks, fail closed.
// Route IDs never select fixture records or confer authorization.
export async function RouteShell({ screenId }: { screenId: string }) {
  const screen = screenById(screenId)!;
  if (screenId === 'P02') notFound();
  const publicScreen = ['P02', 'P07'].includes(screenId);
  const { user, unavailable } = publicScreen ? { user: null, unavailable: true } : await verifiedUser();
  if (!publicScreen && !unavailable && !user) redirect(`/auth/login${['owner', 'manager', 'cashier', 'admin'].includes(screen.role) ? '?intent=business' : ''}`);
  return <main id="main" className="container"><StatePanel title={screenId === 'P02' ? 'Cafe unavailable' : screen.title} href={publicScreen ? '/' : '/workspace'} action={publicScreen ? 'Back to home' : 'Choose workspace'}>
    <p>{publicScreen ? 'This public destination is not available. No published cafe has been selected.' : unavailable ? 'This development environment is not connected to authentication yet. This feature is unavailable until setup is complete.' : 'This feature is being connected. No business role, branch access or record access has been granted by this route.'}</p>
    <p>Actions are unavailable until authenticated server operations and current permissions are connected.</p>
    {fixturesEnabled() && <Link className="button button-secondary" href={`/ui-fixtures/screens/${screenId}`}>Review local {screenId} layout</Link>}
  </StatePanel></main>;
}
