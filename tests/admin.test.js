import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAdmin, addMonths, taipeiDate, normalizeDomain } from '../supabase/functions/admin-site/handler.mjs';
import { parseOrigins } from '../supabase/functions/_shared/http.mjs';
import { makeDispatcher, makeGetUser } from '../supabase/functions/_shared/runtime.mjs';
import { makeBrevoSender } from '../supabase/functions/_shared/brevo.mjs';
import { customerGoLive, customerReceipt, adminFirstPublish } from '../supabase/functions/_shared/emails.mjs';

const SID = '11111111-1111-1111-1111-111111111111', VID = '22222222-2222-2222-2222-222222222222', V2 = '33333333-3333-3333-3333-333333333333';
const ORIGIN = 'https://chi1017.github.io';
const NOW = new Date('2026-10-10T20:00:00Z');   // 台灣時間 2026-10-11 04:00 → today = 2026-10-11

function setup({ site = {}, user = { id: 'u1', email: 'ycaxiom@gmail.com', isAdmin: true }, dispatchOk = true, mailOk = true, cf = undefined, versions = [{ id: V2, created_at: '2026-10-09' }], payments = [], memberEmail = 'cust@example.com' } = {}) {
  const s = { id: SID, member_id: 'mmm', slug: 'wuhou-cafe', status: 'live', content: { name: '午後日光咖啡' }, palette: 'ink', sections: {}, paid_until: '2026-10-20', live_version_id: VID, cf_project_name: 'wuhou-cafe', custom_domain: null, domain_status: 'none', plan: 'standard', early_bird: false, ...site };
  const log = { patches: [], events: [], payments: [], mails: [], dispatches: [] };
  const db = {
    getOne: async (t, q) => {
      if (t === 'rental_sites') { if (q.includes('custom_domain=eq.')) return log.otherSiteDomain || null; return s; }
      if (t === 'members') return memberEmail ? { email: memberEmail } : null;
      if (t === 'site_versions') { const m = q.match(/id=eq\.([^&]+)/); return m && [VID, V2].includes(m[1]) ? { id: m[1], content: { name: '舊版' }, palette: 'forest', sections: { menu: true }, created_at: '2026-10-01' } : null; }
      return null;
    },
    list: async (t, q) => {
      if (t === 'payments') return payments;
      if (t === 'rental_sites') return log.earlyBirdOthers || [];
      if (t === 'site_versions') return versions;
      return [];
    },
    patch: async (t, q, b) => { log.patches.push({ t, q, b }); Object.assign(s, b); },
    insert: async (t, b) => { if (t === 'site_events') log.events.push(b); },
    insertReturning: async (t, b) => { log.payments.push(b); return { id: 'pay-1', ...b }; }
  };
  const deps = {
    allowedOrigins: parseOrigins(), db, now: () => NOW,
    getUser: async (tok) => (tok === 'good' ? user : null),
    sendMail: async (m) => { log.mails.push(m); return mailOk ? { ok: true } : { ok: false, error: 'brevo 401' }; },
    dispatch: async (a) => { log.dispatches.push(a); return dispatchOk ? { ok: true } : { ok: false, error: 'github 404' }; },
    cf
  };
  const call = (action, params = {}, over = {}) => handleAdmin(new Request('https://x/functions/v1/admin-site', {
    method: 'POST', headers: { origin: ORIGIN, authorization: 'Bearer good', 'content-type': 'application/json', ...(over.headers || {}) },
    body: over.body === undefined ? JSON.stringify({ action, site_id: SID, ...params }) : over.body
  }), deps);
  return { call, log, site: s, deps };
}
const types = (l) => l.events.map((e) => e.type);

test('date helpers: Taiwan today, month-end clamp', () => {
  assert.equal(taipeiDate(NOW), '2026-10-11');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28'); assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-10-11', 3), '2027-01-11'); assert.equal(addMonths('2026-11-30', 12), '2027-11-30'); assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
});
test('normalizeDomain accepts normal domains, rejects pages.dev / junk', () => {
  assert.equal(normalizeDomain(' HTTPS://WWW.Example.com.tw/path '), 'www.example.com.tw');
  for (const bad of ['', 'nodot', 'a b.com', 'x.pages.dev', 'pages.dev', 'a.workers.dev', '-a.com', 'a..com', 'http://', '<script>.com', 'a.com:8080']) assert.equal(normalizeDomain(bad), '', bad);
});

