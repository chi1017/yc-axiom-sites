// 會員自己管理網站的 Edge Function：自訂網域（設定、檢查、移除）、網站收款（店家自己的綠界帳號：設定金鑰、標記訂單已處理）、
// 預約行事曆（確認／取消預約）、多人協作（邀請、移除協作者；被邀請的人接受邀請）。
// 預約管理擁有者與協作者都能用；其他動作只有網站擁有者能用。網域邏輯與管理後台共用（_shared/domain.mjs）。
import { UUID, corsHeaders, parseOrigins, json } from '../_shared/http.mjs';
import { domainAction } from '../_shared/domain.mjs';
import { seal } from '../_shared/secretbox.mjs';
import { MERCHANT_RE, KEY_RE, PAY_MODES } from '../_shared/shop.mjs';
import { guestBookingResult, collabInvite, adminUpgradeRequest, adminProRequest } from '../_shared/emails.mjs';
import { upgradeQuote, proQuote } from '../_shared/plans.mjs';
import { normalizePages, pagesFromSections } from '../../../templates/shared/pages.js';
import { normalizeSections } from '../../../templates/shared/content.js';
export { parseOrigins };

const ACTIONS = ['set_domain', 'check_domain', 'clear_domain', 'get_pay', 'set_pay', 'order_done', 'delete_site', 'set_booking', 'invite_collab', 'remove_collab', 'accept_invites', 'upgrade_quote', 'upgrade_layout', 'pro_quote', 'request_pro', 'set_next'];
export const MAX_COLLABS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// 會員可以自己刪除的狀態：還沒上線過的草稿與待上線（沒有部署、沒有收款）。刪除＝改成已終止並隱藏，資料保留，管理員可以復原。
export const DELETABLE = ['draft', 'pending'];

/** deps: { allowedOrigins, getUser, db, dispatch, cf?, paySecret, now? } */
export async function handleMember(req, deps) {
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
  if (!body || typeof body !== 'object' || !ACTIONS.includes(body.action)) return reply({ error: 'bad_request', message: '不支援的動作' }, 400);
  const { db } = deps;
  const fail = (error, message, status = 400) => reply({ error, message }, status);
  if (body.action === 'accept_invites') return acceptInvites(user, deps, reply);
  if (typeof body.site_id !== 'string' || !UUID.test(body.site_id)) return reply({ error: 'bad_request', message: '缺少網站編號' }, 400);

  const siteId = body.site_id;
  let site = await db.getOne('rental_sites', 'id=eq.' + siteId + '&member_id=eq.' + user.id + '&select=*');
  // 協作者（進階方案、已接受邀請）只能管理預約
  if (!site && body.action === 'set_booking') {
    const cm = await db.getOne('site_members', 'site_id=eq.' + siteId + '&member_id=eq.' + user.id + '&status=eq.active&select=site_id');
    const s2 = cm ? await db.getOne('rental_sites', 'id=eq.' + siteId + '&select=*') : null;
    if (s2 && s2.tier === 'pro') site = s2;
  }
  if (!site) return reply({ error: 'not_found', message: '找不到這個網站' }, 404);
  if (body.action === 'set_booking') return setBooking(body, site, user, deps, reply, fail);
  if (body.action === 'invite_collab' || body.action === 'remove_collab') return collabAction(body, site, user, deps, reply, fail);
  if (body.action === 'upgrade_quote' || body.action === 'upgrade_layout') return upgradeAction(body, site, user, deps, reply, fail);
  if (body.action === 'pro_quote' || body.action === 'request_pro') return proAction(body, site, user, deps, reply, fail);
  if (body.action === 'set_next') return setNext(body, site, user, deps, reply, fail);
  if (['get_pay', 'set_pay', 'order_done'].includes(body.action)) return payAction(body, site, user, deps, reply, fail);
  if (body.action === 'delete_site') {
    if (!DELETABLE.includes(site.status) || site.first_published_at) return fail('not_allowed', '已上線過的網站不能自己刪除，請用 LINE（@788cblaq）聯絡我們辦理終止', 409);
    const done = await db.patchReturning('rental_sites', 'id=eq.' + siteId + '&status=in.(draft,pending)', { status: 'cancelled' });
    if (!done.length) return fail('not_allowed', '這個網站目前的狀態不能刪除', 409);
    await db.insert('site_events', { site_id: siteId, type: 'deleted_by_member', detail: { from: site.status, by: 'member:' + (user.email || user.id) } }).catch(() => {});
    return reply({ ok: true, message: '已刪除網站「' + ((site.content && site.content.name) || site.slug) + '」。' }, 200);
  }
  if (body.action === 'set_domain' && !['live', 'overdue'].includes(site.status)) return fail('not_allowed', '網站上線後才能綁定自己的網域', 409);
  const by = 'member:' + (user.email || user.id);
  const event = (type, detail) => db.insert('site_events', { site_id: siteId, type, detail: { ...detail, by } }).catch(() => {});
  async function queueDeploy({ versionId } = {}) {
    const d = await deps.dispatch({ siteId, versionId }).catch((e) => ({ ok: false, error: String(e) }));
    if (!d.ok) await event('deploy_failed', { message: '無法啟動部署：' + String(d.error || '').slice(0, 200), ...(versionId ? { version_id: versionId } : {}) });
    return d;
  }
  return domainAction(body.action, { site, siteId, body, db, cf: deps.cf, event, queueDeploy, reply, fail, audience: 'member' });
}

