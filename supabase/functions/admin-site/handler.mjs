// 管理員操作租用網站的 Edge Function 邏輯（確認收款、重新發佈、暫停／恢復、終止租用、永久刪除、還原版本、網域）。
// 所有外部依賴由 deps 注入，方便在 Node 內測試。只有 JWT app_metadata.role = admin 能呼叫；
// 每個動作都會在 site_events 留下紀錄（含操作者 Email）。
import { UUID, corsHeaders, parseOrigins, json } from '../_shared/http.mjs';
import { customerReceipt, customerCodeResult } from '../_shared/emails.mjs';
import { normalizeDomain, domainAction } from '../_shared/domain.mjs';
import { applyPayment } from '../_shared/payment.mjs';
export { normalizeDomain };
export { parseOrigins };

const MAX_MONTHS = 60;
const MAX_AMOUNT = 10000000;
const ACTIONS = ['confirm_payment', 'republish', 'suspend', 'restore', 'terminate', 'purge', 'restore_version', 'set_domain', 'check_domain', 'clear_domain', 'set_tier', 'review_code'];
const PHOTO_BUCKET = 'site-photos';

// 台灣日期（UTC+8）。到期日、「今天」都以台灣時間計算。
export function taipeiDate(d) { return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10); }
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
// 加月份；月底會往前收（1/31 + 1 個月 = 2/28）
export function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

/**
 * deps: {
 *   allowedOrigins: string[],
 *   getUser(token) → {id,email,isAdmin}|null,
 *   db: { getOne, patch, insert, insertReturning, list },
 *   sendMail({to,subject,html,text}) → {ok,error?},
 *   dispatch({siteId,versionId?,mode?}) → {ok,error?},
 *   cf?: { addDomain, getDomain, removeDomain, deleteProject },
 *   now?: () => Date
 * }
 */
