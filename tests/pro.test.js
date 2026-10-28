// 進階方案：版型風格、自訂字型、嵌入與自訂程式碼（審核）、預約行事曆、多人協作
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSite } from '../templates/shared/site.js';
import { normalizeContent } from '../templates/shared/content.js';
import { customCode, codeHash, effectiveContent, hasCustomCode } from '../templates/shared/code.js';
import { availability, checkSlot, slotsForDate } from '../templates/shared/slots.js';
import { validateForPublish } from '../templates/shared/validate.js';
import { handleMember } from '../supabase/functions/member-site/handler.mjs';
import { handlePublic } from '../supabase/functions/site-public/handler.mjs';
import { handlePublish } from '../supabase/functions/publish-site/handler.mjs';
import { handleAdmin } from '../supabase/functions/admin-site/handler.mjs';
import { parseOrigins } from '../supabase/functions/_shared/http.mjs';

const SID = '11111111-1111-1111-1111-111111111111';
const MID = '22222222-2222-2222-2222-222222222222';
const NOW = new Date('2026-10-26T01:00:00Z');   // 台灣 2026-10-26（一）09:00
const WEEK = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [{ start: '10:00', end: '12:00' }]]));
const CAL = { enabled: true, slotMinutes: 60, capacity: 2, leadHours: 0, maxDays: 7, weekly: WEEK, closed: ['2026-10-28'] };
const base = { name: '好喝咖啡', address: '台北市', hours: { mon: { open: '10:00', close: '18:00' } }, photos: { hero: { path: 'h.webp', w: 10, h: 8 }, room: [] } };
const build = (content, extra = {}) => buildSite({ template: 'cafe', content: { ...base, ...content }, palette: 'forest', siteUrl: 'https://x.pages.dev/', siteId: SID, publicApi: 'https://p/site-public', ...extra });

test('layouts: center, bento and sidebar add their body class; bento hero is a photo grid; sidebar adds contact under the menu', () => {
  for (const k of ['center', 'bento', 'sidebar']) assert.match(build({ homeStyle: k }).html, new RegExp('<body class="[^"]*ly-' + k));
  assert.match(build({ homeStyle: 'bento' }).html, /class="hero bento"[\s\S]*class="b-main"/);
  assert.match(build({ homeStyle: 'sidebar', phone: '02-1234-5678' }).html, /class="side-extra"[\s\S]*02-1234-5678/);
  assert.doesNotMatch(build({ homeStyle: 'standard' }).html, /<body class="[^"]*ly-/);
});

test('custom font: path must be in the site\'s own folder; without an upload the font falls back to serif; preview can name the format', () => {
  const ok = normalizeContent({ style: { font: 'custom', customFont: { path: SID + '/font-abc123.ttf', name: '我的字' } } });
  assert.equal(ok.style.font, 'custom'); assert.equal(ok.style.customFont.name, '我的字');
  assert.equal(normalizeContent({ style: { font: 'custom', customFont: { path: '../x.ttf' } } }).style.font, 'serif');
  const r = buildSite({ template: 'cafe', content: { ...base, style: ok.style }, palette: 'forest', siteUrl: 'https://x/', preview: true, previewFontUrl: 'blob:abc', previewFontFormat: '' });
  assert.match(r.html, /src:url\(blob:abc\);/);
});

test('code: preview never runs it; live site has head/body code and raw embed; hash changes with the code; effectiveContent strips by tier/approval', async () => {
  const content = { code: { head: '<meta name="x-test" content="1">', body: '<script>window.t=1</script>' }, blocks: [{ id: 'emb1', kind: 'html', title: 'IG', html: '<blockquote class="ig">hi</blockquote>' }] };
  const live = build(content).html;
  assert.match(live, /<meta name="x-test" content="1">\n<\/head>/); assert.match(live, /<script>window.t=1<\/script>\n<\/body>/); assert.match(live, /<blockquote class="ig">hi<\/blockquote>/);
  const prev = build(content, { preview: true }).html;
  assert.doesNotMatch(prev, /x-test|window\.t=1|<blockquote class="ig">/); assert.match(prev, /embed-ph/);
  const c = normalizeContent(content);
  assert.ok(hasCustomCode(c)); assert.equal(customCode(c).blocks.length, 1);
  const h1 = await codeHash(c), h2 = await codeHash(normalizeContent({ ...content, code: { head: '', body: '' } }));
  assert.match(h1, /^[0-9a-f]{64}$/); assert.notEqual(h1, h2);
  const stripped = effectiveContent(c, { tier: 'pro', codeApproved: false });
  assert.equal(stripped.code.head, ''); assert.equal(stripped.blocks.length, 0); assert.ok(!stripped.order.includes('b:emb1'));
  assert.equal(effectiveContent(c, { tier: 'pro', codeApproved: true }), c);
  const basic = effectiveContent(normalizeContent({ ...content, bookingCal: CAL }), { tier: 'basic', codeApproved: true });
  assert.equal(basic.code.body, ''); assert.equal(basic.bookingCal.enabled, false);
});

