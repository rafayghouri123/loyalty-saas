// Uses only a new synthetic Auth account; no businesses, campaigns or payments are created.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {chromium} from '@playwright/test';

assert.equal(process.env.APP_ENV,'staging');
const target=new URL(process.argv[2]);
assert(target.protocol==='https:'&&target.pathname==='/'&&!target.search&&!target.hash&&!target.username&&!target.password,'Supply the isolated staging HTTPS origin.');
const origin=target.origin;
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.STORAGE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const jar=new Map();
const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
let userId,browser,stage='synthetic account';
try {
  assert.equal((await fetch(`${origin}/ui-fixtures/business`,{redirect:'manual'})).status,404,'Business fixtures must stay unavailable on staging.');
  const email=`business-entry-${randomUUID()}@example.invalid`,password=randomBytes(32).toString('base64url');
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
  assert(!created.error&&created.data.user);userId=created.data.user.id;
  assert(!(await client.auth.signInWithPassword({email,password})).error);
  assert(!(await client.rpc('complete_profile',{p_display_name:'TEST business entry',p_correlation_id:randomUUID()})).error);
  const creation=await client.rpc('can_bootstrap_business');
  assert(!creation.error&&creation.data===true,'New verified owner must be eligible for first business');
  stage='OAuth destinations';
  for(const [intent,next,expected]of [['customer',undefined,'/app'],['business',undefined,'/workspace'],['business','/dashboard/onboarding','/dashboard/onboarding']]) {
    const response=await fetch(`${origin}/api/auth/google`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({intent,next})});
    assert.equal(response.status,200);
    const callback=new URL(new URL((await response.json()).data.url).searchParams.get('redirect_to'));
    assert.equal(callback.origin,origin);assert.equal(callback.searchParams.get('next'),expected);
  }
  console.log('PASS distinct customer, business and trial OAuth destinations');
  browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addCookies([...jar].map(([name,value])=>({name,value,url:origin,httpOnly:false,secure:true,sameSite:'Lax'})));
  const page=await context.newPage();
  stage='new business redirect';await page.goto(`${origin}/workspace`);
  await page.waitForURL(`${origin}/dashboard/onboarding`);
  await page.getByRole('heading',{name:"Let's set up your cafe."}).waitFor();
  assert.equal(await page.locator('a[href^="/app"]').count(),0);
  await page.getByLabel('Business name',{exact:true}).fill('TEST business draft');
  await page.getByLabel('Public URL slug').fill('test-business-entry');
  mkdirSync('.local',{recursive:true});await page.screenshot({path:'.local/business-entry-desktop.png',fullPage:true});
  await page.setViewportSize({width:360,height:800});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'.local/business-entry-mobile.png',fullPage:true});
  stage='authenticator return context';await page.getByRole('link',{name:'Set up or verify authenticator'}).click();
  await page.getByRole('heading',{name:'Verify your authenticator'}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('next'),'/dashboard/onboarding');
  await page.goto(`${origin}/dashboard/onboarding`);
  assert.equal(await page.getByLabel('Business name',{exact:true}).inputValue(),'TEST business draft');
  console.log('PASS real verified user without businesses redirects to onboarding; mobile layout, business-only navigation and authenticator draft retention');
  stage='business sign-out';await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.waitForURL(`${origin}/auth/login?intent=business`);
  await page.goto(`${origin}/workspace`);await page.waitForURL(`${origin}/auth/login?intent=business`);
  console.log('PASS actual logout revokes the session and preserves business sign-in context');
} catch(error) {console.error(`Business entry failed at ${stage}: ${error.name}`);process.exitCode=1;}
finally {await browser?.close();if(userId){const removed=await admin.auth.admin.deleteUser(userId);if(removed.error){console.error('Synthetic Auth cleanup failed');process.exitCode=1;}}}
