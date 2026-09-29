import { test, expect } from '@playwright/test';
test('batch preview excludes ineligible contacts and a confirmed retry keeps its idempotency key',async({page})=>{
 const keys:string[]=[];
 await page.route('**/api/whatsapp/preview-batch',route=>route.fulfill({json:{data:{eligible:1,excluded:1,templateVersion:1,members:[
  {membershipId:'b6000000-0000-4000-8000-000000000005',name:'TEST Ayesha',body:'Hello Ayesha, visit TEST cafe.',exclusion:null,recentContactWarning:true},
  {membershipId:'b6000000-0000-4000-8000-000000000009',name:'TEST no consent',body:null,exclusion:'no_whatsapp_consent',recentContactWarning:false}]}}}));
 await page.route('**/api/whatsapp/create-batch',async route=>{keys.push(route.request().postDataJSON().idempotencyKey);
  await route.fulfill(keys.length===1?{status:503,json:{error:{message:'Commit result unavailable. Retry.'}}}:{json:{data:{batchId:'b6000000-0000-4000-8000-000000000010',createdTasks:1,excluded:1}}});});
 await page.goto('/ui-fixtures/phase6?form=batch');await page.getByLabel('Batch name').fill('TEST follow-up');
 await page.getByRole('combobox',{name:/^Template/u}).selectOption('b6000000-0000-4000-8000-000000000003');await page.getByRole('checkbox',{name:'TEST Ayesha'}).check();
 await page.getByRole('button',{name:'Preview tasks'}).click();await expect(page.getByText('Excluded: no whatsapp consent',{exact:true})).toBeVisible();
 await expect(page.getByText('Recent contact in the last 24 hours.',{exact:false})).toBeVisible();expect(keys).toHaveLength(0);
 await page.getByLabel('Batch name').fill('TEST renamed');await expect(page.getByRole('button',{name:'Create follow-up tasks'})).toBeDisabled();
 await page.getByRole('button',{name:'Preview tasks'}).click();await page.getByRole('button',{name:'Create follow-up tasks'}).click();
 await expect(page.getByRole('dialog',{name:'Create manual tasks?'})).toBeVisible();expect(keys).toHaveLength(0);await page.getByRole('button',{name:'Create tasks',exact:true}).click();
 await expect(page.getByRole('status')).toHaveText('Commit result unavailable. Retry.');await expect(page.getByLabel('Batch name')).toHaveValue('TEST renamed');
 await page.getByRole('button',{name:'Preview tasks'}).click();await page.getByRole('button',{name:'Create follow-up tasks'}).click();await page.getByRole('button',{name:'Create tasks',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('No messages have been sent.');expect(keys).toHaveLength(2);expect(keys[1]).toBe(keys[0]);expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/u);
});
test('Phase 6 live components fit mobile and preserve honest manual states',async({page})=>{
 for(const form of ['templates','batch','task','list','stale','opted-out']){
  await page.goto(`/ui-fixtures/phase6?form=${form}`);
  await expect(page.getByText('Messages are sent manually.',{exact:false})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),form).toBe(true);
  if(form==='stale'||form==='opted-out')await expect(page.getByRole('button',{name:'Open WhatsApp',exact:true})).toBeDisabled();
 }
 await page.screenshot({path:test.info().outputPath('phase6-optout.png'),fullPage:true});
});
test('template grammar blocks save and API errors preserve authored content',async({page})=>{
 await page.route('**/api/whatsapp/save-template',route=>route.fulfill({status:409,json:{error:{message:'Template changed. Refresh.'}}}));
 await page.goto('/ui-fixtures/phase6?form=templates');
 await page.getByLabel('Template name').fill('TEST hello');await page.getByLabel('Message body',{exact:false}).fill('Hello {{unknown}} today');
 await expect(page.getByRole('button',{name:'Save template'})).toBeDisabled();
 await page.getByLabel('Message body',{exact:false}).fill('Hello {{first_name}} today');
 await page.getByRole('button',{name:'Save template'}).click();
 await expect(page.getByRole('status').filter({hasText:'Template changed'})).toBeVisible();
 await expect(page.getByLabel('Message body',{exact:false})).toHaveValue('Hello {{first_name}} today');
});
test('explicit open navigates to the encoded chat and only explicit attestation can mark sent',async({page,context})=>{
 let marked=0;
 await page.route('**/api/whatsapp/open-task',async route=>{expect(route.request().postDataJSON()).toMatchObject({rowVersion:1});
  await route.fulfill({json:{data:{url:'https://wa.me/923001234567?text='+encodeURIComponent('Hello Ayesha 😀 & friends.\nVisit TEST cafe.'),rowVersion:2,leaseExpiresAt:new Date(Date.now()+300000).toISOString()}}});});
 await context.route('https://wa.me/**',route=>route.fulfill({contentType:'text/html',body:'Synthetic click-to-chat target; no message sent.'}));
 await page.route('**/api/whatsapp/task-action',async route=>{marked++;expect(route.request().postDataJSON()).toMatchObject({action:'mark_sent',attestsSent:true,rowVersion:2});await route.fulfill({status:409,json:{error:{message:'Consent changed. Refresh task.'}}});});
 await page.goto('/ui-fixtures/phase6?form=task');await expect(page.getByRole('button',{name:'Mark as sent'})).toBeDisabled();
 const popupEvent=page.waitForEvent('popup');await page.getByRole('button',{name:'Open WhatsApp',exact:true}).click();const popup=await popupEvent;
 await expect(popup).toHaveURL(/https:\/\/wa\.me\/923001234567/u);
 expect(new URL(popup.url()).searchParams.get('text')).toBe('Hello Ayesha 😀 & friends.\nVisit TEST cafe.');
 expect(marked).toBe(0);await popup.close();
 await page.getByRole('checkbox',{name:'I personally sent',exact:false}).check();await page.getByRole('button',{name:'Mark as sent'}).click();
 await expect(page.getByRole('dialog',{name:'Record message as sent?'})).toBeVisible();await page.getByRole('button',{name:'Confirm action'}).click();
 await expect(page.getByRole('status').filter({hasText:'Consent changed'})).toBeVisible();expect(marked).toBe(1);
});
test('private manual endpoints return no-store and safely reject missing identity',async({request})=>{
 for(const operation of ['configuration','save-template','preview-batch','create-batch','tasks','task-detail','open-task','task-action','member-contact']){
  const response=await request.post(`/api/whatsapp/${operation}`,{data:{}});expect([401,403,503]).toContain(response.status());expect(response.headers()['cache-control']).toContain('no-store');
  expect(await response.text()).not.toContain('923001234567');
 }
});
