import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getPublicConfig } from '@/lib/config';
import { failure, PRIVATE_HEADERS, readSmallJson, validMutationOrigin } from '@/lib/security/http';
import { REFERRAL_COOKIE, readAttributions, referralCookieOptions, writeAttributions } from '@/lib/security/referral-attribution';

export async function POST(request: Request) {
  const correlationId = randomUUID();
  const config = getPublicConfig();
  if (!config || !validMutationOrigin(request, config.appUrl)) return failure('forbidden', 'Request origin is not allowed.', correlationId);
  let businessSlug: string;
  try { businessSlug = z.strictObject({ businessSlug: z.string().regex(/^[a-z0-9-]{3,50}$/u) }).parse(await readSmallJson(request)).businessSlug; }
  catch { return failure('invalid_input', 'Choose a valid cafe.', correlationId); }
  const rawCookie = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${REFERRAL_COOKIE}=`))?.slice(REFERRAL_COOKIE.length + 1);
  const remaining = readAttributions(rawCookie).filter(item => item.businessSlug !== businessSlug);
  const response = NextResponse.json({ data: { cleared: true }, correlationId }, { headers: PRIVATE_HEADERS });
  if (remaining.length) response.cookies.set(REFERRAL_COOKIE, writeAttributions(remaining), referralCookieOptions(new URL(config.appUrl).protocol==='https:'));
  else response.cookies.delete(REFERRAL_COOKIE);
  return response;
}
