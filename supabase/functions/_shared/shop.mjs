// 店家網站的線上收款（店家自己的綠界帳號）：設定檢查、訂單計算、結帳頁、付款通知處理。
// 價格一律以「上線中的版本」內容為準，不相信瀏覽器送來的金額。
import { ECPAY_TEST, ECPAY_URL } from './ecpay.mjs';
import { open } from './secretbox.mjs';
import { normalizeContent, liveItems } from '../../../templates/shared/content.js';

export const MERCHANT_RE = /^\d{7,10}$/;
export const KEY_RE = /^[A-Za-z0-9]{16}$/;
export const PAY_MODES = ['off', 'test', 'live'];
export const MAX_QTY = 99;
export const MAX_ORDER = 1000000;

// 店家的收款設定 → 綠界參數；test＝綠界公開的測試帳號（不會真的收款），live＝店家自己的帳號
export async function shopPayConfig(row, secret) {
  if (!row || row.mode === 'off') return null;
  if (row.mode === 'test') return { mode: 'test', ...ECPAY_TEST, ...ECPAY_URL.stage };
  if (row.mode !== 'live' || !MERCHANT_RE.test(row.merchant_id || '')) return null;
  const hashKey = await open(row.key_enc, secret), hashIV = await open(row.iv_enc, secret);
  if (!hashKey || !hashIV) return null;
  return { mode: 'live', merchantId: row.merchant_id, hashKey, hashIV, ...ECPAY_URL.prod };
}

// 表單的 q_<商品代碼>＝數量 → 訂單明細與金額
export function cartFromForm(rawContent, form) {
  const c = normalizeContent(rawContent);
  if (!c.shop.enabled) return { ok: false, msg: '這個網站目前沒有開放線上購買。' };
  const items = [];
  for (const it of liveItems(c)) {
    const q = parseInt(form.get('q_' + it.id) || '0', 10);
    if (q > 0) items.push({ id: it.id, name: it.name, price: it.price, qty: Math.min(q, MAX_QTY) });
  }
  if (!items.length) return { ok: false, msg: '請先選擇要購買的品項與數量。' };
  const amount = items.reduce((s, i) => s + i.price * i.qty, 0);
  if (amount > MAX_ORDER) return { ok: false, msg: '單筆訂單金額太高，請分成幾筆或直接與店家聯絡。' };
  return { ok: true, items, amount, shopName: c.name };
}

// 綠界 ItemName：多個品項用 # 分隔，總長 400 字以內
export function itemNameOf(items) {
  const s = items.map((i) => String(i.name).replace(/[#&]/g, ' ') + ' x' + i.qty).join('#');
  return [...s].length > 190 ? [...s].slice(0, 188).join('') + '…' : s;
}

const escA = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// 自動把欄位 POST 到綠界的頁面（綠界規定要由瀏覽器送出）；沒有 JavaScript 時顯示按鈕
export function autoPostPage(action, fields, title = '前往付款') {
  return '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + escA(title) + '</title>' +
    "<body style=\"font:16px/1.8 -apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:560px;margin:15vh auto;padding:0 20px\">" +
    '<form id="f" method="post" action="' + escA(action) + '">' + Object.entries(fields).map(([k, v]) => '<input type="hidden" name="' + escA(k) + '" value="' + escA(v) + '">').join('') +
    '<p>正在前往綠界付款頁…</p><p><button type="submit" style="font:inherit;padding:10px 24px">前往付款</button></p></form>' +
    '<script>document.getElementById("f").submit()</script></body></html>';
}

// 付款通知的狀態判斷：RtnCode 1＝付款成功；2（ATM）、10100073（超商代碼）、10100058（條碼）＝已取號等待繳費
export function notifyKind(route, rtnCode) {
  if (route === 'shop-info') return ['2', '10100073', '10100058'].includes(String(rtnCode)) ? 'awaiting' : 'failed';
  return String(rtnCode) === '1' ? 'paid' : 'failed';
}

// 店家通知信與買家確認信
const money = (n) => 'NT$ ' + Number(n).toLocaleString('en-US');
export function orderMails({ shopName, order, base }) {
  const isDeposit = order.kind === 'deposit';
  const b = order.buyer || {};
  const lines = isDeposit ? ['預約訂金 ' + money(order.amount)] : (order.items || []).map((i) => i.name + ' x ' + i.qty + '　' + money(i.price * i.qty));
  const rows = [['訂單編號', order.trade_no], ['金額', money(order.amount)], ['姓名', b.name || ''], ['手機', b.phone || ''], ['Email', b.email || '']];
  if (b.address) rows.push(['收件地址', b.address]);
  if (b.note) rows.push(['備註', b.note]);
  if (order.test) rows.push(['注意', '這是測試訂單，沒有實際收款']);
  const table = (rs) => '<table style="border-collapse:collapse">' + rs.map((r) => '<tr><td style="padding:3px 14px 3px 0;color:#777;white-space:nowrap;vertical-align:top">' + escA(r[0]) + '</td><td>' + escA(r[1]) + '</td></tr>').join('') + '</table>';
  const list = '<ul style="padding-left:18px">' + lines.map((l) => '<li>' + escA(l) + '</li>').join('') + '</ul>';
  const owner = {
    subject: '「' + shopName + '」' + (isDeposit ? '預約訂金已付款' : '新訂單已付款') + '：' + money(order.amount) + (order.test ? '（測試）' : ''),
    html: '<p>' + escA(shopName) + ' 你好，</p><p>' + (isDeposit ? '有客人付了預約訂金，預約內容在另一封預約通知信與會員專區。' : '有一筆新訂單已經付款完成，請盡快處理：') + '</p>' + list + table(rows) +
      '<p style="color:#777;font-size:14px">直接回覆這封信會寄給買家。所有訂單也可以在會員專區查看。款項會依你和綠界的約定撥款到你的帳戶。</p>',
    text: shopName + ' 你好，\n\n' + (isDeposit ? '有客人付了預約訂金。' : '有一筆新訂單已經付款完成：') + '\n\n' + lines.join('\n') + '\n\n' + rows.map((r) => r[0] + '：' + r[1]).join('\n') + '\n\n所有訂單也可以在會員專區查看。'
  };
  const buyer = b.email ? {
    subject: '【' + shopName + '】' + (isDeposit ? '已收到你的預約訂金' : '已收到你的訂單付款') + (order.test ? '（測試）' : ''),
    html: '<p>' + escA(b.name || '') + ' 你好，</p><p>謝謝你！' + escA(shopName) + ' 已收到你的' + (isDeposit ? '預約訂金，店家確認預約後會與你聯絡。' : '付款，會盡快為你處理訂單。') + '</p>' + list + table(rows.slice(0, 2)) +
      '<p style="color:#777;font-size:14px">有任何問題，直接回覆這封信就會寄給店家。' + (base ? '網站：' + escA(base) : '') + '</p>',
    text: (b.name || '') + ' 你好，\n\n謝謝你！' + shopName + ' 已收到你的' + (isDeposit ? '預約訂金。' : '付款。') + '\n\n' + lines.join('\n') + '\n訂單編號：' + order.trade_no + '\n\n有任何問題，直接回覆這封信就會寄給店家。'
  } : null;
  return { owner, buyer };
}
