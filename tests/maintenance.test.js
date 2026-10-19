import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBuild } from '../build/run.mjs';
import { makeCloudflare } from '../build/lib/cloudflare.mjs';
import { buildMaintenancePage } from '../templates/shared/maintenance.js';

const sample = JSON.parse(readFileSync(new URL('../templates/cafe/sample.json', import.meta.url)));
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 '), Buffer.alloc(40)]);
const SID = '11111111-1111-1111-1111-111111111111', VID = '22222222-2222-2222-2222-222222222222';
const tmp = () => join(mkdtempSync(join(tmpdir(), 'm-')), 'dist');

function fakeDb(siteOver = {}, { memberEmail = 'cust@example.com' } = {}) {
  const calls = { events: [], patches: [] };
  const site = { id: SID, member_id: 'mem1', slug: 'wuhou-cafe', template: 'cafe', status: 'live', live_version_id: VID, cf_project_name: 'wuhou-cafe', first_published_at: null, go_live_notified_at: null, custom_domain: null, domain_status: 'none', public_url: 'https://wuhou-cafe-9x.pages.dev/', content: sample.content, ...siteOver };
  return {
    calls, site,
    getOne: async (t) => (t === 'rental_sites' ? site : t === 'members' ? (memberEmail ? { email: memberEmail } : null) : { id: VID, content: sample.content, palette: 'caramel', sections: sample.sections }),
    patch: async (t, q, b) => { calls.patches.push({ t, q, b }); },
    insert: async (t, b) => { calls.events.push(b); },
    download: async () => WEBP
  };
}
const cf = (subdomain = 'wuhou-cafe-9x.pages.dev') => ({ ensureProject: async (name) => ({ name, subdomain, created: false }) });
const run = (db, extra = {}) => runBuild({ siteId: SID, outDir: tmp(), db, cf: cf(), deploy: async () => {}, log: () => {}, now: () => new Date('2026-10-11T00:00:00Z'), ...extra });

test('maintenance page: noindex, escaped shop name, fixed contact info, no customer content', () => {
  const p = buildMaintenancePage({ shopName: '<script>alert(1)</script>咖啡' });
  assert.ok(p.html.includes('noindex,nofollow') && p.html.includes('@788cblaq') && p.html.includes('ycaxiom@gmail.com'));
  assert.ok(!p.html.includes('<script>') && p.html.includes('&lt;script&gt;'));
  assert.deepEqual(Object.keys(p.files).sort(), ['index.html', 'robots.txt']); assert.ok(!('sitemap.xml' in p.files));
  assert.ok(buildMaintenancePage().html.includes('網站維護中'));
});
test('maintenance mode: only suspended sites; deploys to the SAME project; keeps live_version_id; no mail', async () => {
  const db = fakeDb({ status: 'suspended' }); const out = tmp(); let deployed = null; let mails = 0;
  const r = await runBuild({ siteId: SID, mode: 'maintenance', outDir: out, db, cf: cf(), deploy: async (a) => { deployed = a; }, sendMail: async () => { mails++; return { ok: true }; }, log: () => {} });
  assert.equal(r.ok, true); assert.deepEqual(deployed, { dir: out, project: 'wuhou-cafe' });
  assert.ok(existsSync(join(out, 'index.html')) && existsSync(join(out, '_headers')) && !existsSync(join(out, 'images')));
  assert.ok(readFileSync(join(out, 'index.html'), 'utf8').includes('網站維護中')); assert.ok(readFileSync(join(out, '_headers'), 'utf8').includes('X-Robots-Tag: noindex'));
  assert.ok(!('live_version_id' in db.calls.patches[0].b) && !('public_url' in db.calls.patches[0].b)); assert.equal(mails, 0);
  assert.deepEqual(db.calls.events.at(-1).detail.mode, 'maintenance'); assert.equal(db.calls.events.at(-1).type, 'deploy_ok');
});
test('maintenance mode refuses non-suspended; normal mode refuses suspended; unknown mode refused', async () => {
  for (const status of ['live', 'overdue', 'pending', 'draft', 'cancelled']) {
    let called = false; const db = fakeDb({ status });
    const r = await runBuild({ siteId: SID, mode: 'maintenance', outDir: tmp(), db, cf: cf(), deploy: async () => { called = true; }, log: () => {} });
    assert.equal(r.ok, false, status); assert.equal(called, false); assert.equal(db.calls.events.at(-1).type, 'deploy_failed');
  }
  let called = false; let db = fakeDb({ status: 'suspended' });
  assert.equal((await run(db, { deploy: async () => { called = true; } })).ok, false); assert.equal(called, false);
  db = fakeDb(); assert.equal((await run(db, { mode: 'weird' })).ok, false);
});
test('maintenance mode on a never-deployed site is a no-op success (nothing to replace)', async () => {
  let called = false; const db = fakeDb({ status: 'suspended', cf_project_name: null });
  const r = await runBuild({ siteId: SID, mode: 'maintenance', outDir: tmp(), db, cf: cf(), deploy: async () => { called = true; }, log: () => {} });
  assert.equal(r.ok, true); assert.equal(r.skipped, true); assert.equal(called, false);
});
test('maintenance deploy failure → deploy_failed with mode, no patch', async () => {
  const db = fakeDb({ status: 'suspended' });
  const r = await runBuild({ siteId: SID, mode: 'maintenance', outDir: tmp(), db, cf: cf(), deploy: async () => { throw new Error('boom Bearer tok.en-1'); }, log: () => {} });
  assert.equal(r.ok, false); assert.equal(db.calls.patches.length, 0); const e = db.calls.events.at(-1); assert.equal(e.detail.mode, 'maintenance'); assert.ok(!JSON.stringify(e).includes('tok.en'));
});

