// 會員自己管理網站的 Edge Function：自訂網域（設定、檢查、移除）、線上付款（綠界：付款選項、建立結帳、取消每月自動扣款）。
// 只有網站擁有者能呼叫；網域邏輯與管理後台共用（_shared/domain.mjs）。
import { UUID, corsHeaders, parseOrigins, json } from '../_shared/http.mjs';
import { domainAction } from '../_shared/domain.mjs';
import { checkoutFields, newTradeNo, cancelPeriod } from '../_shared/ecpay.mjs';
import { PAY_OPTIONS, planFor, priceFor } from '../_shared/plans.mjs';
export { parseOrigins };

const ACTIONS = ['set_domain', 'check_domain', 'clear_domain', 'pay_options', 'checkout', 'cancel_recurring'];
const PAYABLE = ['pending', 'live', 'overdue', 'suspended'];

/** deps: { allowedOrigins, getUser, db, dispatch, cf?, ecpay?: {mode, merchantId, hashKey, hashIV, checkout, period}, publicApi?, dashboardUrl?, now?, fetchImpl? } */
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
  if (['pay_options', 'checkout', 'cancel_recurring'].includes(body.action)) return payAction(body, site, user, deps, reply, fail);
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

// ── 線上付款 ──
// 測試環境（還沒放正式金鑰）只開放管理員測試，避免客戶用測試卡號免費開通
async function payAction(body, site, user, deps, reply, fail) {
  const cfg = deps.ecpay;
  const enabled = !!cfg && !!deps.publicApi && (cfg.mode === 'prod' || user.isAdmin);
  const { db } = deps;
  const now = (deps.now || (() => new Date()))();
  const plan = planFor(site.layout);
  if (body.action === 'pay_options') {
    if (!enabled) return reply({ ok: true, enabled: false }, 200);
    const active = await db.getOne('pay_orders', 'site_id=eq.' + site.id + '&kind=eq.card_monthly&status=eq.active&select=trade_no,success_times,amount');
    return reply({ ok: true, enabled: PAYABLE.includes(site.status), test: cfg.mode !== 'prod', plan: plan.name, recurring: active || null,
      options: Object.entries(PAY_OPTIONS).filter(([k]) => !(active && k === 'card_monthly')).map(([key, o]) => ({ key, label: o.label, months: o.months, amount: priceFor(site.layout, o.months) })) }, 200);
  }
  if (!enabled) return fail('not_enabled', '線上付款尚未開放，請先用銀行轉帳', 409);
  if (body.action === 'cancel_recurring') {
    const active = await db.getOne('pay_orders', 'site_id=eq.' + site.id + '&kind=eq.card_monthly&status=eq.active&select=trade_no');
    if (!active) return fail('no_recurring', '這個網站沒有設定每月自動扣款', 409);
    const r = await cancelPeriod(active.trade_no, cfg, deps.fetchImpl, now).catch((e) => ({ ok: false, message: String(e.message || e) }));
    if (!r.ok) return fail('ecpay_error', '取消失敗：' + (r.message || '請稍後再試'), 502);
    await db.patch('pay_orders', 'trade_no=eq.' + active.trade_no, { status: 'cancelled', updated_at: now.toISOString() });
    await db.insert('site_events', { site_id: site.id, type: 'recurring_cancelled', detail: { trade_no: active.trade_no, by: 'member:' + (user.email || user.id) } }).catch(() => {});
    return reply({ ok: true, message: '已取消每月自動扣款。目前已付的期間不受影響，到期前會再寄提醒。' }, 200);
  }
  // checkout
  const opt = PAY_OPTIONS[body.option];
  if (!opt) return fail('bad_request', '請選擇付款方式');
  if (!PAYABLE.includes(site.status)) return fail('not_allowed', site.status === 'draft' ? '請先在編輯器按「發佈」送出上線申請，再付款' : '這個網站目前無法付款', 409);
  if (opt.kind === 'card_monthly' && await db.getOne('pay_orders', 'site_id=eq.' + site.id + '&kind=eq.card_monthly&status=eq.active&select=trade_no')) return fail('already_recurring', '這個網站已經設定每月自動扣款', 409);
  const amount = priceFor(site.layout, opt.months);
  const tradeNo = newTradeNo(now);
  await db.insert('pay_orders', { trade_no: tradeNo, site_id: site.id, member_id: site.member_id, kind: opt.kind, months: opt.months, amount, test: cfg.mode !== 'prod' });
  const api = deps.publicApi.replace(/\/$/, '');
  const shop = String((site.content && site.content.name) || site.slug).replace(/[#&]/g, ' ').slice(0, 30);
  const fields = await checkoutFields({
    tradeNo, amount, kind: opt.kind, now,
    itemName: '網站租用 ' + plan.name + ' ' + (opt.kind === 'card_monthly' ? '每月' : opt.months + ' 個月') + '（' + shop + '）',
    returnUrl: api + '/ecpay', periodReturnUrl: api + '/ecpay-period', paymentInfoUrl: api + '/ecpay-info',
    clientBackUrl: deps.dashboardUrl || undefined
  }, cfg);
  return reply({ ok: true, action: cfg.checkout, fields, test: cfg.mode !== 'prod' }, 200);
}