// ── 網站收款（店家自己的綠界帳號）──
// 金鑰只寫不讀：存進資料庫前加密，之後只回傳「已設定」與特店編號。
async function payAction(body, site, user, deps, reply, fail) {
  const { db } = deps;
  const now = (deps.now || (() => new Date()))();
  const by = 'member:' + (user.email || user.id);
  const cur = await db.getOne('site_pay_settings', 'site_id=eq.' + site.id + '&select=site_id,mode,merchant_id,key_enc,iv_enc,updated_at');
  const was = cur ? cur.mode : 'off';
  const view = (r) => ({ mode: r ? r.mode : 'off', merchant_id: r ? r.merchant_id || '' : '', has_keys: !!(r && r.key_enc && r.iv_enc), updated_at: r ? r.updated_at : null });
  if (body.action === 'get_pay') return reply({ ok: true, ...view(cur) }, 200);

  if (body.action === 'order_done') {
    const tn = String(body.trade_no || '');
    if (!/^[A-Za-z0-9]{1,20}$/.test(tn)) return fail('bad_request', '缺少訂單編號');
    const done = body.done !== false;
    const r = await db.patchReturning('shop_orders', 'trade_no=eq.' + tn + '&site_id=eq.' + site.id, { fulfilled_at: done ? now.toISOString() : null, updated_at: now.toISOString() });
    if (!r.length) return fail('not_found', '找不到這筆訂單', 404);
    return reply({ ok: true, done }, 200);
  }

  // set_pay
  const mode = PAY_MODES.includes(body.mode) ? body.mode : '';
  if (!mode) return fail('bad_request', '請選擇收款模式');
  const patch = { mode, updated_at: now.toISOString() };
  if (mode === 'live') {
    const mid = String(body.merchant_id || '').trim();
    const key = String(body.hash_key || '').trim(), iv = String(body.hash_iv || '').trim();
    if (!MERCHANT_RE.test(mid)) return fail('bad_request', '特店編號（MerchantID）格式不正確，應該是 7 到 10 位數字');
    if (mid === '3002607' || mid === '2000132') return fail('bad_request', '這是綠界的測試帳號。要測試請選「測試模式」；正式收款請填你自己的特店編號');
    const changingKeys = key || iv || !cur || !cur.key_enc || cur.merchant_id !== mid;
    if (changingKeys) {
      if (!KEY_RE.test(key) || !KEY_RE.test(iv)) return fail('bad_request', 'HashKey 與 HashIV 都是 16 個英文或數字，請到綠界廠商後台複製貼上');
      patch.key_enc = await seal(key, deps.paySecret);
      patch.iv_enc = await seal(iv, deps.paySecret);
    }
    patch.merchant_id = mid;
  }
  if (cur) await db.patch('site_pay_settings', 'site_id=eq.' + site.id, patch);
  else await db.insert('site_pay_settings', { site_id: site.id, member_id: site.member_id, ...patch });
  await db.insert('site_events', { site_id: site.id, type: 'pay_settings', detail: { mode, ...(patch.merchant_id ? { merchant_id: patch.merchant_id } : {}), keys_changed: !!patch.key_enc, by } }).catch(() => {});
  // 網站上的「前往付款」要重新發佈才會出現／消失
  let warning = '';
  if ((was === 'off') !== (mode === 'off') && ['live', 'overdue'].includes(site.status) && site.live_version_id) {
    const d = await deps.dispatch({ siteId: site.id, versionId: site.live_version_id }).catch((e) => ({ ok: false, error: String(e) }));
    if (!d.ok) warning = '網站沒有自動重新發佈，請到編輯器按一次「發佈」。';
  }
  const after = await db.getOne('site_pay_settings', 'site_id=eq.' + site.id + '&select=site_id,mode,merchant_id,key_enc,iv_enc,updated_at');
  const msg = mode === 'off' ? '已關閉線上收款。' : mode === 'test' ? '已開啟測試模式：可以用綠界測試卡號下單，不會真的收款。' : '已開啟正式收款，款項會進到你的綠界帳戶。建議先自己下一筆小額訂單確認。';
  return reply({ ok: true, ...view(after), message: msg + (warning ? ' ' + warning : ''), ...(warning ? { warning } : {}) }, 200);
}

