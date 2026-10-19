import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runMonthlyReport } from '../build/monthly-report.mjs';
import { runCleanup } from '../build/cleanup-photos.mjs';
import { pickTopIssues, monthLabel, clampScore } from '../build/lib/report.mjs';
import { makeFetchPage } from '../build/lib/fetchsite.mjs';
import { buildSite } from '../templates/shared/site.js';
import { makeFakeDb } from './helpers/fakedb.js';

const NOW = new Date('2026-11-01T02:00:00Z');      // 台灣 2026-11-01 10:00
const M = '2026-11-01';
const uid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const quiet = () => {};

function site(n, over = {}) {
  return { id: uid(n), member_id: 'm' + n, slug: 'shop-' + n, status: 'live', content: { name: '店' + n }, public_url: 'https://shop-' + n + '.pages.dev/', custom_domain: null, domain_status: 'none', paid_until: '2027-01-01', ...over };
}
function setup(sites, { fetchPage, analyze, mailOk = true } = {}) {
  const db = makeFakeDb({ iso: NOW.toISOString() });
  sites.forEach((s) => { db.tables.rental_sites.push(s); db.tables.members.push({ id: s.member_id, email: s.member_id + '@example.com' }); });
  const mails = [], fetched = [], analyzed = [];
  const state = { mailOk };
  const deps = {
    db, now: () => NOW, log: quiet, dashboardUrl: 'https://chi1017.github.io/yc-axiom-site/dashboard/',
    fetchPage: fetchPage || (async (url) => { fetched.push(url); return { ok: true, html: '<html>' + url + '</html>', finalUrl: url, robots: { status: 'ok', text: '' }, llms: { status: 'none', text: '' } }; }),
    analyze: analyze || (async ({ url }) => { analyzed.push(url); return { seo: { score: 82.4, actions: [{ priority: 'high', title: 'Meta Description 缺失', detail: '建議 80–160 字' }, { priority: 'medium', title: 'H1 數量過多', detail: 'x' }, { priority: 'medium', title: '缺少 Open Graph', detail: 'y' }] }, geo: { score: 70.6, issues: [{ title: '缺少 FAQ 結構化資料', level: 'high', fix: '加入 FAQPage', loss: 6 }, { title: '段落太長', level: 'low', fix: '分段' }] } }; }),
    sendMail: async (m) => { mails.push(m); return state.mailOk ? { ok: true } : { ok: false, error: 'brevo 401' }; }
  };
  return { db, deps, mails, fetched, analyzed, state, run: (over = {}) => runMonthlyReport({ ...deps, ...over }), reports: () => db.tables.site_reports, events: (n, t) => db.tables.site_events.filter((e) => e.site_id === uid(n) && (!t || e.type === t)) };
}

test('pickTopIssues: severity order, ≤2 per tool, dedupe, plain text, max 3', () => {
  const r = pickTopIssues({
    seoActions: [{ priority: 'high', title: 'A', detail: '<b>粗體</b>  多餘   空白' }, { priority: 'high', title: 'B' }, { priority: 'high', title: 'C' }, { priority: 'low', title: 'L' }],
    geoIssues: [{ title: 'G1', level: 'medium', fix: 'f1' }, { title: 'A', level: 'high', fix: 'dup' }, { title: 'G2', level: 'low', why: 'w2' }]
  });
  assert.equal(r.length, 3);
  assert.deepEqual(r.map((x) => x.title), ['A', 'B', 'G1']);        // 同工具最多 2 項；重複標題只留一個
  assert.equal(r[0].detail, '粗體 多餘 空白'); assert.equal(r[0].level, 'high'); assert.equal(r[2].tool, 'GEO');
  assert.equal(pickTopIssues({ seoActions: [{ priority: 'high', title: 'only' }] }).length, 1);   // 不足 3 項就給幾項
  assert.deepEqual(pickTopIssues({}), []);
  assert.equal(pickTopIssues({ seoActions: [{ priority: 'high', title: 'x', detail: 'd'.repeat(500) }] })[0].detail.length, 120);
  const fill = pickTopIssues({ seoActions: ['a', 'b', 'c'].map((t) => ({ priority: 'high', title: t })), geoIssues: [] });
  assert.equal(fill.length, 3);                                   // 湊不滿時放寬「同工具最多 2 項」
});
test('monthLabel / clampScore', () => {
  assert.equal(monthLabel('2026-11-01'), '2026 年 11 月'); assert.equal(monthLabel('2027-01-01'), '2027 年 1 月');
  assert.equal(clampScore(82.5), 83); assert.equal(clampScore(-3), 0); assert.equal(clampScore(140), 100); assert.equal(clampScore(null), null); assert.equal(clampScore(NaN), null);
});

