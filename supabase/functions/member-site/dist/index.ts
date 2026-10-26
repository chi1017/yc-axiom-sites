// 由 npm run bundle:function 產生，請勿手改。來源：supabase/functions/member-site/ 與 templates/shared/。

// supabase/functions/_shared/http.mjs
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function corsHeaders(req, allowed) {
  const origin = req.headers.get("origin") || "";
  const h = { Vary: "Origin", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Max-Age": "86400" };
  if (origin && allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
function parseOrigins(v) {
  return (v || "https://chi1017.github.io").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
}
var json = (body, status, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });

// supabase/functions/_shared/domain.mjs
function normalizeDomain(v) {
  let s = String(v == null ? "" : v).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!s || s.length > 253 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return "";
  if (/(^|\.)pages\.dev$/.test(s) || /(^|\.)workers\.dev$/.test(s)) return "";
  return s;
}
var DEFAULT_WARN = "Actions 沒有啟動成功，請稍後再試一次（或請管理員重新發佈）。";
async function domainAction(action, ctx) {
  const { site, siteId, body, db: db2, cf: cf2, event, queueDeploy, reply, fail, audience = "admin" } = ctx;
  const deployWarn = ctx.deployWarn || DEFAULT_WARN;
  const notReady = audience === "admin" ? "尚未設定 Cloudflare 金鑰（Supabase Secrets：CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID）" : "網域功能暫時無法使用，請聯絡我們";
  switch (action) {
    case "set_domain": {
      if (!cf2) return fail("cf_not_configured", notReady, 501);
      const domain = normalizeDomain(body.domain);
      if (!domain) return fail("bad_request", "網域格式不正確（例如 www.example.com；不接受 pages.dev）");
      if (!site.cf_project_name) return fail("not_deployed", audience === "admin" ? "網站還沒有部署過，請先確認收款上線後再綁網域" : "網站上線後才能綁定自己的網域", 409);
      if (["draft", "cancelled"].includes(site.status)) return fail("not_allowed", "這個狀態的網站不能綁網域", 409);
      const used = await db2.getOne("rental_sites", "custom_domain=eq." + encodeURIComponent(domain) + "&id=neq." + siteId + "&select=id");
      if (used) return fail("domain_in_use", "這個網域已經綁在別的網站上", 409);
      let r;
      try {
        r = await cf2.addDomain(site.cf_project_name, domain);
      } catch (e) {
        await event("domain_failed", { domain, message: String(e.message || e).slice(0, 200) });
        return fail("cloudflare_error", "新增網域失敗：" + String(e.message || e).slice(0, 200), 502);
      }
      const active = r.status === "active";
      if (site.custom_domain && site.custom_domain !== domain) await cf2.removeDomain(site.cf_project_name, site.custom_domain).catch(() => {
      });
      await db2.patch("rental_sites", "id=eq." + siteId, { custom_domain: domain, domain_status: active ? "active" : "pending_dns" });
      await event("domain_set", { domain, cf_status: r.status });
      let warning = "";
      if (active && ["live", "overdue"].includes(site.status) && site.live_version_id) {
        const d = await queueDeploy({ versionId: site.live_version_id });
        if (!d.ok) warning = deployWarn;
      }
      return reply({
        ok: true,
        domain,
        domain_status: active ? "active" : "pending_dns",
        cname_target: r.target,
        ...warning ? { warning } : {},
        message: active ? "網域已生效。" : (audience === "admin" ? "請客戶（或網域管理者）" : "請到你買網域的地方（或請網域管理者）") + "到網域的 DNS 設定新增一筆 CNAME：名稱 " + domain + " → " + r.target + "。設定後等幾分鐘到數小時，再按「檢查網域」。"
      }, 200);
    }
    case "check_domain": {
      if (!cf2) return fail("cf_not_configured", notReady, 501);
      if (!site.custom_domain || !site.cf_project_name) return fail("no_domain", "這個網站還沒有設定自訂網域", 409);
      let r;
      try {
        r = await cf2.getDomain(site.cf_project_name, site.custom_domain);
      } catch (e) {
        return fail("cloudflare_error", "查詢網域失敗：" + String(e.message || e).slice(0, 200), 502);
      }
      if (!r) return fail("domain_missing", "Cloudflare 上找不到這個網域，請重新設定網域", 409);
      if (r.status !== "active") {
        await event("domain_checked", { domain: site.custom_domain, cf_status: r.status });
        return reply({ ok: true, domain_status: "pending_dns", cf_status: r.status, message: "網域尚未生效（Cloudflare 狀態：" + r.status + "）" + (r.error ? "：" + r.error : "") + "。DNS 設定後可能要等幾分鐘到數小時。" }, 200);
      }
      let warning = "";
      if (site.domain_status !== "active") {
        await db2.patch("rental_sites", "id=eq." + siteId, { domain_status: "active" });
        await event("domain_active", { domain: site.custom_domain });
        if (["live", "overdue"].includes(site.status) && site.live_version_id) {
          const d = await queueDeploy({ versionId: site.live_version_id });
          if (!d.ok) warning = deployWarn;
        }
      }
      return reply({ ok: true, domain_status: "active", cf_status: r.status, ...warning ? { warning } : {}, message: "網域已生效，網站正在以新網域重新發佈（約 1–2 分鐘）。" }, 200);
    }
    case "clear_domain": {
      if (!site.custom_domain) return fail("no_domain", "這個網站沒有自訂網域", 409);
      if (cf2 && site.cf_project_name) {
        try {
          await cf2.removeDomain(site.cf_project_name, site.custom_domain);
        } catch (e) {
          return fail("cloudflare_error", "移除網域失敗：" + String(e.message || e).slice(0, 200), 502);
        }
      }
      await db2.patch("rental_sites", "id=eq." + siteId, { custom_domain: null, domain_status: "none" });
      await event("domain_cleared", { domain: site.custom_domain });
      let warning = "";
      if (["live", "overdue"].includes(site.status) && site.live_version_id) {
        const d = await queueDeploy({ versionId: site.live_version_id });
        if (!d.ok) warning = deployWarn;
      }
      return reply({ ok: true, domain_status: "none", ...warning ? { warning } : {}, message: "已移除自訂網域，網站改回 pages.dev 網址並重新發佈。" }, 200);
    }
  }
  return fail("bad_request", "不支援的動作");
}

// supabase/functions/_shared/secretbox.mjs
var te = new TextEncoder();
var td = new TextDecoder();
var b64 = (u8) => btoa(String.fromCharCode(...u8));
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
async function seal(plain, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFrom(secret), te.encode(String(plain))));
  return "v1." + b64(iv) + "." + b64(ct);
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
  midnight: { label: "夜海藍", bg: "#13171B", surface: "#1E2429", text: "#E9EDF1", muted: "#A8B3BD", accent: "#6FA8DC", onAccent: "#13171B", line: "#323B43" },
  matcha: { label: "抹茶綠", bg: "#F6F7EF", surface: "#E6EAD5", text: "#1F2614", muted: "#4D5640", accent: "#4A6B22", onAccent: "#FFFFFF", line: "#D2D8BD" },
  lake: { label: "湖水青", bg: "#0E1A1C", surface: "#152528", text: "#E6F1F0", muted: "#A9C0BE", accent: "#5CC8B8", onAccent: "#0E1A1C", line: "#26393C" },
  paper: { label: "宣紙朱", bg: "#FAF7F0", surface: "#EFE7D6", text: "#2A241C", muted: "#5C5244", accent: "#9E2B25", onAccent: "#FFFFFF", line: "#DED3BE" },
  navy: { label: "藏青金", bg: "#F7F6F1", surface: "#E8E5DB", text: "#18202F", muted: "#4A5162", accent: "#1F3B6B", onAccent: "#FFFFFF", line: "#D6D1C3" }
};
var PALETTE_IDS = Object.keys(PALETTES);

