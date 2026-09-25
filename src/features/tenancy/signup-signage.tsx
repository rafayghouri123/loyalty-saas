'use client';
import { useState } from 'react';
export function SignupSignage({ businessId, slug, origin, branches }: { businessId: string; slug: string; origin: string; branches: { id: string; name: string; status: string }[] }) {
  const active = branches.filter(b => b.status === 'active');
  const [branchId, setBranchId] = useState(active[0]?.id ?? '');
  const destination = `${origin}/join/${slug}?branch=${branchId}`;
  return <section className="screen-panel stack"><h2>Signup QR assets</h2><label className="field">Signage branch<select value={branchId} onChange={e => setBranchId(e.target.value)}>{active.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <p>Public destination: <a href={destination}>{destination}</a></p>{branchId && <div className="actions">{(['png', 'svg'] as const).map(format => <a className="button button-secondary" key={format} href={`/api/tenancy/signup-asset?businessId=${businessId}&branchId=${branchId}&format=${format}`}>{format === 'png' ? 'Download PNG' : 'Download printable SVG'}</a>)}</div>}
    <p>Publish your programme before downloading. A standard NFC tag can store this same signup URL; no special NFC reader is needed.</p></section>;
}
