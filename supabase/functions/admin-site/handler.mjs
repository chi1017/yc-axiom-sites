// 管理員操作租用網站的 Edge Function 邏輯（確認收款、重新發佈、暫停／恢復、還原版本、網域）。
// 所有外部依賴由 deps 注入，方便在 Node 內測試。只有 JWT app_metadata.role = admin 能呼叫；
// 每個動作都會在 site_events 留下紀錄（含操作者 Email）。
import { UUID, corsHeaders, parseOrigins, json } from '../_shared/http.mjs';
import { customerReceipt } from '../_shared/emails.mjs';
export { parseOrigins };

const MAX_MONTHS = 60;
const MAX_AMOUNT = 10000000;
const ACTIONS = ['confirm_payment', 'republish', 'suspend', 'restore', 'restore_version', 'set_domain', 'check_domain', 'clear_domain'];

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
export function normalizeDomain(v) {
  let s = String(v == null ? '' : v).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  if (!s || s.length > 253 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return '';
  if (/(^|\.)pages\.dev$/.test(s) || /(^|\.)workers\.dev$/.test(s)) return '';
  return s;
}

/**
 * deps: {
 *   allowedOrigins: string[],
 *   getUser(token) → {id,email,isAdmin}|null,
 *   db: { getOne, patch, insert, insertReturning, list },
 *   sendMail({to,subject,html,text}) → {ok,error?},
 *   dispatch({siteId,versionId?,mode?}) → {ok,error?},
 *   cf?: { addDomain, getDomain, removeDomain },
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

      let deployVersionId = null;
      if (site.status === 'pending') {
        const v = await latestVersion();
        if (!v) return fail('no_version', '這個網站沒有可上線的版本', 409);
        deployVersionId = v.id;
      }
      const from = site.paid_until && site.paid_until > today ? site.paid_until : today;
      const to = addMonths(from, months);
      const pay = await db.insertReturning('payments', { site_id: siteId, member_id: site.member_id, amount, months, method: 'bank_transfer', reference: reference || null, paid_on: paidOn, period_from: from, period_to: to, confirmed_by: by });
      if (!pay) return fail('server_error', '寫入收款紀錄失敗，請稍後再試', 500);

      const newStatus = to >= today ? 'live' : 'overdue';
      const patch = { paid_until: to };
      let needDeploy = false;
      if (site.status !== newStatus) patch.status = newStatus;
      if (site.status === 'suspended') { patch.suspended_at = null; patch.suspend_reason = null; needDeploy = true; deployVersionId = site.live_version_id || (await latestVersion() || {}).id || null; }
      if (site.status === 'pending') needDeploy = true;
      try { await db.patch('rental_sites', 'id=eq.' + siteId, patch); } catch (e) {
        await event('payment_confirmed', { payment_id: pay.id, amount, months, period_to: to, warning: '收款已記錄，但更新網站狀態失敗' });
        return fail('server_error', '收款已記錄，但更新網站狀態失敗。請在詳情頁檢查狀態與到期日。', 500);
      }
      await event('payment_confirmed', { payment_id: pay.id, amount, months, period_from: from, period_to: to, status_from: site.status, status_to: patch.status || site.status });

      let warning = '';
      if (needDeploy) {
        if (!deployVersionId) warning = '找不到可部署的版本，請請客戶按一次發佈。';
        else { const d = await queueDeploy({ versionId: deployVersionId }); if (!d.ok) warning = deployWarn; }
      }
      // 收據信：失敗只記錄，不影響收款
      const member = await db.getOne('members', 'id=eq.' + site.member_id + '&select=email').catch(() => null);
      if (member && member.email) {
        const mail = customerReceipt({ shopName: (site.content && site.content.name) || site.slug, amount, months, paidOn, periodTo: to, reference });
        const r = await deps.sendMail({ to: member.email, ...mail }).catch((e) => ({ ok: false, error: String(e) }));
        await event(r.ok ? 'email_sent' : 'email_failed', { template: 'customerReceipt', ...(r.ok ? {} : { error: String(r.error || '').slice(0, 200) }) });
      }
      return reply({ ok: true, status: patch.status || site.status, paid_until: to, deploying: needDeploy && !warning, ...(warning ? { warning } : {}), message: '已記錄收款，到期日 ' + to + (needDeploy && !warning ? '，正在部署（約 1–2 分鐘）。' : '。') + (warning ? ' ' + warning : '') }, 200);
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
      if (site.status !== 'suspended') return fail('not_allowed', '只有暫停中的網站可以恢復', 409);
      const deployed = !!(site.live_version_id && site.cf_project_name);
      const status = !deployed ? 'pending' : (site.paid_until && site.paid_until >= today ? 'live' : 'overdue');
      await db.patch('rental_sites', 'id=eq.' + siteId, { status, suspended_at: null, suspend_reason: null });
      await event('restored', { status_to: status });
      if (!deployed) return reply({ ok: true, status, message: '已恢復為「待上線」（這個網站還沒有部署過）。' }, 200);
      const d = await queueDeploy({ versionId: site.live_version_id });
      return reply({ ok: true, status, ...(d.ok ? {} : { warning: deployWarn }), message: d.ok ? '已恢復為「' + status + '」，網站約 1–2 分鐘後回來。' : '已恢復，但部署沒有啟動。' + deployWarn }, 200);
    }

    case 'restore_version': {
      if (typeof body.version_id !== 'string' || !UUID.test(body.version_id)) return fail('bad_request', '缺少版本編號');
      if (!['live', 'overdue'].includes(site.status)) return fail('not_allowed', '只有上線中或已逾期的網站可以還原版本', 409);
      const ver = await db.getOne('site_versions', 'id=eq.' + body.version_id + '&site_id=eq.' + siteId + '&select=id,content,palette,sections,created_at');
      if (!ver) return fail('not_found', '找不到這個版本', 404);
      const overwrite = body.overwrite_draft === true;
      if (overwrite) await db.patch('rental_sites', 'id=eq.' + siteId, { content: ver.content, palette: ver.palette, sections: ver.sections });
      await event('version_restore_queued', { version_id: ver.id, overwrite_draft: overwrite });
      const d = await queueDeploy({ versionId: ver.id });
      return d.ok ? reply({ ok: true, message: '已排入還原' + (overwrite ? '（並已覆蓋會員草稿）' : '（會員草稿未更動）') + '，約 1–2 分鐘。' }, 200) : fail('dispatch_failed', '沒有送出成功：' + deployWarn, 502);
    }

    case 'set_domain': {
      if (!deps.cf) return fail('cf_not_configured', '尚未設定 Cloudflare 金鑰（Supabase Secrets：CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID）', 501);
      const domain = normalizeDomain(body.domain);
      if (!domain) return fail('bad_request', '網域格式不正確（例如 www.example.com；不接受 pages.dev）');
      if (!site.cf_project_name) return fail('not_deployed', '網站還沒有部署過，請先確認收款上線後再綁網域', 409);
      if (['draft', 'cancelled'].includes(site.status)) return fail('not_allowed', '這個狀態的網站不能綁網域', 409);
      const used = await db.getOne('rental_sites', 'custom_domain=eq.' + encodeURIComponent(domain) + '&id=neq.' + siteId + '&select=id');
      if (used) return fail('domain_in_use', '這個網域已經綁在別的網站上', 409);
      let r;
      try { r = await deps.cf.addDomain(site.cf_project_name, domain); } catch (e) { await event('domain_failed', { domain, message: String(e.message || e).slice(0, 200) }); return fail('cloudflare_error', '新增網域失敗：' + String(e.message || e).slice(0, 200), 502); }
      const active = r.status === 'active';
      // 換網域：舊的從 Cloudflare 移掉（失敗不影響）
      if (site.custom_domain && site.custom_domain !== domain) await deps.cf.removeDomain(site.cf_project_name, site.custom_domain).catch(() => {});
      await db.patch('rental_sites', 'id=eq.' + siteId, { custom_domain: domain, domain_status: active ? 'active' : 'pending_dns' });
      await event('domain_set', { domain, cf_status: r.status });
      let warning = '';
      if (active && ['live', 'overdue'].includes(site.status) && site.live_version_id) { const d = await queueDeploy({ versionId: site.live_version_id }); if (!d.ok) warning = deployWarn; }
      return reply({ ok: true, domain, domain_status: active ? 'active' : 'pending_dns', cname_target: r.target, ...(warning ? { warning } : {}),
        message: active ? '網域已生效。' : '請客戶（或網域管理者）到網域的 DNS 設定新增一筆 CNAME：名稱 ' + domain + ' → ' + r.target + '。設定後等幾分鐘到數小時，再按「檢查網域」。' }, 200);
    }

    case 'check_domain': {
      if (!deps.cf) return fail('cf_not_configured', '尚未設定 Cloudflare 金鑰（Supabase Secrets：CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID）', 501);
      if (!site.custom_domain || !site.cf_project_name) return fail('no_domain', '這個網站還沒有設定自訂網域', 409);
      let r;
      try { r = await deps.cf.getDomain(site.cf_project_name, site.custom_domain); } catch (e) { return fail('cloudflare_error', '查詢網域失敗：' + String(e.message || e).slice(0, 200), 502); }
      if (!r) return fail('domain_missing', 'Cloudflare 上找不到這個網域，請重新設定網域', 409);
      if (r.status !== 'active') {
        await event('domain_checked', { domain: site.custom_domain, cf_status: r.status });
        return reply({ ok: true, domain_status: 'pending_dns', cf_status: r.status, message: '網域尚未生效（Cloudflare 狀態：' + r.status + '）' + (r.error ? '：' + r.error : '') + '。DNS 設定後可能要等幾分鐘到數小時。' }, 200);
      }
      let warning = '';
      if (site.domain_status !== 'active') {
        await db.patch('rental_sites', 'id=eq.' + siteId, { domain_status: 'active' });
        await event('domain_active', { domain: site.custom_domain });
        if (['live', 'overdue'].includes(site.status) && site.live_version_id) { const d = await queueDeploy({ versionId: site.live_version_id }); if (!d.ok) warning = deployWarn; }
      }
      return reply({ ok: true, domain_status: 'active', cf_status: r.status, ...(warning ? { warning } : {}), message: '網域已生效，網站正在以新網域重新發佈（約 1–2 分鐘）。' }, 200);
    }

    case 'clear_domain': {
      if (!site.custom_domain) return fail('no_domain', '這個網站沒有自訂網域', 409);
      if (deps.cf && site.cf_project_name) { try { await deps.cf.removeDomain(site.cf_project_name, site.custom_domain); } catch (e) { return fail('cloudflare_error', '移除網域失敗：' + String(e.message || e).slice(0, 200), 502); } }
      await db.patch('rental_sites', 'id=eq.' + siteId, { custom_domain: null, domain_status: 'none' });
      await event('domain_cleared', { domain: site.custom_domain });
      let warning = '';
      if (['live', 'overdue'].includes(site.status) && site.live_version_id) { const d = await queueDeploy({ versionId: site.live_version_id }); if (!d.ok) warning = deployWarn; }
      return reply({ ok: true, domain_status: 'none', ...(warning ? { warning } : {}), message: '已移除自訂網域，網站改回 pages.dev 網址並重新發佈。' }, 200);
    }
  }
  return fail('bad_request', '不支援的動作');
}
