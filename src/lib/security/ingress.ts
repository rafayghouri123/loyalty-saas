import { isIP } from 'node:net';
import { subjectHmac } from './crypto';

export function canonicalIp(raw: string): string {
  if (!raw || raw !== raw.trim() || raw.includes('%') || raw.includes(',')) throw new Error('Untrusted ingress metadata.');
  const version = isIP(raw);
  if (version === 4) return raw;
  if (version !== 6) throw new Error('Untrusted ingress metadata.');
  const normalized = new URL(`http://[${raw}]/`).hostname.slice(1, -1);
  if (normalized.startsWith('::ffff:')) {
    const halves = normalized.slice(7).split(':');
    if (halves.length !== 2) throw new Error('Invalid mapped address.');
    const high = Number.parseInt(halves[0]!, 16);
    const low = Number.parseInt(halves[1]!, 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join('.');
  }
  return normalized;
}

type VercelIngress = { platform: 'vercel'; deploymentHost: string };
export type TrustedIngressReader = (request: Request) => string;

// Construct this adapter only from server-owned deployment metadata. A header name alone is not trust.
export function vercelIngressReader(environment: Record<string, string | undefined>): TrustedIngressReader | null {
  if (environment.VERCEL !== '1' || !environment.VERCEL_URL) return null;
  const settings: VercelIngress = { platform: 'vercel', deploymentHost: environment.VERCEL_URL };
  if (!/^[a-z0-9.-]+\.vercel\.app$/u.test(settings.deploymentHost)) return null;
  return request => canonicalIp(request.headers.get('x-vercel-forwarded-for') ?? '');
}

export function trustedIpSubject(request: Request, reader: TrustedIngressReader | null, key: Buffer): string {
  if (!reader) throw new Error('Trusted ingress is unavailable.');
  return subjectHmac(key, 'ingress-ip', canonicalIp(reader(request)));
}
