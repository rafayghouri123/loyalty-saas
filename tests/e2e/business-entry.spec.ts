import { test, expect } from '@playwright/test';

test('trial keeps business onboarding context while customer login remains separate',async({page})=>{
  await page.goto('/');
  await page.getByRole('link',{name:'Start your cafe trial',exact:false}).first().click();
  await expect(page).toHaveURL(/intent=business&next=\/dashboard\/onboarding/u);
  await expect(page.getByRole('heading',{name:'Start your cafe trial.'})).toBeVisible();
  await expect(page.getByText('Sign in to create your business and set up your loyalty programme.')).toBeVisible();
  await page.goto('/auth/login');
  await expect(page.getByText('Sign in to keep your loyalty cards together.')).toBeVisible();
});

test('business setup preserves details across authenticator navigation without customer links',async({page})=>{
  await page.goto('/ui-fixtures/business');
  await expect(page.getByRole('heading',{name:"Let's set up your cafe."})).toBeVisible();
  await expect(page.locator('a[href^="/app"]')).toHaveCount(0);
  await page.getByLabel('Business name',{exact:true}).fill('TEST saved cafe');
  await page.getByLabel('Public URL slug').fill('test-saved-cafe');
  await page.getByRole('link',{name:'Set up or verify authenticator'}).click();
  await expect(page).toHaveURL(/\/auth\/mfa\?next=\/dashboard\/onboarding/u);
  await page.goto('/ui-fixtures/business');
  await expect(page.getByLabel('Business name',{exact:true})).toHaveValue('TEST saved cafe');
  await expect(page.getByLabel('Public URL slug')).toHaveValue('test-saved-cafe');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('business-onboarding.png'),fullPage:true});
});

test('business picker has role-specific destinations and sign-out stays in business login',async({page})=>{
  let attempts=0;
  await page.route('**/api/auth/logout',route=>route.fulfill(++attempts===1?{status:503,json:{error:{message:'Retry signing out.'}}}:{status:200,json:{data:{signedOut:true}}}));
  await page.goto('/ui-fixtures/business?view=workspaces');
  await expect(page.locator('a[href^="/app"]')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Create business'})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Continue setup'})).toHaveAttribute('href','/dashboard/b2000000-0000-4000-8000-000000000001');
  await expect(page.getByRole('link',{name:'Open scanner'})).toHaveAttribute('href','/staff/b2000000-0000-4000-8000-000000000002');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('business-workspaces.png'),fullPage:true});
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Retry signing out.'})).toBeVisible();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page).toHaveURL(/\/auth\/login\?intent=business$/u);
});

test('support-approved owner can see the additional business action',async({page})=>{
  await page.goto('/ui-fixtures/business?view=workspaces-granted');
  await expect(page.getByRole('link',{name:'Create another business'})).toHaveAttribute('href','/dashboard/onboarding');
});
