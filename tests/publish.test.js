import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handlePublish, parseOrigins } from '../supabase/functions/publish-site/handler.mjs';
import { adminFirstPublish } from '../supabase/functions/_shared/emails.mjs';

const sample = JSON.parse(readFileSync(new URL('../templates/cafe/sample.json', import.meta.url)));
const UID = 'aaaaaaaa-0000-0000-0000-000000000001', SID = '11111111-1111-1111-1111-111111111111';
const ORIGIN = 'https://chi1017.github.io';

function setup({ slug = 'wuhou-cafe', status = 'draft', content = sample.content, consented = true, terms = '2026-10-01T00:00:00Z', events = [], owner = UID, dispatchOk = true, mailOk = true } = {}) {
  const log = { patches: [], events: [], versions: [], mails: [], dispatches: [] };
  const site = { id: SID, member_id: owner, slug, status, content, palette: 'ink', sections: sample.sections, terms_accepted_at: terms };
  const eq = (q, k) => (q.match(new RegExp('(?:^|&)' + k + '=eq\\.([^&]+)')) || [])[1];
  const db = {
    getOne: async (t, q) => {
      if (t === 'rental_sites') return eq(q, 'id') === site.id && eq(q, 'member_id') === site.member_id ? site : null;
      if (t === 'members') return consented ? { consented_at: '2026-01-01', email: 'a@example.com' } : { consented_at: null, email: 'a@example.com' };
    },
    list: async () => events,
    patch: async (t, q, b) => { log.patches.push({ t, q, b }); },
    insert: async (t, b) => { log.events.push(b); },
    insertReturning: async (t, b) => { log.versions.push(b); return { id: '22222222-2222-2222-2222-222222222222' }; }
  };
  const deps = {
    allowedOrigins: parseOrigins(), previewBase: 'https://chi1017.github.io/yc-axiom-site/builder/preview/', adminEmail: 'ycaxiom@gmail.com', db,
    getUser: async (tok) => (tok === 'good' ? { id: UID, email: 'a@example.com' } : null),
    sendMail: async (m) => { log.mails.push(m); return mailOk ? { ok: true } : { ok: false, error: 'brevo 401' }; },
    dispatch: async (a) => { log.dispatches.push(a); return dispatchOk ? { ok: true } : { ok: false, error: 'github 404' }; },
    now: () => new Date('2026-10-10T12:00:00Z')
  };
  const call = (over = {}) => handlePublish(new Request('https://x/functions/v1/publish-site', {
    method: 'POST', headers: { origin: ORIGIN, authorization: 'Bearer good', 'content-type': 'application/json', ...(over.headers || {}) },
    body: over.body === undefined ? JSON.stringify({ site_id: SID }) : over.body
  }), deps);
  return { call, log, deps };
}

