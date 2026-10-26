import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMac, verifyMac, ECPAY_TEST, ecpayConfig, checkoutFields, newTradeNo } from '../supabase/functions/_shared/ecpay.mjs';
import { priceFor } from '../supabase/functions/_shared/plans.mjs';
import { handleMember } from '../supabase/functions/member-site/handler.mjs';
import { handlePublic } from '../supabase/functions/site-public/handler.mjs';
import { parseOrigins } from '../supabase/functions/_shared/http.mjs';

const SID = '11111111-1111-1111-1111-111111111111';
const NOW = new Date('2026-10-26T04:00:00Z');   // 台灣 2026-10-26 12:00
const CFG = ecpayConfig({});

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

// ── 共用假資料庫 ──
function world({ site = {}, orders = [], isAdmin = true, cfg = CFG } = {}) {
  const t = { rental_sites: [{ id: SID, member_id: 'u1', slug: 'shop', status: 'pending', layout: 'single', content: { name: '好喝咖啡' }, paid_until: null, live_version_id: null, ...site }],
    pay_orders: orders.map((o) => ({ success_times: 0, status: 'created', test: true, ...o })), payments: [], site_events: [], site_versions: [{ id: 'v1', site_id: SID }], members: [{ id: 'u1', email: 'o@x.tw' }] };
  const log = { dispatches: [], mails: [], fetches: [] };
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
    insert: async (tb, b) => { t[tb].push({ ...b }); },
    insertReturning: async (tb, b) => { const r = { id: tb + (t[tb].length + 1), ...b }; t[tb].push(r); return r; },
    patch: async (tb, q, b) => { t[tb].filter((r) => match(r, q)).forEach((r) => Object.assign(r, b)); },
    patchReturning: async (tb, q, b) => { const rows = t[tb].filter((r) => match(r, q)); rows.forEach((r) => Object.assign(r, b)); return rows; }
  };
  const deps = { db, now: () => NOW, ecpay: cfg, sendMail: async (m) => { log.mails.push(m); return { ok: true }; }, dispatch: async (a) => { log.dispatches.push(a); return { ok: true }; } };
  const member = (body) => handleMember(new Request('https://x/functions/v1/member-site', { method: 'POST', headers: { origin: 'https://chi1017.github.io', authorization: 'Bearer good' }, body: JSON.stringify({ site_id: SID, ...body }) }),
    { ...deps, allowedOrigins: parseOrigins(), publicApi: 'https://p.supabase.co/functions/v1/site-public', dashboardUrl: 'https://o/dashboard/', getUser: async () => ({ id: 'u1', email: 'o@x.tw', isAdmin }),
      fetchImpl: async (url, init) => { log.fetches.push([url, init.body]); return new Response('MerchantID=3002607&MerchantTradeNo=x&RtnCode=1&RtnMsg=OK'); } });
  const notify = async (route, fields) => { const f = { MerchantID: cfg.merchantId, ...fields }; f.CheckMacValue = await checkMac(f, cfg);
    const r = await handlePublic(new Request('https://x/functions/v1/site-public/' + route, { method: 'POST', body: new URLSearchParams(f).toString() }), deps); return r.text(); };
  return { t, log, member, notify };
}

