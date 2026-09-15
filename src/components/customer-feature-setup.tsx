import { redirect } from 'next/navigation';
import { verifiedUser } from '../lib/db/server';
import { copy } from '../lib/copy';
import { StatePanel } from './ui/state-panel';

export async function CustomerFeatureSetup({ title, children }: { title: string; children: React.ReactNode }) {
  const { user, unavailable } = await verifiedUser();
  if (!unavailable && !user) redirect('/auth/login');
  return <main id="main" className="container"><StatePanel title={title}>
    {unavailable ? <p>{copy.setup.body}</p> : children}
  </StatePanel></main>;
}