test('slots: weekly ranges, closed dates, lead time and remaining places', () => {
  const cal = normalizeContent({ bookingCal: CAL }).bookingCal;
  assert.deepEqual(slotsForDate(cal, '2026-10-26'), ['10:00', '11:00']); assert.deepEqual(slotsForDate(cal, '2026-10-28'), []);
  const days = availability(cal, NOW, { '2026-10-26 10:00': 2 });
  assert.equal(days[0].date, '2026-10-26'); assert.equal(days[0].slots[0].left, 0); assert.equal(days[0].slots[1].left, 2);
  assert.ok(!days.some((d) => d.date === '2026-10-28')); assert.equal(days.length, 7);
  assert.equal(checkSlot(cal, '2026-10-26', '10:30', NOW).ok, false); assert.equal(checkSlot(cal, '2026-11-20', '10:00', NOW).ok, false);
  assert.equal(checkSlot({ ...cal, leadHours: 2 }, '2026-10-26', '10:00', NOW).ok, false); assert.equal(checkSlot(cal, '2026-10-27', '11:00', NOW).ok, true);
  const v = validateForPublish(normalizeContent({ ...base, bookingForm: true, bookingCal: { ...CAL, weekly: {} } }), { menu: true, interior: true, faq: true, news: true }, 'shop-one');
  assert.ok(v.errors.some((e) => e.field === 'bookingCal'));
});

