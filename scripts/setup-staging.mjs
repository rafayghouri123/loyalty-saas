// Explicit operator setup for the configured isolated project. Never prints credentials.
import pg from 'pg';
import { readFileSync,writeFileSync,readdirSync,renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

async function setup(){
process.loadEnvFile('.env.local');
if(process.env.APP_ENV==='production')throw new Error('This setup command is for an isolated development/staging project.');
const url=new URL(process.env.MIGRATION_DATABASE_URL);
const project=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
if(!['postgres:','postgresql:'].includes(url.protocol)||!((url.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(url.username)===`postgres.${project}`)||(url.hostname===`db.${project}.supabase.co`&&decodeURIComponent(url.username)==='postgres')))throw new Error('Migration URL must match the configured project and operator role.');
for(const key of [...url.searchParams.keys()])if(key.toLowerCase().startsWith('ssl'))url.searchParams.delete(key);
const caPath=process.env.DATABASE_CA_CERT_PATH||resolve('.local/certificates/supabase-ca.crt');
const ssl={rejectUnauthorized:true,ca:readFileSync(caPath,'utf8')};
const client=new pg.Client({connectionString:url.toString(),ssl,connectionTimeoutMillis:10000,statement_timeout:30000});
const migrations=readdirSync('supabase/migrations').filter(name=>/^\d+_.+\.sql$/.test(name)).sort();
let step='connect';
try{
  await client.connect();
  await client.query("select pg_advisory_lock(hashtextextended('loyalty-schema-setup',0))");
  const historyExists=(await client.query("select to_regclass('supabase_migrations.schema_migrations') as relation")).rows[0].relation;
  if(!historyExists){
    const tables=(await client.query("select count(*) from pg_tables where schemaname in ('public','app_private','pgboss')")).rows[0].count;
    const users=(await client.query('select count(*) from auth.users')).rows[0].count;
    if(tables!=='0'||users!=='0')throw new Error('Initial setup requires an empty isolated project; no changes applied.');
    await client.query('create schema if not exists supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text);revoke all on schema supabase_migrations from public,anon,authenticated;');
  }
  const history=(await client.query('select version,statements from supabase_migrations.schema_migrations')).rows;
  if(history.some(row=>!migrations.some(file=>file.startsWith(row.version+'_'))))throw new Error('Unrecognized migration history.');
  for(const file of migrations){
    step=file;
    const version=file.split('_')[0],sql=readFileSync(`supabase/migrations/${file}`,'utf8').replaceAll('\r\n','\n');
    const existing=history.find(row=>row.version===version);
    if(existing){if(existing.statements?.[0]!==sql)throw new Error('Recorded migration differs from the workspace.');console.log('Already applied:',file);continue;}
    await client.query('begin');
    try{
      await client.query(sql.replace(/^begin;\s*\n/m,'').replace(/commit;\s*$/,''));
      await client.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)',[version,[sql],file.slice(version.length+1,-4)]);
      await client.query('commit');console.log('Applied:',file);
    }catch(error){await client.query('rollback');throw error;}
  }
  step='runtime roles';
  let env=readFileSync('.env.local','utf8');
  const set=(name,value)=>{const line=`${name}=${JSON.stringify(value)}`;const pattern=new RegExp(`^${name}=.*$`,'m');env=pattern.test(env)?env.replace(pattern,()=>line):env.trimEnd()+'\n'+line+'\n';};
  const roles=[['loyalty_worker_login','loyalty_worker','WORKER_DATABASE_URL','5432'],['loyalty_web_login','loyalty_web_gateway','WEB_GATEWAY_DATABASE_URL','6543']];
  const pending=[];
  for(const [role,parent,variable,port]of roles){
    const exists=(await client.query('select 1 from pg_roles where rolname=$1',[role])).rowCount>0;
    if(exists){if(!process.env[variable])throw new Error('Existing runtime role requires its saved credential; passwords are not reset automatically.');continue;}
    const password=randomBytes(32).toString('hex'),runtimeUrl=new URL(url);
    runtimeUrl.username=url.hostname.endsWith('.pooler.supabase.com')?`${role}.${project}`:role;
    runtimeUrl.password=password;
    if(url.hostname.endsWith('.pooler.supabase.com'))runtimeUrl.port=port;
    set(variable,runtimeUrl.toString());pending.push({role,parent,password});
  }
  set('DATABASE_CA_CERT_PATH',resolve(caPath).replaceAll('\\','/'));
  // Save generated credentials before creating logins so an interruption cannot lose their passwords.
  const temporary=resolve('.env.local.setup-tmp');writeFileSync(temporary,env);renameSync(temporary,resolve('.env.local'));
  for(const {role,parent,password}of pending){
    // Role names are hard-coded above and passwords contain only cryptographically random hex.
    await client.query(`create role ${role} login inherit nosuperuser nocreatedb nocreaterole nobypassrls password '${password}';grant ${parent} to ${role};`);
    console.log('Created restricted login:',role);
  }
  await client.query("notify pgrst,'reload schema'");
  console.log('Migration and runtime credential setup completed. Live push flags unchanged.');
}catch(error){console.log('Setup failed at:',step,'safe code:',/^[a-zA-Z0-9_/-]{1,100}$/.test(error.code??'')?error.code:'setup_guard');process.exitCode=1;}
finally{await client.end();}
}
setup().catch(()=>{console.log('Setup configuration is missing or invalid. Credentials were not logged.');process.exitCode=1;});
