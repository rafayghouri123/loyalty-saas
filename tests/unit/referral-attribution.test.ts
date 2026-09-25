import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { readAttributions, readReferralVisits, writeAttributions, writeReferralVisits } from '../../src/lib/security/referral-attribution';

const original = process.env.RATE_LIMIT_HMAC_KEY_BASE64;
beforeEach(() => { process.env.RATE_LIMIT_HMAC_KEY_BASE64 = randomBytes(32).toString('base64'); });
afterEach(() => { if (original === undefined) delete process.env.RATE_LIMIT_HMAC_KEY_BASE64;
  else process.env.RATE_LIMIT_HMAC_KEY_BASE64 = original; });

describe('signed referral attribution', () => {
  const code = randomBytes(16).toString('base64url');
  const live = () => [{ code, businessSlug: 'test-cafe', seenAt: new Date().toISOString(),
    expiresAt: new Date(Date.now()+7*86400000).toISOString() }];
  it('keeps a bounded canonical attribution through login cookies', () => {
    const items = live();
    expect(readAttributions(writeAttributions(items))).toEqual(items);
  });
  it('rejects edits, invalid code padding, expired dates and a different key', () => {
    const signed = writeAttributions(live());
    expect(readAttributions(`${signed.slice(0,-1)}${signed.endsWith('A')?'B':'A'}`)).toEqual([]);
    expect(readAttributions(writeAttributions([{ ...live()[0]!, code: `${code.slice(0,21)}B` }]))).toEqual([]);
    expect(readAttributions(writeAttributions([{ ...live()[0]!, expiresAt: new Date(Date.now()-1000).toISOString() }]))).toEqual([]);
    process.env.RATE_LIMIT_HMAC_KEY_BASE64 = randomBytes(32).toString('base64');
    expect(readAttributions(signed)).toEqual([]);
  });
  it('bounds signed visit deduplication by code and UTC day', () => {
    const visit={code,day:new Date().toISOString().slice(0,10)};
    const signed=writeReferralVisits([visit]);
    expect(readReferralVisits(signed)).toEqual([visit]);
    expect(readReferralVisits(`${signed.slice(0,-1)}${signed.endsWith('A')?'B':'A'}`)).toEqual([]);
    expect(readReferralVisits(writeReferralVisits([{...visit,day:'2000-01-01'}]))).toEqual([]);
  });
});