test('auth: no/invalid token → 401; non-admin → 403 and nothing runs; bad origin → 403', async () => {
  let s = setup();
  assert.equal((await s.call('republish', {}, { headers: { authorization: '' } })).status, 401);
  assert.equal((await s.call('republish', {}, { headers: { authorization: 'Bearer bad' } })).status, 401);
  s = setup({ user: { id: 'u2', email: 'cust@example.com', isAdmin: false } });
  const r = await s.call('suspend', { reason: 'x' }); assert.equal(r.status, 403);
  assert.equal(s.log.patches.length, 0); assert.equal(s.log.dispatches.length, 0); assert.equal(s.log.events.length, 0);
  assert.equal((await setup().call('republish', {}, { headers: { origin: 'https://evil.example' } })).status, 403);
  const opt = await handleAdmin(new Request('https://x/', { method: 'OPTIONS', headers: { origin: ORIGIN } }), setup().deps); assert.equal(opt.status, 204);
  assert.equal((await handleAdmin(new Request('https://x/', { method: 'GET' }), setup().deps)).status, 405);
});
test('validation: unknown action, bad site id, bad json, oversize, unknown site', async () => {
  const s = setup();
  assert.equal((await s.call('nope')).status, 400);
  assert.equal((await s.call('republish', { site_id: 'not-a-uuid' })).status, 400);
  assert.equal((await s.call('x', {}, { body: '{oops' })).status, 400);
  assert.equal((await s.call('x', {}, { body: JSON.stringify({ action: 'republish', site_id: SID, pad: 'a'.repeat(5000) }) })).status, 400);
  s.deps.db.getOne = async () => null; assert.equal((await s.call('republish')).status, 404);
});

