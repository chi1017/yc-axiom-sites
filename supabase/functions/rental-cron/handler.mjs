// 每日排程（到期提醒、逾期、自動暫停、暫停滿 30 天通知）與每週一管理員摘要。
// 所有外部依賴由 deps 注入，方便在 Node 內測試。呼叫方式只有兩種：
//   1. pg_cron（x-cron-secret 標頭 = CRON_SECRET）
//   2. 管理員（JWT app_metadata.role = admin，後台「排程模擬」面板）
// 原則：絕不刪除任何客戶資料；每條規則都先「佔位」（條件式更新記號／狀態）再動作，重跑不會重複寄信或重複暫停；
// 寄信失敗只記錄，不影響狀態變更與部署。
import { UUID, corsHeaders, parseOrigins, json } from '../_shared/http.mjs';
import { taipeiDate, isDateStr, addDays, diffDays, weekdayOf, firstOfMonth, prevMonthFirst } from '../_shared/dates.mjs';
import { customerReminder, customerOverdue, customerSuspended, adminSiteAlert, adminWeeklySummary } from '../_shared/emails.mjs';
import { planFor, priceFor, monthlyOf, PRO_ADDON } from '../_shared/plans.mjs';
// 提醒信上的續約費用（依網站目前的版型）
// 下一期有申請降級（next_layout／next_tier）時，用降級後的價格
export const renewText = (site) => { const layout = site.next_layout || site.layout, tier = site.next_tier || site.tier || 'basic'; return 'NT$ ' + monthlyOf(layout, tier).toLocaleString('en-US') + '／月（' + planFor(layout).name + (tier === 'pro' ? '＋' + PRO_ADDON.name : '') + '）；一次付 12 個月 NT$ ' + priceFor(layout, 12, tier).toLocaleString('en-US'); };
export { parseOrigins };

export const REMINDER_DAYS = 7;       // 到期前幾天（含）開始提醒
export const GRACE_DAYS = 7;          // 到期日之後的寬限天數（寬限最後一天是 到期日 + 7）
export const LONG_SUSPEND_DAYS = 30;  // 暫停滿幾天通知管理員
export const AUTO_REASON = '逾期未續約';
const MAX_SIM_DAYS = 400;             // 模擬日期與今天最多差這麼多天
const SOFT_DEADLINE_MS = 110000;      // Edge Function 時間上限前主動收尾，沒處理完的下一輪會接著做（記號保證不重複）

export const RULE_LABELS = {
  reminder: '寄「即將到期」提醒信給客戶',
  to_overdue: '狀態改為「已逾期」，並寄「已到期」通知給客戶',
  overdue_notice: '補寄「已到期」通知給客戶（狀態已是逾期但還沒通知）',
  auto_suspend: '自動暫停：部署維護頁，並通知客戶與管理員',
  long_suspend_notice: '通知管理員：已暫停滿 30 天（只通知，不刪除任何資料）',
  back_to_live: '到期日已在今天之後，狀態改回「上線中」',
  anomaly: '資料異常，需要人工檢查'
};

// 寬限期結束後的第一天：這天（含）以後仍未續約就暫停；停機很久才處理到時，至少給客戶一天
export const suspendDateOf = (paidUntil, today) => { const d = addDays(paidUntil, GRACE_DAYS + 1); const t = addDays(today, 1); return d > t ? d : t; };

/**
 * 純函式：這個網站「今天」該做什麼（不碰資料庫）。回傳規則陣列（最多一個）。
 * site: { status, paid_until, suspended_at, reminder_sent_for, overdue_notified_for, suspend_notified_for }
 */