export async function handleAdmin(req, deps) {
  const cors = corsHeaders(req, deps.allowedOrigins);
  const reply = (b, s) => json(b, s, cors);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed', message: '不支援的請求方式' }, 405);
  const origin = req.headers.get('origin') || '';
  if (origin && !deps.allowedOrigins.includes(origin)) return reply({ error: 'forbidden_origin', message: '來源不被允許' }, 403);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const user = token ? await deps.getUser(token).catch(() => null) : null;
  if (!user || !user.id) return reply({ error: 'unauthorized', message: '請先登入' }, 401);
  if (!user.isAdmin) return reply({ error: 'forbidden', message: '只有管理員可以使用' }, 403);

  let body;
  try { const t = await req.text(); if (t.length > 4000) throw new Error('too big'); body = JSON.parse(t); } catch { return reply({ error: 'bad_request', message: '請求格式不正確' }, 400); }
  if (!body || typeof body !== 'object') return reply({ error: 'bad_request', message: '請求格式不正確' }, 400);
  if (!ACTIONS.includes(body.action)) return reply({ error: 'bad_request', message: '不支援的動作' }, 400);
  if (typeof body.site_id !== 'string' || !UUID.test(body.site_id)) return reply({ error: 'bad_request', message: '缺少網站編號' }, 400);

  const { db } = deps;
  const now = (deps.now || (() => new Date()))();
  const today = taipeiDate(now);
  const siteId = body.site_id;
  const by = user.email || user.id;
  const site = await db.getOne('rental_sites', 'id=eq.' + siteId + '&select=*');
  if (!site) return reply({ error: 'not_found', message: '找不到這個網站' }, 404);
  const event = (type, detail) => db.insert('site_events', { site_id: siteId, type, detail: { ...detail, by } }).catch(() => {});
  const fail = (error, message, status = 400) => reply({ error, message }, status);

  // 排入部署；失敗時記錄 deploy_failed 並回報（資料狀態已更新的動作會說明）
  async function queueDeploy({ versionId, mode } = {}) {
    const d = await deps.dispatch({ siteId, versionId, mode }).catch((e) => ({ ok: false, error: String(e) }));
    if (!d.ok) await event('deploy_failed', { message: '無法啟動部署：' + String(d.error || '').slice(0, 200), ...(versionId ? { version_id: versionId } : {}), ...(mode ? { mode } : {}) });
    return d;
  }
  const latestVersion = async () => (await db.list('site_versions', 'site_id=eq.' + siteId + '&select=id&order=created_at.desc&limit=1'))[0] || null;
  const deployWarn = 'Actions 沒有啟動成功，請稍後在詳情按「重新發佈」。';

  switch (body.action) {
    case 'confirm_payment': {
      const amount = body.amount, months = body.months, paidOn = body.paid_on;
      const reference = body.reference == null ? '' : String(body.reference).trim();
      if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) return fail('bad_request', '金額必須是 1 到 ' + MAX_AMOUNT.toLocaleString('en-US') + ' 的整數（新台幣）');
      if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) return fail('bad_request', '月數必須是 1 到 ' + MAX_MONTHS + ' 的整數');
      if (reference.length > 100) return fail('bad_request', '匯款備註最長 100 字');
      if (!isDate(paidOn)) return fail('bad_request', '收款日格式不正確（YYYY-MM-DD）');
      if (Date.parse(paidOn + 'T00:00:00Z') > Date.parse(today + 'T00:00:00Z') + 86400000) return fail('bad_request', '收款日不能晚於明天');
      if (Date.parse(paidOn + 'T00:00:00Z') < Date.parse(today + 'T00:00:00Z') - 800 * 86400000) return fail('bad_request', '收款日太久以前，請確認');
      if (!['pending', 'live', 'overdue', 'suspended'].includes(site.status)) return fail('not_allowed', site.status === 'draft' ? '客戶還沒有送出上線申請' : '這個網站已終止服務，無法收款', 409);

      // 防止連點兩次造成重複入帳
      const since = new Date(now.getTime() - 60 * 1000).toISOString();
      const dup = await db.list('payments', 'site_id=eq.' + siteId + '&amount=eq.' + amount + '&paid_on=eq.' + paidOn + '&created_at=gte.' + encodeURIComponent(since) + '&select=id&limit=1');
      if (dup.length) return fail('duplicate', '1 分鐘內已有相同的收款紀錄，請勿重複送出', 409);

      const r = await applyPayment({ db, site, siteId, amount, months, method: 'bank_transfer', reference, paidOn, by, today, now, event, queueDeploy, sendMail: deps.sendMail, deployWarn });
      if (!r.ok) return fail(r.error, r.message, r.status || 500);
      return reply({ ok: true, status: r.status, paid_until: r.paidUntil, deploying: r.deploying, ...(r.warning ? { warning: r.warning } : {}), message: '已記錄收款，到期日 ' + r.paidUntil + (r.deploying ? '，正在部署（約 1–2 分鐘）。' : '。') + (r.warning ? ' ' + r.warning : '') }, 200);
    }

    case 'republish': {
      if (site.status === 'suspended') {
        const d = await queueDeploy({ mode: 'maintenance' });
        await event('republish_queued', { mode: 'maintenance' });
        return d.ok ? reply({ ok: true, message: '已重新部署維護頁。' }, 200) : fail('dispatch_failed', '沒有送出成功：' + deployWarn, 502);
      }
      if (!['live', 'overdue'].includes(site.status)) return fail('not_allowed', '只有上線中、已逾期或已暫停的網站可以重新發佈', 409);
      if (!site.live_version_id) return fail('no_version', '這個網站還沒有成功部署過的版本，請改用「收款」或請客戶發佈', 409);
      await event('republish_queued', { version_id: site.live_version_id });
      const d = await queueDeploy({ versionId: site.live_version_id });
      return d.ok ? reply({ ok: true, message: '已排入重新發佈，約 1–2 分鐘。' }, 200) : fail('dispatch_failed', '沒有送出成功：' + deployWarn, 502);
    }

    case 'suspend': {
      const reason = body.reason == null ? '' : String(body.reason).trim();
      if (reason.length > 200) return fail('bad_request', '原因最長 200 字');
      if (!['pending', 'live', 'overdue'].includes(site.status)) return fail('not_allowed', site.status === 'suspended' ? '這個網站已經是暫停狀態' : '這個狀態的網站不能暫停', 409);
      await db.patch('rental_sites', 'id=eq.' + siteId, { status: 'suspended', suspended_at: now.toISOString(), suspend_reason: reason || null });
      await event('suspended', { reason, status_from: site.status });
      const d = await queueDeploy({ mode: 'maintenance' });
      return reply({ ok: true, status: 'suspended', ...(d.ok ? {} : { warning: deployWarn }), message: d.ok ? '已暫停，維護頁約 1–2 分鐘後生效。' : '已暫停，但維護頁沒有啟動部署。' + deployWarn }, 200);
    }

    case 'restore': {
      if (!['suspended', 'cancelled'].includes(site.status)) return fail('not_allowed', '只有暫停中或已終止的網站可以恢復', 409);
      const statusFrom = site.status;
      const deployed = !!(site.live_version_id && site.cf_project_name);
      const status = !deployed ? 'pending' : (site.paid_until && site.paid_until >= today ? 'live' : 'overdue');
      await db.patch('rental_sites', 'id=eq.' + siteId, { status, suspended_at: null, suspend_reason: null });
      await event('restored', { status_to: status, status_from: statusFrom });
      if (!deployed) return reply({ ok: true, status, message: '已恢復為「待上線」（這個網站還沒有部署過）。' }, 200);
      const d = await queueDeploy({ versionId: site.live_version_id });
      return reply({ ok: true, status, ...(d.ok ? {} : { warning: deployWarn }), message: d.ok ? '已恢復為「' + status + '」，網站約 1–2 分鐘後回來。' : '已恢復，但部署沒有啟動。' + deployWarn }, 200);
    }

    // 終止租用：網站改成「已終止」，網址換成「已停止服務」頁；資料（草稿、版本、照片、收款紀錄）全部保留，可以再按「恢復」。
    case 'terminate': {
      const reason = body.reason == null ? '' : String(body.reason).trim();
      if (reason.length > 200) return fail('bad_request', '原因最長 200 字');
      if (!['pending', 'live', 'overdue', 'suspended'].includes(site.status)) return fail('not_allowed', site.status === 'cancelled' ? '這個網站已經是終止狀態' : '這個狀態的網站不能終止', 409);
      const statusFrom = site.status;
      await db.patch('rental_sites', 'id=eq.' + siteId, { status: 'cancelled', suspended_at: null, suspend_reason: null });
      await event('terminated', { reason, status_from: statusFrom });
      if (!site.cf_project_name) return reply({ ok: true, status: 'cancelled', message: '已終止（這個網站還沒有部署過，沒有網址需要下線）。' }, 200);
      const d = await queueDeploy({ mode: 'closed' });
      return reply({ ok: true, status: 'cancelled', ...(d.ok ? {} : { warning: deployWarn }), message: d.ok ? '已終止，「已停止服務」頁約 1–2 分鐘後生效。資料都還保留。' : '已終止，但停止服務頁沒有啟動部署。' + deployWarn }, 200);
    }

    // 永久刪除：只有「已終止」的網站可以；必須輸入網址代稱確認。刪 Cloudflare 專案 → 刪照片 → 刪資料庫紀錄（草稿、版本、事件、收款、月報一併刪除）。
    // 順序是「先刪外部、最後才刪資料庫」，每一步都能安全重試；任何一步失敗就停下來，網站仍保持「已終止」。
    case 'purge': {
      if (site.status !== 'cancelled') return fail('not_allowed', '只有「已終止」的網站可以永久刪除，請先終止租用', 409);
      if (typeof body.confirm_slug !== 'string' || body.confirm_slug.trim() !== site.slug) return fail('confirm_mismatch', '請輸入這個網站的網址代稱「' + site.slug + '」來確認');
      const steps = [];
      if (site.cf_project_name) {
        if (!deps.cf || !deps.cf.deleteProject) return fail('cf_not_configured', '尚未設定 Cloudflare 金鑰，無法刪除網站專案，所以什麼都沒刪', 501);
        if (site.custom_domain) await deps.cf.removeDomain(site.cf_project_name, site.custom_domain).catch(() => {});
        try { const r = await deps.cf.deleteProject(site.cf_project_name); steps.push(r.deleted ? '已刪除 Cloudflare 網站專案' : 'Cloudflare 專案已經不存在'); }
        catch (e) { return fail('cloudflare_error', '刪除 Cloudflare 專案失敗，所以什麼都沒刪：' + String(e.message || e).slice(0, 200) + '。可以到 Cloudflare 後台手動刪除該專案後再按一次。', 502); }
      }
      let photos = 0;
      try {
        for (let guard = 0; guard < 50; guard++) {
          const objs = (await db.storageList(PHOTO_BUCKET, siteId, { offset: 0, limit: 100 })).filter((o) => o && o.id != null && o.name);
          if (!objs.length) break;
          await db.storageRemove(PHOTO_BUCKET, objs.map((o) => siteId + '/' + o.name));
          photos += objs.length;
        }
      } catch (e) { return fail('storage_error', '網站專案已刪除，但照片沒有刪成功：' + String(e.message || e).slice(0, 200) + '。請再按一次永久刪除。', 502); }
      steps.push('已刪除 ' + photos + ' 張照片');
      try { await db.remove('rental_sites', 'id=eq.' + siteId); }
      catch (e) { return fail('db_error', '外部資料已刪除，但資料庫紀錄沒有刪成功：' + String(e.message || e).slice(0, 200) + '。請再按一次永久刪除。', 502); }
      steps.push('已刪除資料庫紀錄');
      console.log('[admin-site] purged site ' + siteId + ' slug=' + site.slug + ' by ' + by + '；' + steps.join('；'));
      return reply({ ok: true, deleted: true, message: '已永久刪除：' + steps.join('、') + '。' }, 200);
    }

    case 'restore_version': {
      if (typeof body.version_id !== 'string' || !UUID.test(body.version_id)) return fail('bad_request', '缺少版本編號');
      if (!['live', 'overdue'].includes(site.status)) return fail('not_allowed', '只有上線中或已逾期的網站可以還原版本', 409);
      const ver = await db.getOne('site_versions', 'id=eq.' + body.version_id + '&site_id=eq.' + siteId + '&select=id,content,palette,sections,layout,pages,created_at');
      if (!ver) return fail('not_found', '找不到這個版本', 404);
      const overwrite = body.overwrite_draft === true;
      // 版型不跟著還原（多頁不能改回一頁）；多頁版本才一併還原頁面勾選
      if (overwrite) await db.patch('rental_sites', 'id=eq.' + siteId, { content: ver.content, palette: ver.palette, sections: ver.sections, ...(ver.layout === 'multi' ? { pages: ver.pages } : {}) });
      await event('version_restore_queued', { version_id: ver.id, overwrite_draft: overwrite });
      const d = await queueDeploy({ versionId: ver.id });
      return d.ok ? reply({ ok: true, message: '已排入還原' + (overwrite ? '（並已覆蓋會員草稿）' : '（會員草稿未更動）') + '，約 1–2 分鐘。' }, 200) : fail('dispatch_failed', '沒有送出成功：' + deployWarn, 502);
    }

    // 方案：basic／pro。降回一般方案時，上線中的網站會重新部署（拿掉程式碼與預約行事曆）
    case 'set_tier': {
      if (!['basic', 'pro'].includes(body.tier)) return fail('bad_request', '方案只能是 basic 或 pro');
      if (body.tier === site.tier) return reply({ ok: true, message: '方案沒有變更。' }, 200);
      await db.patch('rental_sites', 'id=eq.' + siteId, { tier: body.tier });
      await event('tier_changed', { from: site.tier || 'basic', to: body.tier });
      if (['live', 'overdue'].includes(site.status) && site.live_version_id) {
        const d = await queueDeploy({ versionId: site.live_version_id });
        return reply({ ok: true, message: '已改為' + (body.tier === 'pro' ? '進階方案' : '一般方案') + '，網站重新部署中。', ...(d.ok ? {} : { warning: deployWarn }) }, 200);
      }
      return reply({ ok: true, message: '已改為' + (body.tier === 'pro' ? '進階方案' : '一般方案') + '。' }, 200);
    }

    // 自訂程式碼審核：approve=true 核准（上線中的網站重新部署最新版本），false 退回；都會寄信通知客戶
    case 'review_code': {
      const hash = String(body.hash || '');
      if (!/^[0-9a-f]{64}$/.test(hash)) return fail('bad_request', '缺少程式碼編號');
      const note = body.note == null ? '' : String(body.note).trim();
      if (note.length > 300) return fail('bad_request', '說明最長 300 字');
      const rv = await db.getOne('site_code_reviews', 'site_id=eq.' + siteId + '&hash=eq.' + hash + '&select=status');
      if (!rv) return fail('not_found', '找不到這筆審核', 404);
      const approve = body.approve === true;
      await db.patch('site_code_reviews', 'site_id=eq.' + siteId + '&hash=eq.' + hash, { status: approve ? 'approved' : 'rejected', note: note || null, reviewed_by: by, reviewed_at: now.toISOString() });
      await event(approve ? 'code_approved' : 'code_rejected', { note });
      const member = await db.getOne('members', 'id=eq.' + site.member_id + '&select=email');
      const shopName = (site.content && site.content.name) || site.slug;
      if (member && member.email && deps.sendMail) await deps.sendMail({ to: member.email, ...customerCodeResult({ shopName, approved: approve, note }) }).catch(() => null);
      if (approve && ['live', 'overdue'].includes(site.status)) {
        const lv = await latestVersion();
        const d = await queueDeploy({ versionId: (lv && lv.id) || site.live_version_id });
        return reply({ ok: true, message: '已核准，網站重新部署中。', ...(d.ok ? {} : { warning: deployWarn }) }, 200);
      }
      return reply({ ok: true, message: approve ? '已核准。網站上線或下次發佈時會放進程式碼。' : '已退回，已通知客戶。' }, 200);
    }

    case 'set_domain':
    case 'check_domain':
    case 'clear_domain':
      return domainAction(body.action, { site, siteId, body, db, cf: deps.cf, event, queueDeploy, reply, fail, audience: 'admin', deployWarn });
  }
  return fail('bad_request', '不支援的動作');
}