test('monthly report: only live sites, stores scores, emails customer once, records events', async () => {
  const s = setup([site(1), site(2), site(3, { status: 'suspended' }), site(4, { status: 'draft', public_url: null }), site(5, { status: 'overdue' })]);
  // 上個月有一筆舊報告 → 月報要顯示進步／退步
  s.db.tables.site_reports.push({ id: 'old1', site_id: uid(1), month: '2026-10-01', status: 'ok', seo_score: 80, geo_score: 75, top_issues: [], emailed_at: '2026-10-01T02:00:00Z' });
  const out = await s.run();
  assert.equal(out.month, M); assert.deepEqual(out.results.map((r) => r.slug), ['shop-1', 'shop-2']);
  assert.deepEqual(out.results.map((r) => r.status + ':' + r.mail), ['ok:sent', 'ok:sent']);
  const rows = s.reports().filter((r) => r.month === M);
  assert.equal(rows.length, 2);
  const r1 = rows.find((r) => r.site_id === uid(1));
  assert.equal(r1.status, 'ok'); assert.equal(r1.seo_score, 82); assert.equal(r1.geo_score, 71); assert.equal(r1.top_issues.length, 3); assert.ok(r1.emailed_at); assert.equal(r1.url, 'https://shop-1.pages.dev/');
  assert.equal(s.mails.length, 2);
  const m1 = s.mails.find((m) => m.to === 'm1@example.com');
  assert.match(m1.subject, /2026 年 11 月/); assert.match(m1.text, /SEO：82/); assert.match(m1.text, /GEO：71/);
  assert.match(m1.text, /進步 2 分/); assert.match(m1.text, /Meta Description 缺失/);   // 與上月 80 比
  assert.match(m1.text, /@788cblaq/);
  const m2 = s.mails.find((m) => m.to === 'm2@example.com'); assert.match(m2.text, /首次檢測/);
  assert.equal(s.events(1, 'monthly_report').length, 1); assert.equal(s.events(1, 'email_sent').length, 1);
  assert.deepEqual(s.fetched.sort(), ['https://shop-1.pages.dev/', 'https://shop-2.pages.dev/']);
});

test('monthly report: failures are recorded, never emailed, and do not stop the other sites', async () => {
  const s = setup([site(1), site(2), site(3), site(4, { public_url: null }), site(5)], {
    fetchPage: async (url) => (url.includes('shop-1') ? { ok: false, error: '抓不到網站：連線逾時' } : { ok: true, html: url, finalUrl: url, robots: { status: 'ok', text: '' }, llms: { status: 'none', text: '' } }),
    analyze: async ({ url }) => {
      if (url.includes('shop-2')) throw new Error('analyzer boom');
      if (url.includes('shop-3')) return { seo: { score: null, actions: [] }, geo: { score: 60, issues: [] } };
      return { seo: { score: 90, actions: [] }, geo: { score: 85, issues: [] } };
    }
  });
  const out = await s.run();
  assert.deepEqual(out.results.map((r) => r.status), ['failed', 'failed', 'failed', 'failed', 'ok']);
  const byId = (n) => s.reports().find((r) => r.site_id === uid(n));
  assert.match(byId(1).error, /連線逾時/); assert.match(byId(2).error, /analyzer boom/); assert.match(byId(3).error, /無法評分/); assert.match(byId(4).error, /沒有公開網址/);
  for (const n of [1, 2, 3, 4]) { assert.equal(byId(n).status, 'failed'); assert.equal(byId(n).seo_score, null); assert.equal(byId(n).emailed_at, undefined); assert.equal(s.events(n, 'report_failed').length, 1); }
  assert.equal(s.mails.length, 1); assert.equal(s.mails[0].to, 'm5@example.com');
  assert.equal(byId(5).status, 'ok'); assert.match(s.mails[0].text, /本月沒有發現需要優先處理的問題/);
});

