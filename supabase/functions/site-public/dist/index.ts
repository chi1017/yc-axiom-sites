// 由 npm run bundle:function 產生，請勿手改。來源：supabase/functions/site-public/ 與 templates/shared/。

// supabase/functions/_shared/http.mjs
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
var DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// templates/shared/hours.js
function dayState(h) {
  if (!h) return { kind: "unset" };
  if (h.closed) return { kind: "closed" };
  if (h.open && h.close) return { kind: "open", open: h.open, close: h.close };
  return { kind: "unset" };
}

// templates/shared/booking.js
var BOOKING_DAYS_AHEAD = 90;
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
var addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
function checkBooking({ hours, date, time, today }) {
  if (!DATE_RE.test(date || "") || Number.isNaN(Date.parse(date + "T00:00:00Z"))) return { ok: false, msg: "請選擇預約日期" };
  if (!TIME_RE.test(time || "")) return { ok: false, msg: "請選擇預約時間" };
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
function ecpayConfig(env = {}) {
  const prod = env.ECPAY_ENV === "prod" && env.ECPAY_MERCHANT_ID && env.ECPAY_HASH_KEY && env.ECPAY_HASH_IV;
  return prod ? { mode: "prod", merchantId: env.ECPAY_MERCHANT_ID, hashKey: env.ECPAY_HASH_KEY, hashIV: env.ECPAY_HASH_IV, ...ECPAY_URL.prod } : { mode: "stage", ...ECPAY_TEST, ...ECPAY_URL.stage };
}
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

// supabase/functions/_shared/emails.mjs
var esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var CONTACT = { line: "@788cblaq", email: "ycaxiom@gmail.com" };
function layout(title, bodyHtml) {
  return `<!doctype html><html lang="zh-Hant"><body style="margin:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#222"><div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border-radius:10px;padding:24px 26px;line-height:1.7;font-size:15px"><h2 style="margin:0 0 14px;font-size:18px">` + esc(title) + "</h2>" + bodyHtml + '</div><p style="color:#888;font-size:12px;text-align:center;margin:14px 0 0">YC AXIOM 網站租用 · LINE ' + CONTACT.line + " · " + CONTACT.email + "</p></div></body></html>";
}
var ADD_CONTACT = "為避免我們的信件被歸到垃圾信匣，請把 " + CONTACT.email + " 加入你的聯絡人；直接回覆這封信也會寄到我們的信箱。";
function customerReceipt({ shopName, amount, months, paidOn, periodTo, reference }) {
  const subject = "【YC AXIOM】已收到你的款項：" + shopName;
  const rows = [["網站", shopName], ["金額", "NT$ " + Number(amount).toLocaleString("en-US")], ["租用月數", months + " 個月"], ["收款日", paidOn], ["服務到期日", periodTo]];
  if (reference) rows.push(["匯款備註", reference]);
  const html = layout(
    "已收到你的款項",
    '<p>謝謝你！我們已確認收到匯款，服務期間已更新：</p><table style="border-collapse:collapse;width:100%">' + rows.map((r) => '<tr><td style="padding:6px 12px 6px 0;color:#777;white-space:nowrap">' + esc(r[0]) + '</td><td style="padding:6px 0">' + esc(r[1]) + "</td></tr>").join("") + '</table><p style="color:#666;font-size:13px">這封信作為收款通知；如需正式收據或發票請聯絡我們。' + esc(ADD_CONTACT) + "</p>"
  );
  const text2 = ["已收到你的款項", "", ...rows.map((r) => r[0] + "：" + r[1]), "", ADD_CONTACT].join("\n");
  return { subject, html, text: text2 };
}
var LINE_HINT = "有任何問題都可以直接回覆這封信，或用 LINE " + CONTACT.line + " 聯絡我們。";

// supabase/functions/_shared/dates.mjs
function taipeiDate(d) {
  return new Date(d.getTime() + 8 * 3600 * 1e3).toISOString().slice(0, 10);
}
function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

// supabase/functions/_shared/payment.mjs
async function applyPayment({ db: db2, site, siteId, amount, months, method, reference = "", paidOn, by, today, event, queueDeploy, sendMail: sendMail2, deployWarn = "" }) {
  if (!["pending", "live", "overdue", "suspended"].includes(site.status)) return { ok: false, error: "not_allowed", status: 409, message: site.status === "draft" ? "客戶還沒有送出上線申請" : "這個網站已終止服務，無法收款" };
  const latestVersion = async () => (await db2.list("site_versions", "site_id=eq." + siteId + "&select=id&order=created_at.desc&limit=1"))[0] || null;
  let deployVersionId = null;
  if (site.status === "pending") {
    const v = await latestVersion();
    if (!v) return { ok: false, error: "no_version", status: 409, message: "這個網站沒有可上線的版本" };
    deployVersionId = v.id;
  }
  const from = site.paid_until && site.paid_until > today ? site.paid_until : today;
  const to = addMonths(from, months);
  const pay = await db2.insertReturning("payments", { site_id: siteId, member_id: site.member_id, amount, months, method, reference: reference || null, paid_on: paidOn, period_from: from, period_to: to, confirmed_by: by });
  if (!pay) return { ok: false, error: "server_error", status: 500, message: "寫入收款紀錄失敗，請稍後再試" };
  const newStatus = to >= today ? "live" : "overdue";
  const patch = { paid_until: to };
  let needDeploy = false;
  if (site.status !== newStatus) patch.status = newStatus;
  if (site.status === "suspended") {
    patch.suspended_at = null;
    patch.suspend_reason = null;
    needDeploy = true;
    deployVersionId = site.live_version_id || (await latestVersion() || {}).id || null;
  }
  if (site.status === "pending") needDeploy = true;
  try {
    await db2.patch("rental_sites", "id=eq." + siteId, patch);
  } catch (e) {
    await event("payment_confirmed", { payment_id: pay.id, amount, months, period_to: to, method, warning: "收款已記錄，但更新網站狀態失敗" });
    return { ok: false, error: "server_error", status: 500, message: "收款已記錄，但更新網站狀態失敗。請在詳情頁檢查狀態與到期日。" };
  }
  const statusFrom = site.status;
  Object.assign(site, patch);
  await event("payment_confirmed", { payment_id: pay.id, amount, months, ...method !== "bank_transfer" ? { method } : {}, period_from: from, period_to: to, status_from: statusFrom, status_to: site.status });
  let warning = "";
  if (needDeploy) {
    if (!deployVersionId) warning = "找不到可部署的版本，請請客戶按一次發佈。";
    else {
      const d = await queueDeploy({ versionId: deployVersionId });
      if (!d.ok) warning = deployWarn;
    }
  }
  const member = await db2.getOne("members", "id=eq." + site.member_id + "&select=email").catch(() => null);
  if (member && member.email && sendMail2) {
    const mail = customerReceipt({ shopName: site.content && site.content.name || site.slug, amount, months, paidOn, periodTo: to, reference });
    const r = await sendMail2({ to: member.email, ...mail }).catch((e) => ({ ok: false, error: String(e) }));
    await event(r.ok ? "email_sent" : "email_failed", { template: "customerReceipt", ...r.ok ? {} : { error: String(r.error || "").slice(0, 200) } });
  }
  return { ok: true, status: patch.status || site.status, paidUntil: to, deploying: needDeploy && !warning, warning, paymentId: pay.id };
}

// supabase/functions/site-public/handler.mjs
var LIMITS = { name: 60, contact: 120, message: 2e3, perIpHour: 5, perSiteDay: 100 };
var LIVE = ["live", "overdue"];
var BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|facebookexternalhit|curl|wget|python|node-fetch/i;
var esc2 = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
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
  '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc2(title) + `</title><body style="font:16px/1.8 -apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:560px;margin:15vh auto;padding:0 20px"><h1 style="font-size:22px">` + esc2(title) + "</h1><p>" + esc2(text2) + "</p>" + (back ? '<p><a href="' + esc2(back) + '">回到網站</a></p>' : '<p><a href="javascript:history.back()">回上一頁</a></p>') + "</body></html>",
  { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
);
function shopMessageEmail({ shopName, name, contact: contact2, message, base, kind = "message", when = "" }) {
  const subject = "「" + shopName + "」" + (kind === "booking" ? "預約申請：" + when + " " : "網站留言：") + name;
  const intro = kind === "booking" ? "有人透過網站送出預約申請，請與對方聯絡確認（網站不會自動保留時段）：" : "有人透過網站的聯絡表單留言給你：";
  const text2 = shopName + " 你好，\n\n" + intro + "\n\n姓名：" + name + "\n聯絡方式：" + contact2 + "\n\n" + message + "\n\n" + (EMAIL.test(contact2) ? "直接回覆這封信，就會寄給對方。\n" : "請用對方留下的聯絡方式回覆。\n") + "所有留言也可以在會員專區查看。\n\n網站：" + base;
  const html = "<p>" + esc2(shopName) + " 你好，</p><p>" + esc2(intro) + '</p><table style="border-collapse:collapse"><tr><td style="padding:2px 12px 2px 0;color:#777">姓名</td><td>' + esc2(name) + '</td></tr><tr><td style="padding:2px 12px 2px 0;color:#777">聯絡方式</td><td>' + esc2(contact2) + '</td></tr></table><p style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:12px">' + esc2(message) + '</p><p style="color:#777;font-size:14px">' + (EMAIL.test(contact2) ? "直接回覆這封信，就會寄給對方。" : "請用對方留下的聯絡方式回覆。") + "所有留言也可以在會員專區查看。</p>";
  return { subject, text: text2, html };
}
async function handlePublic(req, deps) {
  const url = new URL(req.url);
  const route = url.pathname.replace(/\/+$/, "").split("/").pop();
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "content-type" } });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (route === "hit") return hit(req, deps);
  if (route === "ecpay" || route === "ecpay-period" || route === "ecpay-info") return ecpayNotify(req, deps, route);
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
  const site = await deps.db.getOne("rental_sites", "id=eq." + siteId + "&select=id,member_id,status,public_url,custom_domain,domain_status,content");
  if (!site || !LIVE.includes(site.status)) return page("送出失敗", "這個網站目前無法接收留言。");
  const base = siteBase(site);
  const thanks = base ? base + "thanks/" : "";
  if (f.get("website")) return thanks ? Response.redirect(thanks, 303) : page("已送出", "謝謝你的留言。");
  const now = (deps.now || (() => /* @__PURE__ */ new Date()))();
  const name = clean(f.get("name"), LIMITS.name), contactV = clean(f.get("contact"), LIMITS.contact);
  let message = clean(f.get("message"), LIMITS.message), meta = null, when = "";
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
  if (ipHash && await deps.db.count("site_messages", "ip_hash=eq." + ipHash + "&created_at=gte." + encodeURIComponent(hourAgo)) >= LIMITS.perIpHour) return page("送出太頻繁", "請稍後再試，或直接用電話、LINE 聯絡店家。", base);
  if (await deps.db.count("site_messages", "site_id=eq." + siteId + "&created_at=gte." + encodeURIComponent(dayAgo)) >= LIMITS.perSiteDay) return page("暫時無法留言", "今天的留言已經很多了，請改用電話或 LINE 聯絡店家。", base);
  const row = await deps.db.insertReturning("site_messages", { site_id: siteId, name, contact: contactV, message, ip_hash: ipHash, kind, ...meta ? { meta } : {} });
  const owner = await deps.db.getOne("members", "id=eq." + site.member_id + "&select=email");
  if (owner && owner.email && deps.sendMail) {
    const shopName = site.content && site.content.name || "你的網站";
    const m = shopMessageEmail({ shopName, name, contact: contactV, message, base, kind, when });
    const r = await deps.sendMail({ to: owner.email, ...m, ...EMAIL.test(contactV) ? { replyTo: contactV } : {} }).catch(() => ({ ok: false }));
    if (r && r.ok && row && row.id) await deps.db.patch("site_messages", "id=eq." + row.id, { emailed: true }).catch(() => {
    });
  }
  return thanks ? Response.redirect(thanks, 303) : page("已送出", kind === "booking" ? "已收到你的預約申請，店家確認後會與你聯絡。" : "謝謝你的留言，店家會盡快回覆你。");
}
var text = (t) => new Response(t, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
async function ecpayNotify(req, deps, route) {
  const cfg = deps.ecpay;
  if (!cfg) return text("0|not configured");
  let f;
  try {
    const t = await req.text();
    if (t.length > 8e3) return text("0|too large");
    f = Object.fromEntries(new URLSearchParams(t));
  } catch {
    return text("0|bad request");
  }
  if (!await verifyMac(f, cfg)) return text("0|CheckMacValue Error");
  if (f.MerchantID !== cfg.merchantId) return text("0|MerchantID Error");
  const { db: db2 } = deps;
  const tradeNo = String(f.MerchantTradeNo || "");
  if (!/^[A-Za-z0-9]{1,20}$/.test(tradeNo)) return text("0|bad trade no");
  const order = await db2.getOne("pay_orders", "trade_no=eq." + tradeNo + "&select=*");
  if (!order) return text("0|order not found");
  const now = (deps.now || (() => /* @__PURE__ */ new Date()))();
  const notify = { route, RtnCode: f.RtnCode, RtnMsg: String(f.RtnMsg || "").slice(0, 200), TradeNo: f.TradeNo, at: now.toISOString() };
  const touch = (extra) => db2.patch("pay_orders", "trade_no=eq." + tradeNo, { last_notify: notify, updated_at: now.toISOString(), ...extra }).catch(() => {
  });
  const event = (type, detail) => db2.insert("site_events", { site_id: order.site_id, type, detail: { ...detail, trade_no: tradeNo, by: "ecpay" } }).catch(() => {
  });
  if (cfg.mode === "prod" && f.SimulatePaid === "1") {
    await touch({});
    return text("1|OK");
  }
  if (route === "ecpay-info") {
    if (order.status === "created") await touch({ status: "atm_issued", atm: { bank: f.BankCode || "", account: f.vAccount || "", expire: f.ExpireDate || "" } });
    return text("1|OK");
  }
  const site = await db2.getOne("rental_sites", "id=eq." + order.site_id + "&select=*");
  if (!site) {
    await touch({});
    return text("1|OK");
  }
  const today = taipeiDate(now);
  const credit = (months2, method, amount2) => applyPayment({
    db: db2,
    site,
    siteId: site.id,
    amount: amount2,
    months: months2,
    method,
    reference: "綠界 " + String(f.TradeNo || tradeNo).slice(0, 40) + (order.test ? "（測試）" : ""),
    paidOn: today,
    by: "ecpay",
    today,
    event,
    queueDeploy: async ({ versionId }) => {
      const d = await deps.dispatch({ siteId: site.id, versionId }).catch((e) => ({ ok: false, error: String(e) }));
      if (!d.ok) await event("deploy_failed", { message: "無法啟動部署：" + String(d.error || "").slice(0, 200), ...versionId ? { version_id: versionId } : {} });
      return d;
    },
    sendMail: deps.sendMail,
    deployWarn: "自動部署沒有啟動，請到後台按重新發佈。"
  });
  if (f.RtnCode !== "1") {
    await touch(order.kind === "card_monthly" && order.status === "active" ? {} : order.status === "created" ? { status: "failed" } : {});
    await event(route === "ecpay-period" ? "recurring_failed" : "payment_failed", { code: f.RtnCode, message: notify.RtnMsg });
    return text("1|OK");
  }
  const paidAmount = Number(route === "ecpay-period" ? f.Amount : f.TradeAmt);
  if (paidAmount !== order.amount) {
    await touch({});
    await event("payment_mismatch", { expected: order.amount, got: paidAmount });
    return text("1|OK");
  }
  if (order.kind === "card_monthly") {
    const times = route === "ecpay-period" ? Math.max(1, parseInt(f.TotalSuccessTimes || "0", 10) || 0) : 1;
    const prev = order.success_times, amount2 = order.amount;
    if (times <= prev) {
      await touch({});
      return text("1|OK");
    }
    const won2 = await db2.patchReturning("pay_orders", "trade_no=eq." + tradeNo + "&success_times=eq." + prev, { success_times: times, status: order.status === "cancelled" ? "cancelled" : "active", last_notify: notify, updated_at: now.toISOString() });
    if (!won2.length) return text("1|OK");
    await credit(times - prev, "credit_recurring", amount2 * (times - prev));
    return text("1|OK");
  }
  const { months, kind, amount } = order;
  const won = await db2.patchReturning("pay_orders", "trade_no=eq." + tradeNo + "&status=in.(created,atm_issued,failed)", { status: "paid", last_notify: notify, updated_at: now.toISOString() });
  if (!won.length) return text("1|OK");
  await credit(months, kind === "atm" ? "atm" : "credit", amount);
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
      const res = await fetchImpl(base + "/rest/v1/" + table + "?" + query + "&select=id", { method: "HEAD", headers: headers({ Prefer: "count=exact" }) });
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

// supabase/functions/_shared/runtime.mjs
function makeDispatcher({ token, repo, ref = "main", fetchImpl = fetch }) {
  return async function dispatch2({ siteId, versionId, mode }) {
    if (!token) return { ok: false, error: "GITHUB_DISPATCH_TOKEN 未設定" };
    const inputs = { site_id: siteId };
    if (versionId) inputs.version_id = versionId;
    if (mode) inputs.mode = mode;
    const res = await fetchImpl("https://api.github.com/repos/" + repo + "/actions/workflows/deploy-site.yml/dispatches", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", "User-Agent": "yc-axiom-sites-functions" },
      body: JSON.stringify({ ref: ref || "main", inputs }),
      signal: AbortSignal.timeout(1e4)
    });
    return res.status === 204 ? { ok: true } : { ok: false, error: "github " + res.status };
  };
}

// supabase/functions/site-public/main.mjs
var need = (k) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error("missing secret " + k);
  return v;
};
var db = makeSupabase({ url: need("SUPABASE_URL"), serviceKey: need("SUPABASE_SERVICE_ROLE_KEY") });
var sendMail = makeBrevoSender({ apiKey: Deno.env.get("BREVO_API_KEY") || "" });
var salt = Deno.env.get("HIT_SALT") || "yc-site-public";
var dispatch = makeDispatcher({ token: Deno.env.get("GITHUB_DISPATCH_TOKEN") || "", repo: Deno.env.get("GITHUB_REPO") || "chi1017/yc-axiom-sites", ref: Deno.env.get("GITHUB_REF") || "main" });
var ecpay = ecpayConfig({ ECPAY_ENV: Deno.env.get("ECPAY_ENV"), ECPAY_MERCHANT_ID: Deno.env.get("ECPAY_MERCHANT_ID"), ECPAY_HASH_KEY: Deno.env.get("ECPAY_HASH_KEY"), ECPAY_HASH_IV: Deno.env.get("ECPAY_HASH_IV") });
Deno.serve((req) => handlePublic(req, { db, sendMail, salt, dispatch, ecpay }));
