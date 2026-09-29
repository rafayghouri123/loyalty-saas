export function contentSecurityPolicy(nonce: string, supabaseUrl?: string, development = false) {
  let storageOrigin = '';
  try { const url = new URL(supabaseUrl ?? ''); if (url.protocol === 'https:') storageOrigin = url.origin; } catch { /* Unconfigured environments allow no remote storage. */ }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    // React style props drive merchant accents, QR sizing and Recharts. Script
    // nonces remain strict; permitting style attributes does not permit scripts.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${storageOrigin}`,
    "font-src 'self'",
    `connect-src 'self' ${storageOrigin} https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://fcm.googleapis.com${development ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
    "worker-src 'self'", "manifest-src 'self'", "media-src 'self' blob:",
    "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
}
