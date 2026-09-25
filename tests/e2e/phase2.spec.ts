import { test, expect } from '@playwright/test';

test('Phase 2 real form components render accessible controls without overflow', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  for (const form of ['onboarding', 'programme', 'staff', 'join', 'preferences', 'branch', 'profile', 'mfa']) {
    await page.goto(`/ui-fixtures/phase2?form=${form}`);
    await expect(page.getByRole('heading', { level: 1, name: `Phase 2 ${form} controls` })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), form).toBe(true);
  }
  expect(errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('phase2-mfa.png'), fullPage: true });
});

test('onboarding retains browser-session business draft and sends complete bootstrap fields', async ({ page }) => {
  let body: Record<string, unknown> | undefined;
  await page.route('**/api/tenancy/bootstrap', async route => { body = route.request().postDataJSON(); await route.fulfill({ status: 409, json: { error: { code: 'conflict', message: 'Test conflict: slug already exists.' } } }); });
  await page.goto('/ui-fixtures/phase2?form=onboarding');
  await page.getByLabel('Business name', { exact: true }).fill('TEST cafe');
  await page.getByLabel('Public URL slug').fill('test-cafe');
  await page.getByRole('button', { name: 'Continue to branch' }).click();
  await page.getByLabel('Branch name', { exact: true }).fill('TEST branch');
  await page.getByLabel('Address', { exact: true }).fill('Fictional address');
  await page.getByLabel('City', { exact: true }).fill('Lahore');
  await page.getByRole('button', { name: 'Add opening interval' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByLabel('Business name', { exact: true })).toHaveValue('TEST cafe');
  await page.getByRole('button', { name: 'Continue to branch' }).click();
  await expect(page.getByLabel('Address', { exact: true })).toHaveValue('Fictional address');
  await page.reload();
  await page.getByRole('button', { name: 'Continue to branch' }).click();
  await expect(page.getByLabel('Address', { exact: true })).toHaveValue('Fictional address');
  await expect(page.getByLabel('Opens', { exact: true })).toHaveValue('09:00');
  await page.getByRole('button', { name: 'Save branch and start trial' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Test conflict' })).toBeVisible();
  expect(body).toMatchObject({ name: 'TEST cafe', slug: 'test-cafe', branchName: 'TEST branch', address: 'Fictional address', city: 'Lahore', hours: [{ weekday: 1, opensAt: '09:00', closesAt: '18:00' }] });
  expect(body).not.toHaveProperty('createdBy');
  await expect(page.getByLabel('Address', { exact: true })).toHaveValue('Fictional address');
  await page.screenshot({ path: test.info().outputPath('phase2-onboarding.png'), fullPage: true });
});

test('join preserves input on failure and sends explicit separate marketing choices', async ({ page }) => {
  let body: Record<string, unknown> | undefined;
  await page.route('**/api/tenancy/join', async route => { body = route.request().postDataJSON(); await route.fulfill({ status: 409, json: { error: { code: 'conflict', message: 'Test stale terms. Reload current terms.' } } }); });
  await page.goto('/ui-fixtures/phase2?form=join');
  await expect(page.getByRole('checkbox', { name: 'Share my verified email with this cafe' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Receive WhatsApp offers from this cafe' })).toBeDisabled();
  await page.getByLabel('WhatsApp number (optional)', { exact: false }).fill('0300 1234567');
  await page.getByRole('checkbox', { name: 'Receive WhatsApp offers from this cafe' }).check();
  await page.getByRole('checkbox', { name: 'I accept the programme terms', exact: false }).check();
  await page.getByRole('button', { name: 'Join and view my card' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Test stale terms' })).toBeVisible();
  expect(body).toMatchObject({ phone: '+923001234567', shareVerifiedEmail: false, whatsappMarketingConsent: true, rejoin: false });
  expect(body).toHaveProperty('acceptedProgrammeVersionId'); expect(body).toHaveProperty('privacyDocumentId');
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('TEST customer');
  await page.screenshot({ path: test.info().outputPath('phase2-join.png'), fullPage: true });
});

test('private Phase 2 endpoints are no-store and deny mutations without configured identity', async ({ request }) => {
  for (const endpoint of ['bootstrap', 'programme', 'publish', 'invite', 'join', 'contact', 'consent', 'leave', 'branch', 'reserve-media', 'resend-invite']) {
    const response = await request.post(`/api/tenancy/${endpoint}`, { data: {} });
    expect(response.status()).toBe(503); expect(response.headers()['cache-control']).toContain('no-store');
  }
  const mfa = await request.post('/api/auth/mfa', { data: { action: 'enroll' } });
  expect(mfa.status()).toBe(503); expect(mfa.headers()['cache-control']).toContain('no-store');
});
