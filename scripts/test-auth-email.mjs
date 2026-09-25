import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { sendAuthEmail } from '../src/worker/auth-email.ts';
export async function testAuthEmail({client,postgres,test}) {
 const hash=s=>createHash('sha256').update(s).digest('hex');
 const as=async(role,sql,args=[])=>{await client.query('begin');try{await client.query(`set local role ${role}`);const r=await client.query(sql,args);await client.query('commit');return r.rows[0]?.result;}catch(e){await client.query('rollback');throw e;}};
 const email='email-hook-test@example.invalid',callback='https://example.invalid/auth/callback?next=%2Fjoin%2Ftest-cafe';
 let grant,event;
 await test('Auth email grant is gateway-only, shares cooldown and rejects direct-provider bypass',async()=>{
  await assert.rejects(as('authenticated','select public.gateway_authorize_auth_email($1,$2,$3,$4) as result',[email,hash(email),hash('ip-auth-email'),callback]),{code:'42501'});
  const direct=await as('supabase_auth_admin','select public.auth_send_email_hook($1) as result',[{user:{email},email_data:{email_action_type:'magiclink',token_hash:'a'.repeat(64),redirect_to:callback}}]);
  assert.equal(direct.error.http_code,403);
  grant=await as('loyalty_web_gateway','select public.gateway_authorize_auth_email($1,$2,$3,$4) as result',[email,hash(email),hash('ip-auth-email'),callback]);
  assert.equal(grant.allowed,true);
  const retry=await as('loyalty_web_gateway','select public.gateway_authorize_auth_email($1,$2,$3,$4) as result',[email,hash(email),hash('ip-auth-email'),callback]);
  assert.equal(retry.allowed,false);assert(retry.retryAfterSeconds>0);
  await assert.rejects(as('authenticated','select public.auth_send_email_hook($1) as result',[{}]),{code:'42501'});
 });
 await test('Auth hook binds recipient, consumes once and atomically queues only encrypted secrets',async()=>{
  const payload={user:{email},email_data:{email_action_type:'magiclink',token_hash:'a'.repeat(64),redirect_to:`${callback}&email_request=${grant.token}`}};
  assert.equal((await as('supabase_auth_admin','select public.auth_send_email_hook($1) as result',[{...payload,user:{email:'wrong@example.invalid'}}])).error.http_code,403);
  assert.deepEqual(await as('supabase_auth_admin','select public.auth_send_email_hook($1) as result',[payload]),{});
  assert.deepEqual(await as('supabase_auth_admin','select public.auth_send_email_hook($1) as result',[payload]),{});
  const events=(await client.query("select id,payload from public.outbox_events where event_type='auth.email_requested' and event_key=$1",[grant.grantId])).rows;
  assert.equal(events.length,1);event=events[0].id;
  assert.deepEqual(events[0].payload,{grantId:grant.grantId});
  const row=(await client.query('select payload_ciphertext,token_hash,email_hash from app_private.auth_email_grants where id=$1',[grant.grantId])).rows[0];
  assert(!row.payload_ciphertext.includes(Buffer.from(email)));assert.notEqual(row.token_hash,grant.token);assert.notEqual(row.email_hash,email);
  await assert.rejects(as('authenticated','select public.worker_auth_email_job($1) as result',[event]),{code:'42501'});
 });
 await test('Auth email worker retries with stable identity and erases encrypted payload after acceptance',async()=>{
  const connection=postgres.getPgClient();await connection.connect();await connection.query('set role loyalty_worker');
  const sent=[];let fail=true;
  const sender={supabaseUrl:'https://test.supabase.co',appOrigin:'https://example.invalid',send:async message=>{sent.push(message);if(fail){fail=false;throw new Error('network');}return randomUUID();}};
  try {
   await assert.rejects(sendAuthEmail(connection,event,sender));
   await sendAuthEmail(connection,event,sender);await sendAuthEmail(connection,event,sender);
  }finally{await connection.end();}
  assert.equal(sent.length,2);assert.equal(sent[0].id,sent[1].id);
  const url=new URL(sent[1].url);assert.equal(url.pathname,'/auth/v1/verify');assert.equal(url.searchParams.get('redirect_to'),callback);
  const row=(await client.query('select state,payload_ciphertext from app_private.auth_email_grants where id=$1',[grant.grantId])).rows[0];
  assert.equal(row.state,'provider_accepted');assert.equal(row.payload_ciphertext,null);
 });
}
