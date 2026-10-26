// 客戶網站對外的 Edge Function（不需登入）：
//   POST …/site-public/contact  聯絡表單（一般 HTML 表單送出，不需要 JavaScript）→ 存進 site_messages、寄信給店家 → 導回網站的感謝頁
//   POST …/site-public/booking  線上預約申請（同上，另外檢查日期時間是否在營業時間內）
//   POST …/site-public/ecpay, ecpay-period, ecpay-info  綠界付款結果通知（驗證檢查碼後自動入帳；同一筆只入帳一次）
//   POST …/site-public/hit      瀏覽計數（網站用 sendBeacon 送出）→ 每日每頁的次數，不記錄個人資料
import { UUID } from '../_shared/http.mjs';
import { checkBooking } from '../../../templates/shared/booking.js';
import { verifyMac } from '../_shared/ecpay.mjs';
import { applyPayment } from '../_shared/payment.mjs';
import { taipeiDate } from '../_shared/dates.mjs';

export const LIMITS = { name: 60, contact: 120, message: 2000, perIpHour: 5, perSiteDay: 100 };
const LIVE = ['live', 'overdue'];
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|facebookexternalhit|curl|wget|python|node-fetch/i;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clean = (v, max) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// 網站目前的正式網址（自訂網域生效時用自訂網域）。只會導回這個網址，避免被拿來當跳板。
export function siteBase(site) {
  if (site.custom_domain && site.domain_status === 'active') return 'https://' + site.custom_domain + '/';
  const u = String(site.public_url || '');
  return /^https:\/\/[a-z0-9.-]+\/?$/i.test(u) ? u.replace(/\/?$/, '/') : '';
}
const page = (title, text, back) => new Response('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(title) + '</title>' +
  '<body style="font:16px/1.8 -apple-system,BlinkMacSystemFont,\'Noto Sans TC\',sans-serif;max-width:560px;margin:15vh auto;padding:0 20px"><h1 style="font-size:22px">' + esc(title) + '</h1><p>' + esc(text) + '</p>' +
  (back ? '<p><a href="' + esc(back) + '">回到網站</a></p>' : '<p><a href="javascript:history.back()">回上一頁</a></p>') + '</body></html>',
  { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

export function shopMessageEmail({ shopName, name, contact, message, base, kind = 'message', when = '' }) {
  const subject = '「' + shopName + '」' + (kind === 'booking' ? '預約申請：' + when + ' ' : '網站留言：') + name;
  const intro = kind === 'booking' ? '有人透過網站送出預約申請，請與對方聯絡確認（網站不會自動保留時段）：' : '有人透過網站的聯絡表單留言給你：';
  const text = shopName + ' 你好，\n\n' + intro + '\n\n姓名：' + name + '\n聯絡方式：' + contact + '\n\n' + message + '\n\n' +
    (EMAIL.test(contact) ? '直接回覆這封信，就會寄給對方。\n' : '請用對方留下的聯絡方式回覆。\n') + '所有留言也可以在會員專區查看。\n\n網站：' + base;
  const html = '<p>' + esc(shopName) + ' 你好，</p><p>' + esc(intro) + '</p>' +
    '<table style="border-collapse:collapse"><tr><td style="padding:2px 12px 2px 0;color:#777">姓名</td><td>' + esc(name) + '</td></tr><tr><td style="padding:2px 12px 2px 0;color:#777">聯絡方式</td><td>' + esc(contact) + '</td></tr></table>' +
    '<p style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:12px">' + esc(message) + '</p>' +
    '<p style="color:#777;font-size:14px">' + (EMAIL.test(contact) ? '直接回覆這封信，就會寄給對方。' : '請用對方留下的聯絡方式回覆。') + '所有留言也可以在會員專區查看。</p>';
  return { subject, text, html };
}

/** deps: { db: { getOne, insert, count, rpc, patch }, sendMail, now?, salt? } */
export async function handlePublic(req, deps) {
  const url = new URL(req.url);
  const route = url.pathname.replace(/\/+$/, '').split('/').pop();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type' } });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (route === 'hit') return hit(req, deps);
  if (route === 'ecpay' || route === 'ecpay-period' || route === 'ecpay-info') return ecpayNotify(req, deps, route);
  if (route === 'contact') return contact(req, deps, 'message');
  if (route === 'booking') return contact(req, deps, 'booking');
  return new Response('not found', { status: 404 });
}

async function hit(req, deps) {
  const ok = new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
  if (BOT.test(req.headers.get('user-agent') || '')) return ok;
  let b;
  try { const t = await req.text(); if (t.length > 500) return ok; b = JSON.parse(t); } catch { return ok; }
  if (!b || typeof b.s !== 'string' || !UUID.test(b.s)) return ok;
  let path = String(b.p || '/').split('?')[0].split('#')[0];
  if (!/^\/[a-z0-9/_-]{0,118}$/i.test(path)) path = '/other';
  await deps.db.rpc('rental_record_hit', { p_site: b.s, p_path: path }).catch(() => {});
  return ok;
}

async function contact(req, deps, kind) {
  let f;
  try { const t = await req.text(); if (t.length > 12000) return page('留言太長', '請縮短內容後再送出。'); f = new URLSearchParams(t); } catch { return page('送出失敗', '請稍後再試一次。'); }
  const siteId = f.get('site') || '';
  if (!UUID.test(siteId)) return page('送出失敗', '表單資料不完整，請重新整理網頁後再試。');
  const site = await deps.db.getOne('rental_sites', 'id=eq.' + siteId + '&select=id,member_id,status,public_url,custom_domain,domain_status,content');
  if (!site || !LIVE.includes(site.status)) return page('送出失敗', '這個網站目前無法接收留言。');
  const base = siteBase(site);
  const thanks = base ? base + 'thanks/' : '';
  // 機器人陷阱：看不見的欄位有值就當作已送出（不告訴機器人被擋）
  if (f.get('website')) return thanks ? Response.redirect(thanks, 303) : page('已送出', '謝謝你的留言。');
  const now = (deps.now || (() => new Date()))();
  const name = clean(f.get('name'), LIMITS.name), contactV = clean(f.get('contact'), LIMITS.contact);
  let message = clean(f.get('message'), LIMITS.message), meta = null, when = '';
  if (kind === 'booking') {
    const date = clean(f.get('date'), 10), time = clean(f.get('time'), 5);
    const people = Math.max(0, Math.min(50, parseInt(f.get('people') || '0', 10) || 0)), item = clean(f.get('item'), 60);
    const today = new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const chk = checkBooking({ hours: (site.content && site.content.hours) || {}, date, time, today });
    if (!chk.ok) return page('預約時間需要調整', chk.msg + '。', base);
    when = date.replace(/-/g, '/') + ' ' + time;
    meta = { date, time, ...(people ? { people } : {}), ...(item ? { item } : {}) };
    message = '預約：' + when + (people ? '・' + people + ' 人' : '') + (item ? '・' + item : '') + (message ? '\n備註：' + message : '');
  }
  if (!name || !contactV || !message) return page('還有欄位沒填', '請填寫姓名、聯絡方式與留言內容。');
  if ((message.match(/https?:\/\//gi) || []).length > 2) return page('送出失敗', '留言裡的網址太多，請刪減後再送出。');

  const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const ipHash = ip ? (await sha256((deps.salt || '') + '|' + now.toISOString().slice(0, 10) + '|' + ip)).slice(0, 32) : null;
  const hourAgo = new Date(now.getTime() - 3600 * 1000).toISOString(), dayAgo = new Date(now.getTime() - 86400 * 1000).toISOString();
  if (ipHash && (await deps.db.count('site_messages', 'ip_hash=eq.' + ipHash + '&created_at=gte.' + encodeURIComponent(hourAgo))) >= LIMITS.perIpHour) return page('送出太頻繁', '請稍後再試，或直接用電話、LINE 聯絡店家。', base);
  if ((await deps.db.count('site_messages', 'site_id=eq.' + siteId + '&created_at=gte.' + encodeURIComponent(dayAgo))) >= LIMITS.perSiteDay) return page('暫時無法留言', '今天的留言已經很多了，請改用電話或 LINE 聯絡店家。', base);

  const row = await deps.db.insertReturning('site_messages', { site_id: siteId, name, contact: contactV, message, ip_hash: ipHash, kind, ...(meta ? { meta } : {}) });
  const owner = await deps.db.getOne('members', 'id=eq.' + site.member_id + '&select=email');
  if (owner && owner.email && deps.sendMail) {
    const shopName = (site.content && site.content.name) || '你的網站';
    const m = shopMessageEmail({ shopName, name, contact: contactV, message, base, kind, when });
    const r = await deps.sendMail({ to: owner.email, ...m, ...(EMAIL.test(contactV) ? { replyTo: contactV } : {}) }).catch(() => ({ ok: false }));
    if (r && r.ok && row && row.id) await deps.db.patch('site_messages', 'id=eq.' + row.id, { emailed: true }).catch(() => {});
  }
  return thanks ? Response.redirect(thanks, 303) : page('已送出', kind === 'booking' ? '已收到你的預約申請，店家確認後會與你聯絡。' : '謝謝你的留言，店家會盡快回覆你。');
}

// ── 綠界付款通知 ──
// 回 "1|OK" 表示收到；驗證失敗回 "0|…"。入帳用條件式更新（樂觀鎖），重複通知或同時到達都只會入帳一次。
const text = (t) => new Response(t, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
async function ecpayNotify(req, deps, route) {
  const cfg = deps.ecpay;
  if (!cfg) return text('0|not configured');
  let f;
  try { const t = await req.text(); if (t.length > 8000) return text('0|too large'); f = Object.fromEntries(new URLSearchParams(t)); } catch { return text('0|bad request'); }
  if (!(await verifyMac(f, cfg))) return text('0|CheckMacValue Error');
  if (f.MerchantID !== cfg.merchantId) return text('0|MerchantID Error');
  const { db } = deps;
  const tradeNo = String(f.MerchantTradeNo || '');
  if (!/^[A-Za-z0-9]{1,20}$/.test(tradeNo)) return text('0|bad trade no');
  const order = await db.getOne('pay_orders', 'trade_no=eq.' + tradeNo + '&select=*');
  if (!order) return text('0|order not found');
  const now = (deps.now || (() => new Date()))();
  const notify = { route, RtnCode: f.RtnCode, RtnMsg: String(f.RtnMsg || '').slice(0, 200), TradeNo: f.TradeNo, at: now.toISOString() };
  const touch = (extra) => db.patch('pay_orders', 'trade_no=eq.' + tradeNo, { last_notify: notify, updated_at: now.toISOString(), ...extra }).catch(() => {});
  const event = (type, detail) => db.insert('site_events', { site_id: order.site_id, type, detail: { ...detail, trade_no: tradeNo, by: 'ecpay' } }).catch(() => {});
  // 正式環境收到「模擬付款」不入帳
  if (cfg.mode === 'prod' && f.SimulatePaid === '1') { await touch({}); return text('1|OK'); }

  if (route === 'ecpay-info') {
    // ATM 取號：記下銀行代碼、虛擬帳號、繳費期限（會員專區會顯示）
    if (order.status === 'created') await touch({ status: 'atm_issued', atm: { bank: f.BankCode || '', account: f.vAccount || '', expire: f.ExpireDate || '' } });
    return text('1|OK');
  }
  const site = await db.getOne('rental_sites', 'id=eq.' + order.site_id + '&select=*');
  if (!site) { await touch({}); return text('1|OK'); }
  const today = taipeiDate(now);
  const credit = (months, method, amount) => applyPayment({ db, site, siteId: site.id, amount, months, method, reference: '綠界 ' + String(f.TradeNo || tradeNo).slice(0, 40) + (order.test ? '（測試）' : ''),
    paidOn: today, by: 'ecpay', today, event, queueDeploy: async ({ versionId }) => {
      const d = await deps.dispatch({ siteId: site.id, versionId }).catch((e) => ({ ok: false, error: String(e) }));
      if (!d.ok) await event('deploy_failed', { message: '無法啟動部署：' + String(d.error || '').slice(0, 200), ...(versionId ? { version_id: versionId } : {}) });
      return d;
    }, sendMail: deps.sendMail, deployWarn: '自動部署沒有啟動，請到後台按重新發佈。' });

  if (f.RtnCode !== '1') {
    await touch(order.kind === 'card_monthly' && order.status === 'active' ? {} : (order.status === 'created' ? { status: 'failed' } : {}));
    await event(route === 'ecpay-period' ? 'recurring_failed' : 'payment_failed', { code: f.RtnCode, message: notify.RtnMsg });
    return text('1|OK');
  }
  const paidAmount = Number(route === 'ecpay-period' ? f.Amount : f.TradeAmt);
  if (paidAmount !== order.amount) { await touch({}); await event('payment_mismatch', { expected: order.amount, got: paidAmount }); return text('1|OK'); }

  if (order.kind === 'card_monthly') {
    // 第一次授權（ReturnURL）與之後每期（PeriodReturnURL）都用「累計成功次數」對帳，只補入還沒入帳的次數
    const times = route === 'ecpay-period' ? Math.max(1, parseInt(f.TotalSuccessTimes || '0', 10) || 0) : 1;
    const prev = order.success_times, amount = order.amount;
    if (times <= prev) { await touch({}); return text('1|OK'); }
    const won = await db.patchReturning('pay_orders', 'trade_no=eq.' + tradeNo + '&success_times=eq.' + prev, { success_times: times, status: order.status === 'cancelled' ? 'cancelled' : 'active', last_notify: notify, updated_at: now.toISOString() });
    if (!won.length) return text('1|OK');
    await credit(times - prev, 'credit_recurring', amount * (times - prev));
    return text('1|OK');
  }
  // 一次付清（信用卡、ATM）
  const { months, kind, amount } = order;
  const won = await db.patchReturning('pay_orders', 'trade_no=eq.' + tradeNo + '&status=in.(created,atm_issued,failed)', { status: 'paid', last_notify: notify, updated_at: now.toISOString() });
  if (!won.length) return text('1|OK');
  await credit(months, kind === 'atm' ? 'atm' : 'credit', amount);
  return text('1|OK');
}
