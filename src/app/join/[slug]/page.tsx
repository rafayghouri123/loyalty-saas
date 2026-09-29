import { customerData, publicConfiguration, readCafe, readCafeProgrammes } from '@/features/tenancy/data';
import { JoinForm } from '@/features/tenancy/customer-forms';
import { cookies } from 'next/headers';
import { REFERRAL_COOKIE, readAttributions } from '@/lib/security/referral-attribution';
export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ branch?: string;programme?:string }> }) {
  const { slug } = await params; const { branch,programme } = await searchParams;
  const programmes=await readCafeProgrammes(slug);
  const selected=programme??programmes[0]?.id;
  const cafe = await readCafe(slug,selected);
  const referralAttribution = readAttributions((await cookies()).get(REFERRAL_COOKIE)?.value).some(item => item.businessSlug === slug);
  const query=new URLSearchParams();if(branch)query.set('branch',branch);if(selected)query.set('programme',selected);
  const { client, user, memberships } = await customerData(`/join/${slug}?${query}`);
  const { data: profile } = await client.from('profiles').select('display_name').eq('auth_user_id', user.id).single();
  return <main id="main" className="container"><h1>Join {cafe.name}</h1><h2>{cafe.programme.name}</h2><p>{cafe.programme.terms}</p>{cafe.rewards.map(r => <p key={r.id}>{r.title}: {r.unitCost} {cafe.programme.type}. {r.terms}</p>)}
    <JoinForm cafe={cafe} configuration={await publicConfiguration()} displayName={profile?.display_name ?? ''} membership={memberships.find(m => m.businessId === cafe.id&&m.programmeId===selected)} initialBranch={branch} referralAttribution={referralAttribution}/></main>;
}