test('calendar section: live page loads slots with a script; preview shows the schedule without the script', () => {
  const live = build({ bookingForm: true, bookingCal: CAL }).html;
  assert.match(live, /data-cal="https:\/\/p\/site-public\/slots\?site=11111111/); assert.match(live, /name="cal" value="1"/); assert.match(live, /fetch\(box\.getAttribute/);
  const prev = build({ bookingForm: true, bookingCal: CAL }, { preview: true }).html;
  assert.match(prev, /class="cal-day"/); assert.doesNotMatch(prev, /data-cal=|fetch\(box/);
  assert.doesNotMatch(build({ bookingForm: true }).html, /cal-form/);
});

// ── 假資料庫 ──
function world({ tier = 'pro', live = { ...base, bookingForm: true, bookingCal: CAL }, members = [] } = {}) {
  const t = { rental_sites: [{ id: SID, member_id: 'u1', slug: 'shop', status: 'live', tier, layout: 'single', public_url: 'https://shop.pages.dev/', live_version_id: 'v1', terms_accepted_at: '2026', content: live }],
    site_versions: [{ id: 'v1', site_id: SID, content: live, created_at: '2026-10-01' }], site_messages: [], site_events: [], site_code_reviews: [], site_members: members,
    members: [{ id: 'u1', email: 'o@x.tw', consented_at: '2026' }, { id: 'u2', email: 'c@x.tw', consented_at: '2026' }] };
  const log = { mails: [], dispatches: [] };
  const match = (row, q) => q.split('&').every((part) => {
    const [k, v] = part.split('='); if (['select', 'limit', 'order', 'created_at'].includes(k) || !v) return true;
    if (v.startsWith('eq.')) return String(row[k]) === decodeURIComponent(v.slice(3));
    if (v.startsWith('neq.')) return String(row[k]) !== decodeURIComponent(v.slice(4));
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(row[k]));
    return true;
  });
  let n = 0;
  const db = {
    getOne: async (tb, q) => t[tb].find((r) => match(r, q)) || null,
    list: async (tb, q) => t[tb].filter((r) => match(r, q)),
    count: async () => 0,
    insert: async (tb, b) => { t[tb].push({ ...b }); },
    insertReturning: async (tb, b) => { const r = { id: tb + ++n, created_at: '2026-10-26', ...b }; t[tb].push(r); return r; },
    patch: async (tb, q, b) => { t[tb].filter((r) => match(r, q)).forEach((r) => Object.assign(r, b)); },
    patchReturning: async (tb, q, b) => { const rows = t[tb].filter((r) => match(r, q)); rows.forEach((r) => Object.assign(r, b)); return rows; },
    rpc: async (fn, a) => {
      if (fn === 'rental_slot_usage') { const u = {}; t.site_messages.filter((m) => m.slot_date && m.slot_status !== 'cancelled').forEach((m) => { const k = m.slot_date + '|' + m.slot_time; u[k] = (u[k] || 0) + 1; }); return Object.entries(u).map(([k, used]) => ({ slot_date: k.split('|')[0], slot_time: k.split('|')[1], used })); }
      if (fn === 'rental_book_slot') {
        const used = t.site_messages.filter((m) => m.slot_date === a.p_date && m.slot_time === a.p_time && m.slot_status !== 'cancelled').length;
        if (used >= a.p_capacity) return null;
        const id = '33333333-3333-3333-3333-33333333333' + t.site_messages.length;
        t.site_messages.push({ id, site_id: a.p_site, name: a.p_name, contact: a.p_contact, message: a.p_message, meta: a.p_meta, slot_date: a.p_date, slot_time: a.p_time, slot_status: 'pending', kind: 'booking' });
        return id;
      }
      return null;
    }
  };
  const deps = { db, now: () => NOW, sendMail: async (m) => { log.mails.push(m); return { ok: true }; }, dispatch: async (a) => { log.dispatches.push(a); return { ok: true }; },
    allowedOrigins: parseOrigins(), adminEmail: 'admin@x.tw', previewBase: 'https://p/', adminUrl: 'https://a/' };
  const req = (path, body, auth = 'u1') => new Request('https://x/functions/v1/' + path, { method: 'POST', headers: { origin: 'https://chi1017.github.io', authorization: 'Bearer ' + auth }, body: JSON.stringify(body) });
  const users = { u1: { id: 'u1', email: 'o@x.tw' }, u2: { id: 'u2', email: 'c@x.tw' }, admin: { id: 'a', email: 'admin@x.tw', isAdmin: true } };
  const getUser = async (tok) => users[tok] || null;
  const call = async (fn, body, auth) => { const r = await fn(req(fn === handleMember ? 'member-site' : fn === handleAdmin ? 'admin-site' : 'publish-site', body, auth), { ...deps, getUser }); return { status: r.status, j: await r.json() }; };
  const post = async (route, form) => { const r = await handlePublic(new Request('https://x/functions/v1/site-public/' + route, { method: 'POST', body: new URLSearchParams(form).toString() }), deps); return { status: r.status, loc: r.headers.get('location'), body: await r.text() }; };
  const get = async (q) => { const r = await handlePublic(new Request('https://x/functions/v1/site-public/slots?' + q, { method: 'GET' }), deps); return r.json(); };
  return { t, log, call, post, get };
}
const form = (o) => ({ site: SID, cal: '1', name: '王小明', contact: '0912345678', date: '2026-10-27', time: '10:00', ...o });

test('booking calendar: slots endpoint, full slot is refused, bad slot is refused, owner gets an email; basic tier gets nothing', async () => {
  const w = world();
  const days = (await w.get('site=' + SID)).days;
  assert.equal(days[0].date, '2026-10-26'); assert.equal(days[0].slots[0].left, 2);
  assert.equal((await w.post('booking', form({}))).status, 303);
  assert.equal((await w.post('booking', form({ name: '李' }))).status, 303);
  const full = await w.post('booking', form({ name: '張' }));
  assert.match(full.body, /額滿/); assert.equal(w.t.site_messages.length, 2);
  assert.match((await w.post('booking', form({ time: '10:30' }))).body, /沒有開放/);
  assert.match(w.log.mails[0].subject, /新預約：2026\/10\/27 10:00/);
  assert.equal((await w.get('site=' + SID)).days.find((d) => d.date === '2026-10-27').slots[0].left, 0);
  const b = world({ tier: 'basic' });
  assert.deepEqual((await b.get('site=' + SID)).days, []); assert.match((await b.post('booking', form({}))).body, /沒有開放線上選時段/);
});

test('owner confirms or cancels a booking; the guest is emailed; cancelled frees the place', async () => {
  const w = world();
  await w.post('booking', form({ email: 'g@x.tw' }));
  const id = w.t.site_messages[0].id;
  const r = await w.call(handleMember, { action: 'set_booking', site_id: SID, message_id: id, status: 'confirmed' });
  assert.equal(r.status, 200); assert.equal(w.t.site_messages[0].slot_status, 'confirmed');
  assert.equal(w.log.mails.at(-1).to, 'g@x.tw'); assert.match(w.log.mails.at(-1).subject, /已確認/);
  await w.call(handleMember, { action: 'set_booking', site_id: SID, message_id: id, status: 'cancelled', note: '公休' });
  assert.equal(w.t.site_messages[0].slot_status, 'cancelled'); assert.match(w.log.mails.at(-1).text, /公休/);
  assert.equal((await w.call(handleMember, { action: 'set_booking', site_id: SID, message_id: id, status: 'confirmed' })).status, 409);
  assert.equal((await w.call(handleMember, { action: 'set_booking', site_id: SID, message_id: id, status: 'confirmed' }, 'u2')).status, 404);   // 不是協作者
});

test('collaborators: owner invites (pro only, max 5), invitee accepts on login, then can publish and manage bookings; removed loses access', async () => {
  const b = world({ tier: 'basic' });
  assert.equal((await b.call(handleMember, { action: 'invite_collab', site_id: SID, email: 'c@x.tw' })).status, 403);
  const w = world();
  assert.equal((await w.call(handleMember, { action: 'invite_collab', site_id: SID, email: 'C@x.tw' })).status, 200);
  assert.equal(w.t.site_members[0].email, 'c@x.tw'); assert.match(w.log.mails.at(-1).subject, /邀請你一起編輯/);
  assert.equal((await w.call(handleMember, { action: 'invite_collab', site_id: SID, email: 'c@x.tw' })).status, 400);
  assert.equal((await w.call(handleMember, { action: 'invite_collab', site_id: SID, email: 'c@x.tw' }, 'u2')).status, 404);   // 協作者不能邀請
  assert.equal((await w.call(handlePublish, { site_id: SID }, 'u2')).status, 404);   // 還沒接受
  assert.equal((await w.call(handleMember, { action: 'accept_invites' }, 'u2')).j.accepted, 1);
  assert.equal(w.t.site_members[0].status, 'active'); assert.equal(w.t.site_members[0].member_id, 'u2');
  const p = await w.call(handlePublish, { site_id: SID }, 'u2');
  assert.equal(p.status, 200); assert.equal(w.log.dispatches.length, 1);
  await w.post('booking', form({}));
  assert.equal((await w.call(handleMember, { action: 'set_booking', site_id: SID, message_id: w.t.site_messages[0].id, status: 'confirmed' }, 'u2')).status, 200);
  assert.equal((await w.call(handleMember, { action: 'get_pay', site_id: SID }, 'u2')).status, 404);   // 收款只有擁有者
  await w.call(handleMember, { action: 'remove_collab', site_id: SID, email: 'c@x.tw' });
  assert.equal((await w.call(handlePublish, { site_id: SID }, 'u2')).status, 404);
});

test('code review: publishing new code asks the admin; approve redeploys and tells the customer; tier change redeploys', async () => {
  const live = { ...base, code: { head: '<meta name="a">', body: '' } };
  const w = world({ live });
  const p = await w.call(handlePublish, { site_id: SID });
  assert.equal(p.status, 200); assert.match(p.j.message, /需要審核/);
  assert.equal(w.t.site_code_reviews.length, 1); assert.equal(w.t.site_code_reviews[0].status, 'pending');
  assert.ok(w.log.mails.some((m) => m.to === 'admin@x.tw' && /待審核/.test(m.subject)));
  const hash = w.t.site_code_reviews[0].hash;
  assert.equal((await w.call(handleAdmin, { action: 'review_code', site_id: SID, hash, approve: true }, 'u1')).status, 403);
  const a = await w.call(handleAdmin, { action: 'review_code', site_id: SID, hash, approve: true }, 'admin');
  assert.equal(a.status, 200); assert.equal(w.t.site_code_reviews[0].status, 'approved');
  assert.ok(w.log.mails.some((m) => m.to === 'o@x.tw' && /已核准/.test(m.subject))); assert.equal(w.log.dispatches.length, 2);
  // 同一份程式碼再發佈不用再審
  await new Promise((r) => setTimeout(r, 0)); w.t.site_events.length = 0;
  const p2 = await w.call(handlePublish, { site_id: SID });
  assert.doesNotMatch(p2.j.message, /審核/); assert.equal(w.t.site_code_reviews.length, 1);
  const tr = await w.call(handleAdmin, { action: 'set_tier', site_id: SID, tier: 'basic' }, 'admin');
  assert.equal(tr.status, 200); assert.equal(w.t.rental_sites[0].tier, 'basic'); assert.equal(w.log.dispatches.at(-1).versionId, 'v1');
  assert.equal((await w.call(handleAdmin, { action: 'set_tier', site_id: SID, tier: 'gold' }, 'admin')).status, 400);
});

// ── 一頁升級多頁：補差額 ──
import { upgradeQuote } from '../supabase/functions/_shared/plans.mjs';
test('upgrade quote: monthly and yearly prorating, nothing left = nothing to pay', () => {
  assert.deepEqual(upgradeQuote({ paidUntil: '2026-11-14', today: '2026-10-26', yearly: false }), { days: 20, amount: 200, yearly: false });
  assert.equal(upgradeQuote({ paidUntil: '2027-08-21', today: '2026-10-26', yearly: true }).amount, Math.round(300 * 3000 / 365));
  assert.equal(upgradeQuote({ paidUntil: '2026-10-01', today: '2026-10-26' }).amount, 0);
});
test('upgrade flow: paid site waits for the difference; publish only saves; admin confirm publishes multi; unpaid site upgrades free', async () => {
  const w = world({ tier: 'basic', live: { ...base } });
  Object.assign(w.t.rental_sites[0], { paid_until: '2026-11-14', sections: {} });
  w.t.payments = [{ site_id: SID, months: 1, paid_on: '2026-10-15' }];
  const q = await w.call(handleMember, { action: 'upgrade_quote', site_id: SID });
  assert.equal(q.j.amount, 200);
  const u = await w.call(handleMember, { action: 'upgrade_layout', site_id: SID });
  assert.equal(u.status, 200); assert.equal(u.j.upgrade_pending, true);
  const s = w.t.rental_sites[0];
  assert.equal(s.layout, 'multi'); assert.equal(s.upgrade_pending, true); assert.equal(s.upgrade_amount, 200);
  assert.ok(w.log.mails.some((m) => /待補差額 NT\$ 200/.test(m.subject)));
  assert.equal((await w.call(handleMember, { action: 'upgrade_layout', site_id: SID })).status, 409);
  const p = await w.call(handlePublish, { site_id: SID });
  assert.equal(p.j.upgrade_pending, true); assert.equal(w.log.dispatches.length, 0);
  assert.equal((await w.call(handleAdmin, { action: 'confirm_upgrade', site_id: SID, reference: '12345' }, 'admin')).status, 200);
  assert.equal(s.upgrade_pending, false); assert.equal(w.log.dispatches.length, 1);
  assert.ok(w.log.mails.some((m) => m.to === 'o@x.tw' && /已收到升級差額/.test(m.subject)));
  assert.equal((await w.call(handleAdmin, { action: 'confirm_upgrade', site_id: SID }, 'admin')).status, 409);
  const d = world({ tier: 'basic', live: { ...base } }); Object.assign(d.t.rental_sites[0], { status: 'pending', paid_until: null, sections: {} }); d.t.payments = [];
  const u2 = await d.call(handleMember, { action: 'upgrade_layout', site_id: SID });
  assert.equal(u2.j.upgrade_pending, false); assert.equal(d.t.rental_sites[0].upgrade_pending, false);
});

// ── 方案：進階加購、下一期降級 ──
import { proQuote, priceFor, monthlyOf } from '../supabase/functions/_shared/plans.mjs';
import { renewText } from '../supabase/functions/rental-cron/handler.mjs';
test('plan prices: pro add-on on either layout, yearly pays 10 months, pro difference prorated', () => {
  assert.equal(monthlyOf('single', 'pro'), 999); assert.equal(monthlyOf('multi', 'pro'), 1299);
  assert.equal(priceFor('multi', 12, 'pro'), 12990); assert.equal(priceFor('single', 1), 599);
  assert.equal(proQuote({ paidUntil: '2026-11-14', today: '2026-10-26' }).amount, Math.round(20 * 400 / 30));
  assert.match(renewText({ layout: 'multi', tier: 'pro', next_tier: 'basic' }), /NT\$ 899／月/);
  assert.match(renewText({ layout: 'single', tier: 'pro' }), /NT\$ 999／月.*進階功能/);
});
test('pro request: paid site waits for the difference then admin opens it; unpaid site gets it at once', async () => {
  const w = world({ tier: 'basic', live: { ...base } });
  Object.assign(w.t.rental_sites[0], { paid_until: '2026-11-14', pro_pending: false }); w.t.payments = [{ site_id: SID, months: 1, paid_on: '2026-10-15' }];
  assert.equal((await w.call(handleMember, { action: 'pro_quote', site_id: SID })).j.amount, 267);
  const r = await w.call(handleMember, { action: 'request_pro', site_id: SID });
  assert.equal(r.j.pending, true); assert.equal(w.t.rental_sites[0].tier, 'basic'); assert.equal(w.t.rental_sites[0].pro_pending, true);
  assert.ok(w.log.mails.some((m) => /申請進階功能，待補差額 NT\$ 267/.test(m.subject)));
  assert.equal((await w.call(handleMember, { action: 'request_pro', site_id: SID })).status, 409);
  assert.equal((await w.call(handleAdmin, { action: 'confirm_pro', site_id: SID }, 'admin')).status, 200);
  assert.equal(w.t.rental_sites[0].tier, 'pro'); assert.equal(w.t.rental_sites[0].pro_pending, false); assert.equal(w.log.dispatches.length, 1);
  const d = world({ tier: 'basic', live: { ...base } }); Object.assign(d.t.rental_sites[0], { status: 'pending', paid_until: null, pro_pending: false }); d.t.payments = [];
  const r2 = await d.call(handleMember, { action: 'request_pro', site_id: SID });
  assert.equal(r2.j.pending, false); assert.equal(d.t.rental_sites[0].tier, 'pro');
});
test('next-period downgrade: requested by the member, applied when the renewal is confirmed, site redeployed as one page without pro', async () => {
  const w = world({ tier: 'pro', live: { ...base } });
  Object.assign(w.t.rental_sites[0], { layout: 'multi', pages: { about: true, menu: false, interior: true, news: true, faq: true, visit: true }, sections: { menu: true, interior: true, faq: true, news: true }, paid_until: '2026-11-14' });
  w.t.payments = [];
  assert.equal((await w.call(handleMember, { action: 'set_next', site_id: SID, next_layout: 'single', next_tier: 'basic' })).status, 200);
  assert.equal(w.t.rental_sites[0].next_layout, 'single'); assert.equal(w.t.rental_sites[0].layout, 'multi');
  assert.equal((await w.call(handleMember, { action: 'set_next', site_id: SID, next_layout: 'multi' })).status, 400);
  const c = await w.call(handleAdmin, { action: 'confirm_payment', site_id: SID, amount: 599, months: 1, paid_on: '2026-10-26' }, 'admin');
  assert.equal(c.status, 200);
  const s = w.t.rental_sites[0];
  assert.equal(s.layout, 'single'); assert.equal(s.tier, 'basic'); assert.equal(s.next_layout, null); assert.equal(s.next_tier, null); assert.equal(s.sections.menu, false);
  assert.equal(w.log.dispatches.at(-1).versionId, 'v1'); assert.ok(w.t.site_events.some((e) => e.type === 'plan_downgraded'));
  // 取消申請
  const w2 = world({ tier: 'pro', live: { ...base } });
  await w2.call(handleMember, { action: 'set_next', site_id: SID, next_tier: 'basic' });
  await w2.call(handleMember, { action: 'set_next', site_id: SID, next_tier: null });
  assert.equal(w2.t.rental_sites[0].next_tier, null);
});

test('inline scripts on a live page are valid JavaScript (calendar, shop, menu)', () => {
  const html = build({ bookingForm: true, bookingCal: CAL, shop: { enabled: true, items: [{ id: 'abcd1', name: 'x', price: 10 }] } }, { payReady: true }).html;
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 2);
  for (const s of scripts) assert.doesNotThrow(() => new Function(s));
});
