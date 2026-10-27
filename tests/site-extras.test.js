import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePublic, siteBase, shopMessageEmail, LIMITS } from '../supabase/functions/site-public/handler.mjs';
import { handleMember } from '../supabase/functions/member-site/handler.mjs';
import { parseOrigins } from '../supabase/functions/_shared/http.mjs';

const SID = '11111111-1111-1111-1111-111111111111';
const NOW = new Date('2026-10-26T03:00:00Z');

function pub({ site = {}, counts = {}, ownerEmail = 'owner@shop.tw' } = {}) {
  const s = { id: SID, member_id: 'm1', status: 'live', public_url: 'https://shop.pages.dev/', custom_domain: null, domain_status: 'none', content: { name: '好喝咖啡' }, ...site };
  const log = { rpc: [], inserts: [], mails: [], patches: [] };
  const db = {
    getOne: async (t, q) => (t === 'rental_sites' ? (q.includes(SID) ? s : null) : t === 'members' ? (ownerEmail ? { email: ownerEmail } : null) : null),
    count: async (t, q) => (q.startsWith('ip_hash') ? counts.ip || 0 : counts.site || 0),
    insertReturning: async (t, b) => { log.inserts.push(b); return { id: 'msg-1', ...b }; },
    patch: async (t, q, b) => log.patches.push(b),
    rpc: async (fn, a) => { log.rpc.push([fn, a]); }
  };
  const deps = { db, now: () => NOW, salt: 's', sendMail: async (m) => { log.mails.push(m); return { ok: true }; } };
  const form = (fields, headers = {}) => handlePublic(new Request('https://x/functions/v1/site-public/contact', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': '1.2.3.4', ...headers }, body: new URLSearchParams(fields).toString() }), deps);
  const beacon = (body, ua = 'Mozilla/5.0 Chrome') => handlePublic(new Request('https://x/functions/v1/site-public/hit', { method: 'POST', headers: { 'content-type': 'text/plain', 'user-agent': ua }, body }), deps);
  return { s, log, form, beacon };
}
const ok = { site: SID, name: '王小明', contact: 'ming@example.com', message: '請問週末可以包場嗎？' };

test('contact: valid message is stored, emailed to the owner with reply-to, and redirects to the site thanks page', async () => {
  const p = pub(); const r = await p.form(ok);
  assert.equal(r.status, 303); assert.equal(r.headers.get('location'), 'https://shop.pages.dev/thanks/');
  assert.equal(p.log.inserts[0].name, '王小明'); assert.match(p.log.inserts[0].ip_hash, /^[0-9a-f]{32}$/);
  assert.equal(p.log.mails[0].to, 'owner@shop.tw'); assert.equal(p.log.mails[0].replyTo, 'ming@example.com');
  assert.match(p.log.mails[0].subject, /好喝咖啡.*王小明/);
  assert.deepEqual(p.log.patches[0], { emailed: true });
});
test('contact: custom domain redirect; phone contact has no reply-to; html in message is escaped in email', async () => {
  const p = pub({ site: { custom_domain: 'www.shop.tw', domain_status: 'active' } });
  const r = await p.form({ ...ok, contact: '0912-345-678', message: '<script>x</script>' });
  assert.equal(r.headers.get('location'), 'https://www.shop.tw/thanks/');
  assert.equal(p.log.mails[0].replyTo, undefined);
  assert.ok(!p.log.mails[0].html.includes('<script>'));
});
test('contact: honeypot pretends success without storing; missing fields, bad site, non-live site, too many links are rejected', async () => {
  let p = pub(); let r = await p.form({ ...ok, website: 'spam.com' });
  assert.equal(r.status, 303); assert.equal(p.log.inserts.length, 0);
  p = pub(); r = await p.form({ ...ok, message: '' }); assert.equal(r.status, 200); assert.match(await r.text(), /還有欄位沒填/); assert.equal(p.log.inserts.length, 0);
  p = pub(); r = await p.form({ ...ok, site: 'nope' }); assert.match(await r.text(), /表單資料不完整/);
  p = pub({ site: { status: 'suspended' } }); r = await p.form(ok); assert.match(await r.text(), /無法接收留言/); assert.equal(p.log.inserts.length, 0);
  p = pub(); r = await p.form({ ...ok, message: 'https://a https://b https://c' }); assert.match(await r.text(), /網址太多/);
});
test('contact: rate limits per IP per hour and per site per day', async () => {
  let p = pub({ counts: { ip: LIMITS.perIpHour } }); let r = await p.form(ok); assert.match(await r.text(), /太頻繁/); assert.equal(p.log.inserts.length, 0);
  p = pub({ counts: { site: LIMITS.perSiteDay } }); r = await p.form(ok); assert.match(await r.text(), /今天的留言/);
});
test('contact: long fields are trimmed to limits, control characters removed', async () => {
  const p = pub(); await p.form({ ...ok, name: 'A'.repeat(200) + '\u0007', message: 'x'.repeat(5000) });
  assert.equal(p.log.inserts[0].name.length, LIMITS.name); assert.equal(p.log.inserts[0].message.length, LIMITS.message);
});
test('hit: records site + clean path; ignores bots, bad ids, odd paths become /other; always 204', async () => {
  const p = pub();
  assert.equal((await p.beacon(JSON.stringify({ s: SID, p: '/menu/?utm=1#x' }))).status, 204);
  assert.deepEqual(p.log.rpc[0], ['rental_record_hit', { p_site: SID, p_path: '/menu/' }]);
  await p.beacon(JSON.stringify({ s: SID, p: '/<script>' })); assert.equal(p.log.rpc[1][1].p_path, '/other');
  await p.beacon(JSON.stringify({ s: SID, p: '/' }), 'Googlebot/2.1'); await p.beacon(JSON.stringify({ s: 'x', p: '/' })); await p.beacon('not json');
  assert.equal(p.log.rpc.length, 2);
});
test('siteBase only returns the site\'s own https address', () => {
  assert.equal(siteBase({ public_url: 'https://a.pages.dev' }), 'https://a.pages.dev/');
  assert.equal(siteBase({ public_url: 'javascript:alert(1)' }), '');
  assert.equal(siteBase({ public_url: 'https://a.pages.dev/', custom_domain: 'www.a.tw', domain_status: 'pending_dns' }), 'https://a.pages.dev/');
});
test('shop email text mentions how to reply', () => {
  assert.match(shopMessageEmail({ shopName: 'A', name: 'B', contact: 'b@c.com', message: 'hi', base: 'https://a/' }).text, /直接回覆這封信/);
  assert.match(shopMessageEmail({ shopName: 'A', name: 'B', contact: '0912', message: 'hi', base: 'https://a/' }).text, /用對方留下的聯絡方式/);
});

// ── member-site ──
function mem({ site = {}, owner = 'u1', cf } = {}) {
  const s = { id: SID, member_id: 'u1', status: 'live', live_version_id: 'v1', cf_project_name: 'shop', custom_domain: null, domain_status: 'none', ...site };
  const log = { events: [], patches: [], dispatches: [] };
  const db = {
    getOne: async (t, q) => { if (t !== 'rental_sites') return null; if (q.includes('custom_domain=eq.')) return null; return q.includes('member_id=eq.' + s.member_id) ? s : null; },
    patch: async (t, q, b) => { log.patches.push(b); Object.assign(s, b); },
    insert: async (t, b) => log.events.push(b)
  };
  const fakeCf = cf || { addDomain: async (p, d) => ({ name: d, status: 'pending', target: 'shop.pages.dev' }), getDomain: async () => ({ status: 'active' }), removeDomain: async () => ({ removed: true }) };
  const deps = { allowedOrigins: parseOrigins(), db, cf: fakeCf, getUser: async (t) => (t === 'good' ? { id: owner, email: 'o@x.com' } : null), dispatch: async (a) => { log.dispatches.push(a); return { ok: true }; } };
  const call = (action, params = {}, tok = 'good') => handleMember(new Request('https://x/functions/v1/member-site', { method: 'POST', headers: { origin: 'https://chi1017.github.io', authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify({ action, site_id: SID, ...params }) }), deps);
  return { s, log, call };
}
test('member-site: owner sets a domain and gets CNAME instructions written for the shop owner', async () => {
  const m = mem(); const r = await m.call('set_domain', { domain: 'www.Shop.tw' }); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.cname_target, 'shop.pages.dev'); assert.match(j.message, /請到你買網域的地方/);
  assert.equal(m.s.custom_domain, 'www.shop.tw'); assert.match(m.log.events[0].detail.by, /^member:/);
});
test('member-site: check activates and redeploys; clear removes', async () => {
  const m = mem({ site: { custom_domain: 'www.shop.tw', domain_status: 'pending_dns' } });
  let j = await (await m.call('check_domain')).json(); assert.equal(j.domain_status, 'active'); assert.equal(m.log.dispatches.length, 1);
  j = await (await m.call('clear_domain')).json(); assert.equal(j.domain_status, 'none'); assert.equal(m.s.custom_domain, null);
});
test('member-site: other members, logged-out users, drafts and unknown actions are refused', async () => {
  assert.equal((await mem({ owner: 'u2' }).call('set_domain', { domain: 'a.tw' })).status, 404);
  assert.equal((await mem().call('set_domain', { domain: 'a.tw' }, 'bad')).status, 401);
  assert.equal((await mem({ site: { status: 'draft' } }).call('set_domain', { domain: 'a.tw' })).status, 409);
  assert.equal((await mem().call('purge')).status, 400);
  assert.equal((await mem().call('set_domain', { domain: 'x.pages.dev' })).status, 400);
});

// ── 版型：表單、評價、影片、地圖、統計 ──
import { readFileSync } from 'node:fs';
import { buildSite } from '../templates/shared/site.js';
import { normalizeContent, normalizeSections, youtubeId } from '../templates/shared/content.js';
import { validateForPublish } from '../templates/shared/validate.js';
const sample = JSON.parse(readFileSync(new URL('../templates/cafe/sample.json', import.meta.url)));
const extras = { contactForm: true, showMap: true, video: 'https://youtu.be/dQw4w9WgXcQ', reviews: [{ name: '林小姐', text: '很好喝' }, { name: '', text: '' }], ga4: 'g-abc1234' };
const API = 'https://p.supabase.co/functions/v1/site-public';
const mk = (o = {}) => buildSite({ template: 'cafe', siteUrl: 'https://s.pages.dev/', ...sample, content: { ...sample.content, ...extras }, ...o });

test('extras: normalize video / ga4 / reviews; validation messages for bad input', () => {
  const c = normalizeContent({ ...extras, video: 'https://vimeo.com/1', ga4: 'UA-1' });
  assert.equal(c.video, ''); assert.equal(c.ga4, ''); assert.equal(c.reviews.length, 2);
  assert.equal(normalizeContent(extras).ga4, 'G-ABC1234');
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1'), 'dQw4w9WgXcQ');
  const raw = { ...sample.content, video: 'https://vimeo.com/1', ga4: 'UA-1', showMap: true, address: '' };
  const v = validateForPublish(normalizeContent(raw), sample.sections, 'shop-a', raw);
  for (const f of ['video', 'ga4', 'address']) assert.ok(v.errors.some((e) => e.field === f), f);
});
test('extras (single, real build): working form, thanks page outside sitemap, beacon + lazy GA, map/video load on click, no Review schema', () => {
  const r = mk({ siteId: SID, publicApi: API });
  const h = r.files['index.html'];
  assert.match(h, new RegExp('<form class="contact-form" method="post" action="' + API + '/contact">'));
  assert.match(h, new RegExp('name="site" value="' + SID + '"'));
  assert.ok(!/contact-form[^]*disabled/.test(h.match(/<form[^]*<\/form>/)[0]));
  assert.ok(r.files['thanks/index.html'].includes('noindex'));
  assert.ok(!r.files['sitemap.xml'].includes('thanks'));
  assert.match(h, /sendBeacon/); assert.ok(h.includes(API + '/hit'));
  assert.match(h, /googletagmanager\.com\/gtag\/js\?id=G-ABC1234/); assert.match(h, /setTimeout\(go,6000\)/);
  assert.match(h, /data-embed="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?autoplay=1"/);
  assert.match(h, /data-embed="https:\/\/www\.google\.com\/maps\?q=/);
  assert.ok(!/<iframe/.test(h), 'no iframe until clicked');
  assert.match(h, /客人評價/); assert.ok(!/"@type":"Review"/.test(h));
});
test('extras: preview and demo builds show the form disabled and never send stats', () => {
  const p = mk({ preview: true, siteId: SID, publicApi: API }).html;
  assert.match(p, /預覽：正式網站上可以送出/); assert.ok(!/sendBeacon|gtag/.test(p));
  const d = mk().files['index.html'];
  assert.match(d, /示範網站：此表單不會送出/); assert.ok(!/sendBeacon/.test(d)); assert.match(d, /action="#"/);
});
test('extras (multi): reviews + video on home and about, form + map on the visit page only', () => {
  const f = mk({ layout: 'multi', siteId: SID, publicApi: API }).files;
  assert.match(f['about/index.html'], /id="reviews"/); assert.match(f['about/index.html'], /id="video"/);
  assert.match(f['index.html'], /id="reviews"/); assert.ok(!/id="contact"/.test(f['index.html']));
  assert.match(f['visit/index.html'], /id="contact"/); assert.match(f['visit/index.html'], /map-box/);
  assert.ok(!f['sitemap.xml'].includes('thanks'));
});

// ── 文章 ──
const POSTS = [{ id: '2026-10-01-ab12', title: '秋季新豆上市', date: '2026-10-01', body: '這個秋天我們進了衣索比亞的新豆。\n\n花香明顯，適合手沖。' },
  { id: '2026-10-20-cd34', title: '店休公告與烘豆日', date: '2026-10-20', body: '每週一店休，週二烘豆。' },
  { id: 'BAD ID', title: '沒有代碼的文章不會上線', date: '2026-10-21', body: 'x' }];
for (const layout of ['single', 'multi']) {
  test('posts (' + layout + '): list + one page per post, newest first, in sitemap and llms, BlogPosting + 3-level breadcrumb, links resolve', () => {
    const f = buildSite({ template: 'cafe', siteUrl: 'https://s.pages.dev/', ...sample, layout, content: { ...sample.content, posts: POSTS } }).files;
    assert.ok(f['posts/index.html'] && f['posts/2026-10-01-ab12/index.html'] && f['posts/2026-10-20-cd34/index.html']);
    assert.equal(Object.keys(f).filter((k) => k.startsWith('posts/')).length, 3);
    const list = f['posts/index.html'];
    assert.ok(list.indexOf('店休公告') < list.indexOf('秋季新豆'), 'newest first');
    assert.match(f['sitemap.xml'], /posts\/2026-10-01-ab12\//); assert.match(f['llms.txt'], /秋季新豆上市/);
    const post = f['posts/2026-10-01-ab12/index.html'];
    assert.match(post, /"@type":"BlogPosting"/); assert.match(post, /"position":3/); assert.match(post, /<link rel="canonical" href="https:\/\/s\.pages\.dev\/posts\/2026-10-01-ab12\/">/);
    assert.match(post, /<p>花香明顯，適合手沖。<\/p>/); assert.ok(!/FAQPage/.test(post));
    assert.match(post, /href="\.\.\/\.\.\/posts\/"/, "link back to list");
    assert.match(f['index.html'], /id="posts"/); assert.match(f['index.html'], /href="posts\/2026-10-20-cd34\/"/);
    if (layout === 'single') assert.match(post, /href="\.\.\/\.\.\/#about"/, 'one-page anchors go back to home');
    else assert.match(post, /href="\.\.\/\.\.\/about\/"/);
  });
}

// ── 線上預約 ──
import { checkBooking } from '../templates/shared/booking.js';
const HOURS = { mon: { closed: true }, tue: { open: '09:00', close: '18:00' }, sat: { open: '18:00', close: '02:00' } };
test('checkBooking: dates in range, closed days, opening hours (incl. past midnight)', () => {
  const T = '2026-10-26';   // 週一
  assert.equal(checkBooking({ hours: HOURS, date: '2026-10-25', time: '10:00', today: T }).ok, false);
  assert.match(checkBooking({ hours: HOURS, date: '2026-11-02', time: '10:00', today: T }).msg, /公休/);
  assert.equal(checkBooking({ hours: HOURS, date: '2026-10-27', time: '10:00', today: T }).ok, true);
  assert.match(checkBooking({ hours: HOURS, date: '2026-10-27', time: '19:00', today: T }).msg, /營業時間/);
  assert.equal(checkBooking({ hours: HOURS, date: '2026-10-31', time: '01:00', today: T }).ok, true);
  assert.equal(checkBooking({ hours: HOURS, date: '2027-03-01', time: '10:00', today: T }).ok, false);
  assert.equal(checkBooking({ hours: HOURS, date: '2026-10-29', time: '10:00', today: T }).ok, true, 'days without hours are allowed');
  assert.equal(checkBooking({ hours: HOURS, date: 'x', time: '10:00', today: T }).ok, false);
});
test('booking route: stores kind=booking with meta, email subject has date/time, rejects closed days', async () => {
  const p = pub({ site: { content: { name: '好喝咖啡', hours: HOURS } } });
  const r = await handlePublic(new Request('https://x/functions/v1/site-public/booking', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ site: SID, name: '王小明', contact: '0912345678', date: '2026-10-27', time: '14:00', people: '3', message: '靠窗' }).toString() }), { db: { getOne: async (t) => (t === 'rental_sites' ? p.s : { email: 'o@x.tw' }), count: async () => 0, insertReturning: async (t, b) => { p.log.inserts.push(b); return { id: 'm' }; }, patch: async () => {} }, now: () => NOW, sendMail: async (m) => { p.log.mails.push(m); return { ok: true }; } });
  assert.equal(r.status, 303);
  assert.equal(p.log.inserts[0].kind, 'booking'); assert.deepEqual(p.log.inserts[0].meta, { date: '2026-10-27', time: '14:00', people: 3 });
  assert.match(p.log.inserts[0].message, /2026\/10\/27 14:00・3 人\n備註：靠窗/);
  assert.match(p.log.mails[0].subject, /預約申請：2026\/10\/27 14:00 王小明/);
  const closed = await handlePublic(new Request('https://x/functions/v1/site-public/booking', { method: 'POST', body: new URLSearchParams({ site: SID, name: 'a', contact: 'b', date: '2026-11-02', time: '10:00' }).toString() }), { db: { getOne: async () => p.s, count: async () => 0 }, now: () => NOW });
  assert.match(await closed.text(), /公休/);
});
test('booking form: shows on the visit page (multi) / before visit (single), people for cafes, item select for salons, hero button', () => {
  const c = { ...sample.content, bookingForm: true, booking: { label: '', url: '' } };
  const single = buildSite({ template: 'cafe', siteUrl: 'https://s.pages.dev/', ...sample, content: c, siteId: SID, publicApi: API }).files['index.html'];
  assert.match(single, /id="booking"/); assert.match(single, /name="people"/); assert.match(single, new RegExp('action="' + API + '/booking"'));
  assert.match(single, /<a class="btn" href="#booking">線上預約<\/a>/);
  const multi = buildSite({ template: 'salon', siteUrl: 'https://s.pages.dev/', ...sample, content: c, layout: 'multi', siteId: SID, publicApi: API }).files;
  assert.match(multi['visit/index.html'], /id="booking"/); assert.ok(!/id="booking"/.test(multi['index.html']));
  assert.match(multi['visit/index.html'], /name="item"/); assert.ok(!/name="people"/.test(multi['visit/index.html']));
  assert.match(multi['index.html'], /href="visit\/#booking"/);
  assert.ok(multi['thanks/index.html']);
});

// ── 英文版 ──
test('english page: /en/ with hreflang both ways, English hours and LD, sitemap, footer link; off or incomplete → no page', () => {
  const en = { enabled: true, name: 'Afternoon Sun Coffee', tagline: 'Pour-over coffee and home-baked desserts', intro: 'A small independent café in Lingya, Kaohsiung.\n\nWe roast weekly.', address: 'No. 100, Siwei 3rd Rd., Lingya Dist., Kaohsiung' };
  const f = buildSite({ template: 'cafe', siteUrl: 'https://s.pages.dev/', ...sample, content: { ...sample.content, en }, imageVariants: true }).files;
  const p = f['en/index.html'];
  assert.match(p, /<html lang="en">/); assert.match(p, /<link rel="canonical" href="https:\/\/s\.pages\.dev\/en\/">/);
  assert.match(p, /hreflang="zh-Hant" href="https:\/\/s\.pages\.dev\/"/); assert.match(p, /Tue–Fri 09:00–18:00|Mon Closed/);
  assert.match(p, /"inLanguage":"en"/); assert.match(p, /"alternateName":"午後日光咖啡"/); assert.match(p, /Menu &amp; Prices/);
  assert.match(p, /srcset="\.\.\/images\/hero-480\.webp/);
  assert.match(f['index.html'], /hreflang="en" href="https:\/\/s\.pages\.dev\/en\/"/); assert.match(f['index.html'], /href="en\/" hreflang="en"/);
  assert.match(f['sitemap.xml'], /\/en\//);
  assert.ok(!buildSite({ template: 'cafe', siteUrl: 'https://s.pages.dev/', ...sample, content: { ...sample.content, en: { ...en, enabled: false } } }).files['en/index.html']);
  assert.ok(!buildSite({ template: 'cafe', siteUrl: 'https://s.pages.dev/', ...sample, content: { ...sample.content, en: { ...en, intro: '' } } }).files['en/index.html']);
  const v = validateForPublish(normalizeContent({ ...sample.content, en: { enabled: true } }), sample.sections, 'shop-a');
  assert.ok(v.errors.some((e) => e.field === 'en'));
});

// ── 線上購買（店家自己的綠界）──
test('shop: single page has the order form only when payment is set up; multi page gets shop/; prices come from content', () => {
  const content = { name: '小日子', intro: '我們是一家咖啡店，提供手沖咖啡與手作甜點，歡迎來坐坐。', photos: { hero: { path: 'a/hero-1.webp', w: 1600, h: 900 } }, bookingForm: true, bookingDeposit: 300,
    shop: { enabled: true, note: '週一至週五出貨', items: [{ id: 'abcd', name: '餅乾禮盒', price: 480, desc: '十二入', photo: { path: 'a/item-1.webp', w: 800, h: 600 } }, { id: 'efgh', name: '咖啡豆', price: 350 }, { id: 'zzzz', name: '', price: 1 }] } };
  const base = { template: 'cafe', content, siteUrl: 'https://x.pages.dev/', siteId: '11111111-1111-1111-1111-111111111111', publicApi: 'https://p/functions/v1/site-public' };
  const on = buildSite({ ...base, payReady: true });
  assert.match(on.html, /<form class="contact-form shop-form" id="order" method="post" action="https:\/\/p\/functions\/v1\/site-public\/shop"/);
  assert.match(on.html, /name="q_abcd"[^>]*data-price="480"/); assert.ok(!on.html.includes('q_zzzz'), 'items without a name are not sold');
  assert.match(on.html, /images\/item-abcd\.webp/); assert.ok(on.images.some((i) => i.role === 'item-abcd'));
  assert.match(on.html, /預約需先付訂金 NT\$ 300/); assert.match(on.html, /href="#shop">線上購買</);
  assert.ok(on.files['order/index.html']); assert.match(on.files['order/index.html'], /noindex/);
  const off = buildSite({ ...base, payReady: false });
  assert.ok(!off.html.includes('id="order"')); assert.match(off.html, /尚未開放線上付款/); assert.ok(!off.html.includes('訂金'));
  const multi = buildSite({ ...base, layout: 'multi', pages: {}, payReady: true });
  assert.match(multi.files['index.html'], /前往線上購買/); assert.ok(!multi.files['index.html'].includes('id="order"'));
  assert.match(multi.files['shop/index.html'], /id="order"/); assert.match(multi.files['shop/index.html'], /\.\.\/images\/item-abcd/);
  assert.match(multi.files['sitemap.xml'], /shop\//);
  const none = buildSite({ ...base, content: { ...content, shop: { ...content.shop, enabled: false } }, payReady: true });
  assert.ok(!none.html.includes('id="shop"'));
});

// ── 區塊順序、自訂區塊、字型與按鈕、LINE 浮動按鈕、SEO 與分享圖 ──
test('order: home sections follow the saved order; custom blocks render with photo side and button', () => {
  const content = { name: '小日子', intro: '我們是一家咖啡店，提供手沖咖啡與手作甜點，歡迎來坐坐。', address: '高雄市苓雅區四維三路100號', contactForm: true, menu: [{ name: '拿鐵', price: 120 }],
    photos: { hero: { path: 'a/hero.webp', w: 1600, h: 900 } },
    blocks: [{ id: 'blk1', title: '包場服務', body: '平日晚上可包場。', photo: { path: 'a/b.webp', w: 800, h: 600 }, side: 'left', btnLabel: '詢問包場', btnUrl: 'https://line.me/R/ti/p/@x' }, { id: 'blk2', title: '藏起來', hidden: true }],
    order: ['contact', 'b:blk1', 'menu', 'about'] };
  const r = buildSite({ template: 'cafe', content, siteUrl: 'https://x.pages.dev/' });
  const pos = (id) => r.html.indexOf('id="' + id + '"');
  assert.ok(pos('contact') > 0 && pos('contact') < pos('b-blk1') && pos('b-blk1') < pos('menu') && pos('menu') < pos('about'));
  assert.ok(pos('visit') > 0, 'sections missing from the saved order are added back');
  assert.match(r.html, /class="about split block img-left[^"]*" id="b-blk1"/); assert.match(r.html, /images\/blk-blk1\.webp/);
  assert.match(r.html, /<a class="btn" href="https:\/\/line\.me\/R\/ti\/p\/@x"[^>]*>詢問包場<\/a>/);
  assert.ok(!r.html.includes('b-blk2'), 'hidden blocks are not published');
  const v = validateForPublish(normalizeContent({ ...content, blocks: [{ id: 'blk1', title: 'x', btnLabel: '按我' }] }), normalizeSections({}), 'shop', {}, {});
  assert.ok(v.errors.some((e) => e.field === 'blocks.0'));
});

test('style: heading font stack and button shape; LINE float button needs a LINE link; SEO override and share image', () => {
  const base = { name: '小日子', address: '高雄市苓雅區四維三路100號', photos: { hero: { path: 'a/hero.webp' } }, social: { line: 'https://line.me/R/ti/p/@abc' } };
  const r = buildSite({ template: 'cafe', content: { ...base, style: { font: 'round', button: 'square', floatLine: true },
    seo: { title: '小日子咖啡｜高雄手沖', description: '高雄苓雅的手沖咖啡店。', share: { path: 'a/share.jpg' } } }, siteUrl: 'https://x.pages.dev/', preview: false, headingFont: true });
  assert.match(r.html, /h1,h2,h3\{font-family:"SiteHeading","jf-openhuninn-2\.0"/);
  assert.match(r.html, /\.btn\{border-radius:2px\}/); assert.match(r.html, /font-weight:100 900/);
  assert.match(r.html, /<a class="float-line" href="https:\/\/line\.me\/R\/ti\/p\/@abc"/);
  assert.match(r.html, /<title>小日子咖啡｜高雄手沖<\/title>/); assert.match(r.html, /<meta name="description" content="高雄苓雅的手沖咖啡店。">/);
  assert.match(r.html, /og:image" content="https:\/\/x\.pages\.dev\/images\/share\.jpg"/);
  const plain = buildSite({ template: 'cafe', content: base, siteUrl: 'https://x.pages.dev/' });
  assert.ok(!plain.html.includes('float-line"'), 'off by default'); assert.match(plain.html, /og:image" content="https:\/\/x\.pages\.dev\/images\/hero\.webp"/);
  assert.match(plain.html, /"Noto Serif TC"/);
  const prev = buildSite({ template: 'cafe', content: { ...base, style: { font: 'kai' } }, siteUrl: 'https://x.pages.dev/', preview: true, previewFontUrl: 'https://t/fonts/kai.woff2', imageSrc: () => '' });
  assert.match(prev.html, /src:url\(https:\/\/t\/fonts\/kai\.woff2\)/);
  const v = validateForPublish(normalizeContent({ ...base, social: {}, style: { floatLine: true } }), normalizeSections({}), 'shop', {}, {});
  assert.ok(v.errors.some((e) => e.field === 'social.line'));
});

test('look: subtitles, heading line, texture, motion and section layouts are CSS-only switches', () => {
  const content = { name: '小日子', address: '高雄市苓雅區四維三路100號', menu: [{ name: '拿鐵', price: 120 }], reviews: [{ name: 'A', text: '好喝' }],
    photos: { hero: { path: 'a/h.webp' }, room: [{ path: 'a/r.webp' }] },
    subs: { menu: '每天現煮', bogus: 'x' }, style: { texture: 'contour', motion: 'fade', head: 'num', menuStyle: 'cards', gallery: 'slide', reviewStyle: 'quote' } };
  const r = buildSite({ template: 'cafe', content, palette: 'lake', siteUrl: 'https://x.pages.dev/' });
  assert.match(r.html, /<body class="hd-num tex-contour mo-fade">/);
  assert.match(r.html, /<h2 class="sec-title">菜單與價格<\/h2><p class="sec-sub">每天現煮<\/p><ul class="menu cards">/);
  assert.match(r.html, /class="gallery slide"/); assert.match(r.html, /class="reviews quote"/);
  assert.match(r.html, /tex-contour section\.alt\{background-image:url\("data:image\/svg\+xml/);
  assert.ok(!/<script[^>]*src=/.test(r.html), 'no external scripts');
  const n = normalizeContent({ style: { texture: 'mountain', head: 'bad' } });
  assert.equal(n.style.texture, 'none'); assert.equal(n.style.head, 'plain'); assert.deepEqual(normalizeContent({ subs: { menu: '  ' } }).subs, {});
  const plain = buildSite({ template: 'cafe', content: { name: 'x' }, siteUrl: 'https://x.pages.dev/' });
  assert.match(plain.html, /<body class="hd-plain mo-rise">/);
});

test('style.colors overrides the palette with the shop\'s own four colours', () => {
  const r = buildSite({ template: 'cafe', content: { name: 'x', style: { colors: { bg: '#101820', surface: '#1B2733', accent: '#F2AA4C', text: '#F4F1EA' } } }, palette: 'forest', siteUrl: 'https://x.pages.dev/' });
  assert.match(r.html, /--bg:#101820;--surface:#1B2733;--text:#F4F1EA;/); assert.match(r.html, /--accent:#F2AA4C/);
});
