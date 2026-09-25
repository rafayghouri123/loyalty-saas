/* eslint-disable @next/next/no-img-element -- accepted, versioned Supabase Storage renditions */
import Link from 'next/link';
import { readCafe } from '@/features/tenancy/data';
import { createUserClient } from '@/lib/db/server';
import { getPublicConfig } from '@/lib/config';
import { z } from 'zod';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const cafe = await readCafe((await params).slug);
  const client = await createUserClient(); const media = await client!.rpc('public_brand_media', { p_slug: cafe.slug });
  const brand = z.object({ logo: z.string().nullable(), cover: z.string().nullable() }).safeParse(media.data);
  const imageUrl = (path: string) => `${getPublicConfig()!.supabaseUrl}/storage/v1/object/public/loyalty-brand/${path.split('/').map(encodeURIComponent).join('/')}`;
  return <main id="main" className="container">{brand.success && brand.data.logo && <img src={imageUrl(brand.data.logo)} width={96} height={96} alt={`${cafe.name} logo`}/>}<h1>{cafe.name}</h1>
    {brand.success && brand.data.cover && <img src={imageUrl(brand.data.cover)} alt={`${cafe.name} cover`} style={{ width: '100%', maxHeight: 400, objectFit: 'cover' }}/>}
    <p>{cafe.description}</p><h2>{cafe.programme.name}</h2><p>{cafe.programme.terms}</p>
    {cafe.rewards.map(r => <section className="screen-panel" key={r.id}><h2>{r.title}</h2><p>{r.unitCost} {cafe.programme.type}</p><p>{r.description}</p><p>{r.terms}</p></section>)}
    {cafe.canJoin ? <Link className="button" href={`/join/${cafe.slug}`}>Join loyalty programme</Link> : <p>New enrollment is currently unavailable. Existing members can open their cards.</p>}
    <Link className="button button-secondary" href="/app">Open my cards</Link>
    {cafe.menuUrl && <a className="button button-secondary" href={cafe.menuUrl} rel="noreferrer">View menu</a>}
    {cafe.phone && <a href={`tel:${cafe.phone}`}>Contact cafe</a>}
    <h2>Branches</h2>{cafe.branches.map(b => <section key={b.id} className="screen-panel"><h3>{b.name}</h3><p>{b.address}, {b.city}</p>{b.mapsUrl && <a href={b.mapsUrl} rel="noreferrer">Directions</a>}
      <ul>{b.hours.map((h, i) => <li key={i}>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][h.weekday - 1]}: {h.opensAt.slice(0, 5)}–{h.closesAt.slice(0, 5)}</li>)}</ul>
      {cafe.canJoin && <Link href={`/join/${cafe.slug}?branch=${b.id}`}>Join at {b.name}</Link>}</section>)}
  </main>;
}
