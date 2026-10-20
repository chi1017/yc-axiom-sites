import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleAdmin } from '../supabase/functions/admin-site/handler.mjs';
import { parseOrigins } from '../supabase/functions/_shared/http.mjs';
import { runBuild } from '../build/run.mjs';
import { makeCloudflare } from '../build/lib/cloudflare.mjs';
import { buildClosedPage } from '../templates/shared/closed.js';

const SID = '11111111-1111-1111-1111-111111111111', VID = '22222222-2222-2222-2222-222222222222';
const ORIGIN = 'https://chi1017.github.io';
const NOW = new Date('2026-10-10T20:00:00Z');

function setup({ site = {}, dispatchOk = true, cfMode = 'ok', photos = ['hero-a.webp', 'room-b.webp'], storageFail = false, dbRemoveFail = false } = {}) {
  const s = { id: SID, member_id: 'mmm', slug: 'wuhou-cafe', status: 'cancelled', content: { name: '午後日光咖啡' }, paid_until: '2026-12-01', live_version_id: VID, cf_project_name: 'wuhou-cafe', custom_domain: null, domain_status: 'none', ...site };
  const log = { patches: [], events: [], dispatches: [], cf: [], removed: [], storageRemoved: [], dbRemoves: [] };
  let remaining = [...photos];
  const db = {
    getOne: async (t) => (t === 'rental_sites' ? s : null),
    list: async () => [],
    patch: async (t, q, b) => { log.patches.push({ t, q, b }); Object.assign(s, b); },
    insert: async (t, b) => { if (t === 'site_events') log.events.push(b); },
    insertReturning: async (t, b) => b,
    remove: async (t, q) => { if (dbRemoveFail) throw new Error('boom'); log.dbRemoves.push({ t, q }); },
    storageList: async (bucket, prefix) => { log.cf.push('list:' + bucket + ':' + prefix); if (storageFail) throw new Error('storage down'); return [{ name: 'sub', id: null }, ...remaining.map((name) => ({ name, id: 'x-' + name }))]; },
    storageRemove: async (bucket, paths) => { log.storageRemoved.push(...paths); remaining = remaining.filter((n) => !paths.includes(SID + '/' + n)); return []; }
  };
  const cf = cfMode === 'none' ? undefined : {
    removeDomain: async (p, d) => { log.cf.push('removeDomain:' + p + ':' + d); },
    deleteProject: async (p) => { log.cf.push('deleteProject:' + p); if (cfMode === 'fail') throw new Error('Cloudflare 刪除專案失敗 (400)'); return { deleted: cfMode !== 'gone' }; }
  };
  const deps = { allowedOrigins: parseOrigins(), db, now: () => NOW, getUser: async (t) => (t === 'good' ? { id: 'u1', email: 'ycaxiom@gmail.com', isAdmin: true } : t === 'cust' ? { id: 'u2', email: 'c@x.com', isAdmin: false } : null),
    sendMail: async () => ({ ok: true }), dispatch: async (a) => { log.dispatches.push(a); return dispatchOk ? { ok: true } : { ok: false, error: 'github 404' }; }, cf };
  const call = (action, params = {}, token = 'good') => handleAdmin(new Request('https://x/f', { method: 'POST', headers: { origin: ORIGIN, authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ action, site_id: SID, ...params }) }), deps);
  return { call, log, site: s };
}
const types = (l) => l.events.map((e) => e.type);