// ── 預約行事曆：確認或取消預約（取消後名額釋出）；客人有留 Email 就寄通知 ──
async function setBooking(body, site, user, deps, reply, fail) {
  const { db } = deps;
  const id = String(body.message_id || '');
  if (!UUID.test(id)) return fail('bad_request', '缺少預約編號');
  const status = body.status === 'confirmed' ? 'confirmed' : body.status === 'cancelled' ? 'cancelled' : '';
  if (!status) return fail('bad_request', '狀態只能是確認或取消');
  const note = body.note == null ? '' : String(body.note).trim();
  if (note.length > 200) return fail('bad_request', '說明最長 200 字');
  const msg = await db.getOne('site_messages', 'id=eq.' + id + '&site_id=eq.' + site.id + '&select=id,slot_date,slot_time,slot_status,meta');
  if (!msg || !msg.slot_date) return fail('not_found', '找不到這筆預約', 404);
  if (msg.slot_status === status) return reply({ ok: true, status, message: '狀態沒有變更。' }, 200);
  if (msg.slot_status === 'cancelled') return fail('not_allowed', '已取消的預約不能再改，請請客人重新預約', 409);
  await db.patch('site_messages', 'id=eq.' + id, { slot_status: status, meta: { ...(msg.meta || {}), handled_by: user.email || user.id, ...(note ? { owner_note: note } : {}) } });
  const email = msg.meta && msg.meta.email;
  let mailed = false;
  if (email && EMAIL_RE.test(email) && deps.sendMail) {
    const shopName = (site.content && site.content.name) || '店家';
    const when = String(msg.slot_date).replace(/-/g, '/') + ' ' + msg.slot_time;
    const owner = await db.getOne('members', 'id=eq.' + site.member_id + '&select=email');
    const r = await deps.sendMail({ to: email, ...guestBookingResult({ shopName, when, confirmed: status === 'confirmed', note, base: site.public_url || '' }), ...(owner && owner.email ? { replyTo: owner.email } : {}) }).catch(() => null);
    mailed = !!(r && r.ok);
  }
  return reply({ ok: true, status, mailed, message: (status === 'confirmed' ? '已確認預約。' : '已取消預約，名額已釋出。') + (mailed ? '已寄信通知客人。' : email ? '通知信沒有寄出，請自行聯絡客人。' : '客人沒有留 Email，請用電話聯絡。') }, 200);
}

// ── 多人協作（進階方案）：擁有者用 Email 邀請；對方登入會員專區後自動加入 ──
async function collabAction(body, site, user, deps, reply, fail) {
  const { db } = deps;
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 120) return fail('bad_request', '請輸入正確的 Email');
  const by = 'member:' + (user.email || user.id);
  if (body.action === 'remove_collab') {
    const r = await db.patchReturning('site_members', 'site_id=eq.' + site.id + '&email=eq.' + encodeURIComponent(email), { status: 'removed', member_id: null });
    if (!r.length) return fail('not_found', '找不到這位協作者', 404);
    await db.insert('site_events', { site_id: site.id, type: 'collab_removed', detail: { email, by } }).catch(() => {});
    return reply({ ok: true, message: '已移除 ' + email + '。' }, 200);
  }
  if (site.tier !== 'pro') return fail('not_allowed', '多人協作是進階方案功能，請用 LINE（@788cblaq）聯絡我們升級', 403);
  if (email === String(user.email || '').toLowerCase()) return fail('bad_request', '不能邀請自己');
  const list = await db.list('site_members', 'site_id=eq.' + site.id + '&status=neq.removed&select=email');
  if (list.some((x) => x.email === email)) return fail('bad_request', '這個 Email 已經邀請過了');
  if (list.length >= MAX_COLLABS) return fail('not_allowed', '每個網站最多 ' + MAX_COLLABS + ' 位協作者', 409);
  const old = await db.getOne('site_members', 'site_id=eq.' + site.id + '&email=eq.' + encodeURIComponent(email) + '&select=email');
  const now = (deps.now || (() => new Date()))().toISOString();
  if (old) await db.patch('site_members', 'site_id=eq.' + site.id + '&email=eq.' + encodeURIComponent(email), { status: 'invited', member_id: null, invited_by: user.id, created_at: now, accepted_at: null });
  else await db.insert('site_members', { site_id: site.id, email, status: 'invited', invited_by: user.id });
  await db.insert('site_events', { site_id: site.id, type: 'collab_invited', detail: { email, by } }).catch(() => {});
  let mailed = false;
  if (deps.sendMail) {
    const r = await deps.sendMail({ to: email, ...collabInvite({ shopName: (site.content && site.content.name) || site.slug, inviter: user.email || '', dashboardUrl: deps.dashboardUrl || '' }) }).catch(() => null);
    mailed = !!(r && r.ok);
  }
  return reply({ ok: true, message: '已邀請 ' + email + '。' + (mailed ? '對方會收到邀請信，' : '') + '對方用這個 Email 登入會員專區後就能一起編輯。' }, 200);
}

