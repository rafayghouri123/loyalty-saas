export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };

export const errorStatus = {
  unauthenticated: 401, forbidden: 403, not_found: 404, conflict: 409,
  insufficient_balance: 409, expired: 410, invalid_input: 422,
  rate_limited: 429, temporary_failure: 503,
} as const;
export type ErrorCode = keyof typeof errorStatus;

export function failure(code: ErrorCode, message: string, correlationId: string, fieldErrors?: Record<string, string[]>) {
  return Response.json({ error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) }, correlationId },
    { status: errorStatus[code], headers: PRIVATE_HEADERS });
}

export function validMutationOrigin(request: Request, canonicalOrigin: string) {
  try {
    return request.headers.get('origin') === new URL(canonicalOrigin).origin
      && request.headers.get('content-type')?.split(';')[0]?.trim() === 'application/json';
  } catch { return false; }
}

export async function readSmallJson(request: Request, maximumBytes = 16_384): Promise<unknown> {
  if (!request.body) throw new Error('invalid_input');
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) { await reader.cancel(); throw new Error('invalid_input'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) { joined.set(part, offset); offset += part.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined));
}

export function safeReturnPath(value: string | null | undefined, fallback = '/app') {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || [...value].some(char => char.charCodeAt(0) < 32)) return fallback;
  const parsed = new URL(value, 'https://internal.invalid');
  if (parsed.origin !== 'https://internal.invalid') return fallback;
  // Redirects carry routing context only, never raw intent or auth credentials.
  const allow = /^\/(app(?:\/|$)|workspace$|join\/|invite\/|dashboard\/onboarding$)/u;
  return allow.test(parsed.pathname) ? parsed.pathname + parsed.search : fallback;
}
