import { createHmac, timingSafeEqual } from 'node:crypto';
import { parseSecretKey } from './crypto';

export const REFERRAL_COOKIE = 'loyalty_referral_v1';
export const REFERRAL_VISITS_COOKIE = 'loyalty_referral_visits_v1';
export type ReferralAttribution = { code: string; businessSlug: string; seenAt: string; expiresAt: string };
export type ReferralVisit = { code: string; day: string };
const codePattern = /^[A-Za-z0-9_-]{21}[AEIMQUYcgkosw048]$/u;
const slugPattern = /^[a-z0-9-]{3,50}$/u;

function key() { return parseSecretKey(process.env.RATE_LIMIT_HMAC_KEY_BASE64 ?? ''); }
function signature(payload: string) {
  return createHmac('sha256', key()).update(`loyalty-referral:v1\0${payload}`, 'utf8').digest('base64url');
}
function visitSignature(payload: string) {
  return createHmac('sha256', key()).update(`loyalty-referral-visits:v1\0${payload}`, 'utf8').digest('base64url');
}
export function readReferralVisits(raw: string | undefined): ReferralVisit[] {
  if (!raw || raw.length > 3072) return [];
  const [payload, mac, extra] = raw.split('.');
  if (!payload || !mac || extra || !/^[A-Za-z0-9_-]+$/u.test(payload) || !/^[A-Za-z0-9_-]{43}$/u.test(mac)) return [];
  try {
    const expected = visitSignature(payload);
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return [];
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length > 30) return [];
    const today = new Date().toISOString().slice(0, 10);
    const oldest = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    return parsed.filter((item): item is ReferralVisit => item && typeof item === 'object'
      && codePattern.test(item.code) && typeof item.day === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(item.day)
      && item.day >= oldest && item.day <= today);
  } catch { return []; }
}
export function writeReferralVisits(items: ReferralVisit[]) {
  const payload = Buffer.from(JSON.stringify(items.slice(-30))).toString('base64url');
  return `${payload}.${visitSignature(payload)}`;
}
export function referralVisitsCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: 'lax' as const, path: '/', maxAge: 90 * 86400 };
}
export function readAttributions(raw: string | undefined): ReferralAttribution[] {
  if (!raw || raw.length > 2048) return [];
  const [payload, mac, extra] = raw.split('.');
  if (!payload || !mac || extra || !/^[A-Za-z0-9_-]+$/u.test(payload) || !/^[A-Za-z0-9_-]{43}$/u.test(mac)) return [];
  try {
    const expected = signature(payload);
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return [];
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length > 5) return [];
    const now = Date.now();
    return parsed.filter((item): item is ReferralAttribution => item && typeof item === 'object'
      && codePattern.test(item.code) && slugPattern.test(item.businessSlug)
      && typeof item.seenAt === 'string' && typeof item.expiresAt === 'string'
      && Number.isFinite(Date.parse(item.seenAt)) && Number.isFinite(Date.parse(item.expiresAt))
      && Date.parse(item.seenAt) <= now + 30_000 && Date.parse(item.expiresAt) > now
      && Date.parse(item.expiresAt) - Date.parse(item.seenAt) <= 30 * 86400000);
  } catch { return []; }
}
export function writeAttributions(items: ReferralAttribution[]) {
  const payload = Buffer.from(JSON.stringify(items.slice(0, 5))).toString('base64url');
  return `${payload}.${signature(payload)}`;
}
export function referralCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: 'lax' as const,
    path: '/', maxAge: 30 * 86400 };
}
