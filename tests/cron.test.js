import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCron, planSite, suspendDateOf, GRACE_DAYS } from '../supabase/functions/rental-cron/handler.mjs';
import { taipeiDate as adminTaipeiDate } from '../supabase/functions/admin-site/handler.mjs';
import { taipeiDate, addDays, diffDays, weekdayOf, prevMonthFirst, firstOfMonth, isDateStr } from '../supabase/functions/_shared/dates.mjs';
import { parseOrigins } from '../supabase/functions/_shared/http.mjs';
import * as emails from '../supabase/functions/_shared/emails.mjs';
import { makeFakeDb } from './helpers/fakedb.js';

const ORIGIN = 'https://chi1017.github.io';
const SECRET = 'test-cron-secret-0123456789';
const ADMIN = 'ycaxiom@gmail.com';
const TUE = new Date('2026-10-20T01:00:00Z');   // 台灣 2026-10-20（週二）09:00
const MON = new Date('2026-10-19T01:00:00Z');   // 台灣 2026-10-19（週一）09:00
const uid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

function site(n, over = {}) {
  return { id: uid(n), member_id: 'm' + n, slug: 'shop-' + n, status: 'live', content: { name: '店' + n }, paid_until: '2026-11-30', cf_project_name: 'shop-' + n, public_url: 'https://shop-' + n + '.pages.dev/',
    suspended_at: null, suspend_reason: null, reminder_sent_for: null, overdue_notified_for: null, suspend_notified_for: null, ...over };
}

