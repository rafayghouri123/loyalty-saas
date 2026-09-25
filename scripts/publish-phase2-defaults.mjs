import { readFileSync } from 'node:fs';
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { databaseTls } from '../src/lib/db/tls.ts';

// User-delegated defaults. No payments, customer emails or campaigns are generated.
export async function publishDefaults(client) {
 const input=JSON.parse(readFileSync(new URL('../config/launch-defaults.json',import.meta.url),'utf8'));
 const p=input.plan;
 await client.query('begin');
 try {
  await client.query("select pg_advisory_xact_lock(hashtextextended('publish-phase2-defaults',0))");
  const plan=(await client.query('insert into public.plans(code,name) values($1,$2) on conflict(code) do update set code=excluded.code returning id',[p.code,p.name])).rows[0].id;
  const expected={price_paisa:p.pricePaisa,billing_period:p.billingPeriod,branch_limit:p.branchLimit,staff_limit:p.staffLimit,member_limit:p.memberLimit,monthly_campaign_limit:p.monthlyCampaignLimit,trial_days:p.trialDays};
  const existing=(await client.query('select price_paisa::text,billing_period,branch_limit,staff_limit,member_limit,monthly_campaign_limit,trial_days,status from public.plan_versions where plan_id=$1 and version=$2',[plan,p.version])).rows[0];
  if(existing) { if(existing.status!=='published'||Object.entries(expected).some(([k,v])=>existing[k]!==v)) throw new Error('Published configuration differs; create a new version.'); }
  else await client.query("insert into public.plan_versions(plan_id,version,price_paisa,billing_period,branch_limit,staff_limit,member_limit,monthly_campaign_limit,trial_days,status,published_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'published',now())",[plan,p.version,p.pricePaisa,p.billingPeriod,p.branchLimit,p.staffLimit,p.memberLimit,p.monthlyCampaignLimit,p.trialDays]);
  for(const [kind,body] of Object.entries(input.policies)) {
   const old=(await client.query('select body,published_at from public.policy_documents where business_id is null and kind=$1 and version=$2',[kind,input.version])).rows[0];
   if(old) {if(old.body!==body||!old.published_at) throw new Error('Published policy differs; create a new version.');}
   else await client.query('insert into public.policy_documents(kind,version,body,published_at) values($1,$2,$3,now())',[kind,input.version,body]);
  }
  await client.query('commit');
 } catch(error) {await client.query('rollback');throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 if(process.env.APP_ENV==='production') throw new Error('Pre-release defaults cannot be published into production.');
 const client=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL,ssl:databaseTls(true,process.env.DATABASE_CA_CERT_PATH),connectionTimeoutMillis:10000});
 try {await client.connect();await publishDefaults(client);console.log('Published versioned pre-release configuration.');}
 catch {console.log('Configuration publication failed; no credentials logged.');process.exitCode=1;}
 finally {await client.end();}
}
