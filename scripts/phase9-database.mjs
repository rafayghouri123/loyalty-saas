import EmbeddedPostgres from 'embedded-postgres';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';

// Always creates a new loopback database. No environment URL or remote reset path.
export async function withPhase9Database(action) {
  const directory = resolve('.local/phase9-db', randomUUID());
  mkdirSync(directory, { recursive: true });
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const password = randomBytes(24).toString('hex');
  const postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: 'postgres', password,
    authMethod: 'scram-sha-256', persistent: true, createPostgresUser: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} });
  let client;
  try {
    console.log('Phase 9: initialize isolated loopback database.');
    await postgres.initialise(); await postgres.start();
    client = postgres.getPgClient(); await client.connect();
    await client.query("set statement_timeout='120s'");
    // Explicit SQL Auth/Storage adapter, not a claim of hosted provider validation.
    await client.query(`create role anon nologin; create role authenticated nologin; create role supabase_auth_admin nologin;
      create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false,deleted_at timestamptz);
      create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      create function auth.jwt() returns jsonb language sql stable as 'select coalesce(nullif(current_setting(''request.jwt.claims'',true),''''),''{}'')::jsonb';
      grant usage on schema auth,public to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
      create schema storage;
      create table storage.buckets(id text primary key,name text not null,public boolean not null,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text not null,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated,anon;
      grant select,insert,update,delete on storage.objects to authenticated,anon;`);
    console.log('Phase 9: apply migrations.');
    for (const file of readdirSync('supabase/migrations').filter(v => v.endsWith('.sql')).sort()) {
      await client.query(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    }
    await client.query(`create role phase9_worker login password '${password}' inherit; grant loyalty_worker to phase9_worker;
      create role phase9_client login password '${password}' inherit; grant authenticated to phase9_client;`);
    console.log('Phase 9: migrations ready.');
    await action({ client, postgres, directory,
      workerUrl: `postgresql://phase9_worker:${password}@127.0.0.1:${port}/postgres`,
      appUrl: `postgresql://phase9_client:${password}@127.0.0.1:${port}/postgres` });
  } catch (error) { console.error('Phase 9 failed:', error.code ?? error.name, error.message); throw error; } finally {
    if (client) await client.end();
    if (postgres.process && postgres.process.exitCode !== null) postgres.process = undefined;
    await postgres.stop();
  }
}

export async function phase9Rpc(connection, user, name, args = []) {
  if (!/^[a-z_]+$/u.test(name)) throw new Error('Invalid RPC name');
  await connection.query('begin');
  try {
    await connection.query('set local role authenticated');
    await connection.query("set local statement_timeout='5s'");
    await connection.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
      [user.id, JSON.stringify({ sub: user.id, session_id: user.session, aal: user.aal ?? 'aal2', amr: [{ method: 'totp', timestamp: Math.floor(Date.now()/1000) }] })]);
    const result = (await connection.query(`select public.${name}(${args.map((_,i) => `$${i+1}`).join(',')}) result`, args)).rows[0].result;
    await connection.query('set constraints all immediate');
    await connection.query('commit');
    if (result?.error) throw Object.assign(new Error(result.error.code), { code: result.error.code });
    return result;
  } catch (error) { await connection.query('rollback'); throw error; }
}
