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
    TradeDesc: "網站租用",
    ItemName: order.itemName,
    ReturnURL: order.returnUrl,
    ChoosePayment: order.kind === "atm" ? "ATM" : "Credit",
    EncryptType: "1"
  };
  if (order.clientBackUrl) f.ClientBackURL = order.clientBackUrl;
  if (order.custom1) f.CustomField1 = order.custom1;
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
async function cancelPeriod(tradeNo, cfg, fetchImpl = fetch, now = /* @__PURE__ */ new Date()) {
  const p = { MerchantID: cfg.merchantId, MerchantTradeNo: tradeNo, Action: "Cancel", TimeStamp: String(Math.floor(now.getTime() / 1e3)) };
  p.CheckMacValue = await checkMac(p, cfg);
  const res = await fetchImpl(cfg.period, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(p).toString(), signal: AbortSignal.timeout(1e4) });
  const out = Object.fromEntries(new URLSearchParams(await res.text()));
  return { ok: out.RtnCode === "1", code: out.RtnCode, message: out.RtnMsg || "" };
}

// supabase/functions/_shared/plans.mjs
var PLANS = {
  single: { name: "自架版（一頁）", monthly: 599, yearPaidMonths: 10 },
  multi: { name: "自架版（多頁）", monthly: 899, yearPaidMonths: 10 }
};
var planFor = (layout) => layout === "multi" ? PLANS.multi : PLANS.single;
var PAY_OPTIONS = {
  card_monthly: { label: "信用卡每月自動扣款", kind: "card_monthly", months: 1 },
  card_year: { label: "信用卡一次付 12 個月", kind: "card", months: 12 },
  atm_1: { label: "ATM 轉帳 1 個月", kind: "atm", months: 1 },
  atm_12: { label: "ATM 轉帳 12 個月", kind: "atm", months: 12 }
};
function priceFor(layout, months) {
  const p = planFor(layout);
  const years = Math.floor(months / 12);
  return (years * p.yearPaidMonths + months % 12) * p.monthly;
}

