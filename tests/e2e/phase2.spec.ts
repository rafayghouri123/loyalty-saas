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

test('programme creation and editing share usable controls', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  for (const form of ['programme-new', 'programme-edit']) {
    await page.goto(`/ui-fixtures/phase2?form=${form}`);
    await expect(page.getByLabel('Programme name')).toBeVisible();
    await expect(page.getByLabel('Minimum eligible spend (Rs)')).toBeVisible();
    await page.getByLabel('Programme type').selectOption('points');
    await expect(page.getByLabel('Points per step')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), form).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`${form}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('reward creation and editing share usable controls', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  for (const form of ['reward-new', 'reward-edit']) {
    await page.goto(`/ui-fixtures/phase2?form=${form}`);
    await expect(page.getByLabel('Reward title')).toBeVisible();
    await expect(page.getByLabel('Required units')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'TEST main branch' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), form).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`${form}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('new programme retains reward details across steps', async ({ page }) => {
  await page.goto('/ui-fixtures/phase2?form=programme-new');
  await page.getByLabel('Programme name').fill('TEST second card');
  await page.getByLabel('Programme terms').fill('TEST only: earn on eligible purchases.');
  await page.getByRole('button', { name: 'Continue to reward' }).click();
  await page.getByLabel('Reward title').fill('TEST pastry');
  await page.getByLabel('Required units').fill('5');
  await page.getByLabel('Reward terms').fill('TEST only: five stamps for a pastry.');
  await page.getByRole('checkbox', { name: 'TEST main branch' }).check();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Continue to reward' }).click();
  await expect(page.getByLabel('Reward title')).toHaveValue('TEST pastry');
  await expect(page.getByRole('checkbox', { name: 'TEST main branch' })).toBeChecked();
});

test('reward edit saves changed fields before publishing', async ({ page }) => {
  let body: Record<string, unknown> | undefined;
  await page.route('**/api/loyalty/save-reward', async route => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 409, json: { error: { message: 'TEST save conflict' } } });
  });
  await page.goto('/ui-fixtures/phase2?form=reward-edit');
  await page.getByLabel('Reward title').fill('TEST new pastry');
  await expect(page.getByRole('button', { name: 'Publish reward' })).toBeDisabled();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status')).toContainText('TEST save conflict');
  expect(body).toMatchObject({ rewardId: 'b2000000-0000-4000-8000-000000000025', rowVersion: 1, title: 'TEST new pastry', unitCost: 8 });
});

test('published reward edit saves a draft on the same reward', async ({ page }) => {
  let body: Record<string, unknown> | undefined;
  await page.route('**/api/loyalty/save-reward', async route => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 409, json: { error: { message: 'TEST save conflict' } } });
  });
  await page.goto('/ui-fixtures/phase2?form=reward-edit-published');
  await expect(page.getByRole('heading', { name: 'Edit reward' })).toBeVisible();
  await expect(page.getByLabel('Reward title')).toHaveValue('TEST published treat');
  await page.getByLabel('Reward title').fill('TEST revised treat');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status')).toContainText('TEST save conflict');
  expect(body).toMatchObject({ rewardId: 'b2000000-0000-4000-8000-000000000025', rowVersion: 3, title: 'TEST revised treat', unitCost: 10 });
});