test('confirm_payment on pending: records payment, status→live, paid_until, deploys LATEST version, receipt mail, events', async () => {
  const s = setup({ site: { status: 'pending', paid_until: null, live_version_id: null, cf_project_name: null } });
  const r = await s.call('confirm_payment', { amount: 3000, months: 3, reference: '12345', paid_on: '2026-10-11' }); const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j)); assert.equal(j.status, 'live'); assert.equal(j.paid_until, '2027-01-11'); assert.equal(j.deploying, true);
  assert.deepEqual(s.log.payments[0], { site_id: SID, member_id: 'mmm', amount: 3000, months: 3, method: 'bank_transfer', reference: '12345', paid_on: '2026-10-11', period_from: '2026-10-11', period_to: '2027-01-11', confirmed_by: 'ycaxiom@gmail.com' });
  assert.deepEqual(s.log.patches[0].b, { paid_until: '2027-01-11', status: 'live' });
  assert.deepEqual(s.log.dispatches, [{ siteId: SID, versionId: V2, mode: undefined }]);
  assert.equal(s.log.mails[0].to, 'cust@example.com'); assert.ok(s.log.mails[0].subject.includes('午後日光咖啡')); assert.ok(s.log.mails[0].html.includes('3,000'));
  assert.deepEqual(types(s.log), ['payment_confirmed', 'email_sent']); assert.equal(s.log.events[0].detail.by, 'ycaxiom@gmail.com');
});
test('confirm_payment on live: extends from existing paid_until, no deploy, no status change', async () => {
  const s = setup({ site: { status: 'live', paid_until: '2026-10-20' } });
  const j = await (await s.call('confirm_payment', { amount: 1000, months: 1, paid_on: '2026-10-11' })).json();
  assert.equal(j.paid_until, '2026-11-20'); assert.deepEqual(s.log.patches[0].b, { paid_until: '2026-11-20' }); assert.equal(s.log.dispatches.length, 0); assert.equal(j.deploying, false);
});
test('confirm_payment on overdue: restarts from today, back to live, no redeploy needed', async () => {
  const s = setup({ site: { status: 'overdue', paid_until: '2026-10-01' } });
  const j = await (await s.call('confirm_payment', { amount: 1000, months: 1, paid_on: '2026-10-11' })).json();
  assert.equal(s.log.payments[0].period_from, '2026-10-11'); assert.equal(j.paid_until, '2026-11-11'); assert.equal(j.status, 'live'); assert.equal(s.log.dispatches.length, 0);
});
test('confirm_payment on suspended: restores to live, clears suspension, redeploys live version (normal mode)', async () => {
  const s = setup({ site: { status: 'suspended', paid_until: '2026-09-01', suspended_at: 'x', suspend_reason: 'y' } });
  const j = await (await s.call('confirm_payment', { amount: 1000, months: 1, paid_on: '2026-10-11' })).json();
  assert.equal(j.status, 'live'); assert.deepEqual(s.log.patches[0].b, { paid_until: '2026-11-11', status: 'live', suspended_at: null, suspend_reason: null });
  assert.deepEqual(s.log.dispatches, [{ siteId: SID, versionId: VID, mode: undefined }]);
});
test('confirm_payment: period counts from today even if the payment date is in the past', async () => {
  const s = setup({ site: { status: 'suspended', paid_until: null } });
  const j = await (await s.call('confirm_payment', { amount: 500, months: 1, paid_on: '2025-09-01' })).json();
  assert.equal(j.status, 'live');  // 期間從「今天」起算，不會因為收款日在過去而立刻逾期
});
test('confirm_payment validation: amount/months/date/reference; draft & cancelled rejected; duplicate within 1 minute', async () => {
  const s = setup();
  const bad = [{ amount: 0, months: 1 }, { amount: 1.5, months: 1 }, { amount: '3000', months: 1 }, { amount: 99999999, months: 1 }, { amount: 100, months: 0 }, { amount: 100, months: 61 }, { amount: 100, months: 1.5 },
    { amount: 100, months: 1, paid_on: '2026-13-40' }, { amount: 100, months: 1, paid_on: '2026-10-20' }, { amount: 100, months: 1, paid_on: '2020-01-01' }, { amount: 100, months: 1, reference: 'x'.repeat(101) }];
  for (const b of bad) assert.equal((await s.call('confirm_payment', { paid_on: '2026-10-11', ...b })).status, 400, JSON.stringify(b));
  assert.equal(s.log.payments.length, 0);
  for (const status of ['draft', 'cancelled']) assert.equal((await setup({ site: { status } }).call('confirm_payment', { amount: 100, months: 1, paid_on: '2026-10-11' })).status, 409);
  const d = setup({ payments: [{ id: 'p0' }] }); assert.equal((await d.call('confirm_payment', { amount: 100, months: 1, paid_on: '2026-10-11' })).status, 409); assert.equal(d.log.payments.length, 0);
  assert.equal((await setup({ site: { status: 'pending' }, versions: [] }).call('confirm_payment', { amount: 100, months: 1, paid_on: '2026-10-11' })).status, 409);
});
test('confirm_payment: dispatch failure keeps the payment, warns, logs deploy_failed; mail failure only logs email_failed', async () => {
  const s = setup({ site: { status: 'pending', paid_until: null }, dispatchOk: false, mailOk: false });
  const r = await s.call('confirm_payment', { amount: 1000, months: 1, paid_on: '2026-10-11' }); const j = await r.json();
  assert.equal(r.status, 200); assert.ok(j.warning); assert.equal(j.deploying, false); assert.equal(s.log.payments.length, 1);
  assert.deepEqual(types(s.log), ['payment_confirmed', 'deploy_failed', 'email_failed']);
});
test('confirm_payment: customer email is escaped in receipt', () => {
  const m = customerReceipt({ shopName: '<img src=x onerror=1>', amount: 1000, months: 1, paidOn: '2026-10-11', periodTo: '2026-11-11', reference: '"><script>' });
  assert.ok(!m.html.includes('<img src=x') && !m.html.includes('<script>')); assert.ok(m.html.includes('&lt;img')); assert.ok(m.html.includes('加入你的聯絡人'));
});

