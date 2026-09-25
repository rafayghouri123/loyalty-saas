import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/db/server';
import { z } from 'zod';
import { AcceptInvitation } from '@/features/tenancy/owner-forms';
import { StatePanel } from '@/components/ui/state-panel';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { user, client } = await verifiedUser();
  if (!user || !client) redirect(`/auth/login?intent=business&next=${encodeURIComponent(`/invite/${token}`)}`);
  const result = /^[A-Za-z0-9_-]{43}$/u.test(token) ? await client.rpc('read_invitation', { p_token: token }) : null;
  const parsed = z.object({ businessName: z.string(), inviter: z.string().nullable(), role: z.string(), expiresAt: z.string(), branches: z.array(z.string()) }).safeParse(result?.data);
  if (!parsed.success) return <main id="main" className="container"><StatePanel title="Invitation unavailable" href="/app/notifications" action="Switch account"><p>Sign in with the invited verified email. The invitation may also have expired or been revoked.</p></StatePanel></main>;
  const invite = parsed.data;
  return <main id="main" className="container"><h1>Join {invite.businessName}</h1><p>Invited by {invite.inviter}. Role: {invite.role}.</p><p>Branches: {invite.branches.join(', ')}. Expires {new Date(invite.expiresAt).toLocaleString('en-PK')}.</p><AcceptInvitation token={token}/></main>;
}
