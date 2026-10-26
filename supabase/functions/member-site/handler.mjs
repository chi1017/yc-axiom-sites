// 會員自己管理網站的 Edge Function：自訂網域（設定、檢查、移除）、網站收款（店家自己的綠界帳號：設定金鑰、標記訂單已處理）。
// 只有網站擁有者能呼叫；網域邏輯與管理後台共用（_shared/domain.mjs）。
import { UUID, corsHeaders, parseOrigins, json } from '../_shared/http.mjs';
import { domainAction } from '../_shared/domain.mjs';
import { seal } from '../_shared/secretbox.mjs';
import { MERCHANT_RE, KEY_RE, PAY_MODES } from '../_shared/shop.mjs';
export { parseOrigins };

const ACTIONS = ['set_domain', 'check_domain', 'clear_domain', 'get_pay', 'set_pay', 'order_done'];

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
  if (typeof body.site_id !== 'string' || !UUID.test(body.site_id)) return reply({ error: 'bad_request', message: '缺少網站編號' }, 400);

  const { db } = deps;
  const siteId = body.site_id;
  const site = await db.getOne('rental_sites', 'id=eq.' + siteId + '&member_id=eq.' + user.id + '&select=*');
  if (!site) return reply({ error: 'not_found', message: '找不到這個網站' }, 404);
  const fail = (error, message, status = 400) => reply({ error, message }, status);
  if (['get_pay', 'set_pay', 'order_done'].includes(body.action)) return payAction(body, site, user, deps, reply, fail);
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
