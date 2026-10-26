// 綠界全方位金流（AIO）：檢查碼、建立結帳表單、驗證通知。
// 文件：https://developers.ecpay.com.tw/2902/（檢查碼）、2862（AIO）、2868（定期定額）、2872（ATM）
export const ECPAY_TEST = { merchantId: '3002607', hashKey: 'pwFHCqoQZGmho4w6', hashIV: 'EkRm7iFT261dpevs' };   // 綠界公開的測試帳號（只能用在測試環境）
export const ECPAY_URL = {
  stage: { checkout: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5', period: 'https://payment-stage.ecpay.com.tw/Cashier/CreditCardPeriodAction' },
  prod: { checkout: 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5', period: 'https://payment.ecpay.com.tw/Cashier/CreditCardPeriodAction' }
};

// 設定：沒有正式金鑰時一律是測試環境（用綠界公開的測試帳號）
export function ecpayConfig(env = {}) {
  const prod = env.ECPAY_ENV === 'prod' && env.ECPAY_MERCHANT_ID && env.ECPAY_HASH_KEY && env.ECPAY_HASH_IV;
  return prod
    ? { mode: 'prod', merchantId: env.ECPAY_MERCHANT_ID, hashKey: env.ECPAY_HASH_KEY, hashIV: env.ECPAY_HASH_IV, ...ECPAY_URL.prod }
    : { mode: 'stage', ...ECPAY_TEST, ...ECPAY_URL.stage };
}

// .NET 的 UrlEncode（綠界用的規則）：空白→+，~ 與 ' 要編碼，- _ . ! * ( ) 不編碼
function dotnetEncode(s) {
  return encodeURIComponent(s).replace(/%20/g, '+').replace(/~/g, '%7e').replace(/'/g, '%27');
}
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function checkMac(params, { hashKey, hashIV }) {
  const keys = Object.keys(params).filter((k) => k !== 'CheckMacValue').sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const raw = 'HashKey=' + hashKey + '&' + keys.map((k) => k + '=' + params[k]).join('&') + '&HashIV=' + hashIV;
  return (await sha256Hex(dotnetEncode(raw).toLowerCase())).toUpperCase();
}
export async function verifyMac(params, cfg) {
  if (!params || typeof params.CheckMacValue !== 'string') return false;
  return (await checkMac(params, cfg)) === params.CheckMacValue.toUpperCase();
}

// 台灣時間 yyyy/MM/dd HH:mm:ss
export function ecpayDate(d) {
  const t = new Date(d.getTime() + 8 * 3600 * 1000).toISOString();
  return t.slice(0, 10).replace(/-/g, '/') + ' ' + t.slice(11, 19);
}
// 交易編號：英數 20 字以內、不可重複
export function newTradeNo(now = new Date()) {
  const r = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 6).toUpperCase();
  return ('YC' + now.getTime().toString(36).toUpperCase() + r).slice(0, 20);
}

/**
 * 建立結帳表單欄位（瀏覽器把這些欄位 POST 到 cfg.checkout）
 * order: { tradeNo, amount, itemName, kind: 'card'|'card_monthly'|'atm', returnUrl, periodReturnUrl, paymentInfoUrl, clientBackUrl, now, custom1 }
 */
export async function checkoutFields(order, cfg) {
  const f = {
    MerchantID: cfg.merchantId, MerchantTradeNo: order.tradeNo, MerchantTradeDate: ecpayDate(order.now || new Date()),
    PaymentType: 'aio', TotalAmount: String(order.amount), TradeDesc: '網站租用', ItemName: order.itemName,
    ReturnURL: order.returnUrl, ChoosePayment: order.kind === 'atm' ? 'ATM' : 'Credit', EncryptType: '1'
  };
  if (order.clientBackUrl) f.ClientBackURL = order.clientBackUrl;
  if (order.custom1) f.CustomField1 = order.custom1;
  if (order.kind === 'atm') { f.ExpireDate = '3'; if (order.paymentInfoUrl) f.PaymentInfoURL = order.paymentInfoUrl; }
  if (order.kind === 'card_monthly') {
    // 定期定額：每月扣一次，最多 99 次；TotalAmount 必須等於 PeriodAmount
    f.PeriodAmount = String(order.amount); f.PeriodType = 'M'; f.Frequency = '1'; f.ExecTimes = '99';
    if (order.periodReturnUrl) f.PeriodReturnURL = order.periodReturnUrl;
  }
  f.CheckMacValue = await checkMac(f, cfg);
  return f;
}

// 取消信用卡定期定額（伺服器對伺服器）
export async function cancelPeriod(tradeNo, cfg, fetchImpl = fetch, now = new Date()) {
  const p = { MerchantID: cfg.merchantId, MerchantTradeNo: tradeNo, Action: 'Cancel', TimeStamp: String(Math.floor(now.getTime() / 1000)) };
  p.CheckMacValue = await checkMac(p, cfg);
  const res = await fetchImpl(cfg.period, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(p).toString(), signal: AbortSignal.timeout(10000) });
  const out = Object.fromEntries(new URLSearchParams(await res.text()));
  return { ok: out.RtnCode === '1', code: out.RtnCode, message: out.RtnMsg || '' };
}
