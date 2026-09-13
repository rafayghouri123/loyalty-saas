import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createGateway } from '../src/lib/db/gateway.ts';
import { subjectHmac } from '../src/lib/security/crypto.ts';

export async function testRateLimits({ client, postgres, asUser, test, actor, password, port }) {
  const key = randomBytes(32);
  const email = value => subjectHmac(key, 'login-email', value);
  const ip = value => subjectHmac(key, 'ingress-ip', value);
  await client.query(`create role integration_gateway login password '${password}' inherit;grant loyalty_web_gateway to integration_gateway;`);
  const gateway = createGateway({ connectionString: `postgresql://integration_gateway:${password}@127.0.0.1:${port}/postgres`, ssl: false });
  try {
    await test('gateway limiter persists denied attempts and a true 60-second resend cooldown', async () => {
      const subject = email('cooldown@example.invalid'), ingress = ip('192.0.2.1');
      assert.deepEqual(await gateway.limitMagicLink(subject, ingress), { allowed: true, retryAfterSeconds: 0 });
      const denied = await gateway.limitMagicLink(subject, ingress);
      assert.equal(denied.allowed, false); assert.ok(denied.retryAfterSeconds >= 59);
      assert.equal((await client.query("select count from public.rate_limit_buckets where subject_hash=$1 and operation='magic_link_email'", [subject])).rows[0].count, 2);
      // Move only the cooldown fixture, retaining the hourly count: no wall-clock sleeps.
      await client.query("update public.rate_limit_buckets set window_start=window_start-interval '61 seconds',expires_at=expires_at-interval '61 seconds' where subject_hash=$1 and operation='magic_link_cooldown'", [subject]);
      assert.equal((await gateway.limitMagicLink(subject, ingress)).allowed, true);
      for (let i = 0; i < 3; i++) await gateway.limitMagicLink(subject, ingress);
      const limited = await gateway.limitMagicLink(subject, ingress);
      assert.equal(limited.allowed, false); assert.ok(limited.retryAfterSeconds > 0);
      assert.equal((await client.query("select count from public.rate_limit_buckets where subject_hash=$1 and operation='magic_link_email'", [subject])).rows[0].count, 6);
    });
    await test('31 simultaneous emails sharing an ingress admit exactly 30 requests', async () => {
      const ingress = ip('192.0.2.2');
      const results = await Promise.all(Array.from({ length: 31 }, (_, index) => gateway.limitMagicLink(email(`user${index}@example.invalid`), ingress)));
      assert.equal(results.filter(result => result.allowed).length, 30);
      assert.equal(results.filter(result => !result.allowed).length, 1);
      assert.equal((await client.query("select count from public.rate_limit_buckets where subject_hash=$1 and operation='magic_link_ip'", [ingress])).rows[0].count, 31);
    });
    await test('authenticated RPC cannot choose or read subjects, bypass profile limits, or invoke a gateway operation', async () => {
      for (const sql of ['select * from public.rate_limit_buckets', 'select * from app_private.rate_limit_key', "select app_private.consume_actor_rate('profile_write')", "select app_private.complete_profile_unlimited('Bypass',gen_random_uuid())"])
        await assert.rejects(asUser(actor, sql), { code: '42501' });
      await assert.rejects(asUser(actor, 'select public.gateway_limit_magic_link($1,$2)', [email('attacker@example.invalid'), ip('192.0.2.3')]), { code: '42501' });
      await client.query("delete from public.rate_limit_buckets where operation='profile_write'");
      const calls = await Promise.all(Array.from({ length: 20 }, async () => {
        const conn = postgres.getPgClient(); await conn.connect();
        try {
          await conn.query('begin'); await conn.query('set local role authenticated');
          await conn.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.rate_limit_subject',$2,true)", [actor, randomUUID()]);
          const result = await conn.query('select public.complete_profile($1,$2) as result', ['Existing name', randomUUID()]);
          await conn.query('commit'); return result.rows[0].result;
        } finally { await conn.end(); }
      }));
      assert.equal(calls.filter(result => !result.error).length, 10);
      assert.equal(calls.filter(result => result.error?.code === 'rate_limited').length, 10);
      assert.equal((await client.query("select count(*) from public.rate_limit_buckets where operation='profile_write'")).rows[0].count, '1');
    });
    await test('fixed windows use database timestamps, expire at their boundary, and cleanup retains live buckets', async () => {
      const subject = email('boundary@example.invalid');
      const call = stamp => client.query("select app_private.consume_fixed_rate($1,'boundary_fixture',60,1,$2) as retry", [subject, stamp]);
      assert.equal((await call('2026-01-01T00:00:59.100Z')).rows[0].retry, 0);
      assert.equal((await call('2026-01-01T00:00:59.100Z')).rows[0].retry, 1);
      assert.equal((await call('2026-01-01T00:01:00.000Z')).rows[0].retry, 0);
      const before = await client.query('select count(*) from public.rate_limit_buckets where expires_at>clock_timestamp()');
      await client.query('select public.worker_purge_rate_limits()');
      assert.equal((await client.query('select count(*) from public.rate_limit_buckets where expires_at<=clock_timestamp()')).rows[0].count, '0');
      assert.equal((await client.query('select count(*) from public.rate_limit_buckets')).rows[0].count, before.rows[0].count);
      const keys = (await client.query('select subject_hash from public.rate_limit_buckets')).rows;
      assert.ok(keys.every(row => /^[a-f0-9]{64}$/.test(row.subject_hash)));
    });
  } finally { await gateway.close(); }
}
