// 由 npm run bundle:function 產生，請勿手改。來源：supabase/functions/site-public/ 與 templates/shared/。

// supabase/functions/_shared/http.mjs
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// templates/shared/escape.js
function safeHttpsUrl(v) {
  const s = String(v == null ? "" : v).trim();
  if (!/^https:\/\//i.test(s)) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) return "";
    return u.href;
  } catch {
    return "";
  }
}
function cleanPhone(v) {
  return String(v == null ? "" : v).replace(/[^\d+\-()\s#]/g, "").replace(/\s+/g, " ").trim();
}
function clip(s, n) {
  const a = [...String(s)];
  return a.length <= n ? String(s) : a.slice(0, n).join("");
}

// templates/shared/palettes.js
var PALETTES = {
  forest: { label: "森林綠", bg: "#F6F3EC", surface: "#EAE4D6", text: "#22301F", muted: "#4F5A4B", accent: "#2F4A3A", onAccent: "#F6F3EC", line: "#D8D1C1" },
  caramel: { label: "焦糖棕", bg: "#FBF6F0", surface: "#F0E3D3", text: "#3A2618", muted: "#6B5444", accent: "#8A5A3B", onAccent: "#FBF6F0", line: "#E2D2BE" },
  ink: { label: "墨夜金", bg: "#17161A", surface: "#24222A", text: "#F1ECE2", muted: "#B9B2A5", accent: "#C9A66B", onAccent: "#17161A", line: "#36333C" },
  mist: { label: "霧藍灰", bg: "#F3F5F6", surface: "#DDE5EA", text: "#1D2A33", muted: "#4C5C67", accent: "#3E5A6E", onAccent: "#F3F5F6", line: "#C9D3D9" },
  rose: { label: "玫瑰粉", bg: "#F8F2F3", surface: "#EDDEE2", text: "#2E151B", muted: "#66474F", accent: "#AF4B65", onAccent: "#FFFFFF", line: "#DCC6CC" },
  lilac: { label: "薰衣草", bg: "#F4F2F8", surface: "#E2DEED", text: "#1D162C", muted: "#504766", accent: "#6E55A8", onAccent: "#FFFFFF", line: "#CDC6DC" },
  ocean: { label: "海洋藍", bg: "#F2F6F8", surface: "#DEE7ED", text: "#15242E", muted: "#475B66", accent: "#1F6F9E", onAccent: "#FFFFFF", line: "#C6D4DC" },
  olive: { label: "橄欖綠", bg: "#F7F8F2", surface: "#EAEDDE", text: "#292E15", muted: "#606647", accent: "#647227", onAccent: "#FFFFFF", line: "#D8DCC6" },
  clay: { label: "陶土紅", bg: "#F8F3F2", surface: "#EDE1DE", text: "#2E1A15", muted: "#664E47", accent: "#AA5137", onAccent: "#FFFFFF", line: "#DCCBC6" },
  sand: { label: "沙丘黃", bg: "#F8F6F2", surface: "#EDE8DE", text: "#2E2515", muted: "#665C47", accent: "#916511", onAccent: "#FFFFFF", line: "#DCD5C6" },
  graphite: { label: "石墨灰", bg: "#151719", surface: "#202427", text: "#EBEDEF", muted: "#ABB2BA", accent: "#9AA3AD", onAccent: "#151719", line: "#353A41" },
  midnight: { label: "夜海藍", bg: "#13171B", surface: "#1E2429", text: "#E9EDF1", muted: "#A8B3BD", accent: "#6FA8DC", onAccent: "#13171B", line: "#323B43" }
};
var PALETTE_IDS = Object.keys(PALETTES);

// templates/shared/content.js
var LIMITS = {
  name: 40,
  tagline: 60,
  intro: 600,
  address: 120,
  phone: 24,
  hoursNote: 80,
  bookingLabel: 12,
  menu: 12,
  menuName: 40,
  price: 99999,
  faq: 8,
  faqQ: 60,
  faqA: 300,
  news: 6,
  newsTitle: 60,
  room: 6,
  alt: 60,
  social: 200,
  reviews: 6,
  reviewName: 20,
  reviewText: 200,
  posts: 12,
  postTitle: 60,
  postBody: 3e3,
  enName: 60,
  enTagline: 100,
  enIntro: 1e3,
  enAddress: 160,
  shopItems: 24,
  shopName: 40,
  shopDesc: 200,
  shopPrice: 2e5,
  shopNote: 300,
  deposit: 1e5
};
var DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var HERO_STYLES = ["card", "full"];
var HOME_STYLES = ["standard", "magazine"];
function emptyHours() {
  const h = {};
  DAYS.forEach((d) => {
    h[d] = { open: "", close: "", closed: false };
  });
  return h;
}
function emptyContent() {
  return {
    name: "",
    tagline: "",
    intro: "",
    address: "",
    phone: "",
    social: { instagram: "", facebook: "", line: "" },
    hours: emptyHours(),
    hoursNote: "",
    booking: { label: "", url: "" },
    photos: { hero: null, room: [] },
    heroStyle: "card",
    homeStyle: "standard",
    menu: [],
    faq: [],
    news: [],
    // 更多內容（都是選用）
    contactForm: false,
    // 網站顯示聯絡表單，留言寄到網站擁有者的 Email
    showMap: false,
    // 來店資訊顯示 Google 地圖（依地址）
    video: "",
    // YouTube 影片網址
    reviews: [],
    // 客人評價 [{ name, text }]
    ga4: "",
    // Google Analytics 4 評估 ID（G-XXXXXXX），選填
    posts: [],
    // 文章 [{ id, title, date, body }]：每篇一個網頁 posts/<id>/
    bookingForm: false,
    // 線上預約表單（客人送出預約申請，店家收到通知後再確認）
    en: { enabled: false, name: "", tagline: "", intro: "", address: "" },
    // 英文版頁面 /en/
    // 線上購買：店家用自己的綠界帳號收款（金鑰在會員專區設定，不放在內容裡）
    shop: { enabled: false, items: [], note: "" },
    // items: [{ id, name, price, desc, photo }]
    bookingDeposit: 0
    // 線上預約要先付的訂金（0＝不收）
  };
}
function youtubeId(url) {
  const u = String(url || "").trim();
  const m = u.match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/);
  return m ? m[1] : "";
}
var GA4_RE = /^G-[A-Z0-9]{4,15}$/;
var POST_ID_RE = /^[a-z0-9][a-z0-9-]{4,38}[a-z0-9]$/;
var ITEM_ID_RE = /^[a-z0-9]{4,12}$/;
var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function validTime(t) {
  return TIME_RE.test(String(t || ""));
}
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(d) {
  if (!DATE_RE.test(String(d || ""))) return false;
  const t = /* @__PURE__ */ new Date(d + "T00:00:00Z");
  return !isNaN(t) && t.toISOString().slice(0, 10) === d;
}
var str = (v, n) => clip(String(v == null ? "" : v).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim(), n);
var line = (v, n) => str(v, n).replace(/\s*\n\s*/g, " ");
var arr = (v) => Array.isArray(v) ? v : [];
function intIn(v, min, max) {
  let n = typeof v === "string" ? v.replace(/[,\s$NT元]/gi, "") : v;
  if (n === "" || n == null) return null;
  n = Math.round(Number(n));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function photo(p) {
  if (!p || typeof p !== "object") return null;
  const path = String(p.path || "").trim();
  if (!path || path.length > 200 || /\.\./.test(path) || /^\//.test(path)) return null;
  const o = { path };
  const w = Math.round(Number(p.w)), h = Math.round(Number(p.h));
  if (w > 0 && h > 0 && w <= 1e4 && h <= 1e4) {
    o.w = w;
    o.h = h;
  }
  const alt = line(p.alt, LIMITS.alt);
  if (alt) o.alt = alt;
  return o;
}
function normalizeContent(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const c = emptyContent();
  c.name = line(r.name, LIMITS.name);
  c.tagline = line(r.tagline, LIMITS.tagline);
  c.intro = str(r.intro, LIMITS.intro);
  c.address = line(r.address, LIMITS.address);
  c.phone = clip(cleanPhone(r.phone), LIMITS.phone);
  c.hoursNote = line(r.hoursNote, LIMITS.hoursNote);
  const s = r.social && typeof r.social === "object" ? r.social : {};
  ["instagram", "facebook", "line"].forEach((k) => {
    c.social[k] = clip(safeHttpsUrl(s[k]), LIMITS.social);
  });
  const h = r.hours && typeof r.hours === "object" ? r.hours : {};
  DAYS.forEach((d) => {
    const x = h[d] && typeof h[d] === "object" ? h[d] : {};
    const closed = x.closed === true;
    c.hours[d] = {
      open: validTime(x.open) ? x.open : "",
      close: validTime(x.close) ? x.close : "",
      closed
    };
    if (closed) {
      c.hours[d].open = "";
      c.hours[d].close = "";
    }
  });
  const b = r.booking && typeof r.booking === "object" ? r.booking : {};
  c.booking = { label: line(b.label, LIMITS.bookingLabel), url: clip(safeHttpsUrl(b.url), 500) };
  const ph = r.photos && typeof r.photos === "object" ? r.photos : {};
  c.photos.hero = photo(ph.hero);
  c.photos.room = arr(ph.room).map(photo).filter(Boolean).slice(0, LIMITS.room);
  c.heroStyle = HERO_STYLES.includes(r.heroStyle) ? r.heroStyle : "card";
  c.homeStyle = HOME_STYLES.includes(r.homeStyle) ? r.homeStyle : "standard";
  c.menu = arr(r.menu).slice(0, LIMITS.menu).map((m) => {
    const o = m && typeof m === "object" ? m : {};
    let p = o.price;
    if (typeof p === "string") p = p.replace(/[,\s$NT元]/gi, "");
    p = p === "" || p == null ? null : Number(p);
    if (p != null && (!Number.isFinite(p) || p < 0 || p > LIMITS.price)) p = null;
    if (p != null) p = Math.round(p);
    return { name: line(o.name, LIMITS.menuName), price: p };
  });
  c.faq = arr(r.faq).slice(0, LIMITS.faq).map((f) => {
    const o = f && typeof f === "object" ? f : {};
    return { q: line(o.q, LIMITS.faqQ), a: str(o.a, LIMITS.faqA) };
  });
  c.news = arr(r.news).slice(0, LIMITS.news).map((n) => {
    const o = n && typeof n === "object" ? n : {};
    return { date: validDate(o.date) ? o.date : "", title: line(o.title, LIMITS.newsTitle) };
  });
  c.contactForm = r.contactForm === true;
  c.bookingForm = r.bookingForm === true;
  const en = r.en && typeof r.en === "object" ? r.en : {};
  c.en = { enabled: en.enabled === true, name: line(en.name, LIMITS.enName), tagline: line(en.tagline, LIMITS.enTagline), intro: str(en.intro, LIMITS.enIntro), address: line(en.address, LIMITS.enAddress) };
  c.showMap = r.showMap === true;
  const vid = youtubeId(r.video);
  c.video = vid ? "https://www.youtube.com/watch?v=" + vid : "";
  c.reviews = arr(r.reviews).slice(0, LIMITS.reviews).map((x) => {
    const o = x && typeof x === "object" ? x : {};
    return { name: line(o.name, LIMITS.reviewName), text: str(o.text, LIMITS.reviewText) };
  });
  const seen = /* @__PURE__ */ new Set();
  c.posts = arr(r.posts).slice(0, LIMITS.posts).map((x) => {
    const o = x && typeof x === "object" ? x : {};
    let id = String(o.id || "").toLowerCase();
    if (!POST_ID_RE.test(id) || seen.has(id)) id = "";
    if (id) seen.add(id);
    return { id, title: line(o.title, LIMITS.postTitle), date: validDate(o.date) ? o.date : "", body: str(o.body, LIMITS.postBody) };
  });
  const ga = String(r.ga4 || "").trim().toUpperCase();
  c.ga4 = GA4_RE.test(ga) ? ga : "";
  const sh = r.shop && typeof r.shop === "object" ? r.shop : {};
  const ids = /* @__PURE__ */ new Set();
  c.shop = {
    enabled: sh.enabled === true,
    note: str(sh.note, LIMITS.shopNote),
    items: arr(sh.items).slice(0, LIMITS.shopItems).map((x) => {
      const o = x && typeof x === "object" ? x : {};
      let id = String(o.id || "").toLowerCase();
      if (!ITEM_ID_RE.test(id) || ids.has(id)) id = "";
      if (id) ids.add(id);
      return { id, name: line(o.name, LIMITS.shopName), price: intIn(o.price, 1, LIMITS.shopPrice), desc: str(o.desc, LIMITS.shopDesc), photo: photo(o.photo) };
    })
  };
  c.bookingDeposit = intIn(r.bookingDeposit, 0, LIMITS.deposit) || 0;
  return c;
}
var liveItems = (c) => c.shop.items.filter((i) => i.id && i.name && i.price);

// templates/shared/hours.js
function dayState(h) {
  if (!h) return { kind: "unset" };
  if (h.closed) return { kind: "closed" };
  if (h.open && h.close) return { kind: "open", open: h.open, close: h.close };
  return { kind: "unset" };
}

// templates/shared/booking.js
var BOOKING_DAYS_AHEAD = 90;
var DATE_RE2 = /^\d{4}-\d{2}-\d{2}$/;
var TIME_RE2 = /^([01]\d|2[0-3]):[0-5]\d$/;
var addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
function checkBooking({ hours, date, time, today }) {
  if (!DATE_RE2.test(date || "") || Number.isNaN(Date.parse(date + "T00:00:00Z"))) return { ok: false, msg: "請選擇預約日期" };
  if (!TIME_RE2.test(time || "")) return { ok: false, msg: "請選擇預約時間" };
  if (date < today) return { ok: false, msg: "預約日期不能早於今天" };
  if (date > addDays(today, BOOKING_DAYS_AHEAD)) return { ok: false, msg: "只能預約 " + BOOKING_DAYS_AHEAD + " 天內的日期" };
  const dow = DAYS[((/* @__PURE__ */ new Date(date + "T00:00:00Z")).getUTCDay() + 6) % 7];
  const st = dayState(hours && hours[dow]);
  if (st.kind === "closed") return { ok: false, msg: "那天公休，請選擇其他日期" };
  if (st.kind === "open") {
    const inside = st.open <= st.close ? time >= st.open && time < st.close : time >= st.open || time < st.close;
    if (!inside) return { ok: false, msg: "那個時間不在營業時間內（" + st.open + "–" + st.close + "），請重新選擇" };
  }
  return { ok: true, msg: "" };
}

// supabase/functions/_shared/ecpay.mjs
var ECPAY_TEST = { merchantId: "3002607", hashKey: "pwFHCqoQZGmho4w6", hashIV: "EkRm7iFT261dpevs" };
var ECPAY_URL = {
  stage: { checkout: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5", period: "https://payment-stage.ecpay.com.tw/Cashier/CreditCardPeriodAction" },
  prod: { checkout: "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5", period: "https://payment.ecpay.com.tw/Cashier/CreditCardPeriodAction" }
};
function dotnetEncode(s) {
  return encodeURIComponent(s).replace(/%20/g, "+").replace(/~/g, "%7e").replace(/'/g, "%27");
}
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function checkMac(params, { hashKey, hashIV }) {
  const keys = Object.keys(params).filter((k) => k !== "CheckMacValue").sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const raw = "HashKey=" + hashKey + "&" + keys.map((k) => k + "=" + params[k]).join("&") + "&HashIV=" + hashIV;
  return (await sha256Hex(dotnetEncode(raw).toLowerCase())).toUpperCase();
}
async function verifyMac(params, cfg) {
  if (!params || typeof params.CheckMacValue !== "string") return false;
  return await checkMac(params, cfg) === params.CheckMacValue.toUpperCase();
}
function ecpayDate(d) {
  const t = new Date(d.getTime() + 8 * 3600 * 1e3).toISOString();
  return t.slice(0, 10).replace(/-/g, "/") + " " + t.slice(11, 19);
}
function newTradeNo(now = /* @__PURE__ */ new Date()) {
  const r = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 6).toUpperCase();
  return ("YC" + now.getTime().toString(36).toUpperCase() + r).slice(0, 20);
}
async function checkoutFields(order, cfg) {
  const f = {
    MerchantID: cfg.merchantId,
    MerchantTradeNo: order.tradeNo,
    MerchantTradeDate: ecpayDate(order.now || /* @__PURE__ */ new Date()),
    PaymentType: "aio",
    TotalAmount: String(order.amount),
    TradeDesc: order.desc || "網站租用",
    ItemName: order.itemName,
    ReturnURL: order.returnUrl,
    ChoosePayment: order.choose || (order.kind === "atm" ? "ATM" : "Credit"),
    EncryptType: "1"
  };
  if (order.clientBackUrl) f.ClientBackURL = order.clientBackUrl;
  if (order.custom1) f.CustomField1 = order.custom1;
  if (order.choose === "ALL" && order.paymentInfoUrl) f.PaymentInfoURL = order.paymentInfoUrl;
  if (order.kind === "atm") {
    f.ExpireDate = "3";
    if (order.paymentInfoUrl) f.PaymentInfoURL = order.paymentInfoUrl;
  }
  if (order.kind === "card_monthly") {
    f.PeriodAmount = String(order.amount);
    f.PeriodType = "M";
    f.Frequency = "1";
    f.ExecTimes = "99";
    if (order.periodReturnUrl) f.PeriodReturnURL = order.periodReturnUrl;
  }
  f.CheckMacValue = await checkMac(f, cfg);
  return f;
}

// supabase/functions/_shared/secretbox.mjs
var te = new TextEncoder();
var td = new TextDecoder();
var unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function keyFrom(secret) {
  if (!secret) throw new Error("secretbox: missing secret");
  const base = await crypto.subtle.importKey("raw", te.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: te.encode("yc-axiom-site-pay"), info: te.encode("ecpay-keys-v1") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
async function open(box, secret) {
  const m = /^v1\.([A-Za-z0-9+/=]+)\.([A-Za-z0-9+/=]+)$/.exec(String(box || ""));
  if (!m) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(m[1]) }, await keyFrom(secret), unb64(m[2]));
    return td.decode(pt);
  } catch {
    return null;
  }
}

// supabase/functions/_shared/shop.mjs
var MERCHANT_RE = /^\d{7,10}$/;
var MAX_QTY = 99;
var MAX_ORDER = 1e6;
async function shopPayConfig(row, secret) {
  if (!row || row.mode === "off") return null;
  if (row.mode === "test") return { mode: "test", ...ECPAY_TEST, ...ECPAY_URL.stage };
  if (row.mode !== "live" || !MERCHANT_RE.test(row.merchant_id || "")) return null;
  const hashKey = await open(row.key_enc, secret), hashIV = await open(row.iv_enc, secret);
  if (!hashKey || !hashIV) return null;
  return { mode: "live", merchantId: row.merchant_id, hashKey, hashIV, ...ECPAY_URL.prod };
}
function cartFromForm(rawContent, form) {
  const c = normalizeContent(rawContent);
  if (!c.shop.enabled) return { ok: false, msg: "這個網站目前沒有開放線上購買。" };
  const items = [];
  for (const it of liveItems(c)) {
    const q = parseInt(form.get("q_" + it.id) || "0", 10);
    if (q > 0) items.push({ id: it.id, name: it.name, price: it.price, qty: Math.min(q, MAX_QTY) });
  }
  if (!items.length) return { ok: false, msg: "請先選擇要購買的品項與數量。" };
  const amount = items.reduce((s, i) => s + i.price * i.qty, 0);
  if (amount > MAX_ORDER) return { ok: false, msg: "單筆訂單金額太高，請分成幾筆或直接與店家聯絡。" };
  return { ok: true, items, amount, shopName: c.name };
}
function itemNameOf(items) {
  const s = items.map((i) => String(i.name).replace(/[#&]/g, " ") + " x" + i.qty).join("#");
  return [...s].length > 190 ? [...s].slice(0, 188).join("") + "…" : s;
}
var escA = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function autoPostPage(action, fields, title = "前往付款") {
  return '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + escA(title) + `</title><body style="font:16px/1.8 -apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:560px;margin:15vh auto;padding:0 20px"><form id="f" method="post" action="` + escA(action) + '">' + Object.entries(fields).map(([k, v]) => '<input type="hidden" name="' + escA(k) + '" value="' + escA(v) + '">').join("") + '<p>正在前往綠界付款頁…</p><p><button type="submit" style="font:inherit;padding:10px 24px">前往付款</button></p></form><script>document.getElementById("f").submit()</script></body></html>';
}
function notifyKind(route, rtnCode) {
  if (route === "shop-info") return ["2", "10100073", "10100058"].includes(String(rtnCode)) ? "awaiting" : "failed";
  return String(rtnCode) === "1" ? "paid" : "failed";
}
var money = (n) => "NT$ " + Number(n).toLocaleString("en-US");
function orderMails({ shopName, order, base }) {
  const isDeposit = order.kind === "deposit";
  const b = order.buyer || {};
  const lines = isDeposit ? ["預約訂金 " + money(order.amount)] : (order.items || []).map((i) => i.name + " x " + i.qty + "　" + money(i.price * i.qty));
  const rows = [["訂單編號", order.trade_no], ["金額", money(order.amount)], ["姓名", b.name || ""], ["手機", b.phone || ""], ["Email", b.email || ""]];
  if (b.address) rows.push(["收件地址", b.address]);
  if (b.note) rows.push(["備註", b.note]);
  if (order.test) rows.push(["注意", "這是測試訂單，沒有實際收款"]);
  const table = (rs) => '<table style="border-collapse:collapse">' + rs.map((r) => '<tr><td style="padding:3px 14px 3px 0;color:#777;white-space:nowrap;vertical-align:top">' + escA(r[0]) + "</td><td>" + escA(r[1]) + "</td></tr>").join("") + "</table>";
  const list = '<ul style="padding-left:18px">' + lines.map((l) => "<li>" + escA(l) + "</li>").join("") + "</ul>";
  const owner = {
    subject: "「" + shopName + "」" + (isDeposit ? "預約訂金已付款" : "新訂單已付款") + "：" + money(order.amount) + (order.test ? "（測試）" : ""),
    html: "<p>" + escA(shopName) + " 你好，</p><p>" + (isDeposit ? "有客人付了預約訂金，預約內容在另一封預約通知信與會員專區。" : "有一筆新訂單已經付款完成，請盡快處理：") + "</p>" + list + table(rows) + '<p style="color:#777;font-size:14px">直接回覆這封信會寄給買家。所有訂單也可以在會員專區查看。款項會依你和綠界的約定撥款到你的帳戶。</p>',
    text: shopName + " 你好，\n\n" + (isDeposit ? "有客人付了預約訂金。" : "有一筆新訂單已經付款完成：") + "\n\n" + lines.join("\n") + "\n\n" + rows.map((r) => r[0] + "：" + r[1]).join("\n") + "\n\n所有訂單也可以在會員專區查看。"
  };
  const buyer = b.email ? {
    subject: "【" + shopName + "】" + (isDeposit ? "已收到你的預約訂金" : "已收到你的訂單付款") + (order.test ? "（測試）" : ""),
    html: "<p>" + escA(b.name || "") + " 你好，</p><p>謝謝你！" + escA(shopName) + " 已收到你的" + (isDeposit ? "預約訂金，店家確認預約後會與你聯絡。" : "付款，會盡快為你處理訂單。") + "</p>" + list + table(rows.slice(0, 2)) + '<p style="color:#777;font-size:14px">有任何問題，直接回覆這封信就會寄給店家。' + (base ? "網站：" + escA(base) : "") + "</p>",
    text: (b.name || "") + " 你好，\n\n謝謝你！" + shopName + " 已收到你的" + (isDeposit ? "預約訂金。" : "付款。") + "\n\n" + lines.join("\n") + "\n訂單編號：" + order.trade_no + "\n\n有任何問題，直接回覆這封信就會寄給店家。"
  } : null;
  return { owner, buyer };
}

// supabase/functions/site-public/handler.mjs
var LIMITS2 = { name: 60, contact: 120, message: 2e3, perIpHour: 5, perSiteDay: 100 };
var LIVE = ["live", "overdue"];
var BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|facebookexternalhit|curl|wget|python|node-fetch/i;
var esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var clean = (v, max) => String(v == null ? "" : v).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
async function sha256(text2) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text2));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function siteBase(site) {
  if (site.custom_domain && site.domain_status === "active") return "https://" + site.custom_domain + "/";
  const u = String(site.public_url || "");
  return /^https:\/\/[a-z0-9.-]+\/?$/i.test(u) ? u.replace(/\/?$/, "/") : "";
}
var page = (title, text2, back) => new Response(
  '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(title) + `</title><body style="font:16px/1.8 -apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:560px;margin:15vh auto;padding:0 20px"><h1 style="font-size:22px">` + esc(title) + "</h1><p>" + esc(text2) + "</p>" + (back ? '<p><a href="' + esc(back) + '">回到網站</a></p>' : '<p><a href="javascript:history.back()">回上一頁</a></p>') + "</body></html>",
  { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
);
function shopMessageEmail({ shopName, name, contact: contact2, message, base, kind = "message", when = "" }) {
  const subject = "「" + shopName + "」" + (kind === "booking" ? "預約申請：" + when + " " : "網站留言：") + name;
  const intro = kind === "booking" ? "有人透過網站送出預約申請，請與對方聯絡確認（網站不會自動保留時段）：" : "有人透過網站的聯絡表單留言給你：";
  const text2 = shopName + " 你好，\n\n" + intro + "\n\n姓名：" + name + "\n聯絡方式：" + contact2 + "\n\n" + message + "\n\n" + (EMAIL.test(contact2) ? "直接回覆這封信，就會寄給對方。\n" : "請用對方留下的聯絡方式回覆。\n") + "所有留言也可以在會員專區查看。\n\n網站：" + base;
  const html2 = "<p>" + esc(shopName) + " 你好，</p><p>" + esc(intro) + '</p><table style="border-collapse:collapse"><tr><td style="padding:2px 12px 2px 0;color:#777">姓名</td><td>' + esc(name) + '</td></tr><tr><td style="padding:2px 12px 2px 0;color:#777">聯絡方式</td><td>' + esc(contact2) + '</td></tr></table><p style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:12px">' + esc(message) + '</p><p style="color:#777;font-size:14px">' + (EMAIL.test(contact2) ? "直接回覆這封信，就會寄給對方。" : "請用對方留下的聯絡方式回覆。") + "所有留言也可以在會員專區查看。</p>";
  return { subject, text: text2, html: html2 };
}
async function handlePublic(req, deps) {
  const url = new URL(req.url);
  const route = url.pathname.replace(/\/+$/, "").split("/").pop();
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "content-type" } });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (route === "hit") return hit(req, deps);
  if (route === "shop") return shop(req, deps);
  if (route === "shop-notify" || route === "shop-info") return shopNotify(req, deps, route);
  if (route === "contact") return contact(req, deps, "message");
  if (route === "booking") return contact(req, deps, "booking");
  return new Response("not found", { status: 404 });
}
async function hit(req, deps) {
  const ok = new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
  if (BOT.test(req.headers.get("user-agent") || "")) return ok;
  let b;
  try {
    const t = await req.text();
    if (t.length > 500) return ok;
    b = JSON.parse(t);
  } catch {
    return ok;
  }
  if (!b || typeof b.s !== "string" || !UUID.test(b.s)) return ok;
  let path = String(b.p || "/").split("?")[0].split("#")[0];
  if (!/^\/[a-z0-9/_-]{0,118}$/i.test(path)) path = "/other";
  await deps.db.rpc("rental_record_hit", { p_site: b.s, p_path: path }).catch(() => {
  });
  return ok;
}
async function contact(req, deps, kind) {
  let f;
  try {
    const t = await req.text();
    if (t.length > 12e3) return page("留言太長", "請縮短內容後再送出。");
    f = new URLSearchParams(t);
  } catch {
    return page("送出失敗", "請稍後再試一次。");
  }
  const siteId = f.get("site") || "";
  if (!UUID.test(siteId)) return page("送出失敗", "表單資料不完整，請重新整理網頁後再試。");
  const site = await deps.db.getOne("rental_sites", "id=eq." + siteId + "&select=id,member_id,status,public_url,custom_domain,domain_status,content,live_version_id");
  if (!site || !LIVE.includes(site.status)) return page("送出失敗", "這個網站目前無法接收留言。");
  const base = siteBase(site);
  const thanks = base ? base + "thanks/" : "";
  if (f.get("website")) return thanks ? Response.redirect(thanks, 303) : page("已送出", "謝謝你的留言。");
  const now = (deps.now || (() => /* @__PURE__ */ new Date()))();
  const name = clean(f.get("name"), LIMITS2.name), contactV = clean(f.get("contact"), LIMITS2.contact);
  let message = clean(f.get("message"), LIMITS2.message), meta = null, when = "";
  if (kind === "booking") {
    const date = clean(f.get("date"), 10), time = clean(f.get("time"), 5);
    const people = Math.max(0, Math.min(50, parseInt(f.get("people") || "0", 10) || 0)), item = clean(f.get("item"), 60);
    const today = new Date(now.getTime() + 8 * 3600 * 1e3).toISOString().slice(0, 10);
    const chk = checkBooking({ hours: site.content && site.content.hours || {}, date, time, today });
    if (!chk.ok) return page("預約時間需要調整", chk.msg + "。", base);
    when = date.replace(/-/g, "/") + " " + time;
    meta = { date, time, ...people ? { people } : {}, ...item ? { item } : {} };
    message = "預約：" + when + (people ? "・" + people + " 人" : "") + (item ? "・" + item : "") + (message ? "\n備註：" + message : "");
  }
  if (!name || !contactV || !message) return page("還有欄位沒填", "請填寫姓名、聯絡方式與留言內容。");
  if ((message.match(/https?:\/\//gi) || []).length > 2) return page("送出失敗", "留言裡的網址太多，請刪減後再送出。");
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ipHash = ip ? (await sha256((deps.salt || "") + "|" + now.toISOString().slice(0, 10) + "|" + ip)).slice(0, 32) : null;
  const hourAgo = new Date(now.getTime() - 3600 * 1e3).toISOString(), dayAgo = new Date(now.getTime() - 86400 * 1e3).toISOString();
  if (ipHash && await deps.db.count("site_messages", "ip_hash=eq." + ipHash + "&created_at=gte." + encodeURIComponent(hourAgo)) >= LIMITS2.perIpHour) return page("送出太頻繁", "請稍後再試，或直接用電話、LINE 聯絡店家。", base);
  if (await deps.db.count("site_messages", "site_id=eq." + siteId + "&created_at=gte." + encodeURIComponent(dayAgo)) >= LIMITS2.perSiteDay) return page("暫時無法留言", "今天的留言已經很多了，請改用電話或 LINE 聯絡店家。", base);
  let dep = null;
  if (kind === "booking") {
    const live = await liveContent(deps.db, site);
    const amount = live && Number(live.bookingDeposit) > 0 && live.bookingForm ? Math.round(Number(live.bookingDeposit)) : 0;
    const cfg = amount ? await payConfigFor(deps, siteId) : null;
    if (amount && cfg) {
      const email = clean(f.get("email"), 120);
      if (!EMAIL.test(email)) return page("還有欄位沒填", "預約需要先付訂金，請填寫 Email（付款結果會寄到這裡）。", base);
      dep = { amount, cfg, email };
      meta = { ...meta, deposit: amount };
      message += "\n訂金：NT$ " + amount + "（付款完成會另外通知）";
    }
  }
  const row = await deps.db.insertReturning("site_messages", { site_id: siteId, name, contact: contactV, message, ip_hash: ipHash, kind, ...meta ? { meta } : {} });
  const owner = await deps.db.getOne("members", "id=eq." + site.member_id + "&select=email");
  if (owner && owner.email && deps.sendMail) {
    const shopName = site.content && site.content.name || "你的網站";
    const m = shopMessageEmail({ shopName, name, contact: contactV, message, base, kind, when });
    const r = await deps.sendMail({ to: owner.email, ...m, ...EMAIL.test(contactV) ? { replyTo: contactV } : {} }).catch(() => ({ ok: false }));
    if (r && r.ok && row && row.id) await deps.db.patch("site_messages", "id=eq." + row.id, { emailed: true }).catch(() => {
    });
  }
  if (dep) {
    const shopName = site.content && site.content.name || "";
    return checkout(deps, {
      site,
      base,
      cfg: dep.cfg,
      now,
      kind: "deposit",
      items: [{ id: "deposit", name: "預約訂金", price: dep.amount, qty: 1 }],
      amount: dep.amount,
      buyer: { name, phone: EMAIL.test(contactV) ? "" : contactV, email: dep.email, note: when },
      ipHash,
      bookingId: row && row.id,
      shopName
    });
  }
  return thanks ? Response.redirect(thanks, 303) : page("已送出", kind === "booking" ? "已收到你的預約申請，店家確認後會與你聯絡。" : "謝謝你的留言，店家會盡快回覆你。");
}
var text = (t) => new Response(t, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
var html = (h) => new Response(h, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
var SHOP_LIMITS = { perIpHour: 10, name: 60, phone: 24, email: 120, address: 160, note: 500 };
async function liveContent(db2, site) {
  if (!site.live_version_id) return null;
  const v = await db2.getOne("site_versions", "id=eq." + site.live_version_id + "&select=content");
  return v ? v.content : null;
}
async function payConfigFor(deps, siteId) {
  const row = await deps.db.getOne("site_pay_settings", "site_id=eq." + siteId + "&select=*");
  return shopPayConfig(row, deps.paySecret);
}
async function checkout(deps, { site, base, cfg, now, kind, items, amount, buyer, ipHash, bookingId = null, shopName }) {
  if (!deps.publicApi) return page("暫時無法付款", "線上付款暫時無法使用，請直接與店家聯絡。", base);
  const tradeNo = newTradeNo(now);
  await deps.db.insert("shop_orders", { trade_no: tradeNo, site_id: site.id, member_id: site.member_id, kind, items, amount, buyer, test: cfg.mode === "test", ip_hash: ipHash, booking_id: bookingId });
  const api = deps.publicApi.replace(/\/$/, "");
  const fields = await checkoutFields({
    tradeNo,
    amount,
    now,
    choose: "ALL",
    desc: kind === "deposit" ? "預約訂金" : "線上購物",
    itemName: kind === "deposit" ? "預約訂金" + (shopName ? "（" + String(shopName).replace(/[#&]/g, " ").slice(0, 30) + "）" : "") : itemNameOf(items),
    returnUrl: api + "/shop-notify",
    paymentInfoUrl: api + "/shop-info",
    clientBackUrl: base ? base + "order/" : void 0
  }, cfg);
  return html(autoPostPage(cfg.checkout, fields));
}
async function shop(req, deps) {
  let f;
  try {
    const t = await req.text();
    if (t.length > 8e3) return page("訂購單太長", "請縮短備註後再送出。");
    f = new URLSearchParams(t);
  } catch {
    return page("送出失敗", "請稍後再試一次。");
  }
  const siteId = f.get("site") || "";
  if (!UUID.test(siteId)) return page("送出失敗", "訂購單資料不完整，請重新整理網頁後再試。");
  const site = await deps.db.getOne("rental_sites", "id=eq." + siteId + "&select=id,member_id,status,public_url,custom_domain,domain_status,content,live_version_id");
  if (!site || !LIVE.includes(site.status)) return page("送出失敗", "這個網站目前無法線上購買。");
  const base = siteBase(site);
  if (f.get("website")) return base ? Response.redirect(base + "order/", 303) : page("已送出", "謝謝。");
  const cfg = await payConfigFor(deps, siteId);
  if (!cfg) return page("暫時無法線上付款", "店家目前沒有開放線上付款，請用電話或 LINE 與店家聯絡訂購。", base);
  const live = await liveContent(deps.db, site);
  const cart = cartFromForm(live, f);
  if (!cart.ok) return page("訂購單需要調整", cart.msg, base);
  const buyer = {
    name: clean(f.get("name"), SHOP_LIMITS.name),
    phone: clean(f.get("phone"), SHOP_LIMITS.phone),
    email: clean(f.get("email"), SHOP_LIMITS.email),
    address: clean(f.get("address"), SHOP_LIMITS.address),
    note: clean(f.get("note"), SHOP_LIMITS.note)
  };
  if (!buyer.name || !buyer.phone || !EMAIL.test(buyer.email)) return page("還有欄位沒填", "請填寫姓名、手機與正確的 Email。", base);
  const now = (deps.now || (() => /* @__PURE__ */ new Date()))();
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ipHash = ip ? (await sha256((deps.salt || "") + "|" + now.toISOString().slice(0, 10) + "|" + ip)).slice(0, 32) : null;
  const hourAgo = new Date(now.getTime() - 3600 * 1e3).toISOString();
  if (ipHash && await deps.db.count("shop_orders", "ip_hash=eq." + ipHash + "&created_at=gte." + encodeURIComponent(hourAgo)) >= SHOP_LIMITS.perIpHour) return page("送出太頻繁", "請稍後再試，或直接與店家聯絡。", base);
  return checkout(deps, { site, base, cfg, now, kind: "cart", items: cart.items, amount: cart.amount, buyer, ipHash, shopName: cart.shopName });
}
async function shopNotify(req, deps, route) {
  let f;
  try {
    const t = await req.text();
    if (t.length > 8e3) return text("0|too large");
    f = Object.fromEntries(new URLSearchParams(t));
  } catch {
    return text("0|bad request");
  }
  const tradeNo = String(f.MerchantTradeNo || "");
  if (!/^[A-Za-z0-9]{1,20}$/.test(tradeNo)) return text("0|bad trade no");
  const { db: db2 } = deps;
  const order = await db2.getOne("shop_orders", "trade_no=eq." + tradeNo + "&select=*");
  if (!order) return text("0|order not found");
  const cfg = order.test ? { mode: "test", ...ECPAY_TEST, ...ECPAY_URL.stage } : await payConfigFor(deps, order.site_id);
  if (!cfg || (order.test ? cfg.mode !== "test" : cfg.mode !== "live")) return text("0|not configured");
  if (!await verifyMac(f, cfg)) return text("0|CheckMacValue Error");
  if (f.MerchantID !== cfg.merchantId) return text("0|MerchantID Error");
  const now = (deps.now || (() => /* @__PURE__ */ new Date()))();
  const notify = { route, RtnCode: f.RtnCode, RtnMsg: String(f.RtnMsg || "").slice(0, 200), TradeNo: f.TradeNo, PaymentType: String(f.PaymentType || "").slice(0, 40), at: now.toISOString() };
  const touch = (extra, cond = "") => db2.patch("shop_orders", "trade_no=eq." + tradeNo + cond, { last_notify: notify, updated_at: now.toISOString(), ...extra }).catch(() => {
  });
  const event = (type, detail) => db2.insert("site_events", { site_id: order.site_id, type, detail: { ...detail, trade_no: tradeNo, by: "ecpay" } }).catch(() => {
  });
  if (!order.test && f.SimulatePaid === "1") {
    await touch({});
    return text("1|OK");
  }
  const k = notifyKind(route, f.RtnCode);
  if (k === "awaiting") {
    await touch({ status: "awaiting", pay_info: { type: notify.PaymentType, bank: f.BankCode || "", account: f.vAccount || "", code: f.PaymentNo || "", expire: f.ExpireDate || "" } }, "&status=eq.created");
    return text("1|OK");
  }
  if (k === "failed") {
    await touch(route === "shop-notify" ? { status: "failed" } : {}, route === "shop-notify" ? "&status=in.(created,awaiting)" : "");
    await event("shop_payment_failed", { code: f.RtnCode, message: notify.RtnMsg });
    return text("1|OK");
  }
  if (Number(f.TradeAmt) !== order.amount) {
    await touch({});
    await event("shop_payment_mismatch", { expected: order.amount, got: Number(f.TradeAmt) });
    return text("1|OK");
  }
  const won = await db2.patchReturning(
    "shop_orders",
    "trade_no=eq." + tradeNo + "&status=in.(created,awaiting,failed)",
    { status: "paid", paid_at: now.toISOString(), last_notify: notify, updated_at: now.toISOString(), pay_info: { ...order.pay_info || {}, type: notify.PaymentType, ecpay_no: String(f.TradeNo || "").slice(0, 30) } }
  );
  if (!won.length) return text("1|OK");
  await event("shop_paid", { amount: order.amount, kind: order.kind, test: !!order.test });
  if (order.kind === "deposit" && order.booking_id) {
    const msg = await db2.getOne("site_messages", "id=eq." + order.booking_id + "&select=meta");
    if (msg) await db2.patch("site_messages", "id=eq." + order.booking_id, { meta: { ...msg.meta || {}, deposit_paid: true } }).catch(() => {
    });
  }
  if (deps.sendMail) {
    const site = await db2.getOne("rental_sites", "id=eq." + order.site_id + "&select=content,public_url,custom_domain,domain_status");
    const owner = await db2.getOne("members", "id=eq." + order.member_id + "&select=email");
    const shopName = site && site.content && site.content.name || "你的網站";
    const mails = orderMails({ shopName, order, base: site ? siteBase(site) : "" });
    const buyerEmail = order.buyer && order.buyer.email;
    if (owner && owner.email) await deps.sendMail({ to: owner.email, ...mails.owner, ...buyerEmail ? { replyTo: buyerEmail } : {} }).catch(() => {
    });
    if (mails.buyer && buyerEmail) await deps.sendMail({ to: buyerEmail, ...mails.buyer, ...owner && owner.email ? { replyTo: owner.email } : {} }).catch(() => {
    });
  }
  return text("1|OK");
}

// build/lib/supabase.mjs
function makeSupabase({ url, serviceKey, fetchImpl = fetch }) {
  const base = url.replace(/\/$/, "");
  const headers = (extra = {}) => ({ apikey: serviceKey, Authorization: "Bearer " + serviceKey, ...extra });
  async function rest(path, { method = "GET", body, prefer } = {}) {
    const res = await fetchImpl(base + "/rest/v1/" + path, {
      method,
      headers: headers({ "Content-Type": "application/json", ...prefer ? { Prefer: prefer } : {} }),
      body: body === void 0 ? void 0 : JSON.stringify(body)
    });
    const text2 = await res.text();
    if (!res.ok) throw new Error("Supabase " + method + " " + path.split("?")[0] + " → " + res.status + " " + text2.slice(0, 200));
    return text2 ? JSON.parse(text2) : null;
  }
  return {
    async getOne(table, query) {
      const r = await rest(table + "?" + query + "&limit=1");
      return r && r[0] ? r[0] : null;
    },
    async patch(table, query, body) {
      return rest(table + "?" + query, { method: "PATCH", body, prefer: "return=minimal" });
    },
    // 條件式更新並回傳實際被更新的列（沒有符合條件的列 → 空陣列）。排程用它「先佔位再動作」，避免兩個執行同時處理同一個網站。
    async patchReturning(table, query, body) {
      const r = await rest(table + "?" + query, { method: "PATCH", body, prefer: "return=representation" });
      return r || [];
    },
    async remove(table, query) {
      return rest(table + "?" + query, { method: "DELETE", prefer: "return=minimal" });
    },
    async insert(table, body) {
      return rest(table, { method: "POST", body, prefer: "return=minimal" });
    },
    async insertReturning(table, body) {
      const r = await rest(table, { method: "POST", body, prefer: "return=representation" });
      return r && r[0] ? r[0] : null;
    },
    async list(table, query) {
      return await rest(table + "?" + query) || [];
    },
    // 呼叫資料庫函式（RPC）
    async rpc(fn, args) {
      return rest("rpc/" + fn, { method: "POST", body: args || {} });
    },
    async count(table, query) {
      const res = await fetchImpl(base + "/rest/v1/" + table + "?" + query + "&select=*", { method: "HEAD", headers: headers({ Prefer: "count=exact" }) });
      if (!res.ok) throw new Error("Supabase count " + table + " → " + res.status);
      const m = (res.headers.get("content-range") || "").match(/\/(\d+)$/);
      return m ? Number(m[1]) : 0;
    },
    // Storage：列出某個資料夾（prefix）底下的物件；回傳 [{name,id,created_at,...}]（資料夾的 id 為 null）
    async storageList(bucket, prefix, { offset = 0, limit = 100 } = {}) {
      const res = await fetchImpl(base + "/storage/v1/object/list/" + bucket, { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify({ prefix, limit, offset, sortBy: { column: "name", order: "asc" } }) });
      if (!res.ok) throw new Error("Storage list " + prefix + " → " + res.status);
      return res.json();
    },
    async storageRemove(bucket, paths) {
      const res = await fetchImpl(base + "/storage/v1/object/" + bucket, { method: "DELETE", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify({ prefixes: paths }) });
      if (!res.ok) throw new Error("Storage remove → " + res.status);
      return res.json();
    },
    async download(bucket, path) {
      const res = await fetchImpl(base + "/storage/v1/object/" + bucket + "/" + path.split("/").map(encodeURIComponent).join("/"), { headers: headers() });
      if (!res.ok) throw new Error("Storage download " + path + " → " + res.status);
      return Buffer.from(await res.arrayBuffer());
    }
  };
}

// supabase/functions/_shared/brevo.mjs
var SENDER = { name: "YC AXIOM 網站租用", email: "ycaxiom@gmail.com" };
function makeBrevoSender({ apiKey, fetchImpl = fetch, timeoutMs = 1e4 }) {
  return async function sendMail2(m) {
    if (!apiKey) return { ok: false, error: "BREVO_API_KEY 未設定" };
    if (!m || !m.to) return { ok: false, error: "沒有收件人" };
    try {
      const res = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender: SENDER, replyTo: { email: m.replyTo || SENDER.email }, to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: "brevo " + res.status + " " + String(await res.text()).slice(0, 200) };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e).slice(0, 200) };
    }
  };
}

// supabase/functions/site-public/main.mjs
var need = (k) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error("missing secret " + k);
  return v;
};
var SUPABASE_URL = need("SUPABASE_URL");
var SERVICE = need("SUPABASE_SERVICE_ROLE_KEY");
var db = makeSupabase({ url: SUPABASE_URL, serviceKey: SERVICE });
var sendMail = makeBrevoSender({ apiKey: Deno.env.get("BREVO_API_KEY") || "" });
var salt = Deno.env.get("HIT_SALT") || "yc-site-public";
var paySecret = Deno.env.get("PAY_SECRET") || SERVICE;
Deno.serve((req) => handlePublic(req, { db, sendMail, salt, paySecret, publicApi: SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/site-public" }));
