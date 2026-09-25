import pg from 'pg';
import { databaseTls } from '../src/lib/db/tls.ts';
const present = name => Boolean(process.env[name]);
for (const key of ['MIGRATION_DATABASE_URL','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','STORAGE_SERVICE_ROLE_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ACCESS_TOKEN']) console.log(`${key}: ${present(key) ? 'configured' : 'missing'}`);
const client = new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL,ssl:databaseTls(true,process.env.DATABASE_CA_CERT_PATH),connectionTimeoutMillis:10000,statement_timeout:10000});
try {
 await client.connect();
 const { rows } = await client.query("select (select count(*) from public.businesses) as businesses,(select count(*) from auth.users) as auth_users,(select count(*) from supabase_migrations.schema_migrations) as migrations");
 console.log('Configured project aggregate:', JSON.stringify(rows[0]));
 const versions = await client.query('select version from supabase_migrations.schema_migrations order by version');
 console.log('Applied versions:', versions.rows.map(v=>v.version).join(', '));
 const privileges=await client.query("select has_table_privilege(current_user,'auth.users','SELECT') as read_users,has_table_privilege(current_user,'auth.users','UPDATE') as lock_users,has_table_privilege(current_user,'auth.sessions','SELECT') as read_sessions,has_table_privilege(current_user,'auth.sessions','UPDATE') as lock_sessions");
 console.log('Auth table privileges:',JSON.stringify(privileges.rows[0]));
} catch (error) {
 const known = ['Tenant or user not found','password authentication failed','Circuit breaker open','Connection terminated','Max client connections reached'].find(text=>error.message?.includes(text));
 console.log('Preflight failed:', /^[A-Z0-9_]{1,40}$/u.test(error.code??'') ? error.code : 'connection_or_configuration', known ?? String(error.message).replaceAll(new URL(process.env.MIGRATION_DATABASE_URL).password, '[redacted]').replaceAll(decodeURIComponent(new URL(process.env.MIGRATION_DATABASE_URL).password), '[redacted]').replace(/postgres(?:ql)?:\/\/\S+/gu, '[connection]').slice(0,240)); process.exitCode=1;
}
finally { await client.end(); }
