import type { Metadata } from 'next';
import './globals.css';
import { getIdentity } from '@/lib/config';
import { PwaRegistration } from '@/components/pwa-registration';

export const metadata: Metadata = { title: { default: 'Cafe loyalty', template: '%s · Cafe loyalty' }, description: 'One shared loyalty app for Pakistani cafes and their customers.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const identity = getIdentity();
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a>
    {!identity.configured && <div className="setup-note">Development preview · Product identity and live services are not configured</div>}
    {children}<PwaRegistration />
  </body></html>;
}
