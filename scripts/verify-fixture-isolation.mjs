import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Test a completed production build with no Auth configuration or external calls.
for (const [label, settings] of [
  ['production mode', { APP_ENV: 'production', VERCEL: '', VERCEL_ENV: '' }],
  ['hosted development misconfiguration', { APP_ENV: 'development', VERCEL: '1', VERCEL_ENV: 'preview' }],
]) {
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3102'], {
    windowsHide: true,
    env: { ...process.env, ...settings, NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ready = false;
  server.stdout.on('data', chunk => { if (chunk.toString().includes('Ready in')) ready = true; });
  server.stderr.on('data', () => {});
  try {
    const deadline = Date.now() + 30000;
    while (!ready && Date.now() < deadline && server.exitCode === null) await new Promise(resolve => setTimeout(resolve, 100));
    assert(ready, 'Isolated production server did not start');
    for (const path of ['/ui-fixtures/screens', '/ui-fixtures/screens/O10?role=owner', '/ui-fixtures/forms', '/ui-fixtures/phase2?form=onboarding']) {
      const response = await fetch(`http://127.0.0.1:3102${path}`);
      assert.equal(response.status, 404, `${label}: ${path}`);
      assert.match(response.headers.get('cache-control') ?? '', /no-store/);
      assert(!(await response.text()).includes('Sample neighbourhood cafe'));
    }
    console.log(`PASS fixture 404/no-store isolation: ${label}`);
  } finally {
    if (server.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited; }
  }
}
