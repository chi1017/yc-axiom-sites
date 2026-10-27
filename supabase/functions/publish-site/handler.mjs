// 發佈網站的 Edge Function 邏輯。所有外部依賴由 deps 注入，方便在 Node 內測試。
import { normalizeContent, normalizePalette, normalizeSections } from '../../../templates/shared/content.js';
import { validateForPublish } from '../../../templates/shared/validate.js';
import { normalizeLayout, normalizePages } from '../../../templates/shared/pages.js';
import { adminFirstPublish, adminCodeReview } from '../_shared/emails.mjs';
import { hasCustomCode, codeHash } from '../../../templates/shared/code.js';

import { UUID, corsHeaders, parseOrigins, json } from '../_shared/http.mjs';
export { corsHeaders, parseOrigins };

const MIN_GAP_SECONDS = 20;
const MAX_PER_DAY = 30;

/**
 * deps: {
 *   allowedOrigins: string[], previewBase: string, adminUrl?: string, adminEmail: string,
 *   getUser(token) → {id,email}|null,
 *   db: { getOne, patch, insert, insertReturning, list },
 *   sendMail({to,subject,html,text}) → {ok,error?},
 *   dispatch({siteId,versionId}) → {ok,error?},
 *   now?: () => Date
 * }
 */
export async function handlePublish(req, deps) {
  const cors = corsHeaders(req, deps.allowedOrigins);
  const reply = (b, s) => json(b, s, cors);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed', message: '不支援的請求方式' }, 405);
  const origin = req.headers.get('origin') || '';
  if (origin && !deps.allowedOrigins.includes(origin)) return reply({ error: 'forbidden_origin', message: '來源不被允許' }, 403);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const user = token ? await deps.getUser(token).catch(() => null) : null;
  if (!user || !user.id) return reply({ error: 'unauthorized', message: '請先登入' }, 401);

  let body;
  try { const t = await req.text(); if (t.length > 2000) throw new Error('too big'); body = JSON.parse(t); } catch { return reply({ error: 'bad_request', message: '請求格式不正確' }, 400); }
  const siteId = body && body.site_id;
  if (typeof siteId !== 'string' || !UUID.test(siteId)) return reply({ error: 'bad_request', message: '缺少網站編號' }, 400);

  const { db } = deps;
  const now = (deps.now || (() => new Date()))();
  let site = await db.getOne('rental_sites', 'id=eq.' + siteId + '&member_id=eq.' + user.id + '&select=*');
  // 協作者（進階方案、已接受邀請）也可以發佈
  if (!site) {
    const cm = await db.getOne('site_members', 'site_id=eq.' + siteId + '&member_id=eq.' + user.id + '&status=eq.active&select=site_id');
    const s2 = cm ? await db.getOne('rental_sites', 'id=eq.' + siteId + '&select=*') : null;
    if (s2 && s2.tier === 'pro') site = s2;
  }
  if (!site) return reply({ error: 'not_found', message: '找不到這個網站' }, 404);
  const member = await db.getOne('members', 'id=eq.' + user.id + '&select=consented_at,email');
  if (!member || !member.consented_at) return reply({ error: 'consent_required', message: '請先同意服務條款與隱私權政策' }, 403);
  if (site.status === 'suspended' || site.status === 'cancelled') {
    return reply({ error: 'not_allowed', message: site.status === 'suspended' ? '網站目前已暫停，請聯絡 YC AXIOM（LINE @788cblaq）' : '這個網站已終止服務' }, 403);
  }

  // 第一次發佈前必須已同意租用條款（會員在編輯器勾選後由 rental_accept_terms 寫入）
  if (site.status === 'draft' && !site.terms_accepted_at) return reply({ error: 'terms_required', message: '請先閱讀並同意網站租用條款' }, 403);

  // 以資料庫裡的草稿為準（不相信瀏覽器送來的內容）
  const content = normalizeContent(site.content), palette = normalizePalette(site.palette), sections = normalizeSections(site.sections);
  const check = validateForPublish(content, sections, site.slug, site.content, { checkBrand: site.status === 'draft', template: site.template });
  if (!check.ok) return reply({ error: 'validation', message: '還有必填項目沒完成', errors: check.errors }, 422);

  // 頻率限制：兩次發佈至少間隔 20 秒；24 小時內最多 30 次
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const recent = await db.list('site_events', 'site_id=eq.' + siteId + '&type=in.(published_first,version_saved,deploy_queued)&created_at=gte.' + encodeURIComponent(since) + '&select=created_at&order=created_at.desc&limit=' + MAX_PER_DAY);
  if (recent.length && now.getTime() - new Date(recent[0].created_at).getTime() < MIN_GAP_SECONDS * 1000) return reply({ error: 'rate_limited', message: '操作太頻繁，請稍候幾秒再試' }, 429);
  if (recent.length >= MAX_PER_DAY) return reply({ error: 'rate_limited', message: '今天的發佈次數已達上限，請明天再試' }, 429);

  const version = await db.insertReturning('site_versions', { site_id: siteId, content, palette, sections, layout: normalizeLayout(site.layout), pages: normalizePages(site.pages) });
  if (!version || !version.id) return reply({ error: 'server_error', message: '儲存版本失敗，請稍後再試' }, 500);
  const event = (type, detail) => db.insert('site_events', { site_id: siteId, type, detail }).catch(() => {});

  // 進階方案的自訂程式碼：新的程式碼要管理員審核（核准前網站照常更新，只是不含程式碼）
  let codeNote = '';
  if (site.tier === 'pro' && hasCustomCode(content)) {
    const hash = await codeHash(content);
    const rv = await db.getOne('site_code_reviews', 'site_id=eq.' + siteId + '&hash=eq.' + hash + '&select=status');
    if (!rv) {
      await db.insert('site_code_reviews', { site_id: siteId, hash, status: 'pending', version_id: version.id });
      await event('code_review_requested', { version_id: version.id });
      const mail = adminCodeReview({ shopName: content.name, slug: site.slug, memberEmail: member.email || user.email || '', adminUrl: deps.adminUrl });
      await deps.sendMail({ to: deps.adminEmail, ...mail }).catch(() => null);
    }
    const st = rv ? rv.status : 'pending';
    if (st === 'pending') codeNote = '自訂程式碼需要審核，核准後會自動放進網站。';
    else if (st === 'rejected') codeNote = '這段自訂程式碼沒有通過審核，不會放進網站。';
  }
  const withNote = (msg) => (codeNote ? msg + codeNote : msg);

  if (site.status === 'draft') {
    await db.patch('rental_sites', 'id=eq.' + siteId + '&status=eq.draft', { status: 'pending' });
    await event('published_first', { version_id: version.id });
    const mail = adminFirstPublish({ shopName: content.name, slug: site.slug, previewUrl: deps.previewBase + '?site=' + siteId, memberEmail: member.email || user.email || '', adminUrl: deps.adminUrl });
    const r = await deps.sendMail({ to: deps.adminEmail, ...mail }).catch((e) => ({ ok: false, error: String(e) }));
    await event(r.ok ? 'email_sent' : 'email_failed', { template: 'adminFirstPublish', ...(r.ok ? {} : { error: String(r.error || '').slice(0, 200) }) });
    return reply({ ok: true, status: 'pending', version_id: version.id, message: withNote('已送出上線申請。我們確認後會為你開通，並以 Email 通知。') }, 200);
  }
  if (site.status === 'pending') {
    await event('version_saved', { version_id: version.id });
    return reply({ ok: true, status: 'pending', version_id: version.id, message: withNote('已更新送審的內容。網站開通後會使用最新版本。') }, 200);
  }
  // 升級多頁版還沒確認收到差額：先存版本，確認收款後由管理員發佈（正式網站維持一頁版）
  if (site.upgrade_pending) {
    await event('version_saved', { version_id: version.id, upgrade_pending: true });
    return reply({ ok: true, status: site.status, upgrade_pending: true, version_id: version.id, message: withNote('多頁版已儲存。我們確認收到升級差額' + (site.upgrade_amount ? ' NT$ ' + Number(site.upgrade_amount).toLocaleString('en-US') : '') + ' 後，會自動發佈多頁版；在那之前正式網站維持一頁版。') }, 200);
  }
  // live / overdue：排入部署
  await event('deploy_queued', { version_id: version.id });
  const d = await deps.dispatch({ siteId, versionId: version.id }).catch((e) => ({ ok: false, error: String(e) }));
  if (!d.ok) {
    await event('deploy_failed', { message: '無法啟動部署：' + String(d.error || '').slice(0, 200), version_id: version.id });
    return reply({ error: 'dispatch_failed', message: '更新沒有送出成功，請稍後再按一次發佈。你的網站仍維持舊版上線。' }, 502);
  }
  return reply({ ok: true, status: site.status, updating: true, version_id: version.id, message: withNote('更新已送出，約 1–2 分鐘後生效。') }, 200);
}