test('re-run in the same month: finished sites are not re-analysed or re-mailed; failed ones are retried', async () => {
  let fail = true;
  const s = setup([site(1), site(2)], { fetchPage: async (url) => (fail && url.includes('shop-2') ? { ok: false, error: '抓不到網站：HTTP 500' } : { ok: true, html: url, finalUrl: url, robots: { status: 'ok', text: '' }, llms: { status: 'ok', text: 'x'.repeat(80) } }) });
  await s.run();
  assert.equal(s.mails.length, 1); assert.equal(s.analyzed.length, 1);
  fail = false;
  const out = await s.run();
  assert.deepEqual(out.results.map((r) => r.status + ':' + r.mail), ['ok:already', 'ok:sent']);
  assert.equal(s.analyzed.length, 2); assert.equal(s.mails.length, 2);           // 只多分析、多寄了第 2 個網站
  assert.equal(s.reports().filter((r) => r.month === M).length, 2);              // 沒有重複的列
  assert.equal(s.reports().find((r) => r.site_id === uid(2)).status, 'ok'); assert.equal(s.reports().find((r) => r.site_id === uid(2)).error, null);
  await s.run();
  assert.equal(s.mails.length, 2); assert.equal(s.analyzed.length, 2);
});

test('mail failure keeps the report, releases emailed_at, and the next run only re-sends the mail', async () => {
  const s = setup([site(1)], { mailOk: false });
  let out = await s.run();
  assert.equal(out.results[0].status, 'ok'); assert.equal(out.results[0].mail, 'failed');
  assert.equal(s.reports()[0].emailed_at, null); assert.equal(s.events(1, 'email_failed').length, 1); assert.equal(s.reports()[0].status, 'ok');
  s.state.mailOk = true;
  out = await s.run();
  assert.equal(out.results[0].mail, 'sent'); assert.equal(s.analyzed.length, 1); assert.ok(s.reports()[0].emailed_at);
  const noEmail = setup([site(2)]); noEmail.db.tables.members.length = 0;
  out = await noEmail.run(); assert.equal(out.results[0].status, 'ok'); assert.equal(out.results[0].mail, 'failed');
});

test('dry run writes nothing and sends nothing; --no-email stores the report but sends nothing; custom domain preferred; month validated; single site', async () => {
  let s = setup([site(1)]);
  await s.run({ dryRun: true });
  assert.equal(s.reports().length, 0); assert.equal(s.mails.length, 0); assert.equal(s.db.tables.site_events.length, 0); assert.equal(s.db.stats.inserts, 0);
  s = setup([site(1)]);
  const out = await s.run({ sendEmails: false });
  assert.equal(s.reports().length, 1); assert.equal(s.mails.length, 0); assert.equal(s.reports()[0].emailed_at, undefined); assert.equal(out.results[0].mail, 'skipped');
  s = setup([site(1, { custom_domain: 'www.example.com.tw', domain_status: 'active' }), site(2, { custom_domain: 'pending.example.com', domain_status: 'pending_dns' })]);
  await s.run(); assert.deepEqual(s.fetched.sort(), ['https://shop-2.pages.dev/', 'https://www.example.com.tw/']);
  await assert.rejects(() => s.run({ month: '2026-11-15' }), /1 日/); await assert.rejects(() => s.run({ month: 'bad' }), /1 日/);
  s = setup([site(1), site(2)]);
  const one = await s.run({ siteId: uid(2) }); assert.deepEqual(one.results.map((r) => r.slug), ['shop-2']);
  s = setup([site(1)]);
  await s.run({ month: '2026-10-01' }); assert.equal(s.reports()[0].month, '2026-10-01');
});

