// 由 npm run bundle:function 產生，請勿手改。來源：supabase/functions/site-public/ 與 templates/shared/。

// supabase/functions/_shared/http.mjs
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
function shopMessageEmail({ shopName, name, contact: contact2, message, base }) {
  const subject = "「" + shopName + "」網站留言：" + name;
  const text = shopName + " 你好，\n\n有人透過網站的聯絡表單留言給你：\n\n姓名：" + name + "\n聯絡方式：" + contact2 + "\n\n" + message + "\n\n" + (EMAIL.test(contact2) ? "直接回覆這封信，就會寄給對方。\n" : "請用對方留下的聯絡方式回覆。\n") + "所有留言也可以在會員專區查看。\n\n網站：" + base;
  const html = "<p>" + esc(shopName) + ' 你好，</p><p>有人透過網站的聯絡表單留言給你：</p><table style="border-collapse:collapse"><tr><td style="padding:2px 12px 2px 0;color:#777">姓名</td><td>' + esc(name) + '</td></tr><tr><td style="padding:2px 12px 2px 0;color:#777">聯絡方式</td><td>' + esc(contact2) + '</td></tr></table><p style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:12px">' + esc(message) + '</p><p style="color:#777;font-size:14px">' + (EMAIL.test(contact2) ? "直接回覆這封信，就會寄給對方。" : "請用對方留下的聯絡方式回覆。") + "所有留言也可以在會員專區查看。</p>";
  return { subject, text, html };
}
async function handlePublic(req, deps) {
  const url = new URL(req.url);
  const route = url.pathname.replace(/\/+$/, "").split("/").pop();
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "content-type" } });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (route === "hit") return hit(req, deps);
  if (route === "contact") return contact(req, deps);
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
async function contact(req, deps) {
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
  const name = clean(f.get("name"), LIMITS.name), contactV = clean(f.get("contact"), LIMITS.contact), message = clean(f.get("message"), LIMITS.message);
  if (!name || !contactV || !message) return page("還有欄位沒填", "請填寫姓名、聯絡方式與留言內容。");
  if ((message.match(/https?:\/\//gi) || []).length > 2) return page("送出失敗", "留言裡的網址太多，請刪減後再送出。");
  const now = (deps.now || (() => /* @__PURE__ */ new Date()))();
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ipHash = ip ? (await sha256((deps.salt || "") + "|" + now.toISOString().slice(0, 10) + "|" + ip)).slice(0, 32) : null;
  const hourAgo = new Date(now.getTime() - 3600 * 1e3).toISOString(), dayAgo = new Date(now.getTime() - 86400 * 1e3).toISOString();
  if (ipHash && await deps.db.count("site_messages", "ip_hash=eq." + ipHash + "&created_at=gte." + encodeURIComponent(hourAgo)) >= LIMITS.perIpHour) return page("送出太頻繁", "請稍後再試，或直接用電話、LINE 聯絡店家。", base);
  if (await deps.db.count("site_messages", "site_id=eq." + siteId + "&created_at=gte." + encodeURIComponent(dayAgo)) >= LIMITS.perSiteDay) return page("暫時無法留言", "今天的留言已經很多了，請改用電話或 LINE 聯絡店家。", base);
  const row = await deps.db.insertReturning("site_messages", { site_id: siteId, name, contact: contactV, message, ip_hash: ipHash });
  const owner = await deps.db.getOne("members", "id=eq." + site.member_id + "&select=email");
  if (owner && owner.email && deps.sendMail) {
    const shopName = site.content && site.content.name || "你的網站";
    const m = shopMessageEmail({ shopName, name, contact: contactV, message, base });
    const r = await deps.sendMail({ to: owner.email, ...m, ...EMAIL.test(contactV) ? { replyTo: contactV } : {} }).catch(() => ({ ok: false }));
    if (r && r.ok && row && row.id) await deps.db.patch("site_messages", "id=eq." + row.id, { emailed: true }).catch(() => {
    });
  }
  return thanks ? Response.redirect(thanks, 303) : page("已送出", "謝謝你的留言，店家會盡快回覆你。");
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
