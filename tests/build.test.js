import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBuild } from '../build/run.mjs';
import { makeSupabase } from '../build/lib/supabase.mjs';
import { makeCloudflare } from '../build/lib/cloudflare.mjs';
import { sniffImage } from '../build/lib/images.mjs';

const sample = JSON.parse(readFileSync(new URL('../templates/cafe/sample.json', import.meta.url)));
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 '), Buffer.alloc(40)]);
const SID = '11111111-1111-1111-1111-111111111111', VID = '22222222-2222-2222-2222-222222222222';

function fakeDb({ status = 'live', content = sample.content, image = WEBP, live_version_id = VID, template = 'cafe', siteLayout, verLayout, verPages } = {}) {
  const calls = { events: [], patches: [] };
  const site = { id: SID, slug: 'wuhou-cafe', template, status, live_version_id, cf_project_name: null, first_published_at: null, ...(siteLayout ? { layout: siteLayout } : {}) };
  return {
    calls,
    getOne: async (t) => (t === 'rental_sites' ? site : { id: VID, content, palette: 'caramel', sections: sample.sections, ...(verLayout ? { layout: verLayout, pages: verPages || {} } : {}) }),
    patch: async (t, q, b) => { calls.patches.push({ t, q, b }); },
    insert: async (t, b) => { calls.events.push(b); },
    download: async () => image
  };
}
const fakeCf = (subdomain = 'wuhou-cafe-9x.pages.dev') => ({ ensureProject: async (name) => ({ name, subdomain, created: true }) });

test('runBuild: builds with the Cloudflare-returned domain, copies images, deploys, logs ok', async () => {
  const db = fakeDb(); const out = join(mkdtempSync(join(tmpdir(), 'b-')), 'dist'); let deployed = null;
  const r = await runBuild({ siteId: SID, outDir: out, db, cf: fakeCf(), deploy: async (a) => { deployed = a; }, log: () => {} });
  assert.equal(r.ok, true); assert.equal(r.url, 'https://wuhou-cafe-9x.pages.dev/');
  assert.deepEqual(deployed, { dir: out, project: 'wuhou-cafe' });
  for (const f of ['index.html', 'robots.txt', 'sitemap.xml', 'llms.txt', '_headers', 'images/hero.webp', 'images/room-3.webp']) assert.ok(existsSync(join(out, f)), f);
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.ok(html.includes('href="https://wuhou-cafe-9x.pages.dev/"') && html.includes('--accent:#8A5A3B'), 'uses version palette + real url');
  assert.equal(db.calls.events.at(-1).type, 'deploy_ok');
  const p = db.calls.patches[0];
  assert.equal(p.b.public_url, 'https://wuhou-cafe-9x.pages.dev/'); assert.equal(p.b.cf_project_name, 'wuhou-cafe'); assert.equal(p.b.live_version_id, VID); assert.ok(p.b.first_published_at && p.b.last_published_at);
});
test('runBuild: refuses to deploy non-live sites and records failure', async () => {
  for (const status of ['draft', 'pending', 'suspended', 'cancelled']) {
    const db = fakeDb({ status }); let called = false;
    const r = await runBuild({ siteId: SID, outDir: join(tmpdir(), 'x1'), db, cf: fakeCf(), deploy: async () => { called = true; }, log: () => {} });
    assert.equal(r.ok, false, status); assert.equal(called, false); assert.equal(db.calls.events.at(-1).type, 'deploy_failed');
  }
});
test('runBuild: invalid content / bad image / deploy error → deploy_failed, no site patch', async () => {
  const bad = JSON.parse(JSON.stringify(sample.content)); bad.name = '';
  const cases = [
    fakeDb({ content: bad }),
    fakeDb({ image: Buffer.from('<html>not an image at all</html>') }),
    fakeDb({ live_version_id: null })
  ];
  for (const db of cases) {
    const r = await runBuild({ siteId: SID, outDir: join(mkdtempSync(join(tmpdir(), 'b-')), 'd'), db, cf: fakeCf(), deploy: async () => {}, log: () => {} });
    assert.equal(r.ok, false); assert.equal(db.calls.patches.length, 0); assert.equal(db.calls.events.at(-1).type, 'deploy_failed');
  }
  const db = fakeDb();
  const r = await runBuild({ siteId: SID, outDir: join(mkdtempSync(join(tmpdir(), 'b-')), 'd'), db, cf: fakeCf(), deploy: async () => { throw new Error('boom Bearer abc.def-123'); }, log: () => {} });
  assert.equal(r.ok, false); assert.ok(!/abc\.def/.test(JSON.stringify(db.calls.events.at(-1))), 'token scrubbed'); assert.equal(db.calls.patches.length, 0);
});
test('sniffImage', () => {
  assert.equal(sniffImage(WEBP), 'webp');
  assert.equal(sniffImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])), 'jpg');
  assert.equal(sniffImage(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)])), 'png');
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), '');
});