function setup({ now = TUE, sites = [], mailOk = true, mailThrow = false, dispatchOk = true, user = { id: 'u', email: ADMIN, isAdmin: true } } = {}) {
  const clock = { iso: now.toISOString() };
  const db = makeFakeDb(clock);
  sites.forEach((s) => { db.tables.rental_sites.push(s); db.tables.members.push({ id: s.member_id, email: s.member_id + '@example.com' }); });
  const log = { mails: [], dispatches: [] };
  const state = { now, mailOk, mailThrow, dispatchOk };
  const deps = {
    allowedOrigins: parseOrigins(), cronSecret: SECRET, adminEmail: ADMIN, dashboardUrl: 'https://chi1017.github.io/yc-axiom-site/dashboard/', adminUrl: 'https://chi1017.github.io/yc-axiom-site/admin/',
    db, now: () => state.now,
    getUser: async (tok) => (tok === 'good' ? user : null),
    sendMail: async (m) => { if (state.mailThrow) throw new Error('network down'); log.mails.push(m); return state.mailOk ? { ok: true } : { ok: false, error: 'brevo 401' }; },
    dispatch: async (a) => { log.dispatches.push(a); return state.dispatchOk ? { ok: true } : { ok: false, error: 'github 404' }; }
  };
  const call = async (body = { job: 'daily' }, over = {}) => {
    const headers = over.headers || { 'x-cron-secret': SECRET };
    clock.iso = state.now.toISOString();
    const res = await handleCron(new Request('https://x/functions/v1/rental-cron', { method: over.method || 'POST', headers: { 'content-type': 'application/json', ...headers }, ...((over.method || 'POST') === 'POST' ? { body: over.rawBody !== undefined ? over.rawBody : JSON.stringify(body) } : {}) }), deps);
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const get = (n) => db.tables.rental_sites.find((s) => s.id === uid(n));
  const events = (n, type) => db.tables.site_events.filter((e) => e.site_id === uid(n) && (!type || e.type === type));
  const to = (addr) => log.mails.filter((m) => m.to === addr);
  return { db, log, deps, state, call, get, events, to, clock };
}

// ───────────────────────── 純規則 ─────────────────────────
test('dates: Taiwan day matches admin-site; arithmetic across month/year/leap boundaries', () => {
  for (const iso of ['2026-10-19T15:59:59Z', '2026-10-19T16:00:00Z', '2026-12-31T16:00:00Z', '2028-02-28T16:30:00Z']) assert.equal(taipeiDate(new Date(iso)), adminTaipeiDate(new Date(iso)));
  assert.equal(taipeiDate(new Date('2026-10-19T16:00:00Z')), '2026-10-20');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01'); assert.equal(addDays('2028-02-28', 1), '2028-02-29'); assert.equal(addDays('2027-03-01', -1), '2027-02-28');
  assert.equal(diffDays('2026-12-27', '2027-01-02'), 6); assert.equal(diffDays('2026-10-20', '2026-10-13'), -7);
  assert.equal(weekdayOf('2026-10-19'), 1); assert.equal(weekdayOf('2026-10-20'), 2);
  assert.equal(prevMonthFirst('2026-01-15'), '2025-12-01'); assert.equal(firstOfMonth('2026-10-19'), '2026-10-01');
  assert.ok(isDateStr('2028-02-29')); assert.ok(!isDateStr('2027-02-29')); assert.ok(!isDateStr('2026-13-01')); assert.ok(!isDateStr('2026-1-1'));
});

test('planSite: reminder window boundaries (live)', () => {
  const T = '2026-10-20';
  const live = (pu, extra = {}) => ({ status: 'live', paid_until: pu, ...extra });
  assert.deepEqual(planSite(live('2026-10-28'), T), []);                                 // 剩 8 天：還不提醒
  assert.equal(planSite(live('2026-10-27'), T)[0].rule, 'reminder');                     // 剩 7 天
  assert.equal(planSite(live('2026-10-27'), T)[0].daysLeft, 7);
  assert.equal(planSite(live('2026-10-21'), T)[0].daysLeft, 1);
  assert.equal(planSite(live('2026-10-20'), T)[0].daysLeft, 0);                          // 今天是最後一天
  assert.equal(planSite(live('2026-10-19'), T)[0].rule, 'to_overdue');                   // 昨天到期 → 今天逾期
  assert.deepEqual(planSite(live('2026-10-27', { reminder_sent_for: '2026-10-27' }), T), []);          // 已提醒過
  assert.equal(planSite(live('2026-10-27', { reminder_sent_for: '2026-09-27' }), T)[0].rule, 'reminder'); // 記號是舊到期日（已續約過）→ 重新計算
  assert.equal(planSite(live('2027-01-02'), '2026-12-27')[0].daysLeft, 6);               // 跨年
});
test('planSite: overdue / grace / suspend boundaries', () => {
  const T = '2026-10-20';
  const od = (pu, extra = {}) => ({ status: 'overdue', paid_until: pu, ...extra });
  assert.equal(planSite(od('2026-10-19'), T)[0].rule, 'overdue_notice');                 // 逾期 1 天、未通知
  assert.deepEqual(planSite(od('2026-10-19', { overdue_notified_for: '2026-10-19' }), T), []);
  assert.equal(planSite(od('2026-10-13', { overdue_notified_for: '2026-10-13' }), T).length, 0);       // 到期後第 7 天（寬限最後一天）：還不暫停
  assert.equal(planSite(od('2026-10-12', { overdue_notified_for: '2026-10-12' }), T)[0].rule, 'auto_suspend'); // 到期後第 8 天：暫停
  assert.equal(planSite(od('2026-09-01'), T)[0].rule, 'auto_suspend');                   // 停機很久後：直接暫停
  assert.equal(planSite(od('2026-10-20'), T)[0].rule, 'back_to_live');
  assert.equal(planSite(od('2026-10-25'), T)[0].rule, 'back_to_live');
  assert.equal(suspendDateOf('2026-10-13', T), '2026-10-21');                            // 一般情況：到期日 + 8
  assert.equal(suspendDateOf('2026-09-01', T), '2026-10-21');                            // 已經超過寬限 → 至少明天
  assert.equal(GRACE_DAYS, 7);
});
test('planSite: suspended 30-day notice, other statuses untouched, anomalies flagged', () => {
  const T = '2026-11-18';
  const sus = (at, extra = {}) => ({ status: 'suspended', suspended_at: at, paid_until: '2026-10-01', ...extra });
  assert.deepEqual(planSite(sus('2026-10-20T01:00:00Z'), T), []);                        // 29 天
  assert.equal(planSite(sus('2026-10-20T01:00:00Z'), '2026-11-19')[0].rule, 'long_suspend_notice'); // 30 天
  assert.equal(planSite(sus('2026-10-20T01:00:00Z'), '2026-11-19')[0].days, 30);
  assert.deepEqual(planSite(sus('2026-10-20T01:00:00Z', { suspend_notified_for: '2026-10-20' }), '2026-12-30'), []); // 只通知一次
  assert.equal(planSite(sus('2026-10-20T01:00:00Z', { suspend_notified_for: '2026-08-01' }), '2026-11-19')[0].rule, 'long_suspend_notice'); // 新的一次暫停
  assert.deepEqual(planSite(sus(null), '2027-01-01'), []);
  assert.equal(planSite(sus('2026-10-19T16:30:00Z'), '2026-11-19')[0].days, 30);         // 暫停時間以台灣日期算（UTC 16:30 = 台灣隔天）
  for (const status of ['draft', 'pending', 'cancelled']) assert.deepEqual(planSite({ status, paid_until: '2020-01-01' }, T), []);
  assert.equal(planSite({ status: 'live', paid_until: null }, T)[0].rule, 'anomaly');
  assert.equal(planSite({ status: 'overdue', paid_until: null }, T)[0].rule, 'anomaly');
});

// ───────────────────────── 呼叫與驗證 ─────────────────────────
test('auth: cron secret or admin only; empty/wrong secret rejected; bad origin rejected', async () => {
  const s = setup({ sites: [site(1, { paid_until: '2026-10-27' })] });
  assert.equal((await s.call({}, { headers: {} })).status, 401);
  assert.equal((await s.call({}, { headers: { 'x-cron-secret': 'wrong' } })).status, 401);
  assert.equal((await s.call({}, { headers: { 'x-cron-secret': '' } })).status, 401);
  s.deps.cronSecret = '';                                                                 // 沒設定 CRON_SECRET：空標頭也不能通過
  assert.equal((await s.call({}, { headers: { 'x-cron-secret': '' } })).status, 401);
  s.deps.cronSecret = SECRET;
  assert.equal((await s.call({}, { headers: { authorization: 'Bearer bad' } })).status, 401);
  const nonAdmin = setup({ user: { id: 'u2', email: 'c@example.com', isAdmin: false }, sites: [site(1, { paid_until: '2026-10-27' })] });
  assert.equal((await nonAdmin.call({}, { headers: { authorization: 'Bearer good' } })).status, 403);
  assert.equal(nonAdmin.log.mails.length, 0); assert.equal(nonAdmin.db.stats.patches, 0);
  assert.equal((await s.call({}, { headers: { authorization: 'Bearer good', origin: ORIGIN } })).status, 200);
  assert.equal((await s.call({}, { headers: { authorization: 'Bearer good', origin: 'https://evil.example' } })).status, 403);
  assert.equal((await s.call({}, { method: 'GET' })).status, 405);
  const opt = await handleCron(new Request('https://x/', { method: 'OPTIONS', headers: { origin: ORIGIN } }), s.deps); assert.equal(opt.status, 204);
});
test('validation: job, dry_run, as_of, site_id, json; simulated real run needs one site', async () => {
  const s = setup({ sites: [site(1)] });
  const bad = async (body, raw) => (await s.call(body, raw === undefined ? {} : { rawBody: raw })).status;
  assert.equal(await bad({ job: 'monthly' }), 400);
  assert.equal(await bad({ dry_run: 'yes' }), 400);
  assert.equal(await bad({ as_of: '2026-02-30' }), 400);
  assert.equal(await bad({ as_of: '2026/10/20' }), 400);
  assert.equal(await bad({ as_of: '2030-01-01' }), 400);
  assert.equal(await bad({ site_id: 'nope' }), 400);
  assert.equal(await bad(null, '{oops'), 400);
  assert.equal(await bad(null, '[]'), 400);
  assert.equal(await bad(null, JSON.stringify({ pad: 'a'.repeat(3000) })), 400);
  const r = await s.call({ as_of: '2026-10-25' });                                         // 假日期＋實際執行＋沒指定網站
  assert.equal(r.status, 400); assert.equal(r.json.error, 'site_required');
  assert.equal(s.log.mails.length, 0); assert.equal(s.db.stats.patches, 0);
  assert.equal((await s.call({ as_of: '2026-10-25', dry_run: true })).status, 200);       // 預覽可以看全部
  assert.equal((await s.call({ as_of: '2026-10-25', site_id: uid(1) })).status, 200);     // 單一網站可以實際執行
  assert.equal((await s.call({})).status, 200);                                            // 沒有 body = daily
});

// ───────────────────────── 每日規則 ─────────────────────────
function lifecycleSites() {
  return [
    site(1, { paid_until: '2026-10-27' }),                                                 // A 剩 7 天 → 提醒
    site(2, { paid_until: '2026-10-28' }),                                                 // B 剩 8 天 → 不動
    site(3, { paid_until: '2026-10-19' }),                                                 // C 昨天到期 → 逾期＋通知
    site(4, { status: 'overdue', paid_until: '2026-10-12', overdue_notified_for: '2026-10-12' }),   // D 到期後第 8 天 → 自動暫停
    site(5, { status: 'overdue', paid_until: '2026-10-17' }),                              // E 逾期 3 天、沒通知過 → 補通知
    site(6, { status: 'suspended', suspended_at: '2026-09-20T02:00:00.000Z', suspend_reason: '逾期未續約', paid_until: '2026-09-10' }), // F 暫停滿 30 天 → 通知管理員
    site(7, { status: 'draft', paid_until: null }),
    site(8, { status: 'pending', paid_until: null }),
    site(9, { status: 'cancelled', paid_until: '2020-01-01' })
  ];
}

test('daily run: every rule fires exactly once, other sites untouched, nothing deleted', async () => {
  const s = setup({ sites: lifecycleSites() });
  const r = await s.call({ job: 'daily' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.mode, 'real'); assert.equal(r.json.today, '2026-10-20'); assert.equal(r.json.results.length, 5);
  assert.deepEqual(r.json.results.map((x) => x.rule).sort(), ['auto_suspend', 'long_suspend_notice', 'overdue_notice', 'reminder', 'to_overdue']);
  // A 提醒
  assert.equal(s.get(1).status, 'live'); assert.equal(s.get(1).reminder_sent_for, '2026-10-27');
  assert.equal(s.to('m1@example.com').length, 1); assert.match(s.to('m1@example.com')[0].subject, /即將到期/);
  assert.equal(s.events(1, 'reminder_sent').length, 1);
  // B 不動
  assert.equal(s.to('m2@example.com').length, 0); assert.equal(s.get(2).reminder_sent_for, null);
  // C 逾期
  assert.equal(s.get(3).status, 'overdue'); assert.equal(s.get(3).overdue_notified_for, '2026-10-19');
  assert.match(s.to('m3@example.com')[0].subject, /已到期/); assert.match(s.to('m3@example.com')[0].text, /2026-10-27/); // 暫停日 = 到期日 + 8
  assert.equal(s.events(3, 'auto_overdue').length, 1);
  // D 自動暫停
  assert.equal(s.get(4).status, 'suspended'); assert.equal(s.get(4).suspend_reason, '逾期未續約'); assert.equal(s.get(4).suspended_at, '2026-10-20T01:00:00.000Z');
  assert.deepEqual(s.log.dispatches, [{ siteId: uid(4), mode: 'maintenance' }]);
  assert.equal(s.to('m4@example.com').length, 1); assert.match(s.to('m4@example.com')[0].subject, /已暫停/);
  assert.ok(s.to(ADMIN).some((m) => /自動暫停/.test(m.subject) && /店4/.test(m.subject)));
  assert.equal(s.events(4, 'suspended')[0].detail.auto, true); assert.equal(s.events(4, 'suspended')[0].detail.by, 'system');
  // E 補通知
  assert.equal(s.get(5).status, 'overdue'); assert.equal(s.get(5).overdue_notified_for, '2026-10-17'); assert.equal(s.to('m5@example.com').length, 1);
  // F 暫停滿 30 天：只通知管理員
  assert.equal(s.get(6).suspend_notified_for, '2026-09-20'); assert.equal(s.to('m6@example.com').length, 0);
  assert.ok(s.to(ADMIN).some((m) => /暫停滿 30 天/.test(m.subject) && /店6/.test(m.subject)));
  assert.equal(s.get(6).status, 'suspended');
  // 草稿／待上線／已終止完全不動
  for (const n of [7, 8, 9]) assert.equal(s.events(n).length, 0);
  // 絕不刪除資料
  assert.equal(s.db.tables.rental_sites.length, 9); assert.equal(s.db.stats.removes, 0);
  // 寄信總數：A1 C1 D(客戶+管理員)2 E1 F(管理員)1 = 6
  assert.equal(s.log.mails.length, 6);
  assert.equal(s.db.tables.cron_runs.filter((x) => x.job === 'daily').length, 1);
});

test('re-running the same day, and the following days, never repeats mails, suspensions or deploys', async () => {
  const s = setup({ sites: lifecycleSites() });
  await s.call({ job: 'daily' });
  const mails = s.log.mails.length, disp = s.log.dispatches.length, evs = s.db.tables.site_events.length;
  const again = await s.call({ job: 'daily' });                                              // 同一天重跑（例如 cron 與手動各一次）
  assert.equal(again.json.results.length, 0); assert.equal(s.log.mails.length, mails); assert.equal(s.log.dispatches.length, disp); assert.equal(s.db.tables.site_events.length, evs);
  for (let d = 1; d <= 5; d++) {                                                              // 之後幾天：A 不再提醒；C 在寬限內不再通知
    s.state.now = new Date(TUE.getTime() + d * 86400000);
    const r = await s.call({ job: 'daily' });
    const rules = r.json.results.map((x) => x.slug + ':' + x.rule);
    assert.ok(!rules.includes('shop-1:reminder'), 'day+' + d + ' ' + rules);
    assert.ok(!rules.includes('shop-4:auto_suspend') && !rules.includes('shop-6:long_suspend_notice'));
  }
  assert.equal(s.to('m1@example.com').length, 1);
  assert.equal(s.to('m4@example.com').length, 1);
  assert.equal(s.log.dispatches.filter((d) => d.siteId === uid(4)).length, 1);
});

test('payment moves paid_until forward → reminder cycle restarts; paying while overdue returns to live (back_to_live)', async () => {
  const s = setup({ sites: [site(1, { paid_until: '2026-10-27' }), site(2, { status: 'overdue', paid_until: '2026-10-18', overdue_notified_for: '2026-10-18' })] });
  await s.call({ job: 'daily' });
  assert.equal(s.to('m1@example.com').length, 1);
  s.get(1).paid_until = '2026-11-27';                                                        // 管理員確認收款（confirm_payment 只改 paid_until／status）
  s.state.now = new Date('2026-11-20T01:00:00Z');
  let r = await s.call({ job: 'daily' });
  assert.ok(r.json.results.some((x) => x.slug === 'shop-1' && x.rule === 'reminder'));        // 新的到期日 → 再提醒一次
  assert.equal(s.to('m1@example.com').length, 2);
  // 逾期網站被人工把到期日調回未來（Table Editor）：不會被暫停，而是回到上線中
  const s2 = setup({ sites: [site(2, { status: 'overdue', paid_until: '2026-10-10', overdue_notified_for: '2026-10-10' })] });
  s2.get(2).paid_until = '2026-12-01';
  r = await s2.call({ job: 'daily' });
  assert.equal(r.json.results[0].rule, 'back_to_live'); assert.equal(s2.get(2).status, 'live'); assert.equal(s2.log.dispatches.length, 0); assert.equal(s2.log.mails.length, 0);
});

test('dry run: reports the plan but changes nothing (no mail, patch, event, deploy, log)', async () => {
  const s = setup({ sites: lifecycleSites() });
  const before = JSON.stringify(s.db.tables);
  const r = await s.call({ job: 'daily', dry_run: true });
  assert.equal(r.status, 200); assert.equal(r.json.mode, 'dry_run'); assert.equal(r.json.planned.length, 5);
  assert.ok(r.json.planned.every((p) => p.label && p.slug && p.rule));
  assert.equal(JSON.stringify(s.db.tables), before);
  assert.equal(s.log.mails.length, 0); assert.equal(s.log.dispatches.length, 0); assert.equal(s.db.stats.patches, 0); assert.equal(s.db.stats.inserts, 0);
  const r2 = await s.call({ job: 'daily', dry_run: true, as_of: '2026-11-25' });              // 假日期預覽：會看到更多規則
  assert.equal(r2.json.today, '2026-11-25'); assert.ok(r2.json.planned.length >= 5);
  assert.equal(JSON.stringify(s.db.tables), before);
});

test('email failure (error response or exception) never blocks status change or deploy; marker released so next run retries', async () => {
  for (const mode of ['error', 'throw']) {
    const s = setup({ sites: lifecycleSites(), mailOk: mode !== 'error', mailThrow: mode === 'throw' });
    if (mode === 'error') s.state.mailOk = false;
    const r = await s.call({ job: 'daily' });
    assert.equal(r.status, 200);
    assert.equal(s.get(3).status, 'overdue');                                                 // 狀態照改
    assert.equal(s.get(4).status, 'suspended'); assert.equal(s.log.dispatches.length, 1);     // 暫停與維護頁照做
    assert.equal(s.get(1).reminder_sent_for, null); assert.equal(s.get(3).overdue_notified_for, null); assert.equal(s.get(6).suspend_notified_for, null); // 佔位已放掉
    assert.ok(s.events(1, 'email_failed').length === 1 && s.events(3, 'email_failed').length === 1 && s.events(4, 'email_failed').length === 2);
    assert.ok(!s.events(1, 'email_sent').length);
    // 信箱恢復後的下一輪：補寄（提醒／通知），不重複暫停
    s.state.mailOk = true; s.state.mailThrow = false; s.state.now = new Date(TUE.getTime() + 86400000);
    const r2 = await s.call({ job: 'daily' });
    assert.ok(r2.json.results.some((x) => x.slug === 'shop-1' && x.rule === 'reminder' && x.outcome === 'done'));
    assert.equal(s.get(1).reminder_sent_for, '2026-10-27'); assert.equal(s.get(3).overdue_notified_for, '2026-10-19');
    assert.equal(s.log.dispatches.length, 1);
    assert.ok(r2.json.errors.length === 0);
  }
});

test('member without an email: status still changes, email_failed logged, nothing crashes', async () => {
  const s = setup({ sites: [site(3, { paid_until: '2026-10-19' })] });
  s.db.tables.members.length = 0;
  const r = await s.call({ job: 'daily' });
  assert.equal(r.status, 200); assert.equal(s.get(3).status, 'overdue'); assert.equal(s.events(3, 'email_failed').length, 1); assert.equal(s.log.mails.length, 0);
});

test('maintenance deploy failure is logged but the suspension and the notices still happen', async () => {
  const s = setup({ sites: [site(4, { status: 'overdue', paid_until: '2026-10-12', overdue_notified_for: '2026-10-12' })], dispatchOk: false });
  const r = await s.call({ job: 'daily' });
  assert.equal(s.get(4).status, 'suspended'); assert.equal(s.events(4, 'deploy_failed').length, 1); assert.equal(s.events(4, 'deploy_failed')[0].detail.mode, 'maintenance');
  assert.equal(s.log.mails.length, 2); assert.match(r.json.results[0].note, /維護頁沒有啟動/);
});

test('race: payment arrives between listing and acting → rule is skipped, no mail, no suspension', async () => {
  const s = setup({ sites: [site(4, { status: 'overdue', paid_until: '2026-10-12', overdue_notified_for: '2026-10-12' }), site(1, { paid_until: '2026-10-27' }), site(3, { paid_until: '2026-10-19' })] });
  const realList = s.db.list.bind(s.db);
  s.db.list = async (t, q) => { const rows = await realList(t, q); if (t === 'rental_sites') { s.get(4).status = 'live'; s.get(4).paid_until = '2026-12-01'; s.get(1).paid_until = '2026-12-01'; s.get(3).status = 'live'; s.get(3).paid_until = '2026-12-01'; } return rows; };
  const r = await s.call({ job: 'daily' });
  assert.deepEqual(r.json.results.map((x) => x.outcome), ['skipped', 'skipped', 'skipped']);
  assert.equal(s.log.mails.length, 0); assert.equal(s.log.dispatches.length, 0); assert.equal(s.get(4).status, 'live');
});

test('concurrent duplicate runs (cron + manual button at the same time) send each mail once', async () => {
  const s = setup({ sites: lifecycleSites() });
  const [a, b] = await Promise.all([s.call({ job: 'daily' }), s.call({ job: 'daily' })]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(s.log.mails.length, 6); assert.equal(s.log.dispatches.length, 1);
  assert.equal(s.events(4, 'suspended').length, 1); assert.equal(s.events(1, 'reminder_sent').length, 1);
});

test('Taiwan date: 16:30 UTC is already the next Taiwan day', async () => {
  const s = setup({ now: new Date('2026-10-19T16:30:00Z'), sites: [site(1, { paid_until: '2026-10-20' }), site(3, { paid_until: '2026-10-19' })] });
  const r = await s.call({ job: 'daily', dry_run: true });
  assert.equal(r.json.today, '2026-10-20');
  assert.deepEqual(r.json.planned.map((p) => p.slug + ':' + p.rule).sort(), ['shop-1:reminder', 'shop-3:to_overdue']);
});

// ───────────────────────── 日期模擬（驗收用） ─────────────────────────
test('simulation: one test site walks reminder → overdue → suspended → 30-day notice; other sites untouched', async () => {
  const s = setup({ sites: [site(1, { paid_until: '2026-10-30' }), site(2, { paid_until: '2026-10-22' }), site(3, { paid_until: '2026-10-21' })] });
  const run = async (as_of) => (await s.call({ job: 'daily', as_of, site_id: uid(1) })).json;
  let r = await run('2026-10-22');                         // 離到期 8 天
  assert.equal(r.results.length, 0);
  r = await run('2026-10-23');                             // 剩 7 天
  assert.equal(r.mode, 'simulated'); assert.equal(r.results[0].rule, 'reminder'); assert.equal(s.get(1).reminder_sent_for, '2026-10-30');
  assert.equal(s.events(1, 'reminder_sent')[0].detail.simulated_as_of, '2026-10-23');
  r = await run('2026-10-31');                             // 到期後第 1 天
  assert.equal(r.results[0].rule, 'to_overdue'); assert.equal(s.get(1).status, 'overdue');
  r = await run('2026-11-06');                             // 到期後第 7 天：寬限最後一天
  assert.equal(r.results.length, 0); assert.equal(s.get(1).status, 'overdue');
  r = await run('2026-11-07');                             // 第 8 天 → 暫停
  assert.equal(r.results[0].rule, 'auto_suspend'); assert.equal(s.get(1).status, 'suspended'); assert.equal(s.get(1).suspended_at, '2026-11-07T01:00:00.000Z');
  assert.deepEqual(s.log.dispatches, [{ siteId: uid(1), mode: 'maintenance' }]);
  r = await run('2026-12-06');                             // 暫停第 29 天
  assert.equal(r.results.length, 0);
  r = await run('2026-12-07');                             // 暫停滿 30 天 → 只通知管理員
  assert.equal(r.results[0].rule, 'long_suspend_notice'); assert.equal(s.get(1).status, 'suspended');
  assert.equal(s.log.dispatches.length, 1);
  // 其他網站完全沒被動到
  for (const n of [2, 3]) { assert.equal(s.get(n).status, 'live'); assert.equal(s.events(n).length, 0); assert.equal(s.to('m' + n + '@example.com').length, 0); }
  // 模擬紀錄標示為 simulated
  assert.ok(s.db.tables.cron_runs.every((x) => x.mode === 'simulated'));
  assert.equal(s.db.tables.rental_sites.length, 3);
});

// ───────────────────────── 每週摘要 ─────────────────────────
test('weekly summary: sent on Monday with the daily run, only once per day, not on other days', async () => {
  const s = setup({ now: MON, sites: lifecycleSites() });
  s.get(6).suspended_at = '2026-09-10T02:00:00.000Z';   // 暫停超過 30 天
  s.db.tables.site_events.push({ id: 900, site_id: uid(4), type: 'deploy_failed', created_at: '2026-10-15T00:00:00.000Z', detail: { message: 'wrangler boom' } });
  s.db.tables.site_events.push({ id: 901, site_id: uid(1), type: 'email_failed', created_at: '2026-10-16T00:00:00.000Z', detail: { template: 'customerGoLive', error: 'brevo 401' } });
  s.db.tables.site_events.push({ id: 902, site_id: uid(8), type: 'published_first', created_at: '2026-10-10T00:00:00.000Z', detail: {} });
  s.db.tables.site_reports.push({ site_id: uid(2), month: '2026-10-01', status: 'failed', error: '網站打不開' });
  const r = await s.call({ job: 'daily' });
  assert.equal(r.json.weekly.sent, true);
  const summary = s.to(ADMIN).find((m) => /每週摘要/.test(m.subject));
  assert.ok(summary);
  for (const needle of ['7 天內到期', '店1', '已逾期', '店3', '已暫停滿 30 天', '店6', 'wrangler boom', 'customerGoLive', '網站打不開', '待上線超過 3 天', '店8']) assert.ok(summary.text.includes(needle), needle);
  assert.match(summary.text, /共 9 個網站/);
  const n = s.log.mails.length;
  const again = await s.call({ job: 'daily' });
  assert.equal(again.json.weekly.sent, false); assert.equal(again.json.weekly.skipped, true); assert.equal(s.log.mails.length, n);   // 同一天不重複
  const tue = setup({ now: TUE, sites: lifecycleSites() });
  assert.equal((await tue.call({ job: 'daily' })).json.weekly, undefined);                   // 非週一不寄
  const forced = await tue.call({ job: 'weekly' });                                           // 手動要求
  assert.equal(forced.json.weekly.sent, true);
});
test('weekly summary: failed send releases the claim so it can be retried; dry run sends nothing; empty week says so', async () => {
  const s = setup({ now: MON, sites: [site(1)], mailOk: false });
  let r = await s.call({ job: 'weekly' });
  assert.equal(r.json.weekly.sent, false); assert.equal(s.db.tables.cron_runs.filter((x) => x.job === 'weekly').length, 0);
  s.state.mailOk = true;
  r = await s.call({ job: 'weekly' });
  assert.equal(r.json.weekly.sent, true);
  assert.match(s.log.mails.at(-1).text, /本週沒有需要處理的事項/);
  const d = setup({ now: MON, sites: lifecycleSites() });
  r = await d.call({ job: 'weekly', dry_run: true });
  assert.equal(r.json.weekly.would_send, true); assert.equal(d.log.mails.length, 0); assert.equal(d.db.stats.inserts, 0);
});

// ───────────────────────── 信件範本 ─────────────────────────
test('email templates: contact info, add-to-contacts hint, HTML escaping, no stray undefined', () => {
  const evil = '<img src=x onerror=alert(1)>&"\'';
  const all = [
    emails.customerReminder({ shopName: evil, paidUntil: '2026-10-27', daysLeft: 7, dashboardUrl: 'https://chi1017.github.io/yc-axiom-site/dashboard/' }),
    emails.customerReminder({ shopName: '店', paidUntil: '2026-10-20', daysLeft: 0 }),
    emails.customerOverdue({ shopName: evil, paidUntil: '2026-10-19', suspendOn: '2026-10-27', dashboardUrl: 'https://x/' }),
    emails.customerSuspended({ shopName: evil, reason: '逾期未續約', dashboardUrl: 'https://x/' }),
    emails.customerMonthlyReport({ shopName: evil, url: 'https://a.pages.dev/', monthLabel: '2026 年 10 月', seo: 82, geo: 71, prevSeo: 80, prevGeo: null, issues: [{ title: evil, detail: 'd' }, { title: 'b' }, { title: 'c' }, { title: 'd4' }], dashboardUrl: 'https://x/' }),
    emails.adminSiteAlert({ kind: 'auto_suspended', shopName: evil, slug: 'a-b', memberEmail: 'c@example.com', paidUntil: '2026-10-12', reason: '逾期未續約', since: '2026-10-20', adminUrl: 'https://x/' }),
    emails.adminSiteAlert({ kind: 'long_suspended', shopName: '店', slug: 'a-b', memberEmail: '', paidUntil: '2026-10-12', since: '2026-09-20', days: 30 }),
    emails.adminWeeklySummary({ today: '2026-10-19', counts: { live: 2 }, sections: [{ title: 'x', items: [evil] }, { title: 'empty', items: [] }], adminUrl: 'https://x/' })
  ];
  for (const m of all) {
    assert.ok(m.subject && m.html && m.text);
    assert.ok(!/undefined|NaN|\[object/.test(m.html + m.text + m.subject), m.subject);
    assert.ok(!m.html.includes('<img src=x'), 'escaped: ' + m.subject);
  }
  for (const m of all.slice(0, 5)) { assert.match(m.text, /@788cblaq/); assert.match(m.text, /ycaxiom@gmail\.com/); assert.match(m.html, /ycaxiom@gmail\.com/); }
  for (const m of [all[0], all[2], all[3], all[4]]) assert.match(m.text, /加入你的聯絡人/);
  assert.match(all[4].text, /進步 2 分/); assert.match(all[4].text, /首次檢測/); assert.ok(!/4\. /.test(all[4].text));       // 最多 3 項建議
  assert.match(all[1].text, /今天/);
});
