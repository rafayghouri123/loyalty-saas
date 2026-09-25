import { test, expect } from '@playwright/test';
import { screens } from '../../src/features/screens/catalog';

test('all 43 local screen contracts render without browser errors or horizontal overflow', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const screen of screens) {
    await page.goto(`/ui-fixtures/screens/${screen.id}`);
    await expect(page.getByRole('heading', { level: 1, name: screen.title, exact: true })).toBeVisible();
    await expect(page.getByText('Local design fixture · Sample data only.', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), screen.id).toBe(true);
    expect(await page.locator('main').count()).toBe(1);
  }
  expect(errors).toEqual([]);
});

test('checkout validates amounts, reveals discount conditions and keeps financial commit disabled', async ({ page }) => {
  await page.goto('/ui-fixtures/screens/S02');
  await page.getByLabel('Bill total paid (Rs)').fill('100.00');
  await page.getByLabel('Eligible spend (Rs)', { exact: false }).fill('100.01');
  await page.getByLabel('Qualifying purchase confirmed').check();
  await page.getByRole('button', { name: 'Review purchase', exact: true }).click();
  await expect(page.getByLabel('Eligible spend (Rs)', { exact: false })).toBeFocused();
  await expect(page.getByText('Eligible spend cannot exceed the actual paid bill.')).toBeVisible();
  await page.getByLabel('Eligible spend (Rs)', { exact: false }).fill('100');
  await page.getByLabel('Associated claimed offer').selectOption('Discount');
  await expect(page.getByLabel('Eligible goods before this offer (Rs)')).toBeVisible();
  await page.getByRole('button', { name: 'Review purchase', exact: true }).click();
  await expect(page.getByLabel('Eligible goods before this offer (Rs)')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Associated claimed offer').selectOption('None');
  await page.getByRole('button', { name: 'Review purchase', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review purchase', exact: true })).toBeFocused();
  await expect(page.getByLabel('Bill total paid (Rs)')).toHaveValue('100.00');
  await expect(page.getByRole('button', { name: 'Confirm and award', exact: true })).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath('checkout.png'), fullPage: true });
});

test('camera starts only on request, permission denial retains typed fallback', async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { calls++; throw new DOMException('Denied', 'NotAllowedError'); } });
    Object.defineProperty(window, 'cameraCalls', { get: () => calls });
  });
  await page.goto('/ui-fixtures/screens/S01');
  expect(await page.evaluate(() => (window as unknown as { cameraCalls: number }).cameraCalls)).toBe(0);
  await page.getByRole('button', { name: 'Scan customer QR', exact: true }).click();
  await expect(page.getByText('Camera permission denied.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Enter customer code', exact: true }).click();
  await expect(page.getByLabel('Eight-character customer code')).toBeFocused();
  await page.getByLabel('Eight-character customer code').fill('AB12CD34');
  await page.getByRole('button', { name: 'Look up customer' }).click();
  await expect(page.getByText('Preview validated. Nothing has been saved or sent.')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('scanner-denied.png'), fullPage: true });
});