// ───────────────────────── 抓取網站 ─────────────────────────
const resp = (status, body = '', type = 'text/html; charset=utf-8', headers = {}) => ({ status, url: 'https://a.pages.dev/', headers: { get: (k) => ({ 'content-type': type, ...headers }[k.toLowerCase()] ?? null) }, text: async () => body });
test('fetchPage: home page + robots/llms statuses', async () => {
  const f = makeFetchPage({ fetchImpl: async (u) => (u.endsWith('/robots.txt') ? resp(200, 'User-agent: *\nAllow: /', 'text/plain') : u.endsWith('/llms.txt') ? resp(404, 'nf', 'text/plain') : resp(200, '<!doctype html><html><body>hi</body></html>')), retryDelayMs: 0 });
  const r = await f('https://a.pages.dev/');
  assert.equal(r.ok, true); assert.equal(r.robots.status, 'ok'); assert.match(r.robots.text, /Allow/); assert.equal(r.llms.status, 'none');
  const g = makeFetchPage({ fetchImpl: async (u) => (u.endsWith('/robots.txt') ? resp(503, '', 'text/plain') : u.endsWith('/llms.txt') ? Promise.reject(new Error('net')) : resp(200, '<html></html>')), retryDelayMs: 0 });
  const r2 = await g('https://a.pages.dev/'); assert.equal(r2.ok, true); assert.equal(r2.robots.status, 'unknown'); assert.equal(r2.llms.status, 'unknown');
});
test('fetchPage: errors become readable failures (404, 5xx after retry, timeout, not HTML, maintenance page, too big)', async () => {
  const mk = (fn, retries = 1) => makeFetchPage({ fetchImpl: fn, retries, retryDelayMs: 0 });
  assert.match((await mk(async () => resp(404))('https://a.pages.dev/')).error, /HTTP 404/);
  let calls = 0;
  assert.match((await mk(async () => { calls++; return resp(502); })('https://a.pages.dev/')).error, /HTTP 502/); assert.equal(calls, 2);
  calls = 0;
  const ok = await mk(async (u) => { if (u.endsWith('/')) { calls++; return calls === 1 ? resp(500) : resp(200, '<html></html>'); } return resp(404); })('https://a.pages.dev/');
  assert.equal(ok.ok, true);
  const te = new Error('t'); te.name = 'TimeoutError';
  assert.match((await mk(async () => { throw te; })('https://a.pages.dev/')).error, /連線逾時/);
  assert.match((await mk(async () => { throw new Error('ECONNRESET'); })('https://a.pages.dev/')).error, /ECONNRESET/);
  assert.match((await mk(async () => resp(200, '{"a":1}', 'application/json'))('https://a.pages.dev/')).error, /不是網頁/);
  assert.match((await mk(async () => resp(200, '<!doctype html><html><head><meta name="robots" content="noindex"><title>網站維護中</title></head></html>'))('https://a.pages.dev/')).error, /維護頁/);
  assert.match((await mk(async () => resp(200, '<html></html>', 'text/html', { 'content-length': String(10 * 1024 * 1024) }))('https://a.pages.dev/')).error, /太大/);
});

