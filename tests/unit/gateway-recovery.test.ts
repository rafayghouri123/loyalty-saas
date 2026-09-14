import { beforeEach, expect, it, vi } from 'vitest';
const database = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('pg', () => ({ default: { Pool: class {
  query = database.query;
  on() {}
  async end() {}
} } }));
import { createGateway } from '../../src/lib/db/gateway';

beforeEach(() => database.query.mockReset());

it('rechecks the dedicated role after a temporary connection failure', async () => {
  const gateway = createGateway({ connectionString: 'postgres://fixture:fixture@127.0.0.1/test', ssl: false });
  database.query.mockRejectedValueOnce(new Error('Temporary database outage'))
    .mockResolvedValueOnce({ rows: [{ allowed: true }] })
    .mockResolvedValueOnce({ rows: [{ decision: { allowed: true, retryAfterSeconds: 0 } }] });
  await expect(gateway.limitMagicLink('email-hash', 'ip-hash')).rejects.toThrow('Temporary database outage');
  await expect(gateway.limitMagicLink('email-hash', 'ip-hash')).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
  expect(database.query).toHaveBeenCalledTimes(3);
  expect(database.query.mock.calls[0]?.[0]).toContain('pg_has_role');
  expect(database.query.mock.calls[1]?.[0]).toContain('pg_has_role');
});

it('keeps denying operations when a retried connection has the wrong role', async () => {
  const gateway = createGateway({ connectionString: 'postgres://fixture:fixture@127.0.0.1/test', ssl: false });
  database.query.mockResolvedValue({ rows: [{ allowed: false }] });
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(gateway.limitMagicLink('email-hash', 'ip-hash')).rejects.toThrow('Dedicated web gateway role required.');
  }
  expect(database.query).toHaveBeenCalledTimes(2);
  expect(database.query.mock.calls.every(call => String(call[0]).includes('pg_has_role'))).toBe(true);
});
