import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { screens, screenById } from '../../src/features/screens/catalog';
import { allowed, type Access, type Field } from '../../src/features/screens/contracts';
import { fieldSchema, initialValues, rangeError, templateError, validateSections } from '../../src/features/screens/validation';
import { fixturesEnabled } from '../../src/features/screens/fixture-gate';

const owner: Access = { role: 'owner', grants: [] };
const input = (kind: Field['kind'], options: Partial<Field> = {}): Field => ({ id: 'input', label: 'Input', kind, ...options });
describe('Phase 1 contracts', () => {
  it('maps all 43 contracts to actual route files with unique accessible field IDs', () => {
    expect(screens).toHaveLength(43);
    expect(new Set(screens.map(screen => screen.id)).size).toBe(43);
    for (const screen of screens) {
      expect(screen.tables.length).toBeGreaterThan(0);
      expect(screen.operations.length).toBeGreaterThan(0);
      const fields = screen.sections.flatMap(section => section.fields ?? []);
      expect(new Set(fields.map(field => field.id)).size, screen.id).toBe(fields.length);
      for (const route of screen.routes) expect(existsSync(`src/app${route === '/' ? '' : route}/page.tsx`), route).toBe(true);
    }
  });
  it('denies fixtures in every hosted and production mode, including accidental development settings', () => {
    expect(fixturesEnabled({ APP_ENV: 'test' })).toBe(true);
    expect(fixturesEnabled({ APP_ENV: 'development' })).toBe(true);
    for (const env of [{}, { APP_ENV: 'production' }, { APP_ENV: 'development', VERCEL: '1' }, { APP_ENV: 'test', VERCEL_ENV: 'preview' }]) expect(fixturesEnabled(env)).toBe(false);
  });
  it('never grants cashier manager privileges and keeps billing/support explicit for admins', () => {
    expect(allowed({ role: 'cashier', grants: ['contacts', 'exports'] }, undefined, 'contacts')).toBe(false);
    expect(allowed({ role: 'manager', grants: [] }, undefined, 'reversals')).toBe(false);
    expect(allowed({ role: 'manager', grants: ['reversals'] }, undefined, 'reversals')).toBe(true);
    expect(allowed(owner, ['owner'], 'contacts')).toBe(true);
    expect(allowed(owner, undefined, 'billing')).toBe(false);
    expect(allowed({ role: 'admin', grants: [] }, undefined, 'billing')).toBe(false);
  });
  it('validates exact monetary decimals, integers, Unicode and upload metadata', () => {
    const money = fieldSchema(input('money', { required: true }));
    for (const good of ['0', '0.01', '250.05', '1000000']) expect(money.safeParse(good).success).toBe(true);
    for (const bad of ['-1', '1e3', '1.001', '1000000.01', 'NaN', '']) expect(money.safeParse(bad).success).toBe(false);
    const units = fieldSchema(input('integer', { min: 1, max: 10, required: true }));
    for (const bad of ['0', '1.5', '11', '1e1']) expect(units.safeParse(bad).success).toBe(false);
    expect(fieldSchema(input('textarea', { min: 3, max: 80 })).safeParse('😀'.repeat(80)).success).toBe(true);
    expect(fieldSchema(input('textarea', { min: 3, max: 80 })).safeParse('😀'.repeat(81)).success).toBe(false);
    expect(fieldSchema(input('file')).safeParse('asset.svg|20|image/svg+xml').success).toBe(false);
    expect(fieldSchema(input('file')).safeParse('asset.png|5242881|image/png').success).toBe(false);
    expect(fieldSchema(input('file')).safeParse('asset.png|200|image/png').success).toBe(true);
  });
  it('enforces inclusive report and promotion ranges with real calendar boundaries', () => {
    expect(rangeError('2026-01-01', '2026-03-31')).toBeUndefined();
    expect(rangeError('2026-01-01', '2026-04-01')).toContain('90');
    expect(rangeError('2026-02-30', '2026-03-01')).toBeTruthy();
    expect(rangeError('2026-03-01', '2026-02-28')).toBeTruthy();
    expect(rangeError('2024-01-01', '2024-12-31', 366)).toBeUndefined();
  });
  it('checks conditional earning fields and actual-paid purchase amounts', () => {
    const screen = screenById('S02')!;
    const values = { ...initialValues(screen), bill: '100.00', eligible: '100.01', qualifying: 'true', claim: 'None' };
    expect(validateSections(screen, values, { role: 'cashier', grants: [] }).eligible).toContain('cannot exceed');
    const result = validateSections(screen, { ...values, eligible: '100.00', mode: 'Points', qualifying: 'false' }, { role: 'cashier', grants: [] });
    expect(result).toEqual({});
    const discount = validateSections(screen, { ...values, eligible: '90', claim: 'Discount' }, { role: 'cashier', grants: [] });
    expect(discount.beforeDiscount).toBeTruthy(); expect(discount.discountApplied).toBeTruthy(); expect(discount.claimIntent).toBeTruthy();
    const programme = screenById('O05')!;
    const base = { ...initialValues(programme), programmeName: 'My programme', programmeTerms: 'A qualifying purchase.', effectiveAt: '2030-01-01T10:00', stamps: '3', baseCap: '2' };
    expect(validateSections(programme, base, owner).baseCap).toBeTruthy();
    expect(validateSections(programme, { ...base, mode: 'Points', step: '0.99' }, owner).step).toBeTruthy();
  });
  it('requires paired valid optional birthdays and consent-linked phone', () => {
    const account = screenById('C06')!, customer: Access = { role: 'customer', grants: [] };
    const base = { ...initialValues(account), displayName: 'Sample', birthdayMonth: '2', birthdayDay: '29' };
    expect(validateSections(account, base, customer)).toEqual({});
    expect(validateSections(account, { ...base, birthdayDay: '30' }, customer).birthdayDay).toBeTruthy();
    expect(validateSections(account, { ...base, birthdayMonth: '' }, customer).birthdayDay).toBeTruthy();
    const prefs = screenById('C07')!;
    expect(validateSections(prefs, { ...initialValues(prefs), whatsapp: 'true', phone: '' }, customer).phone).toBeTruthy();
  });
  it('rejects malformed WhatsApp templates and missing placeholder dependencies', () => {
    expect(templateError('Hi {{first_name}}, visit {{business_name}}.')).toBeUndefined();
    for (const bad of ['Hi {{phone}}', 'Hi {first_name}', '{{{first_name}}}', '{{first_name', '{{ first_name }}']) expect(templateError(bad)).toBeTruthy();
    const screen = screenById('O13')!;
    const result = validateSections(screen, { ...initialValues(screen), templateBody: 'Enjoy {{reward_name}} at {{public_offer_url}}.', audience: 'Reward ready' }, owner);
    expect(result.targetReward).toBeTruthy(); expect(result.offer).toBeTruthy();
  });
  it('requires claimable offer terms and discount fields without imposing them on informational offers', () => {
    const screen = screenById('O11')!;
    const base = { ...initialValues(screen), offerTitle: 'Sample offer', description: 'Sample information', branches: 'Sample branch', startsAt: '2030-01-01T10:00', expiresAt: '2030-01-02T10:00' };
    expect(validateSections(screen, base, owner)).toEqual({});
    const errors = validateSections(screen, { ...base, kind: 'Discount' }, owner);
    expect(errors.terms).toBeTruthy(); expect(errors.percent).toBeTruthy();
  });
});
