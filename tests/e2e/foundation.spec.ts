import { test, expect } from '@playwright/test';

test('customer navigation reaches honest setup pages with an accessible current location', async ({ page }) => {
  await page.goto('/app');
  const navigation = page.getByRole('navigation', { name: 'Customer navigation' });
  await expect(navigation.getByRole('link', { name: 'Cards', exact: true })).toHaveAttribute('aria-current', 'page');
  for (const label of ['Offers', 'Referrals', 'Account']) {
    const link = navigation.getByRole('link', { name: label, exact: true });
    const bounds = await link.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: label, exact: true })).toBeVisible();
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(page.getByText('This development environment is not connected to authentication yet.', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath('customer-shell.png'), fullPage: true });
});

test('public preview is honest and usable on narrow and desktop screens',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toContainText('A little thank you.');
  await expect(page.getByText('Illustrative card · Example terms, not an active programme')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Contact us for pricing'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('landing.png'),fullPage:true});
  await page.getByRole('link',{name:'Business sign in'}).click();
  await expect(page.getByRole('heading',{name:'Welcome back.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Send sign-in link'})).toBeDisabled();
});

test('unconfigured private pages never show fabricated memberships or healthy readiness',async({request})=>{
  const cards=await request.get('/app');
  expect(cards.headers()['cache-control']).toContain('no-store');
  expect(await cards.text()).toContain('A few things need setting up');
  const health=await request.get('/api/health/ready');
  expect(health.status()).toBe(503);
  expect(await health.json()).toMatchObject({database:'not_configured'});
  const write=await request.post('/api/profile',{data:{displayName:'Customer'}});
  expect(write.status()).toBe(503);
  expect(write.headers()['cache-control']).toContain('no-store');
  const manifest=await request.get('/manifest.webmanifest');
  expect(manifest.headers()['cache-control']).not.toContain('immutable');
  expect(await manifest.json()).toMatchObject({id:'/',start_url:'/app',scope:'/',display:'standalone'});
  const serviceWorker=await request.get('/sw.js');
  expect(serviceWorker.headers()['cache-control']).toContain('must-revalidate');
  for(const path of ['/api/push/register','/api/push/acknowledge','/api/push/revoke','/api/auth/logout']) {
    const response=await request.post(path,{data:{}});
    expect(response.status()).toBe(503);expect(response.headers()['cache-control']).toContain('no-store');
  }
});

test('entering sign-in clears the previous account binding from real browser storage',async({page})=>{
  await page.goto('/');
  await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open('loyalty-device-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('state');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    await new Promise<void>((resolve,reject)=>{
      const transaction=db.transaction('state','readwrite'),store=transaction.objectStore('state');
      store.put({userId:'previous-fixture-account',installationId:crypto.randomUUID(),bindingGeneration:crypto.randomUUID()},'binding');store.put('previous-epoch','epoch');
      transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);
    });db.close();
  });
  await page.goto('/auth/login');
  await expect.poll(()=>page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('loyalty-device-v1',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    try{return await new Promise<boolean>((resolve,reject)=>{const request=db.transaction('state').objectStore('state').get('binding');request.onsuccess=()=>resolve(request.result===undefined);request.onerror=()=>reject(request.error);});}finally{db.close();}
  })).toBe(true);
});