test('republish: live → dispatch live version; suspended → maintenance mode; other states rejected', async () => {
  let s = setup(); assert.equal((await s.call('republish')).status, 200); assert.deepEqual(s.log.dispatches, [{ siteId: SID, versionId: VID, mode: undefined }]); assert.deepEqual(types(s.log), ['republish_queued']);
  s = setup({ site: { status: 'suspended' } }); assert.equal((await s.call('republish')).status, 200); assert.deepEqual(s.log.dispatches, [{ siteId: SID, versionId: undefined, mode: 'maintenance' }]);
  for (const status of ['draft', 'pending', 'cancelled']) assert.equal((await setup({ site: { status } }).call('republish')).status, 409, status);
  assert.equal((await setup({ site: { live_version_id: null } }).call('republish')).status, 409);
  s = setup({ dispatchOk: false }); assert.equal((await s.call('republish')).status, 502); assert.ok(types(s.log).includes('deploy_failed'));
});
test('suspend: status/suspended_at/reason, maintenance deploy, event; rejects already-suspended/draft; long reason', async () => {
  const s = setup(); const j = await (await s.call('suspend', { reason: '逾期未繳' })).json();
  assert.equal(j.status, 'suspended'); assert.equal(s.log.patches[0].b.status, 'suspended'); assert.equal(s.log.patches[0].b.suspend_reason, '逾期未繳'); assert.ok(s.log.patches[0].b.suspended_at);
  assert.deepEqual(s.log.dispatches, [{ siteId: SID, versionId: undefined, mode: 'maintenance' }]); assert.deepEqual(types(s.log), ['suspended']);
  assert.equal((await setup({ site: { status: 'suspended' } }).call('suspend')).status, 409); assert.equal((await setup({ site: { status: 'draft' } }).call('suspend')).status, 409);
  assert.equal((await setup().call('suspend', { reason: 'x'.repeat(201) })).status, 400);
  const f = setup({ dispatchOk: false }); const r = await f.call('suspend', { reason: 'x' }); assert.equal(r.status, 200); assert.ok((await r.json()).warning); assert.equal(f.site.status, 'suspended');
});
test('restore: live/overdue by paid_until, redeploys live version; never-deployed → pending; only for suspended', async () => {
  let s = setup({ site: { status: 'suspended', paid_until: '2026-12-01' } }); let j = await (await s.call('restore')).json();
  assert.equal(j.status, 'live'); assert.deepEqual(s.log.patches[0].b, { status: 'live', suspended_at: null, suspend_reason: null }); assert.deepEqual(s.log.dispatches, [{ siteId: SID, versionId: VID, mode: undefined }]);
  s = setup({ site: { status: 'suspended', paid_until: '2026-10-01' } }); assert.equal((await (await s.call('restore')).json()).status, 'overdue');
  s = setup({ site: { status: 'suspended', paid_until: null, live_version_id: null, cf_project_name: null } }); j = await (await s.call('restore')).json(); assert.equal(j.status, 'pending'); assert.equal(s.log.dispatches.length, 0);
  assert.equal((await setup().call('restore')).status, 409);
});
test('restore_version: deploys chosen version; overwrite_draft only when exactly true; foreign/unknown version rejected; only live/overdue', async () => {
  let s = setup(); let r = await s.call('restore_version', { version_id: V2 }); assert.equal(r.status, 200);
  assert.deepEqual(s.log.dispatches, [{ siteId: SID, versionId: V2, mode: undefined }]); assert.equal(s.log.patches.length, 0); assert.equal(s.log.events[0].detail.overwrite_draft, false);
  s = setup(); await s.call('restore_version', { version_id: V2, overwrite_draft: 'true' }); assert.equal(s.log.patches.length, 0);
  s = setup(); await s.call('restore_version', { version_id: V2, overwrite_draft: true });
  assert.deepEqual(s.log.patches[0].b, { content: { name: '舊版' }, palette: 'forest', sections: { menu: true } }); assert.equal(s.log.events[0].detail.overwrite_draft, true);
  assert.equal((await setup().call('restore_version', { version_id: '99999999-9999-9999-9999-999999999999' })).status, 404);
  assert.equal((await setup().call('restore_version', { version_id: 'bad' })).status, 400);
  for (const status of ['pending', 'suspended', 'draft']) assert.equal((await setup({ site: { status } }).call('restore_version', { version_id: V2 })).status, 409, status);
});

