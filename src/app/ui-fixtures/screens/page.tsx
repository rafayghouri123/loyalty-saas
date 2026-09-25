import Link from 'next/link';
import { notFound } from 'next/navigation';
import { screens } from '@/features/screens/catalog';
import { fixturesEnabled } from '@/features/screens/fixture-gate';
export const dynamic = 'force-dynamic';
export default function ScreenGallery() {
  if (!fixturesEnabled()) notFound();
  return <main id="main" className="container screen-main"><p className="fixture-notice">Local design fixtures · No business operations persist. Unavailable on Vercel.</p><h1>Phase 1 screen review</h1><p>All 43 launch screen contracts. Review role permissions, conditional controls, keyboard access and mobile layouts. Phase 2 onward connects real operations.</p>{['P', 'C', 'S', 'O', 'A'].map(prefix => <section key={prefix} className="screen-panel"><h2>{{ P: 'Public and access', C: 'Customer', S: 'Staff', O: 'Owner', A: 'Administration' }[prefix]}</h2><div className="gallery-grid">{screens.filter(screen => screen.id.startsWith(prefix)).map(screen => <Link key={screen.id} className="gallery-link" href={`/ui-fixtures/screens/${screen.id}`}><span className="eyebrow">{screen.id}</span><strong>{screen.title}</strong><span className="microcopy">{screen.routes[0]}</span></Link>)}</div></section>)}</main>;
}
