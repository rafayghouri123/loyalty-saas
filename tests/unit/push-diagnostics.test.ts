import { expect, it } from 'vitest';
import { registrationFailureCode } from '../../src/lib/push/diagnostics';

it('classifies deployment failures without copying sensitive exception data', () => {
  for (const [code, expected] of [
    ['SELF_SIGNED_CERT_IN_CHAIN', 'database_tls'], ['ENOENT', 'certificate_file_missing'],
    ['28P01', 'database_credentials'], ['42501', 'database_permission_or_session'],
    ['ENOTFOUND', 'database_connection'], ['42883', 'database_migrations'],
  ]) {
    expect(registrationFailureCode({ code, message: 'private connection secret', detail: 'private token' })).toBe(expected);
  }
  expect(registrationFailureCode(new Error('A canonical base64-encoded 32-byte key is required.'))).toBe('encryption_key_invalid');
  expect(registrationFailureCode({ code: 'private token', message: 'private connection secret' })).toBe('unexpected_failure');
  expect(registrationFailureCode(null)).toBe('unexpected_failure');
});
