import { notFound } from 'next/navigation';
import { fixturesEnabled } from '@/features/screens/fixture-gate';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default function FixtureLayout({ children }: { children: React.ReactNode }) {
  if (!fixturesEnabled()) notFound();
  return children;
}