test('supabase REST wrapper builds correct requests', async () => {
  const seen = [];
  const f = async (url, o) => { seen.push({ url, o }); return { ok: true, status: 200, text: async () => '[{"id":1}]', arrayBuffer: async () => new ArrayBuffer(4) }; };
  const db = makeSupabase({ url: 'https://x.supabase.co/', serviceKey: 'KEY', fetchImpl: f });
  assert.deepEqual(await db.getOne('rental_sites', 'id=eq.1'), { id: 1 });
  await db.patch('rental_sites', 'id=eq.1', { a: 1 }); await db.insert('site_events', { a: 1 }); await db.download('site-photos', 'a b/ç.webp');
  assert.equal(seen[0].url, 'https://x.supabase.co/rest/v1/rental_sites?id=eq.1&limit=1');
  assert.equal(seen[0].o.headers.Authorization, 'Bearer KEY');
  assert.equal(seen[1].o.method, 'PATCH'); assert.equal(seen[2].o.method, 'POST');
  assert.equal(seen[3].url, 'https://x.supabase.co/storage/v1/object/site-photos/a%20b/%C3%A7.webp');
});
test('cloudflare ensureProject: gets existing, creates on 404, throws otherwise', async () => {
  const mk = (seq) => { let i = 0; return async () => { const r = seq[i++]; return { status: r[0], json: async () => r[1] }; }; };
  let cf = makeCloudflare({ token: 't', accountId: 'a', fetchImpl: mk([[200, { result: { name: 'n', subdomain: 'n.pages.dev' } }]]) });
  assert.deepEqual(await cf.ensureProject('n'), { name: 'n', subdomain: 'n.pages.dev', created: false });
  cf = makeCloudflare({ token: 't', accountId: 'a', fetchImpl: mk([[404, { errors: [] }], [200, { result: { name: 'n', subdomain: 'n-ab1.pages.dev' } }]]) });
  assert.deepEqual(await cf.ensureProject('n'), { name: 'n', subdomain: 'n-ab1.pages.dev', created: true });
  cf = makeCloudflare({ token: 't', accountId: 'a', fetchImpl: mk([[404, {}], [400, { errors: [{ message: 'quota' }] }]]) });
  await assert.rejects(() => cf.ensureProject('n'), /quota/);
  cf = makeCloudflare({ token: 't', accountId: 'a', fetchImpl: mk([[500, {}]]) });
  await assert.rejects(() => cf.ensureProject('n'), /500/);
});

test('runBuild: multi-page version writes one folder per page; upgraded site renders an old one-page version as multi', async () => {
  const run = async (opts) => { const db = fakeDb(opts); const out = join(mkdtempSync(join(tmpdir(), 'm-')), 'dist');
    const r = await runBuild({ siteId: SID, outDir: out, db, cf: fakeCf(), deploy: async () => {}, log: () => {} }); return { r, out, db }; };
  const a = await run({ siteLayout: 'multi', verLayout: 'multi', verPages: { faq: false }, template: 'salon' });
  assert.equal(a.r.ok, true);
  for (const f of ['index.html', 'about/index.html', 'services/index.html', 'space/index.html', 'news/index.html', 'visit/index.html']) assert.ok(existsSync(join(a.out, f)), f);
  assert.ok(!existsSync(join(a.out, 'faq/index.html')));
  assert.equal(a.db.calls.events.at(-1).detail.layout, 'multi');
  const b = await run({ siteLayout: 'multi' });   // 舊版本沒有 layout（一頁版）
  assert.equal(b.r.ok, true); assert.ok(existsSync(join(b.out, 'menu/index.html')));
  const c = await run({});                         // 一頁版網站：維持單頁
  assert.equal(c.r.ok, true); assert.ok(!existsSync(join(c.out, 'menu/index.html')));
  const d = await run({ template: 'no-such-industry' });
  assert.equal(d.r.ok, false); assert.match(d.r.error, /行業/);
});

