import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashToken, openSecret, parseSecretKey, randomToken, sealSecret, subjectHmac } from '../../src/lib/security/crypto';
import { canonicalIp, trustedIpSubject, vercelIngressReader } from '../../src/lib/security/ingress';
import { limitMagicLink } from '../../src/lib/security/magic-link-limit';
import { rateLimited } from '../../src/lib/security/http';
import { createGateway } from '../../src/lib/db/gateway';
import { startWorker } from '../../src/worker/runtime';

describe('encrypted token storage', () => {
  it('uses fresh authenticated ciphertext and binds purpose, subject and key ID', () => {
    const key = { id: 'test-v1', bytes: randomBytes(32) };
    const token = randomToken();
    const one = sealSecret(token, key, 'push:installation-a');
    const two = sealSecret(token, key, 'push:installation-a');
    expect(one.ciphertext).not.toBe(two.ciphertext);
    expect(one.ciphertext).not.toContain(token);
    expect(openSecret(one.ciphertext, key, 'push:installation-a')).toBe(token);
    expect(() => openSecret(one.ciphertext, key, 'push:installation-b')).toThrow();
    expect(() => openSecret(one.ciphertext, { ...key, id: 'test-v2' }, 'push:installation-a')).toThrow();
    const pieces = one.ciphertext.split('.');
    pieces[3] = `${pieces[3]![0] === 'A' ? 'B' : 'A'}${pieces[3]!.slice(1)}`;
    expect(() => openSecret(pieces.join('.'), key, 'push:installation-a')).toThrow();
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/u);
  });
  it('requires a full canonical 256-bit key', () => {
    const encoded = randomBytes(32).toString('base64');
    expect(parseSecretKey(encoded).length).toBe(32);
    for (const input of ['', randomBytes(16).toString('base64'), `${encoded}\n`]) expect(() => parseSecretKey(input)).toThrow();
  });
});

describe('shared limiter boundary', () => {
  it('supplies only HMACs to the database and normalizes the email subject', async () => {
    const key = randomBytes(32);
    const captured: string[][] = [];
    const dependencies = { hmacKey: key, ingress: () => '::ffff:192.0.2.1', limit: async (...subjects: string[]) => {
      captured.push(subjects); return { allowed: false, retryAfterSeconds: 42 };
    } };
    const request = new Request('https://isolated-test.vercel.app/api/auth', { method: 'POST', body: JSON.stringify({ subjectHash: 'fake', ip: '192.0.2.9' }) });
    expect(await limitMagicLink(request, '  PERSON@EXAMPLE.INVALID ', dependencies)).toEqual({ kind: 'rate_limited', retryAfterSeconds: 42 });
    expect(captured).toEqual([[subjectHmac(key, 'login-email', 'person@example.invalid'), subjectHmac(key, 'ingress-ip', '192.0.2.1')]]);
  });
  it('fails closed for missing ingress or database failure without disclosing provider details', async () => {
    let called = false;
    const dependencies = { hmacKey: randomBytes(32), ingress: null, limit: async () => { called = true; throw new Error('private database credential details'); } };
    const request = new Request('http://127.0.0.1/api/auth');
    expect(await limitMagicLink(request, 'person@example.invalid', dependencies)).toEqual({ kind: 'temporary_failure' });
    expect(called).toBe(false);
    expect(await limitMagicLink(request, 'person@example.invalid', { ...dependencies, ingress: () => '127.0.0.1' })).toEqual({ kind: 'temporary_failure' });
    expect(called).toBe(true);
    expect(await limitMagicLink(request, 'invalid', dependencies)).toEqual({ kind: 'invalid_input' });
  });
  it('returns the required no-store 429 envelope and Retry-After header', async () => {
    const result = rateLimited(42, 'correlation-test');
    expect(result.status).toBe(429);
    expect(result.headers.get('retry-after')).toBe('42');
    expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(await result.json()).toMatchObject({ error: { code: 'rate_limited', retryAfterSeconds: 42 }, correlationId: 'correlation-test' });
  });
  it('does not permit TLS URL overrides or unencrypted remote runtime connections', async () => {
    for (const url of ['postgres://user:fixture@remote.invalid/db', 'postgres://user:fixture@127.0.0.1/db?sslmode=disable']) {
      expect(() => createGateway({ connectionString: url, ssl: false })).toThrow('Invalid gateway database configuration.');
      await expect(startWorker({connectionString:url,ssl:false})).rejects.toThrow('Invalid worker database configuration.');
    }
  });
});

describe('controlled Vercel ingress', () => {
  it('canonicalizes equivalent literals and rejects lists, zones, ports and malformed values', () => {
    expect(canonicalIp('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
    expect(canonicalIp('::ffff:192.0.2.128')).toBe('192.0.2.128');
    expect(canonicalIp('0:0:0:0:0:ffff:c000:0280')).toBe('192.0.2.128');
    for (const input of ['', '192.0.2.1, 192.0.2.2', ' 192.0.2.1', 'localhost', '192.0.2.1:80', '[::1]', 'fe80::1%eth0', '192.0.002.1']) expect(() => canonicalIp(input)).toThrow();
  });
  it('ignores spoofable forwarding headers and fails closed off the configured platform', () => {
    const key = randomBytes(32);
    const reader = vercelIngressReader({ VERCEL: '1', VERCEL_URL: 'isolated-test.vercel.app' });
    const make = (spoof: string) => new Request('https://isolated-test.vercel.app/api/auth', { headers: {
      'x-vercel-forwarded-for': '192.0.2.128', 'x-forwarded-for': spoof, 'forwarded': `for=${spoof}`, 'x-real-ip': spoof, 'cf-connecting-ip': spoof,
    } });
    expect(trustedIpSubject(make('192.0.2.1'), reader, key)).toBe(trustedIpSubject(make('192.0.2.2'), reader, key));
    expect(() => trustedIpSubject(make('192.0.2.1'), vercelIngressReader({}), key)).toThrow();
    expect(() => trustedIpSubject(new Request('https://isolated-test.vercel.app'), reader, key)).toThrow();
    const subject = trustedIpSubject(make('192.0.2.1'), reader, key);
    expect(subject).not.toContain('192.0.2');
    expect(subject).toMatch(/^[a-f0-9]{64}$/u);
    expect(subject).not.toBe(subjectHmac(key, 'login-email', '192.0.2.128'));
  });
  it('allows explicit server-side fixture injection without a request-header bypass', () => {
    const key = randomBytes(32);
    const request = new Request('http://127.0.0.1');
    expect(trustedIpSubject(request, () => '127.0.0.1', key)).toBe(subjectHmac(key, 'ingress-ip', '127.0.0.1'));
  });
});