test('role previews hide restricted sections, never allow cashier grants, and enforce admin capability', async ({ page }) => {
  await page.goto('/ui-fixtures/screens/O04?role=manager');
  await expect(page.getByRole('heading', { name: 'Shared contacts' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Adjust units', exact: true })).toHaveCount(0);
  await page.goto('/ui-fixtures/screens/S04?role=cashier&grants=reversals');
  await expect(page.getByRole('button', { name: 'Reverse purchase' })).toHaveCount(0);
  await page.goto('/ui-fixtures/screens/O13?role=manager');
  await expect(page.getByRole('heading', { name: 'Access unavailable' })).toBeVisible();
  await expect(page.getByLabel('Template body')).toHaveCount(0);
  await page.goto('/ui-fixtures/screens/O13?role=manager&grants=contacts');
  await expect(page.getByLabel('Template body')).toBeVisible();
  await page.goto('/ui-fixtures/screens/A04?role=admin&grants=');
  await expect(page.getByRole('heading', { name: 'Access unavailable' })).toBeVisible();
});

test('staff invitations clear manager permissions when role changes and consent requires valid phone', async ({ page }) => {
  await page.goto('/ui-fixtures/screens/O16');
  await expect(page.getByLabel('Campaign management')).toHaveCount(0);
  await page.getByLabel('Staff role').selectOption('Manager');
  await page.getByLabel('Campaign management').check();
  await page.getByLabel('Staff role').selectOption('Cashier');
  await page.getByLabel('Staff role').selectOption('Manager');
  await expect(page.getByLabel('Campaign management')).not.toBeChecked();
  await page.goto('/ui-fixtures/screens/P05');
  const consent = page.getByLabel('Receive WhatsApp offers from this cafe');
  await expect(consent).toBeDisabled();
  await page.getByLabel('WhatsApp number').fill('03001234567');
  await consent.check();
  await page.getByLabel('WhatsApp number').fill('03007654321');
  await expect(consent).not.toBeChecked();
  await expect(page.getByLabel('Share my email with this cafe')).not.toBeChecked();
});

test('campaign conditionals, Unicode count, report boundaries and keyboard tabs work', async ({ page }) => {
  await page.goto('/ui-fixtures/screens/O10');
  await page.getByLabel('Audience', { exact: false }).selectOption('Near reward');
  await expect(page.getByLabel('Target reward')).toBeVisible();
  await expect(page.getByLabel('Units away from reward')).toBeVisible();
  await expect(page.getByLabel('Inactive days')).toHaveCount(0);
  await page.getByLabel('Notification title').fill('😀'.repeat(80));
  await expect(page.getByText('80/80 characters', { exact: false })).toBeVisible();
  await page.getByLabel('Destination').selectOption('Offer');
  await expect(page.locator('#offer')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('campaign.png'), fullPage: true });
  await page.goto('/ui-fixtures/screens/O15');
  await page.getByLabel('Date range').selectOption('Custom');
  await page.getByLabel('From', { exact: true }).fill('2026-01-01');
  await page.getByLabel('Through', { exact: true }).fill('2026-04-01');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('Choose an inclusive date range of 1–90 days.')).toBeVisible();
  await page.getByRole('tab', { name: 'Overview', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Customers', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel')).toContainText('Customers report');
  await page.screenshot({ path: test.info().outputPath('reports.png'), fullPage: true });
});

test('onboarding retains safe step-one draft and weekly hours reject overlaps', async ({ page }) => {
  await page.goto('/ui-fixtures/screens/O01');
  await page.getByLabel('Published plan').selectOption('Sample plan · fixture only');
  await page.getByLabel('Business name').fill('Sample cafe');
  await page.getByLabel('Slug', { exact: false }).fill('sample-cafe');
  await page.reload();
  await expect(page.getByLabel('Business name')).toHaveValue('Sample cafe');
  await expect(page.getByLabel('Logo')).toBeDisabled();
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.getByRole('heading', { name: '2 · Branch', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add Monday interval', exact: true }).click();
  await page.getByRole('button', { name: 'Add Monday interval', exact: true }).click();
  await expect(page.getByText('Intervals must end later on the same day and cannot overlap.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByLabel('Business name')).toHaveValue('Sample cafe');
});

test('states block unsafe controls and layouts survive large text', async ({ page }) => {
  await page.goto('/ui-fixtures/screens/C02?state=offline');
  await expect(page.getByRole('button', { name: 'Get checkout code' })).toBeDisabled();
  await expect(page.getByText('Offline · Last updated', { exact: false })).toBeVisible();
  await page.addStyleTag({ content: 'body { font-size: 32px !important; }' });
  await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('customer-large-text.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/ui-fixtures/screens/S02?state=uncertain');
  await expect(page.getByRole('button', { name: 'Review purchase', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Check original request' })).toBeEnabled();
});

test('actual route selectors and query roles never expose fixture tenant data', async ({ request }) => {
  for (const route of ['/staff/guessed/checkout?role=owner', '/dashboard/guessed/settings?demo=true', '/admin/billing?role=admin', '/app/cards/guessed/rewards', '/invite/guessed']) {
    const response = await request.get(route);
    expect(response.headers()['cache-control']).toContain('no-store');
    const html = await response.text();
    expect(html).not.toContain('Sample neighbourhood cafe');
    expect(html).not.toContain('Sample member');
  }
  expect((await request.get('/b/unknown-cafe')).status()).toBe(404);
  expect((await request.get('/r/not-a-referral-code')).status()).toBe(404);
});