test('terminate: live/pending/overdue/suspended → cancelled, closed-page deploy, event with reason; keeps everything else', async () => {
  for (const status of ['live', 'pending', 'overdue', 'suspended']) {
    const s = setup({ site: { status } }); const r = await s.call('terminate', { reason: '客戶不續約' }); const j = await r.json();
    assert.equal(r.status, 200, status); assert.equal(j.status, 'cancelled'); assert.equal(s.site.status, 'cancelled');
    assert.deepEqual(s.log.patches[0].b, { status: 'cancelled', suspended_at: null, suspend_reason: null });
    assert.deepEqual(s.log.dispatches, [{ siteId: SID, versionId: undefined, mode: 'closed' }]);
    assert.deepEqual(types(s.log), ['terminated']); assert.equal(s.log.events[0].detail.reason, '客戶不續約'); assert.equal(s.log.events[0].detail.status_from, status); assert.equal(s.log.events[0].detail.by, 'ycaxiom@gmail.com');
    assert.equal(s.log.dbRemoves.length, 0);
  }
});
test('terminate: rejects draft/cancelled and long reason; non-admin forbidden; never-deployed has no deploy; dispatch failure still terminates with warning', async () => {
  for (const status of ['draft', 'cancelled']) assert.equal((await setup({ site: { status } }).call('terminate')).status, 409, status);
  assert.equal((await setup({ site: { status: 'live' } }).call('terminate', { reason: 'x'.repeat(201) })).status, 400);
  const f = setup({ site: { status: 'live' } }); assert.equal((await f.call('terminate', {}, 'cust')).status, 403); assert.equal(f.log.patches.length, 0);
  const n = setup({ site: { status: 'pending', cf_project_name: null, live_version_id: null } }); const j = await (await n.call('terminate')).json();
  assert.equal(j.status, 'cancelled'); assert.equal(n.log.dispatches.length, 0);
  const d = setup({ site: { status: 'live' }, dispatchOk: false }); const r = await d.call('terminate'); assert.equal(r.status, 200); assert.ok((await r.json()).warning); assert.equal(d.site.status, 'cancelled');
});
test('restore: cancelled sites can come back (live/overdue by paid_until, redeploy live version)', async () => {
  let s = setup({ site: { status: 'cancelled', paid_until: '2026-12-01' } }); let j = await (await s.call('restore')).json();
  assert.equal(j.status, 'live'); assert.deepEqual(s.log.dispatches, [{ siteId: SID, versionId: VID, mode: undefined }]); assert.equal(s.log.events[0].detail.status_from, 'cancelled');
  s = setup({ site: { status: 'cancelled', paid_until: '2026-10-01' } }); assert.equal((await (await s.call('restore')).json()).status, 'overdue');
  s = setup({ site: { status: 'cancelled', paid_until: null, live_version_id: null, cf_project_name: null } }); assert.equal((await (await s.call('restore')).json()).status, 'pending');
  assert.equal((await setup({ site: { status: 'live' } }).call('restore')).status, 409);
});

test('purge: only cancelled; needs exact slug; nothing is touched otherwise', async () => {
  for (const status of ['live', 'pending', 'overdue', 'suspended', 'draft']) {
    const s = setup({ site: { status } }); assert.equal((await s.call('purge', { confirm_slug: 'wuhou-cafe' })).status, 409, status);
    assert.deepEqual(s.log.cf, []); assert.equal(s.log.dbRemoves.length, 0);
  }
  for (const bad of [undefined, '', 'wuhou', 'WUHOU-CAFE', 123]) {
    const s = setup(); const r = await s.call('purge', bad === undefined ? {} : { confirm_slug: bad }); assert.equal(r.status, 400, String(bad)); assert.equal((await r.json()).error, 'confirm_mismatch');
    assert.deepEqual(s.log.cf, []); assert.equal(s.log.dbRemoves.length, 0); assert.equal(s.log.storageRemoved.length, 0);
  }
  const c = setup(); assert.equal((await c.call('purge', { confirm_slug: 'wuhou-cafe' }, 'cust')).status, 403); assert.equal(c.log.dbRemoves.length, 0);
});
test('purge: removes custom domain + Pages project, then photos (only this site folder), then the DB row last', async () => {
  const s = setup({ site: { custom_domain: 'www.shop.tw' } }); const r = await s.call('purge', { confirm_slug: ' wuhou-cafe ' }); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.deleted, true);
  assert.deepEqual(s.log.cf.slice(0, 3), ['removeDomain:wuhou-cafe:www.shop.tw', 'deleteProject:wuhou-cafe', 'list:site-photos:' + SID]);
  assert.deepEqual(s.log.storageRemoved, [SID + '/hero-a.webp', SID + '/room-b.webp']);
  assert.deepEqual(s.log.dbRemoves, [{ t: 'rental_sites', q: 'id=eq.' + SID }]);
  assert.ok(j.message.includes('2 張照片'));
});
test('purge: never-deployed site (no Cloudflare project) skips Cloudflare; project already gone is fine', async () => {
  const a = setup({ site: { cf_project_name: null }, cfMode: 'none', photos: [] }); assert.equal((await a.call('purge', { confirm_slug: 'wuhou-cafe' })).status, 200); assert.equal(a.log.dbRemoves.length, 1);
  const b = setup({ cfMode: 'gone' }); assert.equal((await b.call('purge', { confirm_slug: 'wuhou-cafe' })).status, 200); assert.equal(b.log.dbRemoves.length, 1);
});
test('purge: Cloudflare failure / missing keys → nothing deleted, site stays cancelled', async () => {
  const f = setup({ cfMode: 'fail' }); const r = await f.call('purge', { confirm_slug: 'wuhou-cafe' }); assert.equal(r.status, 502); assert.equal((await r.json()).error, 'cloudflare_error');
  assert.equal(f.log.storageRemoved.length, 0); assert.equal(f.log.dbRemoves.length, 0); assert.equal(f.site.status, 'cancelled');
  const n = setup({ cfMode: 'none' }); const r2 = await n.call('purge', { confirm_slug: 'wuhou-cafe' }); assert.equal(r2.status, 501); assert.equal(n.log.dbRemoves.length, 0);
});
test('purge: storage or DB failure stops before deleting the DB row (retry-safe)', async () => {
  const s = setup({ storageFail: true }); const r = await s.call('purge', { confirm_slug: 'wuhou-cafe' }); assert.equal(r.status, 502); assert.equal((await r.json()).error, 'storage_error'); assert.equal(s.log.dbRemoves.length, 0);
  const d = setup({ dbRemoveFail: true }); const r2 = await d.call('purge', { confirm_slug: 'wuhou-cafe' }); assert.equal(r2.status, 502); assert.equal((await r2.json()).error, 'db_error');
});

