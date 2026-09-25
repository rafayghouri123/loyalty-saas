// Operator-only setup; never print management credentials or the complete Auth configuration.
process.loadEnvFile('.env.local');
if(process.env.APP_ENV==='production')throw new Error('Use the isolated staging project.');
const ref=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
const endpoint=`https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers={Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'};
const response=await fetch(endpoint,{method:'PATCH',headers,body:JSON.stringify({hook_send_email_enabled:true,hook_send_email_uri:'pg-functions://postgres/public/auth_send_email_hook'})});
if(!response.ok)throw new Error(`Auth hook configuration failed: HTTP ${response.status}`);
const verify=await fetch(endpoint,{headers});const config=await verify.json();
if(config.hook_send_email_enabled!==true||config.hook_send_email_uri!=='pg-functions://postgres/public/auth_send_email_hook')throw new Error('Auth hook verification failed');
console.log('Verified: isolated Supabase Send Email SQL hook enabled.');