test('first publish: draft → pending, version saved, admin emailed, NO deploy', async () => {
  const s = setup(); const r = await s.call(); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.status, 'pending');
  assert.equal(s.log.dispatches.length, 0);
  assert.deepEqual(s.log.patches[0].b, { status: 'pending' }); assert.ok(s.log.patches[0].q.includes('status=eq.draft'));
  assert.equal(s.log.versions[0].palette, 'ink');
  assert.equal(s.log.versions[0].layout, 'single');
  assert.equal(s.log.versions[0].pages.menu, true);
  assert.deepEqual(s.log.events.map((e) => e.type), ['published_first', 'email_sent']);
  assert.equal(s.log.mails[0].to, 'ycaxiom@gmail.com'); assert.ok(s.log.mails[0].subject.includes('午後日光咖啡')); assert.ok(s.log.mails[0].html.includes('builder/preview/?site=' + SID));
});
test('first publish still succeeds when email fails (logged as email_failed)', async () => {
  const s = setup({ mailOk: false }); const r = await s.call();
  assert.equal(r.status, 200); assert.deepEqual(s.log.events.map((e) => e.type), ['published_first', 'email_failed']);
});
test('pending: saves a newer version only', async () => {
  const s = setup({ status: 'pending' }); const r = await s.call();
  assert.equal(r.status, 200); assert.equal(s.log.patches.length, 0); assert.equal(s.log.mails.length, 0); assert.equal(s.log.dispatches.length, 0);
  assert.equal(s.log.events[0].type, 'version_saved');
});
test('live/overdue: queue deploy with the new version id', async () => {
  for (const status of ['live', 'overdue']) {
    const s = setup({ status }); const r = await s.call(); const j = await r.json();
    assert.equal(r.status, 200); assert.equal(j.updating, true);
    assert.deepEqual(s.log.dispatches, [{ siteId: SID, versionId: '22222222-2222-2222-2222-222222222222' }]);
    assert.equal(s.log.events[0].type, 'deploy_queued');
  }
});
test('live: dispatch failure → 502, deploy_failed recorded, old site stays up', async () => {
  const s = setup({ status: 'live', dispatchOk: false }); const r = await s.call();
  assert.equal(r.status, 502); assert.deepEqual(s.log.events.map((e) => e.type), ['deploy_queued', 'deploy_failed']);
});
test('suspended / cancelled cannot publish', async () => {
  for (const status of ['suspended', 'cancelled']) { const s = setup({ status }); assert.equal((await s.call()).status, 403); assert.equal(s.log.versions.length, 0); }
});
test('auth: no token / bad token → 401; other owner → 404; not consented → 403', async () => {
  const s = setup();
  assert.equal((await s.call({ headers: { authorization: '' } })).status, 401);
  assert.equal((await s.call({ headers: { authorization: 'Bearer bad' } })).status, 401);
  assert.equal((await setup({ owner: 'bbbbbbbb-0000-0000-0000-000000000002' }).call()).status, 404);
  assert.equal((await setup({ consented: false }).call()).status, 403);
});
test('validation blocks publish and names the missing items', async () => {
  const c = JSON.parse(JSON.stringify(sample.content)); c.name = ''; c.photos.hero = null;
  const s = setup({ content: c }); const r = await s.call(); const j = await r.json();
  assert.equal(r.status, 422); assert.deepEqual(j.errors.map((e) => e.field), ['name', 'photos.hero']);
  assert.equal(s.log.versions.length, 0); assert.equal(s.log.patches.length, 0);
});
test('rate limit: <20s since last publish, and 30/day', async () => {
  const recent = setup({ events: [{ created_at: '2026-10-10T11:59:50Z' }] });
  assert.equal((await recent.call()).status, 429);
  const many = setup({ events: Array.from({ length: 30 }, (_, i) => ({ created_at: new Date(Date.UTC(2026, 9, 10, 10, 0, 0) - i * 60000).toISOString() })) });
  assert.equal((await many.call()).status, 429);
  assert.equal((await setup({ events: [{ created_at: '2026-10-10T11:58:00Z' }] }).call()).status, 200);
});
test('bad requests: method, origin, body', async () => {
  const s = setup();
  assert.equal((await s.call({ body: 'not json' })).status, 400);
  assert.equal((await s.call({ body: JSON.stringify({ site_id: 'x' }) })).status, 400);
  assert.equal((await s.call({ body: JSON.stringify({ site_id: SID, pad: 'x'.repeat(3000) }) })).status, 400);
  assert.equal((await s.call({ headers: { origin: 'https://evil.example' } })).status, 403);
  const opt = await handlePublish(new Request('https://x/', { method: 'OPTIONS', headers: { origin: ORIGIN } }), s.deps);
  assert.equal(opt.status, 204); assert.equal(opt.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal((await handlePublish(new Request('https://x/', { method: 'GET' }), s.deps)).status, 405);
});
test('publishes the DB draft, never client-supplied content', async () => {
  const s = setup(); await s.call({ body: JSON.stringify({ site_id: SID, content: { name: '被竄改' } }) });
  assert.equal(s.log.versions[0].content.name, '午後日光咖啡');
});
test('email template escapes shop name', () => {
  const m = adminFirstPublish({ shopName: '<script>x</script>', slug: 'a', previewUrl: 'https://x/?a=1&b=2', memberEmail: 'm@e.com' });
  assert.ok(!m.html.includes('<script>')); assert.ok(m.html.includes('&amp;b=2'));
});

test('first publish requires accepted terms (draft only); pending/live are not blocked', async () => {
  const s = setup({ terms: null }); const r = await s.call(); const j = await r.json();
  assert.equal(r.status, 403); assert.equal(j.error, 'terms_required'); assert.equal(s.log.versions.length, 0); assert.equal(s.log.mails.length, 0);
  for (const status of ['pending', 'live', 'overdue']) assert.equal((await setup({ status, terms: null }).call()).status, 200, status);
});

test('brand slug: a draft must change it before first publish; already-published sites keep their locked slug', async () => {
  const d = await setup({ slug: 'yc-cafe' }).call(); assert.equal(d.status, 422);
  assert.ok((await d.json()).errors.some((e) => e.field === 'slug'));
  for (const status of ['pending', 'live', 'overdue']) {
    const r = await setup({ slug: 'yc-cafe', status }).call(); assert.equal(r.status, 200, status);
  }
});

test('publish stores the site layout and page choices in the version', async () => {
  const s = setup(); s.deps.db.getOne = ((orig) => async (t, q) => { const r = await orig(t, q); return t === 'rental_sites' && r ? { ...r, layout: 'multi', pages: { faq: false, evil: true } } : r; })(s.deps.db.getOne);
  const r = await s.call(); assert.equal(r.status, 200);
  assert.equal(s.log.versions[0].layout, 'multi');
  assert.deepEqual(s.log.versions[0].pages, { about: true, menu: true, interior: true, news: true, faq: false, visit: true });
});