export function planSite(site, today) {
  const pu = site.paid_until || null;
  if (site.status === 'live') {
    if (!pu) return [{ rule: 'anomaly', detail: '狀態是上線中但沒有到期日（paid_until）' }];
    if (pu < today) return [{ rule: 'to_overdue', detail: '到期日 ' + pu + ' 已過 ' + diffDays(pu, today) + ' 天' }];
    const left = diffDays(today, pu);
    if (left <= REMINDER_DAYS && site.reminder_sent_for !== pu) return [{ rule: 'reminder', daysLeft: left, detail: '到期日 ' + pu + '，剩 ' + left + ' 天' }];
    return [];
  }
  if (site.status === 'overdue') {
    if (!pu) return [{ rule: 'anomaly', detail: '狀態是已逾期但沒有到期日（paid_until）' }];
    if (pu >= today) return [{ rule: 'back_to_live', detail: '到期日 ' + pu + ' 還沒到' }];
    if (pu < addDays(today, -GRACE_DAYS)) return [{ rule: 'auto_suspend', detail: '逾期 ' + diffDays(pu, today) + ' 天，超過 ' + GRACE_DAYS + ' 天寬限' }];
    if (site.overdue_notified_for !== pu) return [{ rule: 'overdue_notice', detail: '逾期 ' + diffDays(pu, today) + ' 天，尚未寄過通知' }];
    return [];
  }
  if (site.status === 'suspended' && site.suspended_at) {
    const since = taipeiDate(new Date(site.suspended_at));
    const days = diffDays(since, today);
    if (days >= LONG_SUSPEND_DAYS && site.suspend_notified_for !== since) return [{ rule: 'long_suspend_notice', days, since, detail: '已暫停 ' + days + ' 天（自 ' + since + '）' }];
  }
  return [];
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const SITE_COLS = 'id,member_id,slug,status,layout,tier,next_layout,next_tier,paid_until,suspended_at,suspend_reason,reminder_sent_for,overdue_notified_for,suspend_notified_for,cf_project_name,public_url,shop_name:content->>name';
const shopOf = (s) => s.shop_name || s.slug;
const enc = encodeURIComponent;

/**
 * deps: {
 *   allowedOrigins: string[], cronSecret: string, adminEmail: string, dashboardUrl?: string, adminUrl?: string,
 *   getUser(token) → {id,email,isAdmin}|null,
 *   db: { getOne, list, patchReturning, insert, remove },
 *   sendMail({to,subject,html,text}) → {ok,error?},
 *   dispatch({siteId,versionId?,mode?}) → {ok,error?},
 *   now?: () => Date
 * }
 * body: { job?: 'daily'|'weekly', dry_run?: boolean, as_of?: 'YYYY-MM-DD', site_id?: uuid }
 */
export async function handleCron(req, deps) {
  const cors = corsHeaders(req, deps.allowedOrigins);
  const reply = (b, s) => json(b, s, cors);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed', message: '不支援的請求方式' }, 405);
  const origin = req.headers.get('origin') || '';
  if (origin && !deps.allowedOrigins.includes(origin)) return reply({ error: 'forbidden_origin', message: '來源不被允許' }, 403);

  // 身分：排程密碼，或管理員登入
  let caller = null;
  if (safeEqual(req.headers.get('x-cron-secret') || '', deps.cronSecret || '')) caller = 'cron';
  else {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const user = token ? await deps.getUser(token).catch(() => null) : null;
    if (!user || !user.id) return reply({ error: 'unauthorized', message: '請先登入' }, 401);
    if (!user.isAdmin) return reply({ error: 'forbidden', message: '只有管理員可以使用' }, 403);
    caller = user.email || user.id;
  }

  let body = {};
  try { const t = await req.text(); if (t.length > 2000) throw new Error('too big'); body = t.trim() ? JSON.parse(t) : {}; } catch { return reply({ error: 'bad_request', message: '請求格式不正確' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'bad_request', message: '請求格式不正確' }, 400);
  const job = body.job == null ? 'daily' : body.job;
  if (!['daily', 'weekly'].includes(job)) return reply({ error: 'bad_request', message: '不支援的 job' }, 400);
  const dryRun = body.dry_run === true;
  if (body.dry_run != null && typeof body.dry_run !== 'boolean') return reply({ error: 'bad_request', message: 'dry_run 必須是 true／false' }, 400);
  if (body.site_id != null && (typeof body.site_id !== 'string' || !UUID.test(body.site_id))) return reply({ error: 'bad_request', message: '網站編號格式不正確' }, 400);

  const now = (deps.now || (() => new Date()))();
  const realToday = taipeiDate(now);
  let today = realToday, simulated = false;
  if (body.as_of != null) {
    if (!isDateStr(body.as_of)) return reply({ error: 'bad_request', message: '模擬日期格式不正確（YYYY-MM-DD）' }, 400);
    if (Math.abs(diffDays(realToday, body.as_of)) > MAX_SIM_DAYS) return reply({ error: 'bad_request', message: '模擬日期離今天太遠（最多 ' + MAX_SIM_DAYS + ' 天）' }, 400);
    today = body.as_of; simulated = body.as_of !== realToday;
  }
  // 安全閥：用假日期「實際執行」時只能針對單一網站，避免誤對所有真實客戶寄信、暫停
  if (simulated && !dryRun && job === 'daily' && !body.site_id) return reply({ error: 'site_required', message: '用模擬日期實際執行時，必須指定單一網站（避免誤對真實客戶寄信或暫停）' }, 400);
  // 模擬時間點：09:00（台灣）
  const clock = simulated ? new Date(today + 'T01:00:00Z') : now;

  const { db } = deps;
  const by = 'system';
  const ctx = { deps, db, today, simulated, clock, caller, siteFilter: body.site_id || null };
  const out = { ok: true, job, mode: dryRun ? 'dry_run' : (simulated ? 'simulated' : 'real'), today, as_of: simulated ? today : null, errors: [] };

  try {
    if (job === 'daily') {
      const q = 'select=' + SITE_COLS + '&status=in.(live,overdue,suspended)' + (ctx.siteFilter ? '&id=eq.' + ctx.siteFilter : '') + '&order=created_at.asc&limit=1000';
      const sites = await db.list('rental_sites', q);
      const planned = [];
      for (const s of sites) for (const p of planSite(s, today)) planned.push({ site: s, ...p });
      out.counts = { sites: sites.length, planned: planned.length };
      if (dryRun) {
        out.planned = planned.map((p) => view(p));
      } else {
        out.results = [];
        const t0 = Date.now();
        for (const p of planned) {
          if (Date.now() - t0 > SOFT_DEADLINE_MS) { out.truncated = true; break; }
          let r;
          try { r = await runRule(ctx, p); } catch (e) { r = { outcome: 'failed', detail: String(e && e.message ? e.message : e).slice(0, 200) }; out.errors.push(p.site.slug + '：' + r.detail); }
          out.results.push({ ...view(p), outcome: r.outcome, note: r.note || r.detail || '' });
        }
        await db.insert('cron_runs', { job: 'daily', run_date: today, mode: simulated ? 'simulated' : 'real', triggered_by: caller, summary: { counts: out.counts, results: out.results.map((x) => ({ slug: x.slug, rule: x.rule, outcome: x.outcome })), errors: out.errors, truncated: !!out.truncated } }).catch(() => {});
      }
    }

    // 每週一（台灣）順便寄管理員摘要；job=weekly 則隨時可手動寄。指定單一網站的模擬不寄。
    const weeklyDue = job === 'weekly' || (job === 'daily' && weekdayOf(today) === 1 && !ctx.siteFilter);
    if (weeklyDue) out.weekly = await runWeekly(ctx, { dryRun, force: job === 'weekly' });
  } catch (e) {
    return reply({ ...out, ok: false, error: 'server_error', message: '排程執行失敗：' + String(e && e.message ? e.message : e).slice(0, 200) }, 500);
  }
  return reply(out, 200);
}

const view = (p) => ({ site_id: p.site.id, slug: p.site.slug, shop_name: shopOf(p.site), status: p.site.status, paid_until: p.site.paid_until, rule: p.rule, label: RULE_LABELS[p.rule] || p.rule, detail: p.detail || '' });

// ───────────────────────── 執行單一規則 ─────────────────────────
async function runRule(ctx, p) {
  const { db, deps, today, simulated } = ctx;
  const site = p.site;
  const event = (type, detail) => db.insert('site_events', { site_id: site.id, type, detail: { by: 'system', ...(simulated ? { simulated_as_of: today } : {}), ...detail } }).catch(() => {});
  const memberEmail = async () => { const m = await db.getOne('members', 'id=eq.' + enc(site.member_id) + '&select=email').catch(() => null); return m && m.email ? m.email : ''; };
  const dash = deps.dashboardUrl || '';

  // 先佔位（條件式更新記號），再寄信；寄信失敗就放掉佔位，下一輪重試。回傳 'sent'｜'skipped'（別人已處理）｜'failed'
  async function claimAndMail({ claimQuery, claimBody, releaseBody, to, build, template }) {
    const claimed = await db.patchReturning('rental_sites', claimQuery, claimBody);
    if (!claimed.length) return 'skipped';
    let r;
    try {
      if (!to) r = { ok: false, error: '找不到收件人 Email' };
      else r = await deps.sendMail({ to, ...build() });
    } catch (e) { r = { ok: false, error: String(e && e.message ? e.message : e) }; }
    if (r && r.ok) { await event('email_sent', { template }); return 'sent'; }
    await db.patchReturning('rental_sites', 'id=eq.' + site.id, releaseBody).catch(() => {});
    await event('email_failed', { template, error: String((r && r.error) || 'unknown').slice(0, 200) });
    return 'failed';
  }
  const mailNote = (s) => (s === 'sent' ? '已寄出' : s === 'skipped' ? '已有人處理，略過' : '寄信失敗（已記錄，明天會重試）');

  switch (p.rule) {
    case 'anomaly':
      await event('cron_anomaly', { message: p.detail });
      return { outcome: 'failed', detail: p.detail };

    case 'back_to_live': {
      const rows = await db.patchReturning('rental_sites', 'id=eq.' + site.id + '&status=eq.overdue&paid_until=gte.' + today, { status: 'live' });
      if (!rows.length) return { outcome: 'skipped', note: '狀態已被其他操作改變' };
      await event('auto_live', { paid_until: site.paid_until });
      return { outcome: 'done', note: '已改回上線中' };
    }

    case 'reminder': {
      const pu = site.paid_until;
      const s = await claimAndMail({
        claimQuery: 'id=eq.' + site.id + '&status=eq.live&paid_until=eq.' + pu + '&or=(reminder_sent_for.is.null,reminder_sent_for.neq.' + pu + ')',
        claimBody: { reminder_sent_for: pu }, releaseBody: { reminder_sent_for: null },
        to: await memberEmail(), template: 'customerReminder',
        build: () => customerReminder({ shopName: shopOf(site), paidUntil: pu, daysLeft: p.daysLeft, dashboardUrl: dash, priceText: renewText(site) })
      });
      if (s === 'sent') await event('reminder_sent', { paid_until: pu, days_left: p.daysLeft });
      return { outcome: s === 'failed' ? 'failed' : s === 'skipped' ? 'skipped' : 'done', note: mailNote(s) };
    }

    case 'to_overdue':
    case 'overdue_notice': {
      const pu = site.paid_until;
      if (p.rule === 'to_overdue') {
        const rows = await db.patchReturning('rental_sites', 'id=eq.' + site.id + '&status=eq.live&paid_until=lt.' + today, { status: 'overdue' });
        if (!rows.length) return { outcome: 'skipped', note: '狀態已被其他操作改變' };
        await event('auto_overdue', { paid_until: pu });
      }
      const s = await claimAndMail({
        claimQuery: 'id=eq.' + site.id + '&status=eq.overdue&paid_until=eq.' + pu + '&or=(overdue_notified_for.is.null,overdue_notified_for.neq.' + pu + ')',
        claimBody: { overdue_notified_for: pu }, releaseBody: { overdue_notified_for: null },
        to: await memberEmail(), template: 'customerOverdue',
        build: () => customerOverdue({ shopName: shopOf(site), paidUntil: pu, suspendOn: suspendDateOf(pu, today), dashboardUrl: dash })
      });
      const base = p.rule === 'to_overdue' ? '已改為逾期；' : '';
      return { outcome: s === 'failed' ? 'failed' : 'done', note: base + '通知信：' + mailNote(s) };
    }

    case 'auto_suspend': {
      const rows = await db.patchReturning('rental_sites', 'id=eq.' + site.id + '&status=eq.overdue&paid_until=lt.' + addDays(today, -GRACE_DAYS),
        { status: 'suspended', suspended_at: ctx.clock.toISOString(), suspend_reason: AUTO_REASON });
      if (!rows.length) return { outcome: 'skipped', note: '狀態已被其他操作改變（可能剛收款）' };
      await event('suspended', { auto: true, reason: AUTO_REASON, status_from: 'overdue', paid_until: site.paid_until });
      const notes = ['已暫停'];
      // 維護頁部署：失敗只記錄（管理員可在詳情按「重新發佈」）
      const d = await deps.dispatch({ siteId: site.id, mode: 'maintenance' }).catch((e) => ({ ok: false, error: String(e) }));
      if (d.ok) notes.push('已排入維護頁部署');
      else { await event('deploy_failed', { message: '無法啟動部署：' + String(d.error || '').slice(0, 200), mode: 'maintenance' }); notes.push('維護頁沒有啟動（請到後台按重新發佈）'); }
      // 通知客戶、管理員：失敗只記錄
      const sendOne = async (to, tpl, template) => {
        let r;
        try { r = to ? await deps.sendMail({ to, ...tpl }) : { ok: false, error: '找不到收件人 Email' }; } catch (e) { r = { ok: false, error: String(e && e.message ? e.message : e) }; }
        await event(r && r.ok ? 'email_sent' : 'email_failed', { template, ...(r && r.ok ? {} : { error: String((r && r.error) || 'unknown').slice(0, 200) }) });
        return !!(r && r.ok);
      };
      const mEmail = await memberEmail();
      const c = await sendOne(mEmail, customerSuspended({ shopName: shopOf(site), reason: AUTO_REASON, dashboardUrl: dash }), 'customerSuspended');
      const a = await sendOne(deps.adminEmail, adminSiteAlert({ kind: 'auto_suspended', shopName: shopOf(site), slug: site.slug, memberEmail: mEmail, paidUntil: site.paid_until, reason: AUTO_REASON, since: today, adminUrl: deps.adminUrl }), 'adminAutoSuspended');
      notes.push('客戶信' + (c ? '已寄出' : '失敗') + '、管理員信' + (a ? '已寄出' : '失敗'));
      return { outcome: 'done', note: notes.join('；') };
    }

    case 'long_suspend_notice':
      return await longSuspend(ctx, p, event, memberEmail);
  }
  return { outcome: 'skipped', note: '未知規則' };
}

// 暫停滿 30 天：只通知管理員（一次）。獨立成函式是因為信件內容需要先查客戶 Email。
async function longSuspend(ctx, p, event, memberEmail) {
  const { db, deps } = ctx, site = p.site;
  const claimed = await db.patchReturning('rental_sites', 'id=eq.' + site.id + '&status=eq.suspended&or=(suspend_notified_for.is.null,suspend_notified_for.neq.' + p.since + ')', { suspend_notified_for: p.since });
  if (!claimed.length) return { outcome: 'skipped', note: '已通知過或狀態已改變' };
  const mail = adminSiteAlert({ kind: 'long_suspended', shopName: shopOf(site), slug: site.slug, memberEmail: await memberEmail(), paidUntil: site.paid_until, reason: site.suspend_reason, since: p.since, days: p.days, adminUrl: deps.adminUrl });
  let r;
  try { r = await deps.sendMail({ to: deps.adminEmail, ...mail }); } catch (e) { r = { ok: false, error: String(e && e.message ? e.message : e) }; }
  if (r && r.ok) { await event('email_sent', { template: 'adminLongSuspended' }); await event('long_suspend_notified', { since: p.since, days: p.days }); return { outcome: 'done', note: '已通知管理員' }; }
  await db.patchReturning('rental_sites', 'id=eq.' + site.id, { suspend_notified_for: null }).catch(() => {});
  await event('email_failed', { template: 'adminLongSuspended', error: String((r && r.error) || 'unknown').slice(0, 200) });
  return { outcome: 'failed', note: '寄信失敗（已記錄，明天會重試）' };
}

// ───────────────────────── 每週一管理員摘要 ─────────────────────────
const fmtDate = (iso) => taipeiDate(new Date(iso));
const trunc = (s, n) => String(s == null ? '' : s).slice(0, n);

export async function collectWeekly({ db, today, clock }) {
  const iso = (days) => new Date(clock.getTime() - days * 86400000).toISOString();
  const sites = await db.list('rental_sites', 'select=' + SITE_COLS + '&order=created_at.asc&limit=2000');
  const byId = new Map(sites.map((s) => [s.id, s]));
  const name = (s) => shopOf(s) + '（' + s.slug + '）';
  const counts = {};
  for (const s of sites) counts[s.status] = (counts[s.status] || 0) + 1;

  const sections = [];
  const live = sites.filter((s) => s.status === 'live' && s.paid_until);
  sections.push({ title: '7 天內到期', items: live.map((s) => ({ s, left: diffDays(today, s.paid_until) })).filter((x) => x.left >= 0 && x.left <= 7).sort((a, b) => a.left - b.left).map((x) => name(x.s) + ' 到期 ' + x.s.paid_until + '（剩 ' + x.left + ' 天）') });
  sections.push({ title: '已逾期（寬限中）', items: sites.filter((s) => s.status === 'overdue' && s.paid_until).map((s) => name(s) + ' 逾期 ' + diffDays(s.paid_until, today) + ' 天，寬限至 ' + addDays(s.paid_until, GRACE_DAYS)) });

  const [susEv, deployEv, mailEv, rep, pendEv] = await Promise.all([
    db.list('site_events', 'type=eq.suspended&created_at=gte.' + enc(iso(7)) + '&select=site_id,created_at,detail&order=created_at.desc&limit=200'),
    db.list('site_events', 'type=in.(deploy_ok,deploy_failed)&created_at=gte.' + enc(iso(30)) + '&select=site_id,type,created_at,detail&order=created_at.desc&limit=1000'),
    db.list('site_events', 'type=eq.email_failed&created_at=gte.' + enc(iso(7)) + '&select=site_id,created_at,detail&order=created_at.desc&limit=200'),
    db.list('site_reports', 'month=gte.' + prevMonthFirst(firstOfMonth(today)) + '&select=site_id,month,status,error&limit=2000'),
    db.list('site_events', 'type=eq.published_first&select=site_id,created_at&order=created_at.desc&limit=1000')
  ]);
  sections.push({ title: '本週自動暫停', items: susEv.filter((e) => e.detail && e.detail.auto && byId.has(e.site_id)).map((e) => name(byId.get(e.site_id)) + ' 於 ' + fmtDate(e.created_at) + ' 暫停（' + trunc(e.detail.reason, 40) + '）') });
  sections.push({ title: '已暫停滿 ' + LONG_SUSPEND_DAYS + ' 天，待你決定', items: sites.filter((s) => s.status === 'suspended' && s.suspended_at && diffDays(fmtDate(s.suspended_at), today) >= LONG_SUSPEND_DAYS).map((s) => name(s) + ' 已暫停 ' + diffDays(fmtDate(s.suspended_at), today) + ' 天') });
  const latestDeploy = new Map();
  for (const e of deployEv) if (!latestDeploy.has(e.site_id)) latestDeploy.set(e.site_id, e);
  sections.push({ title: '最近一次部署失敗', items: [...latestDeploy.values()].filter((e) => e.type === 'deploy_failed' && byId.has(e.site_id)).map((e) => name(byId.get(e.site_id)) + ' ' + fmtDate(e.created_at) + '：' + trunc(e.detail && e.detail.message, 80)) });
  sections.push({ title: '寄信失敗（近 7 天）', items: mailEv.filter((e) => byId.has(e.site_id)).map((e) => name(byId.get(e.site_id)) + ' ' + fmtDate(e.created_at) + ' ' + trunc(e.detail && e.detail.template, 30) + '：' + trunc(e.detail && e.detail.error, 60)) });
  const okKeys = new Set(rep.filter((r) => r.status === 'ok').map((r) => r.site_id + '|' + r.month));
  sections.push({ title: '月報檢測失敗（本月與上月）', items: rep.filter((r) => r.status === 'failed' && !okKeys.has(r.site_id + '|' + r.month) && byId.has(r.site_id)).map((r) => name(byId.get(r.site_id)) + ' ' + String(r.month).slice(0, 7) + '：' + trunc(r.error, 80)) });
  const firstPub = new Map();
  for (const e of pendEv) if (!firstPub.has(e.site_id)) firstPub.set(e.site_id, e.created_at);
  sections.push({ title: '待上線超過 3 天還沒處理', items: sites.filter((s) => s.status === 'pending' && firstPub.has(s.id) && new Date(firstPub.get(s.id)).getTime() <= clock.getTime() - 3 * 86400000).map((s) => name(s) + ' 申請已 ' + Math.floor((clock.getTime() - new Date(firstPub.get(s.id)).getTime()) / 86400000) + ' 天') });
  return { today, counts, sections };
}

async function runWeekly(ctx, { dryRun, force }) {
  const { db, deps, today, simulated, caller } = ctx;
  const data = await collectWeekly({ db, today, clock: ctx.clock });
  const summary = { sections: data.sections.map((s) => ({ title: s.title, count: s.items.length })), counts: data.counts };
  if (dryRun) return { would_send: true, ...summary };
  const mode = simulated ? 'simulated' : 'real';
  // 真實執行才用唯一索引防止同一天重複寄；模擬／手動 job=weekly 的失敗要能重試，所以失敗時把佔位刪掉
  let claimed = false;
  if (!simulated) {
    try { await db.insert('cron_runs', { job: 'weekly', run_date: today, mode, triggered_by: caller, summary: { status: 'sending' } }); claimed = true; }
    catch (e) { if (/409|23505|duplicate/i.test(String(e && e.message))) return { sent: false, skipped: true, note: '今天已經寄過週摘要' }; throw e; }
  }
  let r;
  try { r = await deps.sendMail({ to: deps.adminEmail, ...adminWeeklySummary({ ...data, adminUrl: deps.adminUrl }) }); } catch (e) { r = { ok: false, error: String(e && e.message ? e.message : e) }; }
  if (r && r.ok) {
    if (claimed) await db.patchReturning('cron_runs', 'job=eq.weekly&run_date=eq.' + today + '&mode=eq.real', { summary }).catch(() => {});
    else await db.insert('cron_runs', { job: 'weekly', run_date: today, mode, triggered_by: caller, summary }).catch(() => {});
    return { sent: true, ...summary };
  }
  if (claimed) await db.remove('cron_runs', 'job=eq.weekly&run_date=eq.' + today + '&mode=eq.real').catch(() => {});
  return { sent: false, error: trunc((r && r.error) || 'unknown', 200), ...summary };
}