const fakeCf = (over = {}) => ({
  addDomain: async (p, d) => ({ name: d, status: 'pending', target: 'wuhou-cafe-9x.pages.dev', created: true, ...(over.add || {}) }),
  getDomain: async () => (over.get === undefined ? { name: 'x', status: 'active', error: '' } : over.get),
  removeDomain: async () => ({ removed: true })
});
test('set_domain: normalizes, adds to Cloudflare, returns CNAME target, domain_status pending_dns, event; no deploy until active', async () => {
  const s = setup({ cf: fakeCf() }); const r = await s.call('set_domain', { domain: 'HTTPS://www.Example.com.tw/' }); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.cname_target, 'wuhou-cafe-9x.pages.dev'); assert.equal(j.domain_status, 'pending_dns'); assert.ok(j.message.includes('CNAME'));
  assert.deepEqual(s.log.patches[0].b, { custom_domain: 'www.example.com.tw', domain_status: 'pending_dns' }); assert.equal(s.log.dispatches.length, 0); assert.deepEqual(types(s.log), ['domain_set']);
});
test('set_domain: already active at Cloudflare → active + redeploy; rejects bad/in-use/undeployed/no cf; cf error is logged', async () => {
  let s = setup({ cf: fakeCf({ add: { status: 'active' } }) }); const j = await (await s.call('set_domain', { domain: 'a.example.com' })).json();
  assert.equal(j.domain_status, 'active'); assert.deepEqual(s.log.dispatches, [{ siteId: SID, versionId: VID, mode: undefined }]);
  assert.equal((await setup({ cf: fakeCf() }).call('set_domain', { domain: 'x.pages.dev' })).status, 400);
  assert.equal((await setup({ cf: fakeCf(), site: { cf_project_name: null } }).call('set_domain', { domain: 'a.example.com' })).status, 409);
  s = setup({ cf: fakeCf() }); s.log.otherSiteDomain = { id: 'other' }; assert.equal((await s.call('set_domain', { domain: 'a.example.com' })).status, 409);
  assert.equal((await setup().call('set_domain', { domain: 'a.example.com' })).status, 501);
  s = setup({ cf: { ...fakeCf(), addDomain: async () => { throw new Error('Cloudflare 新增網域失敗 (400)：taken'); } } }); const r = await s.call('set_domain', { domain: 'a.example.com' });
  assert.equal(r.status, 502); assert.ok(types(s.log).includes('domain_failed')); assert.equal(s.log.patches.length, 0);
});
test('check_domain: pending → stays pending; active → domain_status active + redeploy; missing → 409', async () => {
  let s = setup({ site: { custom_domain: 'a.example.com', domain_status: 'pending_dns' }, cf: fakeCf({ get: { name: 'a', status: 'pending', error: 'CNAME record not set' } }) });
  let j = await (await s.call('check_domain')).json(); assert.equal(j.domain_status, 'pending_dns'); assert.ok(j.message.includes('CNAME record not set')); assert.equal(s.log.patches.length, 0); assert.equal(s.log.dispatches.length, 0);
  s = setup({ site: { custom_domain: 'a.example.com', domain_status: 'pending_dns' }, cf: fakeCf() }); j = await (await s.call('check_domain')).json();
  assert.equal(j.domain_status, 'active'); assert.deepEqual(s.log.patches[0].b, { domain_status: 'active' }); assert.deepEqual(s.log.dispatches, [{ siteId: SID, versionId: VID, mode: undefined }]); assert.deepEqual(types(s.log), ['domain_active']);
  s = setup({ site: { custom_domain: 'a.example.com', domain_status: 'active' }, cf: fakeCf() }); await s.call('check_domain'); assert.equal(s.log.dispatches.length, 0, 'already active → no redeploy');
  assert.equal((await setup({ site: { custom_domain: 'a.example.com' }, cf: fakeCf({ get: null }) }).call('check_domain')).status, 409);
  assert.equal((await setup({ cf: fakeCf() }).call('check_domain')).status, 409);
});
test('clear_domain: removes from Cloudflare, resets fields, redeploys', async () => {
  const s = setup({ site: { custom_domain: 'a.example.com', domain_status: 'active' }, cf: fakeCf() }); const j = await (await s.call('clear_domain')).json();
  assert.equal(j.domain_status, 'none'); assert.deepEqual(s.log.patches[0].b, { custom_domain: null, domain_status: 'none' }); assert.equal(s.log.dispatches.length, 1); assert.deepEqual(types(s.log), ['domain_cleared']);
  assert.equal((await setup({ cf: fakeCf() }).call('clear_domain')).status, 409);
});

