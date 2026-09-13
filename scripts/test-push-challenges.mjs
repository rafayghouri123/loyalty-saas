import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createGateway } from '../src/lib/db/gateway.ts';
import { hashToken, randomToken, sealSecret } from '../src/lib/security/crypto.ts';

export async function testPushChallenges({ client, postgres, test, users, password, port, key, messages }) {
  const gateway = createGateway({ connectionString: `postgresql://integration_gateway:${password}@127.0.0.1:${port}/postgres`, ssl: false });
  const [a,b,c] = users, sessionA = randomUUID(), sessionA2 = randomUUID(), sessionB = randomUUID(), sessionC = randomUUID();
  await client.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$2),($4,$5),($6,$7)', [sessionA,a,sessionA2,sessionB,b,sessionC,c]);
  const installation = randomUUID(), secret = randomToken(), token = randomToken();
  const request = async(userId,sessionId,installationId,installationSecret,rawToken=token) => {
    const nonce = randomToken(), nonceHash = hashToken(nonce), tokenHash = hashToken(rawToken);
    const result = await gateway.requestPushChallenge({ userId,sessionId,installationId,installationSecretHash:hashToken(installationSecret),tokenHash,
      tokenCiphertext:sealSecret(rawToken,key,`push-token:${tokenHash}`).ciphertext,keyId:key.id,nonceHash,
      nonceCiphertext:sealSecret(nonce,key,`push-challenge:${installationId}:${nonceHash}`).ciphertext });
    return { result, nonce };
  };
  const asSession = async(user,session,sql,params=[]) => {
    const conn=postgres.getPgClient(); await conn.connect();
    try {
      await conn.query('begin'); await conn.query('set local role authenticated');
      await conn.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[user,JSON.stringify({sub:user,session_id:session})]);
      const result=await conn.query(sql,params); await conn.query('commit'); return result;
    } catch(error) { await conn.query('rollback'); throw error; } finally { await conn.end(); }
  };
  const ack = async(user,session,registration,install=installation,nonce=registration.nonce) =>
    (await asSession(user,session,'select public.acknowledge_push_challenge($1,$2,$3) as result',[registration.result.challengeId,install,nonce])).rows[0].result;
  const device = async() => (await client.query('select * from public.push_devices where token_hash=$1',[hashToken(token)])).rows[0];
  let first;
  try {
    await test('registration queues an encrypted foreground challenge without activating or returning its nonce',async()=>{
      first=await request(a,sessionA,installation,secret);
      assert.deepEqual(Object.keys(first.result).sort(),['challengeId','expiresAt','installationId']);
      const row=await device(); assert.equal(row.status,'pending'); assert.ok(!row.token_ciphertext.includes(token));
      assert.ok(!JSON.stringify(first.result).includes(first.nonce));
      const deadline=Date.now()+20_000;
      while(!messages.some(message=>message.challengeId===first.result.challengeId)&&Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,100));
      const message=messages.find(message=>message.challengeId===first.result.challengeId);
      assert.ok(message,'Local sender must receive a real pg-boss challenge job.');
      assert.equal(message.nonce,first.nonce); assert.equal(message.token,token);
      assert.ok(message.ttlSeconds>0&&message.ttlSeconds<=300);
      assert.equal((await device()).status,'pending');
    });
    await test('wrong user/session/installation/nonce and direct table access cannot activate a device',async()=>{
      for(const [user,session,install,nonce] of [[b,sessionB,installation,first.nonce],[a,sessionA2,installation,first.nonce],
        [a,sessionA,randomUUID(),first.nonce],[a,sessionA,installation,randomToken()]]) {
        assert.equal((await ack(user,session,first,install,nonce)).error.code,'not_found');
      }
      for(const table of ['push_devices','push_registration_challenges']) await assert.rejects(asSession(a,sessionA,`select * from public.${table}`),{code:'42501'});
      await assert.rejects(asSession(a,sessionA,'select public.worker_claim_push_challenge($1)',[randomUUID()]),{code:'42501'});
      await assert.rejects(asSession(a,sessionA,'select public.gateway_request_push_challenge($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [a,sessionA,installation,hashToken(secret),hashToken(token),'x'.repeat(80),key.id,hashToken(first.nonce),'x'.repeat(80)]),{code:'42501'});
      assert.equal((await device()).status,'pending');
    });
    await test('same-session acknowledgement activates once and concurrent replays return one generation',async()=>{
      const results=await Promise.all(Array.from({length:5},()=>ack(a,sessionA,first)));
      assert.ok(results.every(result=>result.status==='active'));
      assert.equal(new Set(results.map(result=>result.bindingGeneration)).size,1);
      assert.equal((await device()).row_version,2);
    });
    await test('a stolen token or editable installation ID cannot overwrite an active device binding',async()=>{
      const previous=await device();
      await request(b,sessionB,randomUUID(),randomToken());
      const current=await device();
      assert.equal(current.customer_user_id,a); assert.equal(current.binding_generation,previous.binding_generation);
      await assert.rejects(request(b,sessionB,installation,randomToken()),{code:'42501'});
      assert.equal((await device()).status,'active');
    });
    await test('fresh shared-browser receipt rebinds the account; old acknowledgement cannot reclaim it',async()=>{
      const previous=await device(), replacement=await request(b,sessionB,installation,secret);
      assert.equal((await device()).customer_user_id,a);
      const result=await ack(b,sessionB,replacement);
      assert.equal(result.status,'active'); assert.notEqual(result.bindingGeneration,previous.binding_generation);
      assert.equal((await device()).customer_user_id,b);
      assert.equal((await ack(a,sessionA,first)).error.code,'expired');
      await asSession(a,sessionA,'select public.revoke_push_installation($1)',[installation]);
      assert.equal((await device()).status,'active');
      await asSession(b,sessionB,'select public.revoke_push_installation($1)',[installation]);
      assert.equal((await device()).status,'revoked');
      assert.equal((await ack(b,sessionB,replacement)).error.code,'expired');
    });
    await test('expired/replaced challenges and removed auth sessions cannot activate',async()=>{
      const one=await request(a,sessionA,installation,secret);
      const two=await request(a,sessionA,installation,secret);
      assert.equal((await ack(a,sessionA,one)).error.code,'expired');
      await client.query("update public.push_registration_challenges set created_at=created_at-interval '6 minutes',expires_at=expires_at-interval '6 minutes' where id=$1",[two.result.challengeId]);
      assert.equal((await ack(a,sessionA,two)).error.code,'expired');
      await client.query('select public.worker_expire_push_challenges()');
      assert.ok((await client.query('select canceled_at from public.push_registration_challenges where id=$1',[two.result.challengeId])).rows[0].canceled_at);
      const three=await request(a,sessionA2,installation,secret);
      await client.query('delete from auth.sessions where id=$1',[sessionA2]);
      await assert.rejects(ack(a,sessionA2,three),{code:'42501'});
    });
    await test('challenge generation admits ten per user/minute and the eleventh creates no outbox event',async()=>{
      const install=randomUUID(), possession=randomToken(), rawToken=randomToken();
      for(let i=0;i<10;i++) assert.ok((await request(c,sessionC,install,possession,rawToken)).result.challengeId);
      const before=(await client.query('select count(*) from public.outbox_events')).rows[0].count;
      const limited=await request(c,sessionC,install,possession,rawToken);
      assert.equal(limited.result.error.code,'rate_limited'); assert.ok(limited.result.error.retryAfterSeconds>0);
      assert.equal((await client.query('select count(*) from public.outbox_events')).rows[0].count,before);
    });
  } finally { await gateway.close(); }
}
