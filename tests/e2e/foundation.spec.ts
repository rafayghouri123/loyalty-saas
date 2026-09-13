import { test, expect } from '@playwright/test';

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
});
