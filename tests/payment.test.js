import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMac, verifyMac, ECPAY_TEST, ecpayConfig, checkoutFields, newTradeNo } from '../supabase/functions/_shared/ecpay.mjs';
import { priceFor } from '../supabase/functions/_shared/plans.mjs';
import { seal, open } from '../supabase/functions/_shared/secretbox.mjs';
import { cartFromForm, itemNameOf } from '../supabase/functions/_shared/shop.mjs';
import { handleMember } from '../supabase/functions/member-site/handler.mjs';
import { handlePublic } from '../supabase/functions/site-public/handler.mjs';
import { parseOrigins } from '../supabase/functions/_shared/http.mjs';

const SID = '11111111-1111-1111-1111-111111111111';
const NOW = new Date('2026-10-26T04:00:00Z');   // 台灣 2026-10-26 12:00
const CFG = ecpayConfig({});

// 綠界檢查碼與欄位（租金線上付款已移除，但店家收款共用同一套）
test('checkMac matches ECPay\'s published example', async () => {
  const p = { TradeDesc: '促銷方案', PaymentType: 'aio', MerchantTradeDate: '2023/03/12 15:30:23', MerchantTradeNo: 'ecpay20230312153023', MerchantID: '3002607', ReturnURL: 'https://www.ecpay.com.tw/receive.php', ItemName: 'Apple iphone 15', TotalAmount: '30000', ChoosePayment: 'ALL', EncryptType: '1' };
  assert.equal(await checkMac(p, ECPAY_TEST), '6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840');
});
test('config: test environment unless prod keys are all set; prices follow the plans', () => {
  assert.equal(ecpayConfig({}).mode, 'stage'); assert.equal(ecpayConfig({ ECPAY_ENV: 'prod', ECPAY_MERCHANT_ID: '1' }).mode, 'stage');
  const p = ecpayConfig({ ECPAY_ENV: 'prod', ECPAY_MERCHANT_ID: 'M', ECPAY_HASH_KEY: 'K', ECPAY_HASH_IV: 'V' });
  assert.equal(p.mode, 'prod'); assert.match(p.checkout, /^https:\/\/payment\.ecpay/);
  assert.equal(priceFor('single', 1), 599); assert.equal(priceFor('single', 12), 5990); assert.equal(priceFor('multi', 12), 8990); assert.equal(priceFor('multi', 1), 899);
  assert.match(newTradeNo(NOW), /^YC[A-Z0-9]{1,18}$/); assert.ok(newTradeNo(NOW).length <= 20);
});
test('checkout fields: recurring has PeriodAmount = TotalAmount, monthly, ATM has expiry + info URL, signature verifies', async () => {
  const r = await checkoutFields({ tradeNo: 'YCTEST1', amount: 599, kind: 'card_monthly', itemName: 'x', returnUrl: 'https://r/ecpay', periodReturnUrl: 'https://r/ecpay-period', now: NOW }, CFG);
  assert.equal(r.PeriodAmount, '599'); assert.equal(r.TotalAmount, '599'); assert.equal(r.PeriodType, 'M'); assert.equal(r.Frequency, '1'); assert.equal(r.ChoosePayment, 'Credit');
  assert.equal(r.MerchantTradeDate, '2026/10/26 12:00:00'); assert.ok(await verifyMac(r, CFG));
  const a = await checkoutFields({ tradeNo: 'YCTEST2', amount: 5990, kind: 'atm', itemName: 'x', returnUrl: 'https://r/ecpay', paymentInfoUrl: 'https://r/ecpay-info', now: NOW }, CFG);
  assert.equal(a.ChoosePayment, 'ATM'); assert.equal(a.ExpireDate, '3'); assert.equal(a.PaymentInfoURL, 'https://r/ecpay-info'); assert.ok(!a.PeriodAmount);
  assert.equal(await verifyMac({ ...a, TotalAmount: '1' }, CFG), false);
});

