import assert from 'node:assert/strict';

// Explicit target only: never silently test a local or production environment.
const target = new URL(process.argv[2] ?? '');
assert.equal(target.protocol, 'https:', 'Supply an HTTPS deployment origin.');
assert.equal(target.pathname, '/', 'Supply the origin without a page path.');
assert.ok(!target.username && !target.password && !target.search && !target.hash);
const origin = target.origin;
async function request(path, options = {}) {
  return fetch(`${origin}${path}`, { ...options, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
}
function privateResponse(response) {
  assert.match(response.headers.get('cache-control') ?? '', /\bprivate\b/);
  assert.match(response.headers.get('cache-control') ?? '', /\bno-store\b/);
}

const health = await request('/api/health/ready');
assert.equal(health.status, 200, 'Database readiness failed.');
assert.equal((await health.json()).database, 'ok');
privateResponse(health);
console.log('PASS database readiness and private caching');

for (const path of ['/auth/login', '/app']) {
  const response = await request(path);
  assert.ok([200, 302, 303, 307, 308].includes(response.status));
  privateResponse(response);
  console.log(`PASS ${path} private caching`);
}

for (const intent of ['customer', 'business']) {
  const response = await request('/api/auth/google', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ intent }),
  });
  assert.equal(response.status, 200, 'Canonical-origin OAuth initiation failed; check NEXT_PUBLIC_APP_URL and redeploy.');
  privateResponse(response);
  const authorization = new URL((await response.json()).data.url);
  assert.equal(authorization.protocol, 'https:');
  assert.ok(authorization.hostname.endsWith('.supabase.co'), 'Expected hosted Supabase authorization endpoint.');
  assert.equal(authorization.pathname, '/auth/v1/authorize');
  assert.equal(authorization.searchParams.get('provider'), 'google');
  assert.equal(authorization.searchParams.get('redirect_to'), `${origin}/auth/callback?next=${intent === 'business' ? '/workspace' : '/app'}`);
  const provider = await fetch(authorization, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  assert.ok([302, 303, 307, 308].includes(provider.status), 'Supabase did not redirect to Google.');
  const google = new URL(provider.headers.get('location'));
  assert.equal(google.protocol, 'https:');
  assert.equal(google.hostname, 'accounts.google.com');
  assert.equal(google.searchParams.get('redirect_uri'), `${authorization.origin}/auth/v1/callback`);
  // Do not log provider URLs, PKCE challenges, cookies or client identifiers.
  console.log(`PASS ${intent} OAuth origin, app callback and Google provider redirect`);
}

for (const requestOrigin of ['https://example.com', null]) {
  const response = await request('/api/auth/google', {
    method: 'POST', headers: { ...(requestOrigin ? { origin: requestOrigin } : {}), 'content-type': 'application/json' },
    body: JSON.stringify({ intent: 'customer' }),
  });
  assert.equal(response.status, 403, 'Untrusted origin was accepted.');
  privateResponse(response);
}
console.log('PASS foreign and missing origin rejection');
console.log('Interactive sign-in/session, authenticated RPC, worker delivery, device push and ingress spoofing remain separate checks.');