test('emails: go-live and receipt escape input and ask to add sender to contacts; admin mail points to the admin tab', () => {
  const g = customerGoLive({ shopName: '<b>店</b>', url: 'https://a.pages.dev/?x="y' });
  assert.ok(!g.html.includes('<b>店') && g.html.includes('&lt;b&gt;') && !g.html.includes('x="y')); assert.ok(g.text.includes('ycaxiom@gmail.com') && g.html.includes('加入你的聯絡人'));
  const a = adminFirstPublish({ shopName: 's', slug: 'x', previewUrl: 'https://p/', memberEmail: 'm@e.com' });
  assert.ok(a.html.includes('確認收款') && a.text.includes('確認收款') && !a.html.includes('Supabase'));
});

test('dispatcher: workflow_dispatch body carries site/version/mode and the configured ref; no token → error', async () => {
  const seen = []; const f = async (url, o) => { seen.push({ url, o }); return { status: 204 }; };
  const d = makeDispatcher({ token: 'T', repo: 'o/r', ref: 'feat/x', fetchImpl: f });
  assert.deepEqual(await d({ siteId: SID, versionId: VID, mode: 'maintenance' }), { ok: true });
  assert.equal(seen[0].url, 'https://api.github.com/repos/o/r/actions/workflows/deploy-site.yml/dispatches'); assert.equal(seen[0].o.headers.Authorization, 'Bearer T');
  assert.deepEqual(JSON.parse(seen[0].o.body), { ref: 'feat/x', inputs: { site_id: SID, version_id: VID, mode: 'maintenance' } });
  await makeDispatcher({ token: 'T', repo: 'o/r', fetchImpl: f })({ siteId: SID }); assert.deepEqual(JSON.parse(seen[1].o.body), { ref: 'main', inputs: { site_id: SID } });
  assert.equal((await makeDispatcher({ token: '', repo: 'o/r', fetchImpl: f })({ siteId: SID })).ok, false);
  assert.equal((await makeDispatcher({ token: 'T', repo: 'o/r', fetchImpl: async () => ({ status: 404 }) })({ siteId: SID })).ok, false);
});
test('getUser: reads admin flag from app_metadata only; rejects bad tokens', async () => {
  const mk = (status, body) => makeGetUser({ supabaseUrl: 'https://x.supabase.co', anonKey: 'A', fetchImpl: async () => ({ ok: status === 200, json: async () => body }) });
  assert.deepEqual(await mk(200, { id: 'u', email: 'e', app_metadata: { role: 'admin' } })('t'), { id: 'u', email: 'e', isAdmin: true });
  assert.equal((await mk(200, { id: 'u', email: 'e', app_metadata: {}, user_metadata: { role: 'admin' } })('t')).isAdmin, false);
  assert.equal(await mk(401, {})('t'), null);
});
test('brevo sender: fixed sender + reply-to, never throws, reports failures', async () => {
  const seen = []; const ok = makeBrevoSender({ apiKey: 'K', fetchImpl: async (u, o) => { seen.push(JSON.parse(o.body)); return { ok: true }; } });
  assert.deepEqual(await ok({ to: 'a@b.c', subject: 's', html: 'h', text: 't' }), { ok: true });
  assert.deepEqual(seen[0].sender, { name: 'YC AXIOM 網站租用', email: 'ycaxiom@gmail.com' }); assert.deepEqual(seen[0].replyTo, { email: 'ycaxiom@gmail.com' });
  assert.equal((await makeBrevoSender({ apiKey: '' })({ to: 'a@b.c' })).ok, false);
  assert.equal((await makeBrevoSender({ apiKey: 'K', fetchImpl: async () => { throw new Error('net'); } })({ to: 'a@b.c' })).ok, false);
  assert.equal((await makeBrevoSender({ apiKey: 'K', fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'bad key' }) })({ to: 'a@b.c' })).error.includes('401'), true);
});