// 登入的會員接受所有寄到自己 Email 的邀請（會員專區開啟時自動呼叫）
async function acceptInvites(user, deps, reply) {
  const { db } = deps;
  const email = String(user.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return reply({ ok: true, accepted: 0 }, 200);
  const now = (deps.now || (() => new Date()))().toISOString();
  const r = await db.patchReturning('site_members', 'email=eq.' + encodeURIComponent(email) + '&status=eq.invited', { status: 'active', member_id: user.id, accepted_at: now });
  for (const x of r) await db.insert('site_events', { site_id: x.site_id, type: 'collab_joined', detail: { email, by: 'member:' + email } }).catch(() => {});
  return reply({ ok: true, accepted: r.length }, 200);
}

// ── 一頁版升級多頁版 ──
// 已付費、還有剩餘天數的網站：要補差額。先把網站改成多頁（可以編輯、預覽、發佈成待上線的版本），
// 管理員確認收到差額後才發佈多頁版；在那之前正式網站維持一頁版。還沒付過費或已到期的網站不用補差額。
const PAID_STATUSES = ['live', 'overdue', 'suspended'];
async function quoteFor(site, deps, fn = upgradeQuote) {
  const today = new Date((deps.now ? deps.now() : new Date()).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  if (!PAID_STATUSES.includes(site.status) || !site.paid_until) return { days: 0, amount: 0, yearly: false };
  const last = await deps.db.getOne('payments', 'site_id=eq.' + site.id + '&select=months&order=paid_on.desc');
  return fn({ paidUntil: site.paid_until, today, yearly: !!(last && last.months >= 12) });
}
async function upgradeAction(body, site, user, deps, reply, fail) {
  const { db } = deps;
  if (site.layout === 'multi') return fail('not_allowed', '這個網站已經是多頁版', 409);
  if (site.status === 'cancelled') return fail('not_allowed', '這個網站已終止服務', 409);
  const q = await quoteFor(site, deps);
  if (body.action === 'upgrade_quote') return reply({ ok: true, ...q }, 200);
  const pages = body.pages ? normalizePages(body.pages) : pagesFromSections(normalizeSections(site.sections));
  const pending = q.amount > 0;
  const now = (deps.now ? deps.now() : new Date()).toISOString();
  const done = await db.patchReturning('rental_sites', 'id=eq.' + site.id + '&layout=eq.single', { layout: 'multi', pages, upgrade_pending: pending, upgrade_amount: q.amount, upgrade_requested_at: now });
  if (!done.length) return fail('not_allowed', '這個網站已經是多頁版', 409);
  const by = 'member:' + (user.email || user.id);
  await db.insert('site_events', { site_id: site.id, type: 'layout_upgraded', detail: { amount: q.amount, days: q.days, yearly: q.yearly, pending, by } }).catch(() => {});
  if (pending && deps.sendMail && deps.adminEmail) {
    await deps.sendMail({ to: deps.adminEmail, ...adminUpgradeRequest({ shopName: (site.content && site.content.name) || site.slug, slug: site.slug, memberEmail: user.email || '', amount: q.amount, days: q.days, yearly: q.yearly, adminUrl: deps.adminUrl }) }).catch(() => null);
  }
  const r = done[0];
  return reply({ ok: true, layout: 'multi', pages: r.pages, upgraded_at: r.upgraded_at, upgrade_pending: pending, amount: q.amount, days: q.days, yearly: q.yearly,
    message: pending ? '已升級成多頁版。請匯款升級差額 NT$ ' + q.amount.toLocaleString('en-US') + '，我們確認收到後會自動發佈多頁版；在那之前正式網站維持一頁版。' : '已升級成多頁版，按「發佈」後正式網站就會變成多頁。' }, 200);
}

// ── 加購進階功能 ──
// 和升級多頁版一樣：已付費、還有剩餘天數要補差額，確認收款後才開通；沒有剩餘天數（還沒付費或已到期）直接開通，下一期起依新價格收費。
async function proAction(body, site, user, deps, reply, fail) {
  const { db } = deps;
  if (site.tier === 'pro') return fail('not_allowed', '這個網站已經有進階功能', 409);
  if (site.pro_pending) return fail('not_allowed', '已經申請過了，我們確認收到差額後就會開通', 409);
  if (site.status === 'cancelled') return fail('not_allowed', '這個網站已終止服務', 409);
  const q = await quoteFor(site, deps, proQuote);
  if (body.action === 'pro_quote') return reply({ ok: true, ...q }, 200);
  const pending = q.amount > 0;
  const now = (deps.now ? deps.now() : new Date()).toISOString();
  const done = await db.patchReturning('rental_sites', 'id=eq.' + site.id + '&tier=eq.basic&pro_pending=eq.false', pending ? { pro_pending: true, pro_amount: q.amount, pro_requested_at: now, next_tier: null } : { tier: 'pro', pro_amount: 0, pro_requested_at: now, next_tier: null });
  if (!done.length) return fail('not_allowed', '目前不能申請，請重新整理後再試', 409);
  const by = 'member:' + (user.email || user.id);
  await db.insert('site_events', { site_id: site.id, type: 'pro_requested', detail: { amount: q.amount, days: q.days, yearly: q.yearly, pending, by } }).catch(() => {});
  if (deps.sendMail && deps.adminEmail) {
    await deps.sendMail({ to: deps.adminEmail, ...adminProRequest({ shopName: (site.content && site.content.name) || site.slug, slug: site.slug, memberEmail: user.email || '', amount: q.amount, days: q.days, yearly: q.yearly, pending, adminUrl: deps.adminUrl }) }).catch(() => null);
  }
  // 直接開通、而且網站已上線：重新部署，讓已設定的行事曆等功能出現
  if (!pending && ['live', 'overdue'].includes(site.status) && site.live_version_id && deps.dispatch) await deps.dispatch({ siteId: site.id, versionId: site.live_version_id }).catch(() => null);
  return reply({ ok: true, pending, amount: q.amount, days: q.days, yearly: q.yearly,
    message: pending ? '已申請進階功能。請匯款差額 NT$ ' + q.amount.toLocaleString('en-US') + '，我們確認收到後就會開通。' : '已開通進階功能，下一期起依新價格計費。' }, 200);
}

// ── 下一期改方案（降級）：多頁 → 一頁、取消進階功能。續約確認收款時才生效，當期不退差價；可以隨時取消申請 ──
async function setNext(body, site, user, deps, reply, fail) {
  const { db } = deps;
  const patch = {};
  if ('next_layout' in body) {
    if (body.next_layout === 'single') { if (site.layout !== 'multi') return fail('bad_request', '網站已經是一頁版'); if (site.upgrade_pending) return fail('not_allowed', '升級還在等待補差額，不能同時申請改回一頁版', 409); patch.next_layout = 'single'; }
    else if (body.next_layout === null) patch.next_layout = null;
    else return fail('bad_request', '只能申請改回一頁版');
  }
  if ('next_tier' in body) {
    if (body.next_tier === 'basic') { if (site.tier !== 'pro') return fail('bad_request', '網站沒有進階功能'); patch.next_tier = 'basic'; }
    else if (body.next_tier === null) patch.next_tier = null;
    else return fail('bad_request', '只能申請取消進階功能');
  }
  if (!Object.keys(patch).length) return fail('bad_request', '沒有要變更的項目');
  await db.patch('rental_sites', 'id=eq.' + site.id, patch);
  await db.insert('site_events', { site_id: site.id, type: 'next_plan_set', detail: { ...patch, by: 'member:' + (user.email || user.id) } }).catch(() => {});
  const parts = [];
  if (patch.next_layout === 'single') parts.push('下一期起改回一頁版');
  if (patch.next_tier === 'basic') parts.push('下一期起取消進階功能');
  return reply({ ok: true, ...patch, message: parts.length ? '已申請：' + parts.join('、') + '。續約確認收款時生效，內容都會保留。' : '已取消改方案的申請。' }, 200);
}
