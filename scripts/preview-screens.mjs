import { spawn } from 'node:child_process';

if (process.env.VERCEL || process.env.VERCEL_ENV) throw new Error('Screen fixtures are local-only.');
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3000'], {
  windowsHide: true,
  stdio: 'inherit',
  env: { ...process.env, APP_ENV: 'development', NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '', PUSH_REGISTRATION_ENABLED: 'false', LIVE_PUSH_ENABLED: 'false' },
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', code => { process.exitCode = code ?? 0; });
child.on('error', () => { console.error('Could not start the local screen preview.'); process.exitCode = 1; });
