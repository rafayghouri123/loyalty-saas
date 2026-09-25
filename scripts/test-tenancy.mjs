import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { validateMedia } from '../src/worker/media.ts';

export async function testTenancy({ client, postgres, test: runTest }) {
  const test = (name, callback) => runTest(name, async () => { await client.query('delete from public.rate_limit_buckets'); await callback(); });
  const users = Array.from({ length: 6 }, () => ({ id: randomUUID(), session: randomUUID() }));
  const [ownerA, ownerB, customer, cashier, manager, outsider] = users;
  for (const [index, user] of users.entries()) {
    user.email = `phase2-${index}@example.invalid`;
    await client.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [user.id, user.email]);
    await client.query('insert into auth.sessions(id,user_id) values($1,$2)', [user.session, user.id]);
    await client.query('insert into public.profiles(user_id,auth_user_id,display_name) values($1,$1,$2)', [user.id, `Fixture ${index}`]);
  }
  const as = async (user, sql, values = [], aal = 'aal2', connection = client) => {
    await connection.query('begin');
    try {
      await connection.query('set local role authenticated');
      await connection.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [user.id, JSON.stringify({ sub: user.id, session_id: user.session, aal, amr: [{ method: user.method ?? 'totp', timestamp: user.authTime ?? Math.floor(Date.now() / 1000) }] })]);
      const result = await connection.query(sql, values);
      // Match PostgREST's constraint flush while still in the authenticated role.
      await connection.query('set constraints all immediate');
      await connection.query('commit');
      return result.rows[0]?.result;
    } catch (error) { await connection.query('rollback'); throw error; }
  };
  const rpc = async (user, name, args = [], aal = 'aal2', connection = client) => {
    const result = await as(user, `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args, aal, connection);
    if (result?.error?.code === 'request_rejected') throw Object.assign(new Error('request_rejected'), { code: result.error.sqlState });
    if (result?.error?.code === 'invitation_unavailable') throw Object.assign(new Error('invitation_unavailable'), { code: 'P0002' });
    return result;
  };
  const plan = (await client.query("insert into public.plans(code,name) values('phase2-test','TEST ONLY — not a commercial plan') returning id")).rows[0].id;
  const planVersion = (await client.query("insert into public.plan_versions(plan_id,version,price_paisa,billing_period,branch_limit,staff_limit,member_limit,status,published_at) values($1,1,100,'monthly',2,5,100,'published',now()) returning id", [plan])).rows[0].id;
  const policies = {};
  for (const kind of ['platform_terms', 'privacy', 'push_marketing', 'push_reward', 'push_birthday', 'inbox_birthday', 'whatsapp_marketing']) {
    policies[kind] = (await client.query("insert into public.policy_documents(kind,version,body,published_at) values($1,'test-v1','TEST FIXTURE ONLY. Not production legal wording.',now()) returning id", [kind])).rows[0].id;
  }
  const bootstrap = slug => ({ planVersionId: planVersion, name: `Fixture ${slug}`, slug, accentHex: '#166534', branchName: 'Main branch', address: 'Fictional test address', city: 'Lahore', hours: [{ weekday: 1, opensAt: '09:00', closesAt: '18:00' }] });
  let a, b;
  await test('Phase 2 bootstrap enforces verified session/AAL2 and rolls back incomplete business', async () => {
    await assert.rejects(rpc(ownerA, 'bootstrap_business', [bootstrap('phase2-a'), randomUUID()], 'aal1'), { code: '42501' });
    await assert.rejects(rpc(ownerA, 'bootstrap_business', [{ ...bootstrap('phase2-invalid'), address: 'x' }, randomUUID()]), { code: '23514' });
    assert.equal((await client.query("select count(*) from public.businesses where slug='phase2-invalid'")).rows[0].count, '0');
    a = await rpc(ownerA, 'bootstrap_business', [bootstrap('phase2-a'), randomUUID()]);
    b = await rpc(ownerB, 'bootstrap_business', [bootstrap('phase2-b'), randomUUID()]);
    assert.equal((await client.query('select count(*) from public.subscriptions where business_id=$1', [a.businessId])).rows[0].count, '1');
    const replay = await rpc(ownerA, 'bootstrap_business', [bootstrap('phase2-a'), randomUUID()]);
    assert.equal(replay.businessId, a.businessId);
    assert.equal(replay.existing, true);
    await assert.rejects(rpc(ownerB, 'bootstrap_business', [bootstrap('phase2-a'), randomUUID()]), { code: '23505' });
    await assert.rejects(rpc(ownerA, 'bootstrap_business', [bootstrap('phase2-extra-trial'), randomUUID()]), { code: '22023' });
  });
  await test('Phase 2 one-owner, interval, policy and tenant constraints reject invalid raw SQL', async () => {
    await assert.rejects(client.query("update public.business_users set status='revoked' where business_id=$1 and role='owner'", [a.businessId]), { code: '23514' });
    await assert.rejects(client.query("insert into public.branch_hours(business_id,branch_id,weekday,opens_at,closes_at) values($1,$2,1,'12:00','20:00')", [a.businessId, a.branchId]), { code: '23514' });
    await assert.rejects(client.query("update public.policy_documents set body='Changed published text' where id=$1", [policies.privacy]), { code: '42501' });
    await assert.rejects(client.query("update public.plan_versions set price_paisa=200 where id=$1", [planVersion]), { code: '42501' });
    await assert.rejects(client.query("insert into public.branch_hours(business_id,branch_id,weekday,opens_at,closes_at) values($1,$2,1,'06:00','07:00')", [a.businessId, b.branchId]), { code: '23503' });
  });
  const programme = branch => ({ rowVersion: 1, type: 'stamps', name: 'Test stamps', minimumSpendPaisa: '100', stampsPerPurchase: 1, spendStepPaisa: null, unitsPerStep: null, maxBaseUnitsPerPurchase: 1000,
    terms: 'Test only: qualifying paid purchases.', rewardTitle: 'Test treat', rewardUnitCost: '8', rewardDescription: '', rewardTerms: 'Test only: collect at the selected branch.', rewardBranchIds: [branch], estimatedCostPaisa: null });
  let av, bv;
  await test('Phase 2 publish is atomic and projections omit creators, contacts and merchant costs', async () => {
    assert.equal(await rpc(customer, 'public_business', ['phase2-a']), null);
    await assert.rejects(rpc(ownerA, 'publish_business', [a.businessId, 1, randomUUID()]), { code: '22023' });
    await assert.rejects(rpc(ownerB, 'save_initial_programme', [a.businessId, programme(a.branchId), randomUUID()]), { code: '42501' });
    av = await rpc(ownerA, 'save_initial_programme', [a.businessId, programme(a.branchId), randomUUID()]);
    bv = await rpc(ownerB, 'save_initial_programme', [b.businessId, programme(b.branchId), randomUUID()]);
    await rpc(ownerA, 'publish_business', [a.businessId, 2, randomUUID()]);
    await rpc(ownerB, 'publish_business', [b.businessId, 2, randomUUID()]);
    const projection = await rpc(customer, 'public_business', ['phase2-a']);
    assert.equal(projection.canJoin, true);
    assert.equal(projection.programme.minimumSpendPaisa, '100');
    for (const privateField of ['created_by', 'staff_email', 'estimated_cost_paisa', 'token_hash']) assert.equal(JSON.stringify(projection).includes(privateField), false);
    await assert.rejects(client.query('update public.programme_versions set minimum_spend_paisa=0 where id=$1', [av.programmeVersionId]), { code: '42501' });
  });
  const join = (slug, branch, version, extras = {}) => ({ businessSlug: slug, branchId: branch, displayName: 'Shared cafe name', shareVerifiedEmail: false, phone: '', whatsappMarketingConsent: false,
    acceptedProgrammeVersionId: version, platformTermsDocumentId: policies.platform_terms, privacyDocumentId: policies.privacy, rejoin: false, ...extras });
  let am, bm;
  await test('Phase 2 enrollment concurrency yields one relationship/balance/acceptance without overwriting consent', async () => {
    await assert.rejects(rpc(customer, 'join_business', [join('phase2-a', a.branchId, bv.programmeVersionId), randomUUID()]), { code: '40001' });
    const input = join('phase2-a', a.branchId, av.programmeVersionId);
    const results = await Promise.all(Array.from({ length: 5 }, async () => {
      const conn = postgres.getPgClient(); await conn.connect();
      try { return await rpc(customer, 'join_business', [input, randomUUID()], 'aal1', conn); } finally { await conn.end(); }
    }));
    assert.equal(new Set(results.map(r => r.membershipId)).size, 1);
    assert.equal(results.filter(r => r.status === 'created').length, 1);
    am = results[0].membershipId;
    bm = (await rpc(customer, 'join_business', [join('phase2-b', b.branchId, bv.programmeVersionId, { shareVerifiedEmail: true }), randomUUID()])).membershipId;
    assert.equal((await client.query('select count(*) from public.enrollment_acceptances where membership_id=$1', [am])).rows[0].count, '1');
    await rpc(customer, 'join_business', [{ ...input, shareVerifiedEmail: true, phone: '+923001234567', whatsappMarketingConsent: true }, randomUUID()]);
    assert.equal((await rpc(customer, 'membership_preferences', [am])).contact.sharedEmail, null);
    assert.equal((await rpc(customer, 'membership_preferences', [am])).consents.length, 0);
  });
  await test('Phase 2 customer joins two cafes; each owner sees only deliberately shared relationship data', async () => {
    assert.equal((await rpc(customer, 'my_memberships')).length, 2);
    const ar = await rpc(ownerA, 'business_members', [a.businessId, null, 0]);
    const br = await rpc(ownerB, 'business_members', [b.businessId, null, 0]);
    assert.equal(ar.length, 1); assert.equal(br.length, 1);
    assert.equal(ar[0].contact.sharedEmail, null); assert.equal(br[0].contact.sharedEmail, customer.email);
    await assert.rejects(rpc(ownerA, 'business_members', [b.businessId, null, 0]), { code: '42501' });
    await assert.rejects(rpc(ownerA, 'membership_preferences', [bm]), { code: 'P0002' });
    await assert.rejects(as(customer, 'select * from public.memberships'), { code: '42501' });
    await assert.rejects(as(ownerA, 'select * from public.membership_contacts'), { code: '42501' });
    assert.equal((await rpc(ownerA, 'my_workspaces')).length, 1);
    assert.equal((await rpc(outsider, 'my_workspaces')).length, 0);
  });
  let invitation;
  await test('Phase 2 invitation verifies stored email, scoped branches, single use and cashier permissions', async () => {
    await assert.rejects(rpc(ownerA, 'create_staff_invitation', [a.businessId, { email: cashier.email, role: 'cashier', branchIds: [a.branchId], canContactCustomers: true }, randomUUID()]), { code: '23514' });
    await assert.rejects(rpc(ownerA, 'create_staff_invitation', [a.businessId, { email: cashier.email, role: 'cashier', branchIds: [b.branchId] }, randomUUID()]), { code: '22023' });
    invitation = await rpc(ownerA, 'create_staff_invitation', [a.businessId, { email: cashier.email, role: 'cashier', branchIds: [a.branchId] }, randomUUID()]);
    assert.equal(invitation.token.length, 43);
    await assert.rejects(rpc(outsider, 'read_invitation', [invitation.token]), { code: 'P0002' });
    await assert.rejects(rpc(outsider, 'accept_staff_invitation', [invitation.token, randomUUID()]), { code: 'P0002' });
    assert.equal((await rpc(cashier, 'read_invitation', [invitation.token])).role, 'cashier');
    await rpc(cashier, 'accept_staff_invitation', [invitation.token, randomUUID()]);
    await assert.rejects(rpc(cashier, 'accept_staff_invitation', [invitation.token, randomUUID()]), { code: 'P0002' });
    const access = await rpc(cashier, 'business_access', [a.businessId, a.branchId]);
    assert.equal(access.role, 'cashier'); assert.equal(access.canContactCustomers, false);
    await assert.rejects(rpc(cashier, 'business_access', [a.businessId, b.branchId]), { code: 'P0002' });
    await assert.rejects(rpc(cashier, 'business_members', [a.businessId, a.branchId, 0]), { code: '42501' });
  });
  await test('Phase 2 revoked staff cannot use stale sessions, and unassigned same-tenant branch is denied', async () => {
    const extra = (await client.query("insert into public.branches(business_id,name,address,city) values($1,'Second branch','Fictional address','Lahore') returning id", [a.businessId])).rows[0].id;
    await assert.rejects(rpc(cashier, 'business_access', [a.businessId, extra]), { code: '42501' });
    const setup = await rpc(ownerA, 'business_setup', [a.businessId]);
    const staff = setup.staff.find(s => s.email === cashier.email);
    await assert.rejects(rpc(ownerA, 'manage_staff', [a.businessId, { id: staff.id, rowVersion: staff.rowVersion, action: 'revoke' }, randomUUID()], 'aal1'), { code: '42501' });
    await rpc(ownerA, 'manage_staff', [a.businessId, { id: staff.id, rowVersion: staff.rowVersion, action: 'revoke' }, randomUUID()]);
    await assert.rejects(rpc(cashier, 'business_access', [a.businessId, a.branchId]), { code: '42501' });
    assert.equal((await rpc(cashier, 'my_workspaces')).length, 0);
    const invite = await rpc(ownerB, 'create_staff_invitation', [b.businessId, { email: manager.email, role: 'manager', branchIds: [b.branchId] }, randomUUID()]);
    await rpc(manager, 'accept_staff_invitation', [invite.token, randomUUID()]);
    const rows = await rpc(manager, 'business_members', [b.businessId, b.branchId, 0]);
    assert.equal(rows[0].contact, null);
    await assert.rejects(rpc(manager, 'business_members', [b.businessId, null, 0]), { code: '42501' });
  });
  await test('Phase 2 consent is versioned and atomic; phone changes reset verification and WhatsApp opt-in', async () => {
    await assert.rejects(rpc(customer, 'set_consent', [am, 'whatsapp', 'marketing', true, 'test-v1', randomUUID()]), { code: '22023' });
    await rpc(customer, 'save_membership_contact', [am, { phone: '+923001234567', shareVerifiedEmail: false, rowVersion: 1 }, randomUUID()]);
    await assert.rejects(rpc(customer, 'set_consent', [am, 'whatsapp', 'marketing', true, 'wrong-version', randomUUID()]), { code: '40001' });
    await rpc(customer, 'set_consent', [am, 'whatsapp', 'marketing', true, 'test-v1', randomUUID()]);
    await assert.rejects(rpc(ownerA, 'set_consent', [am, 'whatsapp', 'marketing', true, 'test-v1', randomUUID()]), { code: 'P0002' });
    await rpc(customer, 'save_membership_contact', [am, { phone: '+923009876543', shareVerifiedEmail: true, rowVersion: 2 }, randomUUID()]);
    const preferences = await rpc(customer, 'membership_preferences', [am]);
    assert.equal(preferences.contact.phoneStatus, 'unverified');
    assert.equal(preferences.consents[0].allowed, false);
    assert.equal((await client.query('select count(*) from public.consent_events where membership_id=$1', [am])).rows[0].count, '2');
    await assert.rejects(client.query('delete from public.consent_events where membership_id=$1', [am]), { code: '42501' });
  });
  await test('Phase 2 leave/rejoin preserves membership/history and consent stays off; stale/expired sessions fail', async () => {
    await rpc(customer, 'set_consent', [am, 'push', 'marketing', true, 'test-v1', randomUUID()]);
    const initial = (await rpc(customer, 'my_memberships')).find(m => m.id === am);
    await rpc(customer, 'leave_membership', [am, randomUUID()]);
    await assert.rejects(rpc(customer, 'join_business', [join('phase2-a', a.branchId, av.programmeVersionId), randomUUID()]), { code: '42501' });
    const result = await rpc(customer, 'join_business', [join('phase2-a', a.branchId, av.programmeVersionId, { rejoin: true, phone: '+923000000000' }), randomUUID()]);
    assert.equal(result.membershipId, am); assert.equal(result.status, 'reactivated');
    const after = (await rpc(customer, 'my_memberships')).find(m => m.id === am);
    assert.equal(initial.joinedAt, after.joinedAt);
    assert.equal((await rpc(customer, 'membership_preferences', [am])).consents.every(c => !c.allowed), true);
    await client.query('update auth.sessions set not_after=now()-interval \'1 minute\' where id=$1', [outsider.session]);
    await assert.rejects(rpc(outsider, 'my_workspaces'), { code: '42501' });
    await client.query('delete from auth.sessions where id=$1', [cashier.session]);
    await assert.rejects(rpc(cashier, 'my_workspaces'), { code: '42501' });
  });
  await test('Phase 2 new enrollment fails when trial expires without a scheduler', async () => {
    await client.query("update public.subscriptions set period_start=now()-interval '15 days',period_end=now()-interval '1 day' where business_id=$1", [b.businessId]);
    assert.equal((await rpc(ownerB, 'public_business', ['phase2-b'])).canJoin, true);
    assert.equal((await rpc(ownerB, 'business_setup', [b.businessId])).subscription.withinGrace, true);
    await client.query('update public.subscriptions set cancel_at_period_end=true where business_id=$1', [b.businessId]);
    assert.equal((await rpc(ownerB, 'public_business', ['phase2-b'])).canJoin, false);
    await client.query("update public.subscriptions set cancel_at_period_end=false,period_start=now()-interval '22 days',period_end=now()-interval '8 days' where business_id=$1", [b.businessId]);
    assert.equal((await rpc(ownerB, 'public_business', ['phase2-b'])).canJoin, false);
    await assert.rejects(rpc(ownerA, 'join_business', [join('phase2-b', b.branchId, bv.programmeVersionId), randomUUID()]), { code: '42501' });
    assert.equal((await rpc(customer, 'my_memberships')).length, 2);
  });
  await test('Phase 2 profile birthday cooldown survives clearing, and names only share by explicit choice', async () => {
    const input = { displayName: 'Private profile name', timezone: 'Asia/Karachi', birthdayMonth: 2, birthdayDay: 29, updateMembershipNames: false, rowVersion: 1 };
    await rpc(customer, 'update_profile', [input, randomUUID()]);
    assert.equal((await rpc(ownerA, 'business_members', [a.businessId, null, 0]))[0].name, 'Shared cafe name');
    await assert.rejects(rpc(customer, 'update_profile', [{ ...input, rowVersion: 2, birthdayDay: 28 }, randomUUID()]), { code: '22023' });
    await rpc(customer, 'update_profile', [{ ...input, rowVersion: 2, birthdayMonth: null, birthdayDay: null }, randomUUID()]);
    await assert.rejects(rpc(customer, 'update_profile', [{ ...input, rowVersion: 3 }, randomUUID()]), { code: '22023' });
    await rpc(customer, 'update_profile', [{ ...input, rowVersion: 3, birthdayMonth: null, birthdayDay: null, updateMembershipNames: true }, randomUUID()]);
    assert.equal((await rpc(ownerA, 'business_members', [a.businessId, null, 0]))[0].name, input.displayName);
  });
  await test('Phase 2 branch limits, stale edits and last-active-branch participation are enforced in SQL', async () => {
    const draft = { id: null, rowVersion: null, name: 'Third branch', address: 'Fictional address', city: 'Lahore', status: 'active', hours: [] };
    await assert.rejects(rpc(ownerA, 'save_branch', [a.businessId, draft, randomUUID()]), { code: '22023' });
    await assert.rejects(rpc(ownerB, 'save_branch', [b.businessId, { ...draft, id: b.branchId, rowVersion: 1, status: 'inactive' }, randomUUID()]), { code: '22023' });
    await assert.rejects(rpc(ownerA, 'save_branch', [a.businessId, { ...draft, id: a.branchId, rowVersion: 999 }, randomUUID()]), { code: '40001' });
    await rpc(ownerA, 'save_branch', [a.businessId, { ...draft, id: a.branchId, rowVersion: 1, name: 'Updated branch', hours: [{ weekday: 2, opensAt: '10:00', closesAt: '18:00' }] }, randomUUID()]);
    const setup = await rpc(ownerA, 'business_setup', [a.businessId]);
    assert.equal(setup.branches.find(br => br.id === a.branchId).hours[0].weekday, 2);
  });
  await test('Phase 2 quarantine grants, worker decoding and versioned asset publication isolate tenants', async () => {
    const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#166534' } }).png().toBuffer();
    await assert.rejects(rpc(ownerA, 'reserve_media', [a.businessId, 'logo', 'image/svg+xml', 100, randomUUID()]), { code: '23514' });
    await assert.rejects(rpc(ownerA, 'reserve_media', [a.businessId, 'logo', 'image/png', image.length, randomUUID()], 'aal1'), { code: '42501' });
    const grant = await rpc(ownerA, 'reserve_media', [a.businessId, 'logo', 'image/png', image.length, randomUUID()]);
    await assert.rejects(as(ownerB, "insert into storage.objects(bucket_id,name) values('loyalty-quarantine',$1)", [grant.path]), { code: '42501' });
    await assert.rejects(as(ownerA, "insert into storage.objects(bucket_id,name) values('loyalty-brand',$1)", [grant.path]), { code: '42501' });
    await as(ownerA, "insert into storage.objects(bucket_id,name) values('loyalty-quarantine',$1)", [grant.path]);
    assert.deepEqual(await as(ownerB, "select coalesce(jsonb_agg(name),'[]') as result from storage.objects"), []);
    await assert.rejects(rpc(ownerB, 'submit_media', [grant.assetId, randomUUID()]), { code: '42501' });
    await rpc(ownerA, 'submit_media', [grant.assetId, randomUUID()]);
    await assert.rejects(rpc(ownerA, 'attach_brand_media', [a.businessId, grant.assetId, 3, randomUUID()]), { code: '22023' });
    const event = (await client.query("select id from public.outbox_events where event_type='media.validate' and event_key=$1", [grant.assetId])).rows[0].id;
    const workerConnection = postgres.getPgClient(); await workerConnection.connect();
    const uploads = [];
    try {
      await workerConnection.query('set role loyalty_worker');
      await validateMedia(workerConnection, event, { download: async path => { assert.equal(path, grant.path); return image; },
        upload: async (bucket, path, data) => { uploads.push({ bucket, path, data }); }, removeOriginal: async () => {} });
      await validateMedia(workerConnection, event, { download: async () => { throw new Error('replay must not download'); } });
    } finally { await workerConnection.end(); }
    assert.equal(uploads.length, 1); assert.equal(uploads[0].bucket, 'loyalty-brand');
    assert.equal((await sharp(uploads[0].data).metadata()).format, 'webp');
    assert.equal((await rpc(ownerA, 'media_status', [grant.assetId])).status, 'accepted');
    await assert.rejects(rpc(ownerB, 'attach_brand_media', [b.businessId, grant.assetId, 3, randomUUID()]), { code: '22023' });
    await rpc(ownerA, 'attach_brand_media', [a.businessId, grant.assetId, 3, randomUUID()]);
    assert.equal((await rpc(ownerA, 'public_brand_media', ['phase2-a'])).logo, uploads[0].path);
    await assert.rejects(as(ownerA, 'select public.worker_media_job($1)', [event]), { code: '42501' });
    const proof = await rpc(ownerA, 'reserve_media', [a.businessId, 'payment_proof', 'image/png', image.length, randomUUID()]);
    await as(ownerA, "insert into storage.objects(bucket_id,name) values('loyalty-quarantine',$1)", [proof.path]);
    await rpc(ownerA, 'submit_media', [proof.assetId, randomUUID()]);
    const proofEvent = (await client.query("select id from public.outbox_events where event_key=$1 and event_type='media.validate'", [proof.assetId])).rows[0].id;
    const conn = postgres.getPgClient(); await conn.connect();
    try { await conn.query('set role loyalty_worker'); await validateMedia(conn, proofEvent, { download: async () => image, upload: async bucket => assert.equal(bucket, 'loyalty-private'), removeOriginal: async () => {} }); }
    finally { await conn.end(); }
    assert.equal((await rpc(ownerA, 'media_status', [proof.assetId])).status, 'accepted');
    await assert.rejects(rpc(ownerA, 'attach_brand_media', [a.businessId, proof.assetId, 4, randomUUID()]), { code: '22023' });
  });
  await test('Phase 2 invitation rotation revokes the old token and edits immediately restrict branch permissions', async () => {
    const initial = await rpc(ownerA, 'create_staff_invitation', [a.businessId, { email: ownerB.email, role: 'manager', branchIds: [a.branchId], canContactCustomers: true }, randomUUID()]);
    const renewed = await rpc(ownerA, 'resend_staff_invitation', [a.businessId, initial.invitationId, 1, randomUUID()]);
    assert.notEqual(initial.token, renewed.token);
    await assert.rejects(rpc(ownerB, 'accept_staff_invitation', [initial.token, randomUUID()]), { code: 'P0002' });
    await rpc(ownerB, 'accept_staff_invitation', [renewed.token, randomUUID()]);
    assert.equal((await rpc(ownerB, 'business_access', [a.businessId, a.branchId])).canContactCustomers, true);
    const row = (await rpc(ownerA, 'business_setup', [a.businessId])).staff.find(s => s.email === ownerB.email);
    await rpc(ownerA, 'manage_staff', [a.businessId, { id: row.id, rowVersion: row.rowVersion, action: 'edit', role: 'cashier', branchIds: [a.branchId] }, randomUUID()]);
    assert.equal((await rpc(ownerB, 'business_access', [a.businessId, a.branchId])).canContactCustomers, false);
    await assert.rejects(rpc(ownerB, 'business_members', [a.businessId, a.branchId, 0]), { code: '42501' });
  });
  await test('Phase 2 operator ownership transfer needs admin, AAL2 and recent authentication, retaining exactly one owner', async () => {
    const args = [a.businessId, ownerA.id, ownerB.id, 'TEST ONLY: accepting replacement recorded under fixture reference.', randomUUID()];
    await assert.rejects(rpc(ownerA, 'operator_transfer_owner', args), { code: '42501' });
    await client.query('insert into public.platform_admins(user_id,active,can_reconcile_billing,can_manage_support) values($1,true,false,true)', [ownerA.id]);
    await assert.rejects(rpc(ownerA, 'operator_transfer_owner', args, 'aal1'), { code: '42501' });
    await assert.rejects(rpc({ ...ownerA, authTime: Math.floor(Date.now() / 1000) - 901 }, 'operator_transfer_owner', args), { code: '42501' });
    await assert.rejects(rpc({ ...ownerA, method: 'token_refresh' }, 'operator_transfer_owner', args), { code: '42501' });
    await assert.rejects(rpc(ownerA, 'operator_transfer_owner', [a.businessId, ownerA.id, customer.id, args[3], randomUUID()]), { code: '22023' });
    await rpc(ownerA, 'operator_transfer_owner', args);
    assert.equal((await client.query("select count(*) from public.business_users where business_id=$1 and role='owner' and status='active'", [a.businessId])).rows[0].count, '1');
    await assert.rejects(rpc(ownerA, 'business_setup', [a.businessId]), { code: '42501' });
    assert.equal((await rpc(ownerB, 'business_setup', [a.businessId])).staff.find(s => s.role === 'owner' && s.status === 'active').email, ownerB.email);
    await assert.rejects(as(customer, 'insert into public.platform_admins(user_id,active,can_reconcile_billing,can_manage_support) values(auth.uid(),true,true,true)'), { code: '42501' });
  });
  await test('Phase 2 failed direct invitation attempts commit their rate limit', async () => {
    for (let i = 0; i < 10; i++) {
      const result = await as(customer, 'select public.accept_staff_invitation($1,$2) as result', ['x'.repeat(43), randomUUID()]);
      assert.equal(result.error.code, 'invitation_unavailable');
    }
    const denied = await as(customer, 'select public.accept_staff_invitation($1,$2) as result', ['x'.repeat(43), randomUUID()]);
    assert.equal(denied.error.code, 'rate_limited');
  });
  await test('Phase 2 invalid bootstrap attempts retain limits without partial records', async () => {
    await client.query('insert into auth.sessions(id,user_id) values($1,$2) on conflict(id) do update set not_after=null',[outsider.session,outsider.id]);
    for (let i=0;i<5;i++) {
      const result=await as(outsider,'select public.bootstrap_business($1,$2) as result',[{...bootstrap('invalid-bootstrap'),planVersionId:randomUUID()},randomUUID()]);
      assert.equal(result.error.code,'request_rejected');
    }
    const result=await as(outsider,'select public.bootstrap_business($1,$2) as result',[bootstrap('valid-after-limit'),randomUUID()]);
    assert.equal(result.error.code,'rate_limited');
    assert.equal((await client.query('select count(*) from public.businesses where created_by=$1',[outsider.id])).rows[0].count,'0');
  });
  await test('Phase 2 additional-business grants require recent admin MFA and are consumed once', async () => {
    const args=[ownerB.id,'Operator-authorized second business for test coverage.',randomUUID()];
    await assert.rejects(rpc(outsider,'operator_authorize_business',args),{code:'42501'});
    await assert.rejects(rpc(ownerA,'operator_authorize_business',args,'aal1'),{code:'42501'});
    const grant=await rpc(ownerA,'operator_authorize_business',args);
    await assert.rejects(rpc(ownerB,'bootstrap_business',[{...bootstrap('phase2-extra'),city:''},randomUUID()]),{code:'23514'});
    assert.equal((await client.query('select consumed_at from app_private.business_provision_grants where id=$1',[grant.grantId])).rows[0].consumed_at,null);
    const extra=await rpc(ownerB,'bootstrap_business',[bootstrap('phase2-extra'),randomUUID()]);
    assert.ok(extra.businessId);
    assert.ok((await client.query('select consumed_at from app_private.business_provision_grants where id=$1',[grant.grantId])).rows[0].consumed_at);
    await assert.rejects(rpc(ownerB,'bootstrap_business',[bootstrap('phase2-extra-denied'),randomUUID()]),{code:'22023'});
  });
  await test('Phase 2 business timezone is editable before activity and immutable once locked', async () => {
    const current=(await rpc(ownerB,'business_setup',[b.businessId])).business;
    const input={rowVersion:current.row_version,name:current.display_name,description:'',accentHex:'#166534',phone:'',supportEmail:'',menuUrl:'',reviewUrl:'',timezone:'Asia/Dubai'};
    await rpc(ownerB,'save_business_settings',[b.businessId,input,randomUUID()]);
    assert.equal((await rpc(ownerB,'business_setup',[b.businessId])).business.timezone,'Asia/Dubai');
    await client.query('update public.businesses set timezone_locked_at=now() where id=$1',[b.businessId]);
    await assert.rejects(rpc(ownerB,'save_business_settings',[b.businessId,{...input,rowVersion:input.rowVersion+1,timezone:'Asia/Karachi'},randomUUID()]),{code:'23514'});
    await assert.rejects(client.query('update public.businesses set timezone_locked_at=null where id=$1',[b.businessId]),{code:'23514'});
  });
}
