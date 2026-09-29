import { test, expect } from '@playwright/test';
import axe from 'axe-core';
import { screens } from '../../src/features/screens/catalog';

test('WCAG A/AA automated audit covers all 43 contracts and live billing/privacy controls', async ({page}) => {
  test.setTimeout(240000);
  const results=[];
  for(const path of [...screens.map(s=>`/ui-fixtures/screens/${s.id}`),'/ui-fixtures/phase2','/ui-fixtures/phase6','/ui-fixtures/phase8','/ui-fixtures/phase8?form=plans','/ui-fixtures/phase8?form=privacy','/auth/login','/']) {
    await page.goto(path);await page.locator('main').waitFor();
    // Playwright injection runs the audit in the test browser; it is never a
    // production script or a reason to relax CSP.
    await page.evaluate(axe.source);
    const result=await page.evaluate(async()=>(window as unknown as {axe:typeof axe}).axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
    results.push({path,violations:result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),manualReview:result.incomplete.map(v=>v.id)});
  }
  await test.info().attach('accessibility-audit.json',{body:JSON.stringify(results,null,2),contentType:'application/json'});
  expect(results.filter(r=>r.violations.length)).toEqual([]);
});

test('200 percent text, keyboard dialog trapping and reduced motion preserve checkout',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const screen of ['P05','C02','S02','O10','O15','A04']) {
    await page.goto(`/ui-fixtures/screens/${screen}`);
    await page.evaluate(()=>{const sizes=Array.from(document.querySelectorAll<HTMLElement>('main *'),el=>({el,size:parseFloat(getComputedStyle(el).fontSize)}));for(const {el,size} of sizes)el.style.fontSize=`${size*2}px`;});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),screen).toBe(true);
  }
  await page.goto('/ui-fixtures/screens/S02');
  await page.getByLabel('Bill total paid (Rs)').fill('100');
  await page.getByLabel('Eligible spend (Rs)',{exact:false}).fill('100');
  await page.getByLabel('Qualifying purchase confirmed').check();
  await page.getByRole('button',{name:'Review purchase',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  for(let i=0;i<5;i++){await page.keyboard.press('Tab');expect(await page.evaluate(()=>!!document.activeElement?.closest('dialog'))).toBe(true);}
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Review purchase',exact:true})).toBeFocused();
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
});

test('strict CSP rotates nonces, blocks injected script and keeps hydrated controls usable',async({page,request})=>{
  await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>{
    (window as unknown as {violations:string[]}).violations??=[];
    (window as unknown as {violations:string[]}).violations.push(e.violatedDirective);
  }));
  // Inject into parser input. DevTools page.evaluate can bypass CSP while
  // executing script; it is not a faithful untrusted HTML injection test.
  await page.route('**/ui-fixtures/screens/S01',async route=>{
    const upstream=await route.fetch();
    const html=(await upstream.text()).replace('<body>','<body><script>window.injectedScriptRan=true</script>');
    await route.fulfill({response:upstream,body:html});
  });
  const response=await page.goto('/ui-fixtures/screens/S01');
  const first=response!.headers()['content-security-policy'];expect(first).toContain("'strict-dynamic'");expect(first).not.toContain('unsafe-eval');
  const second=await request.get('/ui-fixtures/screens/S01',{headers:{'x-nonce':'attacker','content-security-policy':"script-src 'unsafe-inline'"}});
  expect(second.headers()['content-security-policy']).not.toEqual(first);expect(second.headers()['content-security-policy']).not.toContain('attacker');
  await page.getByRole('button',{name:'Enter customer code',exact:true}).click();await expect(page.getByLabel('Eight-character customer code')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>((window as unknown as {violations?:string[]}).violations??[]).some(v=>v.startsWith('script-src')))).toBe(true);
  expect(await page.evaluate(()=>(window as unknown as {injectedScriptRan?:boolean}).injectedScriptRan)).toBeUndefined();
  expect(first).toContain("frame-ancestors 'none'");
});