// supabase/functions/member-site/handler.mjs
var ACTIONS = ["set_domain", "check_domain", "clear_domain", "pay_options", "checkout", "cancel_recurring"];
var PAYABLE = ["pending", "live", "overdue", "suspended"];
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
  if (["pay_options", "checkout", "cancel_recurring"].includes(body.action)) return payAction(body, site, user, deps, reply, fail);
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
  const cfg = deps.ecpay;
  const enabled = !!cfg && !!deps.publicApi && (cfg.mode === "prod" || user.isAdmin);
  const { db: db2 } = deps;
  const now = (deps.now || (() => /* @__PURE__ */ new Date()))();
  const plan = planFor(site.layout);
  if (body.action === "pay_options") {
    if (!enabled) return reply({ ok: true, enabled: false }, 200);
    const active = await db2.getOne("pay_orders", "site_id=eq." + site.id + "&kind=eq.card_monthly&status=eq.active&select=trade_no,success_times,amount");
    return reply({
      ok: true,
      enabled: PAYABLE.includes(site.status),
      test: cfg.mode !== "prod",
      plan: plan.name,
      recurring: active || null,
      options: Object.entries(PAY_OPTIONS).filter(([k]) => !(active && k === "card_monthly")).map(([key, o]) => ({ key, label: o.label, months: o.months, amount: priceFor(site.layout, o.months) }))
    }, 200);
  }
  if (!enabled) return fail("not_enabled", "線上付款尚未開放，請先用銀行轉帳", 409);
  if (body.action === "cancel_recurring") {
    const active = await db2.getOne("pay_orders", "site_id=eq." + site.id + "&kind=eq.card_monthly&status=eq.active&select=trade_no");
    if (!active) return fail("no_recurring", "這個網站沒有設定每月自動扣款", 409);
    const r = await cancelPeriod(active.trade_no, cfg, deps.fetchImpl, now).catch((e) => ({ ok: false, message: String(e.message || e) }));
    if (!r.ok) return fail("ecpay_error", "取消失敗：" + (r.message || "請稍後再試"), 502);
    await db2.patch("pay_orders", "trade_no=eq." + active.trade_no, { status: "cancelled", updated_at: now.toISOString() });
    await db2.insert("site_events", { site_id: site.id, type: "recurring_cancelled", detail: { trade_no: active.trade_no, by: "member:" + (user.email || user.id) } }).catch(() => {
    });
    return reply({ ok: true, message: "已取消每月自動扣款。目前已付的期間不受影響，到期前會再寄提醒。" }, 200);
  }
  const opt = PAY_OPTIONS[body.option];
  if (!opt) return fail("bad_request", "請選擇付款方式");
  if (!PAYABLE.includes(site.status)) return fail("not_allowed", site.status === "draft" ? "請先在編輯器按「發佈」送出上線申請，再付款" : "這個網站目前無法付款", 409);
  if (opt.kind === "card_monthly" && await db2.getOne("pay_orders", "site_id=eq." + site.id + "&kind=eq.card_monthly&status=eq.active&select=trade_no")) return fail("already_recurring", "這個網站已經設定每月自動扣款", 409);
  const amount = priceFor(site.layout, opt.months);
  const tradeNo = newTradeNo(now);
  await db2.insert("pay_orders", { trade_no: tradeNo, site_id: site.id, member_id: site.member_id, kind: opt.kind, months: opt.months, amount, test: cfg.mode !== "prod" });
  const api = deps.publicApi.replace(/\/$/, "");
  const shop = String(site.content && site.content.name || site.slug).replace(/[#&]/g, " ").slice(0, 30);
  const fields = await checkoutFields({
    tradeNo,
    amount,
    kind: opt.kind,
    now,
    itemName: "網站租用 " + plan.name + " " + (opt.kind === "card_monthly" ? "每月" : opt.months + " 個月") + "（" + shop + "）",
    returnUrl: api + "/ecpay",
    periodReturnUrl: api + "/ecpay-period",
    paymentInfoUrl: api + "/ecpay-info",
    clientBackUrl: deps.dashboardUrl || void 0
  }, cfg);
  return reply({ ok: true, action: cfg.checkout, fields, test: cfg.mode !== "prod" }, 200);
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
var db = makeSupabase({ url: SUPABASE_URL, serviceKey: need("SUPABASE_SERVICE_ROLE_KEY") });
var getUser = makeGetUser({ supabaseUrl: SUPABASE_URL, anonKey: need("SUPABASE_ANON_KEY") });
var dispatch = makeDispatcher({ token: Deno.env.get("GITHUB_DISPATCH_TOKEN") || "", repo: Deno.env.get("GITHUB_REPO") || "chi1017/yc-axiom-sites", ref: Deno.env.get("GITHUB_REF") || "main" });
var CF_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN") || "";
var CF_ACCOUNT = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
var cf = CF_TOKEN && CF_ACCOUNT ? makeCloudflare({ token: CF_TOKEN, accountId: CF_ACCOUNT }) : void 0;
var ecpay = ecpayConfig({ ECPAY_ENV: Deno.env.get("ECPAY_ENV"), ECPAY_MERCHANT_ID: Deno.env.get("ECPAY_MERCHANT_ID"), ECPAY_HASH_KEY: Deno.env.get("ECPAY_HASH_KEY"), ECPAY_HASH_IV: Deno.env.get("ECPAY_HASH_IV") });
var SITE_BASE = Deno.env.get("OFFICIAL_SITE_URL") || "https://chi1017.github.io/yc-axiom-site/";
Deno.serve((req) => handleMember(req, {
  allowedOrigins: parseOrigins(Deno.env.get("ALLOWED_ORIGINS")),
  db,
  getUser,
  dispatch,
  cf,
  ecpay,
  publicApi: SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/site-public",
  dashboardUrl: SITE_BASE + "dashboard/"
}));
