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
  const callback=new URL(authorization.searchParams.get('redirect_to'));
  assert.equal(callback.origin,origin);assert.equal(callback.pathname,'/auth/callback');
  assert.equal(callback.searchParams.get('next'),intent==='business'?'/workspace':'/app');
  assert.equal([...callback.searchParams].length,1);
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
const policies=[];
let staticScript;
for (let attempt=0;attempt<2;attempt++) {
  const response=await request('/auth/login',{headers:{'x-nonce':'untrusted-probe','content-security-policy':"script-src 'unsafe-inline'"}});
  assert.equal(response.status,200);
  privateResponse(response);
  const policy=response.headers.get('content-security-policy')??'';
  const scriptPolicy=policy.split(';').find(part=>part.trim().startsWith('script-src '))??'';
  assert(scriptPolicy.includes("'strict-dynamic'")&&!scriptPolicy.includes('unsafe-inline')&&!scriptPolicy.includes('unsafe-eval'));
  assert(!policy.includes('untrusted-probe'));
  assert(policy.includes("frame-ancestors 'none'")&&policy.includes("object-src 'none'"));
  const nonce=scriptPolicy.match(/'nonce-([^']+)'/u)?.[1];assert(nonce);
  const html=await response.text();assert(html.includes(`nonce="${nonce}"`),'Rendered scripts must carry the response nonce.');
  staticScript??=html.match(/src="([^"\s]*\/_next\/static\/[^"\s]+\.js[^"\s]*)"/u)?.[1];
  policies.push(policy);
}
assert.notEqual(policies[0],policies[1],'CSP nonce must be fresh for each response.');
for (const path of ['/ui-fixtures/screens/S01','/ui-fixtures/phase8']) {
  const response=await request(path);assert.equal(response.status,404);privateResponse(response);
}
console.log('PASS enforced fresh CSP nonce, spoofed-header overwrite, rendered script nonce and deployed fixture isolation');
for(const path of ['/sw.js','/manifest.webmanifest']) {
  const response=await request(path);assert.equal(response.status,200);
  const cache=response.headers.get('cache-control')??'';
  assert.match(cache,/max-age=0\b/u);assert.match(cache,/must-revalidate/u);
}
assert(staticScript,'Versioned application script must be present.');
const asset=new URL(staticScript,origin);assert.equal(asset.origin,origin);
const assetResponse=await request(asset.pathname+asset.search);assert.equal(assetResponse.status,200);
assert.match(assetResponse.headers.get('cache-control')??'',/\bimmutable\b/u);
console.log('PASS deployed service-worker/manifest revalidation and immutable versioned JavaScript');
console.log('Interactive sign-in/session, authenticated RPC, worker delivery, device push and ingress spoofing remain separate checks.');
