import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { databaseTls } from '../../src/lib/db/tls';

afterEach(() => vi.unstubAllEnvs());

it('does not let blank hosted variables hide the configured certificate file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'loyalty-tls-'));
  try {
    const path = join(directory, 'ca.pem');
    writeFileSync(path, 'fixture certificate');
    vi.stubEnv('DATABASE_CA_CERT_PEM', '   ');
    vi.stubEnv('DATABASE_CA_CERT_BASE64', '');
    expect(databaseTls(true, path)).toEqual({ rejectUnauthorized: true, ca: 'fixture certificate' });
  } finally { rmSync(directory, { recursive: true }); }
});

it('supports hosted certificate content without accessing a workstation path', () => {
  vi.stubEnv('DATABASE_CA_CERT_PEM', '');
  vi.stubEnv('DATABASE_CA_CERT_BASE64', Buffer.from('fixture certificate').toString('base64'));
  expect(databaseTls(true, 'nonexistent-workstation-path')).toEqual({ rejectUnauthorized: true, ca: 'fixture certificate' });
  vi.stubEnv('DATABASE_CA_CERT_PEM', 'line one\\nline two');
  expect(databaseTls(true, 'nonexistent-workstation-path')).toEqual({ rejectUnauthorized: true, ca: 'line one\nline two' });
});
