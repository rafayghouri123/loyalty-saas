import { NextResponse } from 'next/server';
import { createUserClient } from '@/lib/db/server';
import { getPublicConfig } from '@/lib/config';
import { PRIVATE_HEADERS } from '@/lib/security/http';
import { REFERRAL_COOKIE, REFERRAL_VISITS_COOKIE, readAttributions, readReferralVisits, referralCookieOptions,
  referralVisitsCookieOptions, writeAttributions, writeReferralVisits } from '@/lib/security/referral-attribution';
import { recordReferralVisit } from '@/lib/security/referral-grant';
const unavailable = () => new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Referral unavailable</title><main><h1>Referral unavailable</h1><p>This link is unavailable. Ask the cafe for a current link.</p><a href="/">Back to home</a></main></html>',
  { status: 404, headers: { ...PRIVATE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' } });

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const config = getPublicConfig();
  if (!config || !process.env.RATE_LIMIT_HMAC_KEY_BASE64) return unavailable();
  const { code } = await context.params;
  if (!/^[A-Za-z0-9_-]{21}[AEIMQUYcgkosw048]$/u.test(code)) return unavailable();
  const client = await createUserClient();
  const { data, error } = await client!.rpc('resolve_referral', { p_code: code });
  const result = data as { businessId: string; businessSlug: string; attributionDays: number } | null;
  if (error || !result?.businessSlug || !Number.isInteger(result.attributionDays)) return unavailable();
  const response = NextResponse.redirect(new URL(`/b/${encodeURIComponent(result.businessSlug)}`, config.appUrl));
  Object.entries(PRIVATE_HEADERS).forEach(([name, value]) => response.headers.set(name, value));
  const cookies=request.headers.get('cookie')?.split(';').map(part=>part.trim())??[];
  const cookie=(name:string)=>cookies.find(part=>part.startsWith(`${name}=`))?.slice(name.length+1);
  const existing = readAttributions(cookie(REFERRAL_COOKIE));
  const visits=readReferralVisits(cookie(REFERRAL_VISITS_COOKIE));
  const today=new Date().toISOString().slice(0,10);
  const todayVisits=visits.filter(visit=>visit.day===today);
  if(todayVisits.length<30&&!todayVisits.some(visit=>visit.code===code)) {
    try {
      if(await recordReferralVisit(code)) response.cookies.set(REFERRAL_VISITS_COOKIE,
        writeReferralVisits([...todayVisits,{code,day:today}]),referralVisitsCookieOptions(new URL(config.appUrl).protocol==='https:'));
    } catch { console.error('Referral visit recording unavailable.'); }
  }
  let alreadyEnrolled = false;
  const { data: auth } = await client!.auth.getUser();
  if (auth.user?.email_confirmed_at && !auth.user.is_anonymous) {
    const memberships = await client!.rpc('my_memberships');
    alreadyEnrolled = Array.isArray(memberships.data) && memberships.data.some(membership => membership !== null && typeof membership === 'object' && !Array.isArray(membership) && membership.businessId === result.businessId);
  }
  if (!alreadyEnrolled && !existing.some(item => item.businessSlug === result.businessSlug)) {
    const seenAt = new Date();
    const expiresAt = new Date(seenAt.getTime() + result.attributionDays * 86400000);
    response.cookies.set(REFERRAL_COOKIE, writeAttributions([...existing.slice(-4), { code, businessSlug: result.businessSlug,
      seenAt: seenAt.toISOString(), expiresAt: expiresAt.toISOString() }]), referralCookieOptions(new URL(config.appUrl).protocol==='https:'));
  }
  return response;
}
