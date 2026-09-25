import { customerData, publicConfiguration, readCafe } from '@/features/tenancy/data';
import { JoinForm } from '@/features/tenancy/customer-forms';
import { cookies } from 'next/headers';
import { REFERRAL_COOKIE, readAttributions } from '@/lib/security/referral-attribution';
export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ branch?: string }> }) {
  const { slug } = await params; const { branch } = await searchParams;
  const cafe = await readCafe(slug);
  const referralAttribution = readAttributions((await cookies()).get(REFERRAL_COOKIE)?.value).some(item => item.businessSlug === slug);
  const { client, user, memberships } = await customerData(`/join/${slug}${branch ? `?branch=${encodeURIComponent(branch)}` : ''}`);
  const { data: profile } = await client.from('profiles').select('display_name').eq('auth_user_id', user.id).single();
  return <main id="main" className="container"><h1>Join {cafe.name}</h1><h2>{cafe.programme.name}</h2><p>{cafe.programme.terms}</p>{cafe.rewards.map(r => <p key={r.id}>{r.title}: {r.unitCost} {cafe.programme.type}. {r.terms}</p>)}
    <JoinForm cafe={cafe} configuration={await publicConfiguration()} displayName={profile?.display_name ?? ''} membership={memberships.find(m => m.businessId === cafe.id)} initialBranch={branch} referralAttribution={referralAttribution}/></main>;
}