test('staff checkout makes the award action clear and commits the reviewed stamps', async ({ page }) => {
  const businessId='b2000000-0000-4000-8000-000000000020';
  await page.addInitScript(({businessId}) => {
    sessionStorage.setItem(`loyalty-checkout:${businessId}`,JSON.stringify({contextId:'b2000000-0000-4000-8000-000000000030',
      checkoutContext:'a'.repeat(43),kind:'earning',memberName:'TEST customer',businessId,
      branchId:'b2000000-0000-4000-8000-000000000022',branchName:'TEST main branch',
      programmeId:'b2000000-0000-4000-8000-000000000021',programmeName:'TEST stamps',programmeType:'stamps',balance:'2',
      rewardTitle:null,rewardUnitCost:null,expiresAt:'2100-01-01T00:00:00Z'}));
  },{businessId});
  let recorded:Record<string,unknown>|undefined;
  await page.route('**/api/loyalty/preview-purchase',route=>route.fulfill({json:{data:{baseUnits:'1',promotionBonusUnits:'0',referralBonusUnits:'0',inviterBonusUnits:'0',
    promotionReason:'none',referralReason:'none',balance:'2',qualifiesForLoyalty:true,capReduced:false,expectedEffectHash:'a'.repeat(64),programmeVersionId:'b2000000-0000-4000-8000-000000000024'}}}));
  await page.route('**/api/loyalty/record-purchase',async route=>{recorded=route.request().postDataJSON();await route.fulfill({json:{data:{purchaseId:'b2000000-0000-4000-8000-000000000031',receiptReference:null,balanceAfterAtCommit:'3',baseUnits:'1',promotionBonusUnits:'0',referralBonusUnits:'0',inviterBonusUnits:'0'}}});});
  page.on('dialog',dialog=>void dialog.accept());
  await page.goto('/ui-fixtures/phase2?form=staff-checkout');
  await page.getByLabel('Qualifying purchase confirmed').check();
  await expect(page.getByRole('status')).toContainText('review the purchase');
  await page.getByRole('button',{name:'Review purchase'}).click();
  await expect(page.getByRole('status')).toContainText('Enter the paid bill');
  await page.getByLabel('Bill total paid (Rs)').fill('100');
  await page.getByLabel('Eligible spend (Rs)').fill('100');
  await page.getByRole('button',{name:'Review purchase'}).click();
  await expect(page.getByText('After award 3')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Server preview'}).locator('..')).toBeFocused();
  await page.getByRole('button',{name:'Confirm and award'}).click();
  await expect(page.getByRole('heading',{name:'Purchase committed'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Purchase committed'}).locator('..')).toBeFocused();
  await expect(page.getByText('balance 3.',{exact:false})).toBeVisible();
  expect(recorded).toMatchObject({recordedBillPaisa:'10000',eligibleSpendPaisa:'10000',qualifyingPurchaseConfirmed:true,expectedEffectHash:'a'.repeat(64)});
});

test('checkout warns when eligible spend is below the stamp minimum', async ({ page }) => {
  const businessId='b2000000-0000-4000-8000-000000000020';
  await page.addInitScript(({businessId})=>sessionStorage.setItem(`loyalty-checkout:${businessId}`,JSON.stringify({
    contextId:'b2000000-0000-4000-8000-000000000030',checkoutContext:'a'.repeat(43),kind:'earning',memberName:'TEST customer',businessId,
    branchId:'b2000000-0000-4000-8000-000000000022',branchName:'TEST main branch',programmeName:'TEST stamps',programmeType:'stamps',
    balance:'2',rewardTitle:null,rewardUnitCost:null,expiresAt:'2100-01-01T00:00:00Z'})),{businessId});
  await page.route('**/api/loyalty/preview-purchase',route=>route.fulfill({json:{data:{baseUnits:'0',promotionBonusUnits:'0',referralBonusUnits:'0',
    inviterBonusUnits:'0',promotionReason:'none',referralReason:'none',balance:'2',qualifiesForLoyalty:false,capReduced:false,
    eligibleSpendPaisa:'25000',minimumSpendPaisa:'300000',expectedEffectHash:'a'.repeat(64),programmeVersionId:'b2000000-0000-4000-8000-000000000024'}}}));
  let committed=false;
  await page.route('**/api/loyalty/record-purchase',route=>{committed=true;return route.fulfill({json:{data:{}}});});
  page.on('dialog',dialog=>void dialog.dismiss());
  await page.goto('/ui-fixtures/phase2?form=staff-checkout');
  await page.getByLabel('Bill total paid (Rs)').fill('500');
  await page.getByLabel('Eligible spend (Rs)').fill('250');
  await page.getByLabel('Qualifying purchase confirmed').check();
  await page.getByRole('button',{name:'Review purchase'}).click();
  await expect(page.getByRole('alert').filter({hasText:'No stamps will be added'})).toContainText('Rs 3,000 minimum');
  await expect(page.getByRole('button',{name:'Record without stamps'})).toBeVisible();
  await page.getByRole('button',{name:'Record without stamps'}).click();
  expect(committed).toBe(false);
});

test('customer card refreshes its balance when returning from checkout', async ({ page }) => {
  let units='1',reads=0;
  await page.route('**/api/loyalty/card',async route=>{
    reads++;
    await route.fulfill({json:{data:{id:'b2000000-0000-4000-8000-000000000029',businessId:'b2000000-0000-4000-8000-000000000020',
      name:'TEST cafe',memberName:'TEST customer',status:'active',units,ledgerVersion:units,programmeName:'TEST stamps',programmeType:'stamps',
      rewards:[],activity:units==='2'?[{id:'b2000000-0000-4000-8000-000000000032',kind:'purchase',units:'1',occurredAt:'2026-09-29T00:00:00Z'}]:[]}}});
  });
  await page.route('**/api/loyalty/handle',route=>route.fulfill({json:{data:{qrValue:'LOYALTY:EARN:v1:TEST'}}}));
  await page.goto('/ui-fixtures/phase2?form=customer-card');
  await expect(page.getByRole('heading',{name:'1 stamps'})).toBeVisible();
  await expect.poll(()=>reads).toBeGreaterThan(0);
  units='2';
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading',{name:'2 stamps'})).toBeVisible();
  await expect(page.getByText('purchase · 1',{exact:false})).toBeVisible();
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