test('pay_options: test mode is admin-only; customers see nothing until prod keys are set', async () => {
  let w = world({ isAdmin: false }); assert.deepEqual(await (await w.member({ action: 'pay_options' })).json(), { ok: true, enabled: false });
  w = world({ isAdmin: false }); assert.equal((await w.member({ action: 'checkout', option: 'card_year' })).status, 409);
  w = world(); const j = await (await w.member({ action: 'pay_options' })).json();
  assert.equal(j.enabled, true); assert.equal(j.test, true); assert.deepEqual(j.options.map((o) => [o.key, o.amount]), [['card_monthly', 599], ['card_year', 5990], ['atm_1', 599], ['atm_12', 5990]]);
  w = world({ isAdmin: false, cfg: ecpayConfig({ ECPAY_ENV: 'prod', ECPAY_MERCHANT_ID: 'M', ECPAY_HASH_KEY: 'K', ECPAY_HASH_IV: 'V' }) });
  assert.equal((await (await w.member({ action: 'pay_options' })).json()).test, false);
});
test('checkout: creates the order with server-side price (multi = 899), returns signed fields; drafts and duplicate auto-pay refused', async () => {
  const w = world({ site: { layout: 'multi' } });
  const j = await (await w.member({ action: 'checkout', option: 'card_monthly', amount: 1 })).json();
  assert.equal(j.action, CFG.checkout); assert.equal(j.fields.TotalAmount, '899'); assert.ok(await verifyMac(j.fields, CFG));
  assert.equal(w.t.pay_orders[0].amount, 899); assert.equal(w.t.pay_orders[0].kind, 'card_monthly');
  assert.equal(j.fields.ReturnURL, 'https://p.supabase.co/functions/v1/site-public/ecpay'); assert.equal(j.fields.PeriodReturnURL, 'https://p.supabase.co/functions/v1/site-public/ecpay-period');
  w.t.pay_orders[0].status = 'active';
  assert.equal((await w.member({ action: 'checkout', option: 'card_monthly' })).status, 409);
  assert.equal((await world({ site: { status: 'draft' } }).member({ action: 'checkout', option: 'atm_1' })).status, 409);
  assert.equal((await w.member({ action: 'checkout', option: 'free' })).status, 400);
});
test('one-time card: valid notice → payment recorded, pending site goes live and deploys, receipt; repeated notice does not double', async () => {
  const w = world({ orders: [{ trade_no: 'YCA1', site_id: SID, member_id: 'u1', kind: 'card', months: 12, amount: 5990 }] });
  assert.equal(await w.notify('ecpay', { MerchantTradeNo: 'YCA1', RtnCode: '1', TradeAmt: '5990', TradeNo: '2310261200001' }), '1|OK');
  assert.equal(w.t.payments.length, 1); assert.equal(w.t.payments[0].method, 'credit'); assert.equal(w.t.payments[0].period_to, '2027-10-26');
  assert.equal(w.t.rental_sites[0].status, 'live'); assert.equal(w.log.dispatches.length, 1); assert.equal(w.log.mails.length, 1);
  assert.equal(w.t.pay_orders[0].status, 'paid');
  assert.equal(await w.notify('ecpay', { MerchantTradeNo: 'YCA1', RtnCode: '1', TradeAmt: '5990', TradeNo: '2310261200001' }), '1|OK');
  assert.equal(w.t.payments.length, 1, 'no double credit');
});
test('notices with a bad signature, unknown order, wrong amount or failure code do not credit', async () => {
  const w = world({ orders: [{ trade_no: 'YCB1', site_id: SID, member_id: 'u1', kind: 'card', months: 1, amount: 599 }] });
  const forged = await handlePublic(new Request('https://x/functions/v1/site-public/ecpay', { method: 'POST', body: new URLSearchParams({ MerchantID: '3002607', MerchantTradeNo: 'YCB1', RtnCode: '1', TradeAmt: '599', CheckMacValue: 'ABC' }).toString() }), { db: w.t && { getOne: async () => null }, ecpay: CFG });
  assert.match(await forged.text(), /^0\|CheckMacValue/);
  assert.match(await w.notify('ecpay', { MerchantTradeNo: 'NOPE', RtnCode: '1', TradeAmt: '599' }), /^0\|order not found/);
  await w.notify('ecpay', { MerchantTradeNo: 'YCB1', RtnCode: '1', TradeAmt: '1' }); assert.equal(w.t.payments.length, 0);
  assert.ok(w.t.site_events.some((e) => e.type === 'payment_mismatch'));
  await w.notify('ecpay', { MerchantTradeNo: 'YCB1', RtnCode: '10100058', TradeAmt: '599', RtnMsg: 'declined' }); assert.equal(w.t.payments.length, 0); assert.equal(w.t.pay_orders[0].status, 'failed');
});
test('monthly auto-pay: first charge credits 1 month and activates; period notices credit only new successes', async () => {
  const w = world({ site: { status: 'live', paid_until: '2026-11-10', live_version_id: 'v1' }, orders: [{ trade_no: 'YCM1', site_id: SID, member_id: 'u1', kind: 'card_monthly', months: 1, amount: 599 }] });
  await w.notify('ecpay', { MerchantTradeNo: 'YCM1', RtnCode: '1', TradeAmt: '599' });
  assert.equal(w.t.pay_orders[0].status, 'active'); assert.equal(w.t.pay_orders[0].success_times, 1); assert.equal(w.t.rental_sites[0].paid_until, '2026-12-10');
  await w.notify('ecpay-period', { MerchantTradeNo: 'YCM1', RtnCode: '1', Amount: '599', TotalSuccessTimes: '1' });
  assert.equal(w.t.payments.length, 1, 'first period notice duplicates the first charge');
  await w.notify('ecpay-period', { MerchantTradeNo: 'YCM1', RtnCode: '1', Amount: '599', TotalSuccessTimes: '2' });
  assert.equal(w.t.payments.length, 2); assert.equal(w.t.payments[1].method, 'credit_recurring'); assert.equal(w.t.rental_sites[0].paid_until, '2027-01-10');
  await w.notify('ecpay-period', { MerchantTradeNo: 'YCM1', RtnCode: '0', Amount: '599', TotalSuccessTimes: '2', RtnMsg: 'insufficient' });
  assert.equal(w.t.payments.length, 2); assert.ok(w.t.site_events.some((e) => e.type === 'recurring_failed')); assert.equal(w.t.pay_orders[0].status, 'active');
});
test('ATM: number issued is stored, then the payment notice credits; production ignores simulated payments', async () => {
  const w = world({ orders: [{ trade_no: 'YCT1', site_id: SID, member_id: 'u1', kind: 'atm', months: 1, amount: 599 }] });
  await w.notify('ecpay-info', { MerchantTradeNo: 'YCT1', RtnCode: '2', BankCode: '822', vAccount: '9103522175887271', ExpireDate: '2026/10/29' });
  assert.deepEqual(w.t.pay_orders[0].atm, { bank: '822', account: '9103522175887271', expire: '2026/10/29' }); assert.equal(w.t.pay_orders[0].status, 'atm_issued');
  await w.notify('ecpay', { MerchantTradeNo: 'YCT1', RtnCode: '1', TradeAmt: '599' });
  assert.equal(w.t.payments[0].method, 'atm'); assert.equal(w.t.pay_orders[0].status, 'paid');
  const prod = ecpayConfig({ ECPAY_ENV: 'prod', ECPAY_MERCHANT_ID: 'M', ECPAY_HASH_KEY: 'K', ECPAY_HASH_IV: 'V' });
  const p = world({ cfg: prod, orders: [{ trade_no: 'YCP1', site_id: SID, member_id: 'u1', kind: 'card', months: 1, amount: 599 }] });
  await p.notify('ecpay', { MerchantTradeNo: 'YCP1', RtnCode: '1', TradeAmt: '599', SimulatePaid: '1' });
  assert.equal(p.t.payments.length, 0);
});
test('cancel monthly auto-pay calls ECPay with a signed Cancel request and marks the order cancelled', async () => {
  const w = world({ site: { status: 'live' }, orders: [{ trade_no: 'YCM9', site_id: SID, member_id: 'u1', kind: 'card_monthly', months: 1, amount: 599, status: 'active' }] });
  const j = await (await w.member({ action: 'cancel_recurring' })).json();
  assert.equal(j.ok, true); assert.equal(w.t.pay_orders[0].status, 'cancelled');
  const sent = Object.fromEntries(new URLSearchParams(w.log.fetches[0][1]));
  assert.equal(sent.Action, 'Cancel'); assert.equal(sent.MerchantTradeNo, 'YCM9'); assert.ok(await verifyMac(sent, CFG));
  assert.equal((await w.member({ action: 'cancel_recurring' })).status, 409);
});
