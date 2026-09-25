import { describe, expect, it } from 'vitest';
import { bootstrapSchema, joinSchema, consentSchema, phone, profileSchema } from '../../src/features/tenancy/contracts';
import { sanitizeImage } from '../../src/worker/media';
import sharp from 'sharp';
import { signupArtwork, signupDestination } from '../../src/features/tenancy/signup-assets';
import { BinaryBitmap, HybridBinarizer, RGBLuminanceSource, QRCodeReader } from '@zxing/library';

describe('phase 2 contracts', () => {
  it('generates escaped printable signage with a decodable public branch signup QR', async () => {
    const destination=signupDestination('https://example.com','test-cafe',crypto.randomUUID());
    const input={destination,cafe:'Cafe <script>alert(1)</script>',branch:'Main & branch',proposition:'Coffee · 8 stamps'};
    const svg=await signupArtwork(input,'svg');
    expect(svg.toString()).not.toContain('<script>'); expect(svg.toString()).toContain('&lt;script&gt;');
    const png=await signupArtwork(input,'png');
    const {data,info}=await sharp(png).extract({left:150,top:360,width:500,height:500}).greyscale().raw().toBuffer({resolveWithObject:true});
    const source=new RGBLuminanceSource(new Uint8ClampedArray(data),info.width,info.height);
    expect(new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(source))).getText()).toBe(destination);
  }, 20000);
  it('normalizes real Pakistani numbers and rejects invalid optional input', () => {
    expect(phone.parse('0300 1234567')).toBe('+923001234567');
    expect(phone.parse('')).toBe('');
    expect(phone.safeParse('123').success).toBe(false);
  });
  it('rejects actor injection, malformed birthday and unsupported consent pairs', () => {
    const profile = { displayName: 'A', timezone: 'Asia/Karachi', birthdayMonth: 2, birthdayDay: 29, updateMembershipNames: false, rowVersion: 1 };
    expect(profileSchema.safeParse(profile).success).toBe(true);
    expect(profileSchema.safeParse({ ...profile, birthdayDay: 30 }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, userId: 'injected' }).success).toBe(false);
    expect(consentSchema.safeParse({ membershipId: crypto.randomUUID(), channel: 'inbox', purpose: 'marketing', allowed: true, textVersion: 'v1' }).success).toBe(false);
  });
  it('does not accept referral, computed units or signup without versioned terms', () => {
    expect(joinSchema.safeParse({ businessSlug: 'cafe-test', displayName: 'A', units: '100' }).success).toBe(false);
    expect(bootstrapSchema.safeParse({ slug: 'cafe', createdBy: crypto.randomUUID(), planVersionId: crypto.randomUUID() }).success).toBe(false);
  });
});
describe('real raster decoder boundary', () => {
  it('re-encodes a valid PNG into a bounded WebP without metadata', async () => {
    const image = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#166534' } }).png().toBuffer();
    const result = await sanitizeImage(image, 'image/png', 'logo');
    const meta = await sharp(result.data).metadata();
    expect(meta.format).toBe('webp'); expect(meta.width).toBe(100); expect(meta.exif).toBeUndefined();
  });
  it('rejects mislabeled and executable image content', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer();
    await expect(sanitizeImage(png, 'image/jpeg', 'logo')).rejects.toThrow();
    await expect(sanitizeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/png', 'logo')).rejects.toThrow();
  });
  it('rejects more than twenty megapixels and excessive decompression ratio', async () => {
    const huge = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: '#fff' } }).png().toBuffer();
    await expect(sanitizeImage(huge, 'image/png', 'cover')).rejects.toThrow();
    const bomb = await sharp({ create: { width: 2000, height: 2000, channels: 3, background: '#fff' } }).webp({ lossless: true }).toBuffer();
    expect(2000 * 2000 * 4 / bomb.length).toBeGreaterThan(1000);
    await expect(sanitizeImage(bomb, 'image/webp', 'cover').then(() => undefined)).rejects.toThrow();
  });
});