test('custom domain: active → canonical/sitemap use it; pending_dns → still pages.dev', async () => {
  for (const [ds, expect] of [['active', 'https://www.example.com.tw/'], ['pending_dns', 'https://wuhou-cafe-9x.pages.dev/']]) {
    const db = fakeDb({ custom_domain: 'www.example.com.tw', domain_status: ds }); const out = tmp();
    const r = await runBuild({ siteId: SID, outDir: out, db, cf: cf(), deploy: async () => {}, log: () => {} });
    assert.equal(r.url, expect, ds); assert.ok(readFileSync(join(out, 'sitemap.xml'), 'utf8').includes(expect)); assert.ok(readFileSync(join(out, 'index.html'), 'utf8').includes('href="' + expect + '"'));
    assert.equal(db.calls.patches[0].b.public_url, expect);
  }
});

test('go-live email: sent once after first successful deploy, sets go_live_notified_at, logs email_sent', async () => {
  const db = fakeDb(); const sent = [];
  const r = await run(db, { sendMail: async (m) => { sent.push(m); return { ok: true }; } });
  assert.equal(r.ok, true); assert.equal(sent.length, 1); assert.equal(sent[0].to, 'cust@example.com'); assert.ok(sent[0].html.includes('https://wuhou-cafe-9x.pages.dev/'));
  assert.deepEqual(db.calls.patches.at(-1).b, { go_live_notified_at: '2026-10-11T00:00:00.000Z' }); assert.deepEqual(db.calls.events.map((e) => e.type), ['deploy_ok', 'email_sent']);
});
test('go-live email: not sent when already notified, or when no mailer (BREVO_API_KEY missing)', async () => {
  let n = 0; const mail = async () => { n++; return { ok: true }; };
  await run(fakeDb({ go_live_notified_at: '2026-10-01T00:00:00Z' }), { sendMail: mail }); assert.equal(n, 0);
  const db = fakeDb(); const r = await run(db); assert.equal(r.ok, true); assert.deepEqual(db.calls.events.map((e) => e.type), ['deploy_ok']);
});
test('go-live email failures never fail the deploy: send error / throw / no member email', async () => {
  for (const [mail, memberEmail] of [[async () => ({ ok: false, error: 'brevo 401' }), 'a@b.c'], [async () => { throw new Error('network'); }, 'a@b.c'], [async () => ({ ok: true }), null]]) {
    const db = fakeDb({}, { memberEmail }); const r = await run(db, { sendMail: mail });
    assert.equal(r.ok, true); assert.deepEqual(db.calls.events.map((e) => e.type), ['deploy_ok', 'email_failed']);
    assert.ok(!db.calls.patches.some((p) => 'go_live_notified_at' in p.b), 'not marked notified so it can retry on the next deploy');
  }
});

test('cloudflare addDomain / getDomain / removeDomain', async () => {
  const mk = (seq) => { let i = 0; const seen = []; const f = async (url, o) => { seen.push({ url, m: o.method }); const r = seq[i++]; return { status: r[0], json: async () => r[1] }; }; f.seen = seen; return f; };
  let f = mk([[200, { result: { name: 'p', subdomain: 'p-1.pages.dev' } }], [404, {}], [200, { result: { name: 'a.example.com', status: 'pending' } }]]);
  let cf1 = makeCloudflare({ token: 't', accountId: 'acc', fetchImpl: f });
  assert.deepEqual(await cf1.addDomain('p', 'a.example.com'), { name: 'a.example.com', status: 'pending', target: 'p-1.pages.dev', created: true });
  assert.equal(f.seen[2].m, 'POST'); assert.ok(f.seen[2].url.endsWith('/pages/projects/p/domains')); assert.ok(f.seen[1].url.endsWith('/domains/a.example.com'));
  f = mk([[200, { result: { subdomain: 'p-1.pages.dev' } }], [200, { result: { name: 'a.example.com', status: 'active' } }]]); cf1 = makeCloudflare({ token: 't', accountId: 'acc', fetchImpl: f });
  assert.equal((await cf1.addDomain('p', 'a.example.com')).created, false);
  f = mk([[200, { result: { subdomain: 'p-1.pages.dev' } }], [404, {}], [409, { errors: [{ message: 'already in use' }] }]]); cf1 = makeCloudflare({ token: 't', accountId: 'acc', fetchImpl: f });
  await assert.rejects(() => cf1.addDomain('p', 'a.example.com'), /already in use/);
  f = mk([[404, {}], [200, { result: { name: 'a', status: 'active' } }], [500, {}]]); cf1 = makeCloudflare({ token: 't', accountId: 'acc', fetchImpl: f });
  assert.equal(await cf1.getDomain('p', 'a'), null); assert.equal((await cf1.getDomain('p', 'a')).status, 'active'); await assert.rejects(() => cf1.getDomain('p', 'a'), /500/);
  f = mk([[200, {}], [404, {}], [403, { errors: [{ message: 'nope' }] }]]); cf1 = makeCloudflare({ token: 't', accountId: 'acc', fetchImpl: f });
  assert.deepEqual(await cf1.removeDomain('p', 'a'), { removed: true }); assert.deepEqual(await cf1.removeDomain('p', 'a'), { removed: false }); await assert.rejects(() => cf1.removeDomain('p', 'a'), /nope/);
});
