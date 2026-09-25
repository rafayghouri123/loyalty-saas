import type { Metadata } from 'next';
import './globals.css';
import { getIdentity } from '@/lib/config';
import { PwaRegistration } from '@/components/pwa-registration';
import Link from 'next/link';
import { fixturesEnabled } from '@/features/screens/fixture-gate';

export const metadata: Metadata = { title: { default: 'Cafe loyalty', template: '%s · Cafe loyalty' }, description: 'One shared loyalty app for Pakistani cafes and their customers.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const identity = getIdentity();
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a>
    {!identity.configured && <div className="setup-note">Development preview · Product identity and live services are not configured</div>}
    {fixturesEnabled() && <div className="setup-note"><Link href="/ui-fixtures/screens">Review Phase 1 screen layouts</Link> · Local fixtures only</div>}
    {children}<PwaRegistration />
  </body></html>;
}