test('runBuild: real photos get 800px variants + srcset and the heading font; broken photos fall back to originals only', async () => {
  const { default: sharp } = await import('sharp');
  const real = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#8a6a4a' } }).webp().toBuffer();
  const out = join(mkdtempSync(join(tmpdir(), 'v-')), 'dist');
  const r = await runBuild({ siteId: SID, outDir: out, db: fakeDb({ image: real }), cf: fakeCf(), deploy: async () => {}, log: () => {} });
  assert.equal(r.ok, true);
  for (const f of ['images/hero-800.webp', 'images/room-3-800.webp', 'fonts/heading.woff2']) assert.ok(existsSync(join(out, f)), f);
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.ok(html.includes('srcset="images/hero-480.webp 480w, images/hero-800.webp 800w') && html.includes('@font-face'));
  // 測試用的假 WebP 無法縮圖 → 只用原圖、沒有 srcset，部署照常成功
  const out2 = join(mkdtempSync(join(tmpdir(), 'v-')), 'dist');
  const r2 = await runBuild({ siteId: SID, outDir: out2, db: fakeDb(), cf: fakeCf(), deploy: async () => {}, log: () => {} });
  assert.equal(r2.ok, true);
  assert.ok(!existsSync(join(out2, 'images/hero-800.webp')) && !readFileSync(join(out2, 'index.html'), 'utf8').includes('srcset'));
});

test('runBuild: custom code only goes live on the pro tier after approval; custom font is downloaded from site-fonts', async () => {
  const content = { ...sample.content, code: { head: '<meta name="yc-code">', body: '' }, style: { font: 'custom', customFont: { path: SID + '/font-abc123.woff2', name: 'x' } } };
  const fontBuf = readFileSync(new URL('../templates/base/fonts/Huninn-common.woff2', import.meta.url));
  const run = async (tier, status) => {
    const db = fakeDb({ content }); const got = [];
    const g = db.getOne; db.getOne = async (t, q) => (t === 'rental_sites' ? { ...(await g(t, q)), tier } : t === 'site_code_reviews' ? (status ? { status } : null) : g(t, q));
    db.download = async (b, p) => { got.push(b); return b === 'site-fonts' ? fontBuf : WEBP; };
    const out = join(mkdtempSync(join(tmpdir(), 'c-')), 'dist');
    await runBuild({ siteId: SID, outDir: out, db, cf: fakeCf(), deploy: async () => {}, log: () => {} });
    return { html: readFileSync(join(out, 'index.html'), 'utf8'), font: existsSync(join(out, 'fonts/heading.woff2')), got, ev: db.calls.events.at(-1) };
  };
  const a = await run('pro', 'approved'); assert.match(a.html, /<meta name="yc-code">/); assert.ok(a.font); assert.ok(a.got.includes('site-fonts'));
  const b = await run('pro', 'pending'); assert.doesNotMatch(b.html, /yc-code/); assert.match(b.ev.detail.skipped, /等待審核/);
  const c = await run('basic', 'approved'); assert.doesNotMatch(c.html, /yc-code/);
});

test('runBuild: an upgrade waiting for payment still deploys the one-page site', async () => {
  const db = fakeDb({ siteLayout: 'multi', verLayout: 'multi', verPages: { about: true, menu: true, interior: true, news: true, faq: true, visit: true } });
  const g = db.getOne; db.getOne = async (t, q) => (t === 'rental_sites' ? { ...(await g(t, q)), upgrade_pending: true } : g(t, q));
  const out = join(mkdtempSync(join(tmpdir(), 'u-')), 'dist');
  await runBuild({ siteId: SID, outDir: out, db, cf: fakeCf(), deploy: async () => {}, log: () => {} });
  assert.ok(existsSync(join(out, 'index.html'))); assert.ok(!existsSync(join(out, 'about/index.html')));
  db.getOne = g; const out2 = join(mkdtempSync(join(tmpdir(), 'u-')), 'dist');
  await runBuild({ siteId: SID, outDir: out2, db, cf: fakeCf(), deploy: async () => {}, log: () => {} });
  assert.ok(existsSync(join(out2, 'about/index.html')));
});