const SECRET = 'service-role-secret-for-tests';
const LIVE_CONTENT = { name: '好喝咖啡', bookingForm: true, bookingDeposit: 200, hours: {},
  shop: { enabled: true, items: [{ id: 'cake1', name: '起司蛋糕', price: 120 }, { id: 'bean1', name: '咖啡豆#半磅', price: 450 }] } };

// ── 共用假資料庫 ──
function world({ site = {}, pay = null, orders = [] } = {}) {
  const t = { rental_sites: [{ id: SID, member_id: 'u1', slug: 'shop', status: 'live', layout: 'single', public_url: 'https://shop.pages.dev', live_version_id: 'v1',
      content: { name: '好喝咖啡', shop: { enabled: true, items: [{ id: 'cake1', name: '起司蛋糕', price: 1 }] } }, ...site }],
    site_versions: [{ id: 'v1', site_id: SID, content: LIVE_CONTENT }], site_pay_settings: pay ? [{ site_id: SID, member_id: 'u1', ...pay }] : [],
    shop_orders: orders.map((o) => ({ status: 'created', test: true, member_id: 'u1', site_id: SID, ...o })), site_events: [], site_messages: [], members: [{ id: 'u1', email: 'o@x.tw' }] };
  const log = { dispatches: [], mails: [] };
  const match = (row, q) => q.split('&').every((part) => {
    const [k, v] = part.split('='); if (['select', 'limit', 'order'].includes(k) || !v) return true;
    if (v.startsWith('eq.')) return String(row[k]) === decodeURIComponent(v.slice(3));
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(row[k]));
    return true;
  });
  const db = {
    t,
    getOne: async (tb, q) => t[tb].find((r) => match(r, q)) || null,
    list: async (tb, q) => t[tb].filter((r) => match(r, q)),
    count: async () => 0,
    insert: async (tb, b) => { t[tb].push({ ...(tb === 'shop_orders' ? { status: 'created' } : {}), ...b }); },
    insertReturning: async (tb, b) => { const r = { id: tb + (t[tb].length + 1), ...b }; t[tb].push(r); return r; },
    patch: async (tb, q, b) => { t[tb].filter((r) => match(r, q)).forEach((r) => Object.assign(r, b)); },
    patchReturning: async (tb, q, b) => { const rows = t[tb].filter((r) => match(r, q)); rows.forEach((r) => Object.assign(r, b)); return rows; }
  };
  const deps = { db, now: () => NOW, paySecret: SECRET, publicApi: 'https://p.supabase.co/functions/v1/site-public',
    sendMail: async (m) => { log.mails.push(m); return { ok: true }; }, dispatch: async (a) => { log.dispatches.push(a); return { ok: true }; } };
  const member = async (body) => { const r = await handleMember(new Request('https://x/functions/v1/member-site', { method: 'POST', headers: { origin: 'https://chi1017.github.io', authorization: 'Bearer good' }, body: JSON.stringify({ site_id: SID, ...body }) }),
    { ...deps, allowedOrigins: parseOrigins(), getUser: async () => ({ id: 'u1', email: 'o@x.tw' }) }); return { status: r.status, j: await r.json() }; };
  const post = async (route, form) => { const r = await handlePublic(new Request('https://x/functions/v1/site-public/' + route, { method: 'POST', body: new URLSearchParams(form).toString() }), deps); return { status: r.status, loc: r.headers.get('location'), body: await r.text() }; };
  const notify = async (route, fields, cfg = CFG) => { const f = { MerchantID: cfg.merchantId, ...fields }; f.CheckMacValue = await checkMac(f, cfg); return (await post(route, f)).body; };
  return { t, log, member, post, notify };
}
const fieldsOf = (html) => Object.fromEntries([...html.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map((m) => [m[1], m[2].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')]));

test('secretbox: round trip; wrong secret or tampered box gives nothing', async () => {
  const b = await seal('pwFHCqoQZGmho4w6', SECRET);
  assert.match(b, /^v1\./); assert.ok(!b.includes('pwFH'));
  assert.equal(await open(b, SECRET), 'pwFHCqoQZGmho4w6');
  assert.equal(await open(b, 'other'), null); assert.equal(await open(b.slice(0, -4) + 'AAAA', SECRET), null); assert.equal(await open('', SECRET), null);
});

test('cart: prices come from the content, quantities capped, unknown items ignored, ItemName safe', () => {
  const f = new URLSearchParams('q_cake1=2&q_bean1=200&q_nope=3&price=1');
  const c = cartFromForm(LIVE_CONTENT, f);
  assert.equal(c.ok, true); assert.equal(c.amount, 2 * 120 + 99 * 450);
  assert.equal(itemNameOf(c.items), '起司蛋糕 x2#咖啡豆 半磅 x99');
  assert.equal(cartFromForm(LIVE_CONTENT, new URLSearchParams('q_cake1=0')).ok, false);
  assert.equal(cartFromForm({ ...LIVE_CONTENT, shop: { enabled: false, items: LIVE_CONTENT.shop.items } }, f).ok, false);
});

test('set_pay: live needs a real MerchantID and 16-char keys; keys are stored encrypted and never returned', async () => {
  const w = world();
  assert.equal((await w.member({ action: 'get_pay' })).j.mode, 'off');
  assert.equal((await w.member({ action: 'set_pay', mode: 'live', merchant_id: '3002607', hash_key: 'a'.repeat(16), hash_iv: 'b'.repeat(16) })).status, 400);
  assert.equal((await w.member({ action: 'set_pay', mode: 'live', merchant_id: '1234567', hash_key: 'short', hash_iv: 'b'.repeat(16) })).status, 400);
  const r = await w.member({ action: 'set_pay', mode: 'live', merchant_id: '1234567', hash_key: 'KEY0123456789abc', hash_iv: 'IV0123456789abcd' });
  assert.equal(r.status, 200); assert.equal(r.j.mode, 'live'); assert.equal(r.j.has_keys, true); assert.ok(!JSON.stringify(r.j).includes('KEY0123'));
  const row = w.t.site_pay_settings[0];
  assert.ok(!JSON.stringify(row).includes('KEY0123') && !JSON.stringify(row).includes('IV0123'));
  assert.equal(await open(row.key_enc, SECRET), 'KEY0123456789abc');
  assert.equal(w.log.dispatches.length, 1, 'off → on redeploys the live site so the pay button appears');
  // 不改金鑰只改模式：留空即可
  assert.equal((await w.member({ action: 'set_pay', mode: 'live', merchant_id: '1234567' })).status, 200);
  assert.equal(await open(w.t.site_pay_settings[0].key_enc, SECRET), 'KEY0123456789abc');
  assert.equal(w.log.dispatches.length, 1);
  assert.equal((await w.member({ action: 'set_pay', mode: 'off' })).j.mode, 'off'); assert.equal(w.log.dispatches.length, 2);
});

test('shop: order uses the live version prices (not the draft or the form), test mode posts to the ECPay stage page', async () => {
  const w = world({ pay: { mode: 'test' } });
  const r = await w.post('shop', { site: SID, q_cake1: '3', name: '王小明', phone: '0912345678', email: 'b@x.tw', address: '高雄市', note: '下午到' });
  assert.equal(r.status, 200); assert.match(r.body, /action="https:\/\/payment-stage\.ecpay\.com\.tw\/Cashier\/AioCheckOut\/V5"/);
  const f = fieldsOf(r.body);
  assert.equal(f.TotalAmount, '360'); assert.equal(f.ChoosePayment, 'ALL'); assert.equal(f.ReturnURL, 'https://p.supabase.co/functions/v1/site-public/shop-notify');
  assert.equal(f.PaymentInfoURL, 'https://p.supabase.co/functions/v1/site-public/shop-info'); assert.equal(f.ClientBackURL, 'https://shop.pages.dev/order/');
  assert.ok(await verifyMac(f, CFG));
  const o = w.t.shop_orders[0]; assert.equal(o.amount, 360); assert.equal(o.test, true); assert.equal(o.kind, 'cart'); assert.equal(o.buyer.email, 'b@x.tw');
  // 沒設定收款／沒選商品／缺欄位
  assert.match((await world().post('shop', { site: SID, q_cake1: '1', name: 'a', phone: '1', email: 'b@x.tw' })).body, /沒有開放線上付款/);
  assert.match((await w.post('shop', { site: SID, name: 'a', phone: '1', email: 'b@x.tw' })).body, /請先選擇/);
  assert.match((await w.post('shop', { site: SID, q_cake1: '1', name: 'a', phone: '1', email: 'bad' })).body, /Email/);
  assert.equal(w.t.shop_orders.length, 1);
});

test('notify: paid once (owner + buyer mails), duplicates ignored; bad signature, wrong amount, failures and ATM numbers handled', async () => {
  const w = world({ pay: { mode: 'test' }, orders: [{ trade_no: 'YCA1', kind: 'cart', amount: 360, items: [{ id: 'cake1', name: '起司蛋糕', price: 120, qty: 3 }], buyer: { name: '王小明', email: 'b@x.tw', phone: '0912' } }, { trade_no: 'YCA2', kind: 'cart', amount: 100 }, { trade_no: 'YCA3', kind: 'cart', amount: 100 }] });
  assert.equal(await w.notify('shop-notify', { MerchantTradeNo: 'YCA1', RtnCode: '1', TradeAmt: '360', TradeNo: 'E1', PaymentType: 'Credit_CreditCard' }, { ...CFG, hashKey: 'x'.repeat(16) }), '0|CheckMacValue Error');
  assert.equal(w.t.shop_orders[0].status, 'created');
  assert.equal(await w.notify('shop-notify', { MerchantTradeNo: 'YCA1', RtnCode: '1', TradeAmt: '360', TradeNo: 'E1', PaymentType: 'Credit_CreditCard' }), '1|OK');
  assert.equal(w.t.shop_orders[0].status, 'paid'); assert.equal(w.log.mails.length, 2);
  assert.match(w.log.mails[0].subject, /新訂單已付款.*360.*測試/); assert.equal(w.log.mails[0].to, 'o@x.tw'); assert.equal(w.log.mails[0].replyTo, 'b@x.tw');
  assert.equal(w.log.mails[1].to, 'b@x.tw'); assert.equal(w.log.mails[1].replyTo, 'o@x.tw');
  assert.equal(await w.notify('shop-notify', { MerchantTradeNo: 'YCA1', RtnCode: '1', TradeAmt: '360', TradeNo: 'E1' }), '1|OK');
  assert.equal(w.log.mails.length, 2, 'duplicate notice sends nothing');
  await w.notify('shop-notify', { MerchantTradeNo: 'YCA2', RtnCode: '1', TradeAmt: '1' });
  assert.equal(w.t.shop_orders[1].status, 'created'); assert.ok(w.t.site_events.some((e) => e.type === 'shop_payment_mismatch'));
  await w.notify('shop-info', { MerchantTradeNo: 'YCA3', RtnCode: '2', BankCode: '812', vAccount: '9103522175887271', ExpireDate: '2026/10/29', PaymentType: 'ATM_TAISHIN' });
  assert.equal(w.t.shop_orders[2].status, 'awaiting'); assert.equal(w.t.shop_orders[2].pay_info.account, '9103522175887271');
  await w.notify('shop-notify', { MerchantTradeNo: 'YCA3', RtnCode: '1', TradeAmt: '100' });
  assert.equal(w.t.shop_orders[2].status, 'paid');
  assert.equal(await w.notify('shop-notify', { MerchantTradeNo: 'NOPE', RtnCode: '1' }), '0|order not found');
});

test('notify for a live order verifies with the shop\'s own keys; simulated payments are ignored', async () => {
  const own = { merchantId: '1234567', hashKey: 'KEY0123456789abc', hashIV: 'IV0123456789abcd' };
  const w = world({ pay: { mode: 'live', merchant_id: own.merchantId, key_enc: await seal(own.hashKey, SECRET), iv_enc: await seal(own.hashIV, SECRET) },
    orders: [{ trade_no: 'YCL1', kind: 'cart', amount: 500, test: false, buyer: {} }] });
  assert.equal(await w.notify('shop-notify', { MerchantTradeNo: 'YCL1', RtnCode: '1', TradeAmt: '500' }), '0|CheckMacValue Error', 'the public test keys are not accepted for a live order');
  assert.equal(await w.notify('shop-notify', { MerchantTradeNo: 'YCL1', RtnCode: '1', TradeAmt: '500', SimulatePaid: '1' }, own), '1|OK');
  assert.equal(w.t.shop_orders[0].status, 'created');
  assert.equal(await w.notify('shop-notify', { MerchantTradeNo: 'YCL1', RtnCode: '1', TradeAmt: '500' }, own), '1|OK');
  assert.equal(w.t.shop_orders[0].status, 'paid'); assert.equal(w.log.mails.length, 1, 'no buyer email → owner only');
});

test('booking with a deposit: request saved, deposit order created and sent to ECPay; payment marks the booking paid', async () => {
  const w = world({ pay: { mode: 'test' } });
  const r = await w.post('booking', { site: SID, date: '2026-10-28', time: '14:00', name: '林小姐', contact: '0912345678', email: 'l@x.tw' });
  assert.match(r.body, /payment-stage\.ecpay/);
  assert.equal(w.t.site_messages.length, 1); assert.equal(w.t.site_messages[0].meta.deposit, 200); assert.match(w.t.site_messages[0].message, /訂金/);
  const o = w.t.shop_orders[0]; assert.equal(o.kind, 'deposit'); assert.equal(o.amount, 200); assert.equal(o.booking_id, w.t.site_messages[0].id);
  assert.equal(fieldsOf(r.body).TotalAmount, '200');
  await w.notify('shop-notify', { MerchantTradeNo: o.trade_no, RtnCode: '1', TradeAmt: '200' });
  assert.equal(w.t.site_messages[0].meta.deposit_paid, true);
  assert.ok(w.log.mails.some((m) => /預約訂金已付款/.test(m.subject)));
  // 沒填 Email 不建立訂單；沒設定收款就是一般預約
  assert.match((await w.post('booking', { site: SID, date: '2026-10-28', time: '14:00', name: 'a', contact: '0912' })).body, /Email/);
  const w2 = world();
  const r2 = await w2.post('booking', { site: SID, date: '2026-10-28', time: '14:00', name: 'a', contact: '0912' });
  assert.equal(r2.status, 303); assert.equal(w2.t.shop_orders.length, 0);
});

test('order_done marks only this site\'s orders', async () => {
  const w = world({ orders: [{ trade_no: 'YCD1', kind: 'cart', amount: 1, status: 'paid' }, { trade_no: 'YCD2', site_id: '22222222-2222-2222-2222-222222222222', kind: 'cart', amount: 1 }] });
  assert.equal((await w.member({ action: 'order_done', trade_no: 'YCD1' })).status, 200); assert.ok(w.t.shop_orders[0].fulfilled_at);
  assert.equal((await w.member({ action: 'order_done', trade_no: 'YCD2' })).status, 404);
  await w.member({ action: 'order_done', trade_no: 'YCD1', done: false }); assert.equal(w.t.shop_orders[0].fulfilled_at, null);
});
