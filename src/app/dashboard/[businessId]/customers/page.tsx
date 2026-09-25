import { verifiedUser } from '@/lib/db/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ branch?: string; page?: string }> }) {
  const { businessId } = await params; const filters = await searchParams;
  if (!z.uuid().safeParse(businessId).success || filters.branch && !z.uuid().safeParse(filters.branch).success) notFound();
  const page = Math.max(0, Math.min(4000, Number(filters.page) || 0)); if (!Number.isInteger(page)) notFound();
  const { client, user } = await verifiedUser(); if (!client || !user) redirect('/auth/login?intent=business');
  const { data, error } = await client.rpc('business_members', { p_business_id: businessId, ...(filters.branch ? { p_branch_id: filters.branch } : {}), p_offset: page * 25 });
  if (error) notFound();
  const parsed = z.array(z.object({ id: z.uuid(), name: z.string(), status: z.string(), joinedAt: z.string(), units: z.string(), contact: z.object({ phone: z.string().nullable(), sharedEmail: z.string().nullable() }).nullable() })).safeParse(data);
  if (!parsed.success) throw new Error('Customers could not be loaded. Please wait and retry.');
  return <main id="main" className="container"><h1>Customers</h1><p>Only this cafe’s relationships in your permitted branch are shown.</p>{!parsed.data.length && <p>No memberships in this scope.</p>}
    <div className="table-scroll"><table><thead><tr><th>Name</th><th>Joined</th><th>Units</th><th>Status</th><th>Shared contact</th></tr></thead><tbody>{parsed.data.map(m => <tr key={m.id}><td>{m.name}</td><td>{new Date(m.joinedAt).toLocaleDateString('en-PK')}</td><td>{m.units}</td><td>{m.status}</td><td>{m.contact ? [m.contact.phone, m.contact.sharedEmail].filter(Boolean).join(' · ') || 'Not shared' : 'Restricted'}</td></tr>)}</tbody></table></div>
    <nav className="actions">{page > 0 && <Link href={`?page=${page - 1}${filters.branch ? `&branch=${filters.branch}` : ''}`}>Previous page</Link>}{parsed.data.length === 25 && <Link href={`?page=${page + 1}${filters.branch ? `&branch=${filters.branch}` : ''}`}>Next page</Link>}</nav>
  </main>;
}