// supabase/functions/_shared/shop.mjs
var MERCHANT_RE = /^\d{7,10}$/;
var KEY_RE = /^[A-Za-z0-9]{16}$/;
var PAY_MODES = ["off", "test", "live"];

// supabase/functions/member-site/handler.mjs
var ACTIONS = ["set_domain", "check_domain", "clear_domain", "get_pay", "set_pay", "order_done", "delete_site"];
var DELETABLE = ["draft", "pending"];
async function handleMember(req, deps) {
  const cors = corsHeaders(req, deps.allowedOrigins);
  const reply = (b, s) => json(b, s, cors);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "method_not_allowed", message: "不支援的請求方式" }, 405);
  const origin = req.headers.get("origin") || "";
  if (origin && !deps.allowedOrigins.includes(origin)) return reply({ error: "forbidden_origin", message: "來源不被允許" }, 403);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const user = token ? await deps.getUser(token).catch(() => null) : null;
  if (!user || !user.id) return reply({ error: "unauthorized", message: "請先登入" }, 401);
  let body;
  try {
    const t = await req.text();
    if (t.length > 2e3) throw new Error("too big");
    body = JSON.parse(t);
  } catch {
    return reply({ error: "bad_request", message: "請求格式不正確" }, 400);
  }
  if (!body || typeof body !== "object" || !ACTIONS.includes(body.action)) return reply({ error: "bad_request", message: "不支援的動作" }, 400);
  if (typeof body.site_id !== "string" || !UUID.test(body.site_id)) return reply({ error: "bad_request", message: "缺少網站編號" }, 400);
  const { db: db2 } = deps;
  const siteId = body.site_id;
  const site = await db2.getOne("rental_sites", "id=eq." + siteId + "&member_id=eq." + user.id + "&select=*");
  if (!site) return reply({ error: "not_found", message: "找不到這個網站" }, 404);
  const fail = (error, message, status = 400) => reply({ error, message }, status);
  if (["get_pay", "set_pay", "order_done"].includes(body.action)) return payAction(body, site, user, deps, reply, fail);
  if (body.action === "delete_site") {
    if (!DELETABLE.includes(site.status) || site.first_published_at) return fail("not_allowed", "已上線過的網站不能自己刪除，請用 LINE（@788cblaq）聯絡我們辦理終止", 409);
    const done = await db2.patchReturning("rental_sites", "id=eq." + siteId + "&status=in.(draft,pending)", { status: "cancelled" });
    if (!done.length) return fail("not_allowed", "這個網站目前的狀態不能刪除", 409);
    await db2.insert("site_events", { site_id: siteId, type: "deleted_by_member", detail: { from: site.status, by: "member:" + (user.email || user.id) } }).catch(() => {
    });
    return reply({ ok: true, message: "已刪除網站「" + (site.content && site.content.name || site.slug) + "」。" }, 200);
  }
  if (body.action === "set_domain" && !["live", "overdue"].includes(site.status)) return fail("not_allowed", "網站上線後才能綁定自己的網域", 409);
  const by = "member:" + (user.email || user.id);
  const event = (type, detail) => db2.insert("site_events", { site_id: siteId, type, detail: { ...detail, by } }).catch(() => {
  });
  async function queueDeploy({ versionId } = {}) {
    const d = await deps.dispatch({ siteId, versionId }).catch((e) => ({ ok: false, error: String(e) }));
    if (!d.ok) await event("deploy_failed", { message: "無法啟動部署：" + String(d.error || "").slice(0, 200), ...versionId ? { version_id: versionId } : {} });
    return d;
  }
  return domainAction(body.action, { site, siteId, body, db: db2, cf: deps.cf, event, queueDeploy, reply, fail, audience: "member" });
}
async function payAction(body, site, user, deps, reply, fail) {
  const { db: db2 } = deps;
  const now = (deps.now || (() => /* @__PURE__ */ new Date()))();
  const by = "member:" + (user.email || user.id);
  const cur = await db2.getOne("site_pay_settings", "site_id=eq." + site.id + "&select=site_id,mode,merchant_id,key_enc,iv_enc,updated_at");
  const was = cur ? cur.mode : "off";
  const view = (r) => ({ mode: r ? r.mode : "off", merchant_id: r ? r.merchant_id || "" : "", has_keys: !!(r && r.key_enc && r.iv_enc), updated_at: r ? r.updated_at : null });
  if (body.action === "get_pay") return reply({ ok: true, ...view(cur) }, 200);
  if (body.action === "order_done") {
    const tn = String(body.trade_no || "");
    if (!/^[A-Za-z0-9]{1,20}$/.test(tn)) return fail("bad_request", "缺少訂單編號");
    const done = body.done !== false;
    const r = await db2.patchReturning("shop_orders", "trade_no=eq." + tn + "&site_id=eq." + site.id, { fulfilled_at: done ? now.toISOString() : null, updated_at: now.toISOString() });
    if (!r.length) return fail("not_found", "找不到這筆訂單", 404);
    return reply({ ok: true, done }, 200);
  }
  const mode = PAY_MODES.includes(body.mode) ? body.mode : "";
  if (!mode) return fail("bad_request", "請選擇收款模式");
  const patch = { mode, updated_at: now.toISOString() };
  if (mode === "live") {
    const mid = String(body.merchant_id || "").trim();
    const key = String(body.hash_key || "").trim(), iv = String(body.hash_iv || "").trim();
    if (!MERCHANT_RE.test(mid)) return fail("bad_request", "特店編號（MerchantID）格式不正確，應該是 7 到 10 位數字");
    if (mid === "3002607" || mid === "2000132") return fail("bad_request", "這是綠界的測試帳號。要測試請選「測試模式」；正式收款請填你自己的特店編號");
    const changingKeys = key || iv || !cur || !cur.key_enc || cur.merchant_id !== mid;
    if (changingKeys) {
      if (!KEY_RE.test(key) || !KEY_RE.test(iv)) return fail("bad_request", "HashKey 與 HashIV 都是 16 個英文或數字，請到綠界廠商後台複製貼上");
      patch.key_enc = await seal(key, deps.paySecret);
      patch.iv_enc = await seal(iv, deps.paySecret);
    }
    patch.merchant_id = mid;
  }
  if (cur) await db2.patch("site_pay_settings", "site_id=eq." + site.id, patch);
  else await db2.insert("site_pay_settings", { site_id: site.id, member_id: site.member_id, ...patch });
  await db2.insert("site_events", { site_id: site.id, type: "pay_settings", detail: { mode, ...patch.merchant_id ? { merchant_id: patch.merchant_id } : {}, keys_changed: !!patch.key_enc, by } }).catch(() => {
  });
  let warning = "";
  if (was === "off" !== (mode === "off") && ["live", "overdue"].includes(site.status) && site.live_version_id) {
    const d = await deps.dispatch({ siteId: site.id, versionId: site.live_version_id }).catch((e) => ({ ok: false, error: String(e) }));
    if (!d.ok) warning = "網站沒有自動重新發佈，請到編輯器按一次「發佈」。";
  }
  const after = await db2.getOne("site_pay_settings", "site_id=eq." + site.id + "&select=site_id,mode,merchant_id,key_enc,iv_enc,updated_at");
  const msg = mode === "off" ? "已關閉線上收款。" : mode === "test" ? "已開啟測試模式：可以用綠界測試卡號下單，不會真的收款。" : "已開啟正式收款，款項會進到你的綠界帳戶。建議先自己下一筆小額訂單確認。";
  return reply({ ok: true, ...view(after), message: msg + (warning ? " " + warning : ""), ...warning ? { warning } : {} }, 200);
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

// build/lib/cloudflare.mjs
function makeCloudflare({ token, accountId, fetchImpl = fetch }) {
  const api = "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/pages/projects";
  const h = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  async function call(url, opts) {
    const res = await fetchImpl(url, { ...opts, headers: h });
    let j = null;
    try {
      j = await res.json();
    } catch {
    }
    return { status: res.status, json: j };
  }
  return {
    // 取得專案；不存在就建立。回傳 { name, subdomain }（subdomain 例如 my-cafe.pages.dev 或 my-cafe-abc.pages.dev）
    async ensureProject(name) {
      const got = await call(api + "/" + encodeURIComponent(name), { method: "GET" });
      if (got.status === 200 && got.json && got.json.result) return { name: got.json.result.name, subdomain: got.json.result.subdomain, created: false };
      if (got.status !== 404) throw new Error("Cloudflare 讀取專案失敗 (" + got.status + ")：" + errText(got.json));
      const made = await call(api, { method: "POST", body: JSON.stringify({ name, production_branch: "main" }) });
      if (made.status >= 300 || !made.json || !made.json.result) throw new Error("Cloudflare 建立專案失敗 (" + made.status + ")：" + errText(made.json));
      return { name: made.json.result.name, subdomain: made.json.result.subdomain, created: true };
    },
    // 把客戶網域加到 Pages 專案。回傳 { name, status, target }：target 是客戶要設定 CNAME 指向的主機（專案的 pages.dev 網域）。
    async addDomain(project, domain) {
      const p = await call(api + "/" + encodeURIComponent(project), { method: "GET" });
      if (p.status !== 200 || !p.json || !p.json.result) throw new Error("Cloudflare 讀取專案失敗 (" + p.status + ")：" + errText(p.json));
      const target = p.json.result.subdomain;
      const got = await call(api + "/" + encodeURIComponent(project) + "/domains/" + encodeURIComponent(domain), { method: "GET" });
      if (got.status === 200 && got.json && got.json.result) return { name: got.json.result.name || domain, status: got.json.result.status || "pending", target, created: false };
      if (got.status !== 404) throw new Error("Cloudflare 讀取網域失敗 (" + got.status + ")：" + errText(got.json));
      const made = await call(api + "/" + encodeURIComponent(project) + "/domains", { method: "POST", body: JSON.stringify({ name: domain }) });
      if (made.status >= 300 || !made.json || !made.json.result) throw new Error("Cloudflare 新增網域失敗 (" + made.status + ")：" + errText(made.json));
      return { name: made.json.result.name || domain, status: made.json.result.status || "pending", target, created: true };
    },
    // 從 Pages 專案移除網域（找不到視為已移除）
    async removeDomain(project, domain) {
      const r = await call(api + "/" + encodeURIComponent(project) + "/domains/" + encodeURIComponent(domain), { method: "DELETE" });
      if (r.status === 404) return { removed: false };
      if (r.status >= 300) throw new Error("Cloudflare 移除網域失敗 (" + r.status + ")：" + errText(r.json));
      return { removed: true };
    },
    // 刪除整個 Pages 專案（連同所有部署）。找不到視為已刪除（讓「永久刪除」可以安全重試）
    async deleteProject(project) {
      const r = await call(api + "/" + encodeURIComponent(project), { method: "DELETE" });
      if (r.status === 404) return { deleted: false };
      if (r.status >= 300) throw new Error("Cloudflare 刪除專案失敗 (" + r.status + ")：" + errText(r.json));
      return { deleted: true };
    },
    // 查詢網域狀態：Cloudflare 的 status 為 initializing／pending／active／deactivated／blocked／error
    async getDomain(project, domain) {
      const got = await call(api + "/" + encodeURIComponent(project) + "/domains/" + encodeURIComponent(domain), { method: "GET" });
      if (got.status === 404) return null;
      if (got.status !== 200 || !got.json || !got.json.result) throw new Error("Cloudflare 讀取網域失敗 (" + got.status + ")：" + errText(got.json));
      const r = got.json.result;
      return { name: r.name || domain, status: r.status || "pending", error: r.validation_data && r.validation_data.error_message || r.verification_data && r.verification_data.error_message || "" };
    }
  };
}
function errText(j) {
  return j && j.errors && j.errors.length ? j.errors.map((e) => e.message).join("; ") : "unknown";
}

// supabase/functions/_shared/runtime.mjs
function makeGetUser({ supabaseUrl, anonKey, fetchImpl = fetch }) {
  return async function getUser2(token) {
    const res = await fetchImpl(supabaseUrl + "/auth/v1/user", { headers: { apikey: anonKey, Authorization: "Bearer " + token }, signal: AbortSignal.timeout(8e3) });
    if (!res.ok) return null;
    const u = await res.json();
    if (!u || !u.id) return null;
    return { id: u.id, email: u.email, isAdmin: !!(u.app_metadata && u.app_metadata.role === "admin") };
  };
}
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

// supabase/functions/member-site/main.mjs
var need = (k) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error("missing secret " + k);
  return v;
};
var SUPABASE_URL = need("SUPABASE_URL");
var SERVICE = need("SUPABASE_SERVICE_ROLE_KEY");
var db = makeSupabase({ url: SUPABASE_URL, serviceKey: SERVICE });
var getUser = makeGetUser({ supabaseUrl: SUPABASE_URL, anonKey: need("SUPABASE_ANON_KEY") });
var dispatch = makeDispatcher({ token: Deno.env.get("GITHUB_DISPATCH_TOKEN") || "", repo: Deno.env.get("GITHUB_REPO") || "chi1017/yc-axiom-sites", ref: Deno.env.get("GITHUB_REF") || "main" });
var CF_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN") || "";
var CF_ACCOUNT = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
var cf = CF_TOKEN && CF_ACCOUNT ? makeCloudflare({ token: CF_TOKEN, accountId: CF_ACCOUNT }) : void 0;
Deno.serve((req) => handleMember(req, { allowedOrigins: parseOrigins(Deno.env.get("ALLOWED_ORIGINS")), db, getUser, dispatch, cf, paySecret: Deno.env.get("PAY_SECRET") || SERVICE }));
