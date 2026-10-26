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

// supabase/functions/site-public/handler.mjs
var LIMITS = { name: 60, contact: 120, message: 2e3, perIpHour: 5, perSiteDay: 100 };
var LIVE = ["live", "overdue"];
var BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed|facebookexternalhit|curl|wget|python|node-fetch/i;
var esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var clean = (v, max) => String(v == null ? "" : v).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function siteBase(site) {
  if (site.custom_domain && site.domain_status === "active") return "https://" + site.custom_domain + "/";
  const u = String(site.public_url || "");
  return /^https:\/\/[a-z0-9.-]+\/?$/i.test(u) ? u.replace(/\/?$/, "/") : "";
}
var page = (title, text, back) => new Response(
  '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(title) + `</title><body style="font:16px/1.8 -apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;max-width:560px;margin:15vh auto;padding:0 20px"><h1 style="font-size:22px">` + esc(title) + "</h1><p>" + esc(text) + "</p>" + (back ? '<p><a href="' + esc(back) + '">回到網站</a></p>' : '<p><a href="javascript:history.back()">回上一頁</a></p>') + "</body></html>",
  { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
);
function shopMessageEmail({ shopName, name, contact: contact2, message, base, kind = "message", when = "" }) {
  const subject = "「" + shopName + "」" + (kind === "booking" ? "預約申請：" + when + " " : "網站留言：") + name;
  const intro = kind === "booking" ? "有人透過網站送出預約申請，請與對方聯絡確認（網站不會自動保留時段）：" : "有人透過網站的聯絡表單留言給你：";
  const text = shopName + " 你好，\n\n" + intro + "\n\n姓名：" + name + "\n聯絡方式：" + contact2 + "\n\n" + message + "\n\n" + (EMAIL.test(contact2) ? "直接回覆這封信，就會寄給對方。\n" : "請用對方留下的聯絡方式回覆。\n") + "所有留言也可以在會員專區查看。\n\n網站：" + base;
  const html = "<p>" + esc(shopName) + " 你好，</p><p>" + esc(intro) + '</p><table style="border-collapse:collapse"><tr><td style="padding:2px 12px 2px 0;color:#777">姓名</td><td>' + esc(name) + '</td></tr><tr><td style="padding:2px 12px 2px 0;color:#777">聯絡方式</td><td>' + esc(contact2) + '</td></tr></table><p style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:12px">' + esc(message) + '</p><p style="color:#777;font-size:14px">' + (EMAIL.test(contact2) ? "直接回覆這封信，就會寄給對方。" : "請用對方留下的聯絡方式回覆。") + "所有留言也可以在會員專區查看。</p>";
  return { subject, text, html };
}
async function handlePublic(req, deps) {
  const url = new URL(req.url);
  const route = url.pathname.replace(/\/+$/, "").split("/").pop();
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "content-type" } });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (route === "hit") return hit(req, deps);
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
    const text = await res.text();
    if (!res.ok) throw new Error("Supabase " + method + " " + path.split("?")[0] + " → " + res.status + " " + text.slice(0, 200));
    return text ? JSON.parse(text) : null;
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

// supabase/functions/site-public/main.mjs
var need = (k) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error("missing secret " + k);
  return v;
};
var db = makeSupabase({ url: need("SUPABASE_URL"), serviceKey: need("SUPABASE_SERVICE_ROLE_KEY") });
var sendMail = makeBrevoSender({ apiKey: Deno.env.get("BREVO_API_KEY") || "" });
var salt = Deno.env.get("HIT_SALT") || "yc-site-public";
Deno.serve((req) => handlePublic(req, { db, sendMail, salt }));