// ───────────────────────── 照片清理 ─────────────────────────
function storageSetup({ objects, sites, versions = [], now = new Date('2026-11-01T02:00:00Z') }) {
  const db = makeFakeDb({ iso: now.toISOString() });
  sites.forEach((s) => db.tables.rental_sites.push(s)); versions.forEach((v) => db.tables.site_versions.push(v));
  const removed = [];
  db.storageList = async (bucket, prefix, { offset = 0, limit = 100 } = {}) => {
    const all = prefix === '' ? [...new Set(objects.map((o) => o.path.split('/')[0]))].map((name) => ({ name, id: null })) : objects.filter((o) => o.path.startsWith(prefix + '/')).map((o) => ({ name: o.path.slice(prefix.length + 1), id: 'obj-' + o.path, created_at: o.created }));
    return all.slice(offset, offset + limit);
  };
  db.storageRemove = async (bucket, paths) => { removed.push(...paths); objects.splice(0, objects.length, ...objects.filter((o) => !paths.includes(o.path))); return paths.map((p) => ({ name: p })); };
  return { db, removed, run: (o = {}) => runCleanup({ db, now: () => now, log: quiet, ...o }) };
}
const OLD = '2026-08-01T00:00:00Z', NEW = '2026-10-25T00:00:00Z';
const A = uid(1), B = uid(2);
test('cleanup: only unreferenced, old, editor-named photos are candidates; dry run (default) deletes nothing', async () => {
  const objects = [
    { path: A + '/hero-aaa.webp', created: OLD },        // 草稿引用
    { path: A + '/room-old1.jpg', created: OLD },        // 舊版本引用
    { path: A + '/room-orphan.jpg', created: OLD },      // 沒人引用 → 可清
    { path: A + '/room-fresh.jpg', created: NEW },       // 沒人引用但很新 → 保留
    { path: A + '/notes.txt', created: OLD },            // 不是編輯器檔名 → 不碰
    { path: A + '/hero-orphan2.webp', created: OLD },    // 可清
    { path: B + '/room-b1.png', created: OLD },          // 別的網站引用
    { path: B + '/room-b2.png', created: OLD }           // 別的網站沒引用 → 可清
  ];
  const s = storageSetup({
    objects,
    sites: [{ id: A, content: { name: 'A', photos: { hero: { path: A + '/hero-aaa.webp' }, room: [] } } }, { id: B, content: { name: 'B', photos: { hero: null, room: [{ path: B + '/room-b1.png' }] } } }],
    versions: [{ id: 'v1', site_id: A, content: { photos: { hero: null, room: [{ path: A + '/room-old1.jpg' }] } } }]
  });
  const r = await s.run();
  assert.deepEqual(r.candidates.sort(), [A + '/hero-orphan2.webp', A + '/room-orphan.jpg', B + '/room-b2.png']);
  assert.deepEqual(r.deleted, []); assert.deepEqual(s.removed, []);
  const a = await s.run({ apply: true });
  assert.deepEqual(a.deleted.sort(), r.candidates.sort()); assert.deepEqual(s.removed.sort(), r.candidates.sort());
  assert.equal(objects.length, 5);                      // 被引用的、太新的、非編輯器檔名的都還在
  assert.ok(objects.some((o) => o.path.endsWith('notes.txt')) && objects.some((o) => o.path.endsWith('room-fresh.jpg')));
  assert.equal(s.db.tables.site_events.filter((e) => e.type === 'photos_cleaned' && e.site_id === A)[0].detail.count, 2);
  assert.equal(s.db.tables.rental_sites.length, 2); assert.equal(s.db.tables.site_versions.length, 1);   // 資料庫一列都沒刪
});
test('cleanup: a reference anywhere in a site or version (even in unexpected fields) protects the file', async () => {
  const objects = [{ path: A + '/room-x1.webp', created: OLD }, { path: A + '/room-x2.webp', created: OLD }, { path: A + '/room-x3.webp', created: OLD }, { path: A + '/room-x4.webp', created: OLD }];
  const s = storageSetup({ objects, sites: [{ id: A, content: { name: 'A', odd: { deeper: [{ any: A + '/room-x1.webp' }] } } }], versions: [{ id: 'v', site_id: A, content: { photos: { hero: { path: A + '/room-x2.webp' }, room: [] } } }, { id: 'v2', site_id: A, content: { x: 'text ' + A + '/room-x3.webp text' } }] });
  const r = await s.run({ apply: true });
  assert.deepEqual(r.deleted, [A + '/room-x4.webp']);
});
test('cleanup: suspicious situations abort without deleting anything', async () => {
  let s = storageSetup({ objects: [{ path: A + '/room-1.webp', created: OLD }], sites: [{ id: A, content: { name: 'A' } }] });       // 有網站卻查不到任何引用
  let r = await s.run({ apply: true }); assert.equal(r.aborted, 'no_refs'); assert.deepEqual(s.removed, []);
  const many = Array.from({ length: 12 }, (_, i) => ({ path: A + '/room-m' + i + '.webp', created: OLD }));                              // 超過一半都要刪
  s = storageSetup({ objects: many, sites: [{ id: A, content: { photos: { room: [{ path: A + '/room-m0.webp' }] } } }] });
  r = await s.run({ apply: true }); assert.equal(r.aborted, 'too_many'); assert.deepEqual(s.removed, []);
  s = storageSetup({ objects: [], sites: [] }); r = await s.run({ apply: true }); assert.deepEqual(r.deleted, []);
  s = storageSetup({ objects: [{ path: 'stray.png', created: OLD }], sites: [] });                                                          // 根目錄的檔案不碰
  r = await s.run({ apply: true }); assert.deepEqual(s.removed, []);
});
test('cleanup: max per run and grace days are honoured', async () => {
  const objects = [...Array.from({ length: 6 }, (_, i) => ({ path: A + '/room-k' + i + '.webp', created: OLD })), ...Array.from({ length: 14 }, (_, i) => ({ path: A + '/hero-keep' + i + '.webp', created: OLD }))];
  const keep = objects.filter((o) => o.path.includes('keep')).map((o) => ({ path: o.path }));
  const s = storageSetup({ objects, sites: [{ id: A, content: { photos: { room: keep } } }] });
  let r = await s.run({ apply: true, maxDelete: 4 }); assert.equal(r.deleted.length, 4);
  r = await s.run({ apply: true, maxDelete: 4 }); assert.equal(r.deleted.length, 2);
  const s2 = storageSetup({ objects: [{ path: A + '/room-a.webp', created: '2026-10-20T00:00:00Z' }, { path: A + '/hero-b.webp', created: OLD }], sites: [{ id: A, content: { photos: { hero: { path: A + '/hero-b.webp' } } } }] });
  assert.deepEqual((await s2.run({ apply: true, graceDays: 5 })).deleted, [A + '/room-a.webp']);
});