// ── 停止服務頁與 closed 模式 ──
const sample = JSON.parse(readFileSync(new URL('../templates/cafe/sample.json', import.meta.url)));
const tmp = () => join(mkdtempSync(join(tmpdir(), 'c-')), 'dist');
function fakeDb(siteOver = {}) {
  const calls = { events: [], patches: [] };
  const site = { id: SID, member_id: 'mem1', slug: 'wuhou-cafe', template: 'cafe', status: 'cancelled', live_version_id: VID, cf_project_name: 'wuhou-cafe', content: { name: '<b>午後</b>' }, ...siteOver };
  return { calls, getOne: async (t) => (t === 'rental_sites' ? site : { id: VID, content: sample.content, palette: 'caramel', sections: sample.sections }), patch: async (t, q, b) => { calls.patches.push({ t, q, b }); }, insert: async (t, b) => { calls.events.push(b); }, download: async () => Buffer.alloc(0) };
}
const fcf = { ensureProject: async (name) => ({ name, subdomain: name + '.pages.dev', created: false }) };

test('closed page: noindex, escaped shop name, fixed contact info, no customer content', () => {
  const p = buildClosedPage({ shopName: '<script>x</script>咖啡' });
  assert.ok(p.html.includes('noindex,nofollow') && p.html.includes('網站已停止服務') && p.html.includes('@788cblaq') && p.html.includes('ycaxiom@gmail.com'));
  assert.ok(!p.html.includes('<script>') && p.html.includes('&lt;script&gt;'));
  assert.deepEqual(Object.keys(p.files).sort(), ['index.html', 'robots.txt']); assert.ok(p.files['robots.txt'].includes('Disallow: /'));
});
test('closed mode: only cancelled sites; same project; keeps live_version_id; never-deployed is a no-op; other modes refuse cancelled', async () => {
  const db = fakeDb(); const out = tmp(); let deployed = null;
  const r = await runBuild({ siteId: SID, mode: 'closed', outDir: out, db, cf: fcf, deploy: async (a) => { deployed = a; }, log: () => {} });
  assert.equal(r.ok, true); assert.deepEqual(deployed, { dir: out, project: 'wuhou-cafe' });
  assert.ok(readFileSync(join(out, 'index.html'), 'utf8').includes('網站已停止服務') && !existsSync(join(out, 'images')));
  assert.ok(readFileSync(join(out, '_headers'), 'utf8').includes('X-Robots-Tag: noindex')); assert.ok(!('live_version_id' in db.calls.patches[0].b));
  assert.equal(db.calls.events.at(-1).detail.mode, 'closed');
  for (const status of ['live', 'overdue', 'pending', 'suspended', 'draft']) {
    let called = false; const d = fakeDb({ status }); const x = await runBuild({ siteId: SID, mode: 'closed', outDir: tmp(), db: d, cf: fcf, deploy: async () => { called = true; }, log: () => {} });
    assert.equal(x.ok, false, status); assert.equal(called, false); assert.equal(d.calls.events.at(-1).type, 'deploy_failed'); assert.equal(d.calls.events.at(-1).detail.mode, 'closed');
  }
  let called = false; const dn = fakeDb(); assert.equal((await runBuild({ siteId: SID, outDir: tmp(), db: dn, cf: fcf, deploy: async () => { called = true; }, log: () => {} })).ok, false); assert.equal(called, false);
  const nd = fakeDb({ cf_project_name: null }); called = false; const y = await runBuild({ siteId: SID, mode: 'closed', outDir: tmp(), db: nd, cf: fcf, deploy: async () => { called = true; }, log: () => {} });
  assert.equal(y.ok, true); assert.equal(y.skipped, true); assert.equal(called, false);
});
test('cloudflare.deleteProject: DELETE the project; 404 = already gone; other errors throw', async () => {
  const seen = []; const mk = (status) => makeCloudflare({ token: 't', accountId: 'a', fetchImpl: async (u, o) => { seen.push({ u, m: o.method }); return { status, json: async () => ({ errors: [{ message: 'nope' }] }) }; } });
  assert.deepEqual(await mk(200).deleteProject('p-1'), { deleted: true }); assert.equal(seen[0].m, 'DELETE'); assert.ok(seen[0].u.endsWith('/pages/projects/p-1'));
  assert.deepEqual(await mk(404).deleteProject('p-1'), { deleted: false });
  await assert.rejects(() => mk(400).deleteProject('p-1'), /刪除專案失敗/);
});
