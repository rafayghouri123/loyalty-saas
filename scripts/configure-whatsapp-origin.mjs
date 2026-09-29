// Operator-only canonical origin, never supplied by a browser/RPC payload.
import pg from 'pg';
import { databaseTls } from '../src/lib/db/tls.ts';
const origin=new URL(process.env.NEXT_PUBLIC_APP_URL);
if(origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||
 (origin.protocol!=='https:'&& !(process.env.APP_ENV!=='production'&&origin.protocol==='http:'&&['127.0.0.1','localhost'].includes(origin.hostname))))throw new Error('Configure an HTTPS canonical origin (loopback HTTP is local-only).');
const migrationUrl=new URL(process.env.MIGRATION_DATABASE_URL),project=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
if(!((migrationUrl.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(migrationUrl.username)===`postgres.${project}`)||(migrationUrl.hostname===`db.${project}.supabase.co`&&decodeURIComponent(migrationUrl.username)==='postgres')))throw new Error('Migration operator connection must match the configured Supabase project.');
for(const key of [...migrationUrl.searchParams.keys()])if(key.toLowerCase().startsWith('ssl'))migrationUrl.searchParams.delete(key);
const client=new pg.Client({connectionString:migrationUrl.toString(),ssl:databaseTls(true,process.env.DATABASE_CA_CERT_PATH),statement_timeout:5000});
try{await client.connect();await client.query('insert into app_private.whatsapp_origin(origin) values($1) on conflict(singleton) do update set origin=excluded.origin',[origin.origin]);console.log('Canonical manual-offer origin configured. No message sent.');}
finally{await client.end();}