// ───────────────────────── 與官網同一套評分引擎（需要官網 repo；沒有就略過） ─────────────────────────
const SEO_TOOL = process.env.SEO_TOOL, GEO_ENGINE = process.env.GEO_ENGINE;
test('real analyzers on a built sample site (SEO tool + GEO engine from the official repo)', { skip: !(SEO_TOOL && GEO_ENGINE && existsSync(SEO_TOOL) && existsSync(GEO_ENGINE)) && '設定 SEO_TOOL／GEO_ENGINE 才會執行' }, async () => {
  const { makeAnalyzers } = await import('../build/lib/analyzers.mjs');
  const sample = JSON.parse(readFileSync(new URL('../templates/cafe/sample.json', import.meta.url)));
  const built = buildSite({ template: 'cafe', siteUrl: 'https://sample-cafe.pages.dev/', ...sample });
  const pages = { '/': built.files['index.html'], '/robots.txt': built.files['robots.txt'], '/llms.txt': built.files['llms.txt'] };
  const fetchImpl = async (u) => { const p = new URL(u).pathname; return pages[p] ? { status: 200, url: u, headers: { get: (k) => (k.toLowerCase() === 'content-type' ? (p === '/' ? 'text/html' : 'text/plain') : null) }, text: async () => pages[p] } : resp(404); };
  const an = await makeAnalyzers({ seoTool: SEO_TOOL, geoEngine: GEO_ENGINE, chromePath: process.env.CHROME });
  try {
    const s = setup([site(1, { public_url: 'https://sample-cafe.pages.dev/' })], { fetchPage: makeFetchPage({ fetchImpl }), analyze: an.analyze });
    const out = await s.run();
    assert.equal(out.results[0].status, 'ok', JSON.stringify(out));
    const row = s.reports()[0];
    assert.ok(row.seo_score >= 60 && row.seo_score <= 100, 'seo ' + row.seo_score); assert.ok(row.geo_score >= 60 && row.geo_score <= 100, 'geo ' + row.geo_score);
    assert.ok(Array.isArray(row.top_issues) && row.top_issues.length <= 3);
    assert.equal(s.mails.length, 1);
    console.log('# real scores: SEO', row.seo_score, 'GEO', row.geo_score, 'issues', JSON.stringify(row.top_issues.map((i) => i.title)));
  } finally { await an.close(); }
});