test('set_plan: admin sets plan, event logged, no deploy; same plan is a no-op; validation', async () => {
  let s = setup({ site: { plan: 'self' } });
  let r = await s.call('set_plan', { plan: 'pro' });
  assert.equal(r.status, 200); assert.equal(s.site.plan, 'pro'); assert.equal(s.site.early_bird, false);
  assert.deepEqual(types(s.log), ['plan_set']); assert.equal(s.log.events[0].detail.plan_from, 'self'); assert.equal(s.log.dispatches.length, 0);
  r = await s.call('set_plan', { plan: 'pro' }); assert.equal(r.status, 200); assert.equal(s.log.events.length, 1);
  for (const bad of [{}, { plan: 'gold' }, { plan: 'pro', early_bird: 'yes' }, { plan: 'pro', early_bird: true }]) { s = setup(); assert.equal((await s.call('set_plan', bad)).status, 400, JSON.stringify(bad)); assert.equal(s.log.patches.length, 0); }
  s = setup({ site: { status: 'cancelled' } }); assert.equal((await s.call('set_plan', { plan: 'pro' })).status, 409);
  s = setup({ site: { status: 'draft' } }); assert.equal((await s.call('set_plan', { plan: 'standard' })).status, 200);
});
test('set_plan: early bird only for standard, capped at 10 other sites, can be removed', async () => {
  let s = setup({ site: { plan: 'self' } });
  let r = await s.call('set_plan', { plan: 'standard', early_bird: true });
  assert.equal(r.status, 200); assert.equal(s.site.early_bird, true); assert.equal(s.site.plan, 'standard');
  r = await s.call('set_plan', { plan: 'standard', early_bird: false }); assert.equal(s.site.early_bird, false);
  s = setup(); s.log.earlyBirdOthers = Array.from({ length: 10 }, (_, i) => ({ id: 'x' + i }));
  r = await s.call('set_plan', { plan: 'standard', early_bird: true }); assert.equal(r.status, 409); assert.equal((await r.json()).error, 'early_bird_full'); assert.equal(s.log.patches.length, 0);
  s = setup(); s.log.earlyBirdOthers = Array.from({ length: 9 }, (_, i) => ({ id: 'x' + i }));
  assert.equal((await s.call('set_plan', { plan: 'standard', early_bird: true })).status, 200);
  s = setup({ site: { plan: 'standard', early_bird: true } }); s.log.earlyBirdOthers = Array.from({ length: 10 }, (_, i) => ({ id: 'x' + i }));
  assert.equal((await s.call('set_plan', { plan: 'standard', early_bird: true })).status, 200, 'already holding a slot is not re-counted');
});
test('set_domain: self plan has no custom domain; standard/pro do', async () => {
  const cf = { addDomain: async () => ({ status: 'pending', cname_target: 'x.pages.dev' }), getDomain: async () => null, removeDomain: async () => {} };
  let s = setup({ site: { plan: 'self' }, cf }); const r = await s.call('set_domain', { domain: 'www.example.com' });
  assert.equal(r.status, 409); assert.equal((await r.json()).error, 'plan_required'); assert.equal(s.log.patches.length, 0);
  s = setup({ site: { plan: 'pro' }, cf }); assert.equal((await s.call('set_domain', { domain: 'www.example.com' })).status, 200);
});
