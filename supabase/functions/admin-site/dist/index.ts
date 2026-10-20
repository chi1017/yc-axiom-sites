// 由 npm run bundle:function 產生，請勿手改。來源：supabase/functions/admin-site/ 與 templates/shared/。

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
  const text = ["已收到你的款項", "", ...rows.map((r) => r[0] + "：" + r[1]), "", ADD_CONTACT].join("\n");
  return { subject, html, text };
}
var LINE_HINT = "有任何問題都可以直接回覆這封信，或用 LINE " + CONTACT.line + " 聯絡我們。";

// supabase/functions/admin-site/handler.mjs
var MAX_MONTHS = 60;
var MAX_AMOUNT = 1e7;
var ACTIONS = ["confirm_payment", "republish", "suspend", "restore", "terminate", "purge", "restore_version", "set_domain", "check_domain", "clear_domain"];
var PHOTO_BUCKET = "site-photos";
function taipeiDate(d) {
  return new Date(d.getTime() + 8 * 3600 * 1e3).toISOString().slice(0, 10);
}
var isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) && (/* @__PURE__ */ new Date(v + "T00:00:00Z")).toISOString().slice(0, 10) === v;
function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}
function normalizeDomain(v) {
  let s = String(v == null ? "" : v).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!s || s.length > 253 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return "";
  if (/(^|\.)pages\.dev$/.test(s) || /(^|\.)workers\.dev$/.test(s)) return "";
  return s;
}
async function handleAdmin(req, deps) {
  const cors = corsHeaders(req, deps.allowedOrigins);
  const reply = (b, s) => json(b, s, cors);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "method_not_allowed", message: "不支援的請求方式" }, 405);
  const origin = req.headers.get("origin") || "";
  if (origin && !deps.allowedOrigins.includes(origin)) return reply({ error: "forbidden_origin", message: "來源不被允許" }, 403);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const user = token ? await deps.getUser(token).catch(() => null) : null;
  if (!user || !user.id) return reply({ error: "unauthorized", message: "請先登入" }, 401);
  if (!user.isAdmin) return reply({ error: "forbidden", message: "只有管理員可以使用" }, 403);
  let body;
  try {
    const t = await req.text();
    if (t.length > 4e3) throw new Error("too big");
    body = JSON.parse(t);
  } catch {
    return reply({ error: "bad_request", message: "請求格式不正確" }, 400);
  }
  if (!body || typeof body !== "object") return reply({ error: "bad_request", message: "請求格式不正確" }, 400);
  if (!ACTIONS.includes(body.action)) return reply({ error: "bad_request", message: "不支援的動作" }, 400);
  if (typeof body.site_id !== "string" || !UUID.test(body.site_id)) return reply({ error: "bad_request", message: "缺少網站編號" }, 400);
  const { db: db2 } = deps;
  const now = (deps.now || (() => /* @__PURE__ */ new Date()))();
  const today = taipeiDate(now);
  const siteId = body.site_id;
  const by = user.email || user.id;
  const site = await db2.getOne("rental_sites", "id=eq." + siteId + "&select=*");
  if (!site) return reply({ error: "not_found", message: "找不到這個網站" }, 404);
  const event = (type, detail) => db2.insert("site_events", { site_id: siteId, type, detail: { ...detail, by } }).catch(() => {
  });
  const fail = (error, message, status = 400) => reply({ error, message }, status);
  async function queueDeploy({ versionId, mode } = {}) {
    const d = await deps.dispatch({ siteId, versionId, mode }).catch((e) => ({ ok: false, error: String(e) }));
    if (!d.ok) await event("deploy_failed", { message: "無法啟動部署：" + String(d.error || "").slice(0, 200), ...versionId ? { version_id: versionId } : {}, ...mode ? { mode } : {} });
    return d;
  }
  const latestVersion = async () => (await db2.list("site_versions", "site_id=eq." + siteId + "&select=id&order=created_at.desc&limit=1"))[0] || null;
  const deployWarn = "Actions 沒有啟動成功，請稍後在詳情按「重新發佈」。";
  switch (body.action) {
    case "confirm_payment": {
      const amount = body.amount, months = body.months, paidOn = body.paid_on;
      const reference = body.reference == null ? "" : String(body.reference).trim();
      if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) return fail("bad_request", "金額必須是 1 到 " + MAX_AMOUNT.toLocaleString("en-US") + " 的整數（新台幣）");
      if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) return fail("bad_request", "月數必須是 1 到 " + MAX_MONTHS + " 的整數");
      if (reference.length > 100) return fail("bad_request", "匯款備註最長 100 字");
      if (!isDate(paidOn)) return fail("bad_request", "收款日格式不正確（YYYY-MM-DD）");
      if (Date.parse(paidOn + "T00:00:00Z") > Date.parse(today + "T00:00:00Z") + 864e5) return fail("bad_request", "收款日不能晚於明天");
      if (Date.parse(paidOn + "T00:00:00Z") < Date.parse(today + "T00:00:00Z") - 800 * 864e5) return fail("bad_request", "收款日太久以前，請確認");
      if (!["pending", "live", "overdue", "suspended"].includes(site.status)) return fail("not_allowed", site.status === "draft" ? "客戶還沒有送出上線申請" : "這個網站已終止服務，無法收款", 409);
      const since = new Date(now.getTime() - 60 * 1e3).toISOString();
      const dup = await db2.list("payments", "site_id=eq." + siteId + "&amount=eq." + amount + "&paid_on=eq." + paidOn + "&created_at=gte." + encodeURIComponent(since) + "&select=id&limit=1");
      if (dup.length) return fail("duplicate", "1 分鐘內已有相同的收款紀錄，請勿重複送出", 409);
      let deployVersionId = null;
      if (site.status === "pending") {
        const v = await latestVersion();
        if (!v) return fail("no_version", "這個網站沒有可上線的版本", 409);
        deployVersionId = v.id;
      }
      const from = site.paid_until && site.paid_until > today ? site.paid_until : today;
      const to = addMonths(from, months);
      const pay = await db2.insertReturning("payments", { site_id: siteId, member_id: site.member_id, amount, months, method: "bank_transfer", reference: reference || null, paid_on: paidOn, period_from: from, period_to: to, confirmed_by: by });
      if (!pay) return fail("server_error", "寫入收款紀錄失敗，請稍後再試", 500);
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
        await event("payment_confirmed", { payment_id: pay.id, amount, months, period_to: to, warning: "收款已記錄，但更新網站狀態失敗" });
        return fail("server_error", "收款已記錄，但更新網站狀態失敗。請在詳情頁檢查狀態與到期日。", 500);
      }
      await event("payment_confirmed", { payment_id: pay.id, amount, months, period_from: from, period_to: to, status_from: site.status, status_to: patch.status || site.status });
      let warning = "";
      if (needDeploy) {
        if (!deployVersionId) warning = "找不到可部署的版本，請請客戶按一次發佈。";
        else {
          const d = await queueDeploy({ versionId: deployVersionId });
          if (!d.ok) warning = deployWarn;
        }
      }
      const member = await db2.getOne("members", "id=eq." + site.member_id + "&select=email").catch(() => null);
      if (member && member.email) {
        const mail = customerReceipt({ shopName: site.content && site.content.name || site.slug, amount, months, paidOn, periodTo: to, reference });
        const r = await deps.sendMail({ to: member.email, ...mail }).catch((e) => ({ ok: false, error: String(e) }));
        await event(r.ok ? "email_sent" : "email_failed", { template: "customerReceipt", ...r.ok ? {} : { error: String(r.error || "").slice(0, 200) } });
      }
      return reply({ ok: true, status: patch.status || site.status, paid_until: to, deploying: needDeploy && !warning, ...warning ? { warning } : {}, message: "已記錄收款，到期日 " + to + (needDeploy && !warning ? "，正在部署（約 1–2 分鐘）。" : "。") + (warning ? " " + warning : "") }, 200);
    }
    case "republish": {
      if (site.status === "suspended") {
        const d2 = await queueDeploy({ mode: "maintenance" });
        await event("republish_queued", { mode: "maintenance" });
        return d2.ok ? reply({ ok: true, message: "已重新部署維護頁。" }, 200) : fail("dispatch_failed", "沒有送出成功：" + deployWarn, 502);
      }
      if (!["live", "overdue"].includes(site.status)) return fail("not_allowed", "只有上線中、已逾期或已暫停的網站可以重新發佈", 409);
      if (!site.live_version_id) return fail("no_version", "這個網站還沒有成功部署過的版本，請改用「收款」或請客戶發佈", 409);
      await event("republish_queued", { version_id: site.live_version_id });
      const d = await queueDeploy({ versionId: site.live_version_id });
      return d.ok ? reply({ ok: true, message: "已排入重新發佈，約 1–2 分鐘。" }, 200) : fail("dispatch_failed", "沒有送出成功：" + deployWarn, 502);
    }
    case "suspend": {
      const reason = body.reason == null ? "" : String(body.reason).trim();
      if (reason.length > 200) return fail("bad_request", "原因最長 200 字");
      if (!["pending", "live", "overdue"].includes(site.status)) return fail("not_allowed", site.status === "suspended" ? "這個網站已經是暫停狀態" : "這個狀態的網站不能暫停", 409);
      await db2.patch("rental_sites", "id=eq." + siteId, { status: "suspended", suspended_at: now.toISOString(), suspend_reason: reason || null });
      await event("suspended", { reason, status_from: site.status });
      const d = await queueDeploy({ mode: "maintenance" });
      return reply({ ok: true, status: "suspended", ...d.ok ? {} : { warning: deployWarn }, message: d.ok ? "已暫停，維護頁約 1–2 分鐘後生效。" : "已暫停，但維護頁沒有啟動部署。" + deployWarn }, 200);
    }
    case "restore": {
      if (!["suspended", "cancelled"].includes(site.status)) return fail("not_allowed", "只有暫停中或已終止的網站可以恢復", 409);
      const statusFrom = site.status;
      const deployed = !!(site.live_version_id && site.cf_project_name);
      const status = !deployed ? "pending" : site.paid_until && site.paid_until >= today ? "live" : "overdue";
      await db2.patch("rental_sites", "id=eq." + siteId, { status, suspended_at: null, suspend_reason: null });
      await event("restored", { status_to: status, status_from: statusFrom });
      if (!deployed) return reply({ ok: true, status, message: "已恢復為「待上線」（這個網站還沒有部署過）。" }, 200);
      const d = await queueDeploy({ versionId: site.live_version_id });
      return reply({ ok: true, status, ...d.ok ? {} : { warning: deployWarn }, message: d.ok ? "已恢復為「" + status + "」，網站約 1–2 分鐘後回來。" : "已恢復，但部署沒有啟動。" + deployWarn }, 200);
    }
    // 終止租用：網站改成「已終止」，網址換成「已停止服務」頁；資料（草稿、版本、照片、收款紀錄）全部保留，可以再按「恢復」。
    case "terminate": {
      const reason = body.reason == null ? "" : String(body.reason).trim();
      if (reason.length > 200) return fail("bad_request", "原因最長 200 字");
      if (!["pending", "live", "overdue", "suspended"].includes(site.status)) return fail("not_allowed", site.status === "cancelled" ? "這個網站已經是終止狀態" : "這個狀態的網站不能終止", 409);
      const statusFrom = site.status;
      await db2.patch("rental_sites", "id=eq." + siteId, { status: "cancelled", suspended_at: null, suspend_reason: null });
      await event("terminated", { reason, status_from: statusFrom });
      if (!site.cf_project_name) return reply({ ok: true, status: "cancelled", message: "已終止（這個網站還沒有部署過，沒有網址需要下線）。" }, 200);
      const d = await queueDeploy({ mode: "closed" });
      return reply({ ok: true, status: "cancelled", ...d.ok ? {} : { warning: deployWarn }, message: d.ok ? "已終止，「已停止服務」頁約 1–2 分鐘後生效。資料都還保留。" : "已終止，但停止服務頁沒有啟動部署。" + deployWarn }, 200);
    }
    // 永久刪除：只有「已終止」的網站可以；必須輸入網址代稱確認。刪 Cloudflare 專案 → 刪照片 → 刪資料庫紀錄（草稿、版本、事件、收款、月報一併刪除）。
    // 順序是「先刪外部、最後才刪資料庫」，每一步都能安全重試；任何一步失敗就停下來，網站仍保持「已終止」。
    case "purge": {
      if (site.status !== "cancelled") return fail("not_allowed", "只有「已終止」的網站可以永久刪除，請先終止租用", 409);
      if (typeof body.confirm_slug !== "string" || body.confirm_slug.trim() !== site.slug) return fail("confirm_mismatch", "請輸入這個網站的網址代稱「" + site.slug + "」來確認");
      const steps = [];
      if (site.cf_project_name) {
        if (!deps.cf || !deps.cf.deleteProject) return fail("cf_not_configured", "尚未設定 Cloudflare 金鑰，無法刪除網站專案，所以什麼都沒刪", 501);
        if (site.custom_domain) await deps.cf.removeDomain(site.cf_project_name, site.custom_domain).catch(() => {
        });
        try {
          const r = await deps.cf.deleteProject(site.cf_project_name);
          steps.push(r.deleted ? "已刪除 Cloudflare 網站專案" : "Cloudflare 專案已經不存在");
        } catch (e) {
          return fail("cloudflare_error", "刪除 Cloudflare 專案失敗，所以什麼都沒刪：" + String(e.message || e).slice(0, 200) + "。可以到 Cloudflare 後台手動刪除該專案後再按一次。", 502);
        }
      }
      let photos = 0;
      try {
        for (let guard = 0; guard < 50; guard++) {
          const objs = (await db2.storageList(PHOTO_BUCKET, siteId, { offset: 0, limit: 100 })).filter((o) => o && o.id != null && o.name);
          if (!objs.length) break;
          await db2.storageRemove(PHOTO_BUCKET, objs.map((o) => siteId + "/" + o.name));
          photos += objs.length;
        }
      } catch (e) {
        return fail("storage_error", "網站專案已刪除，但照片沒有刪成功：" + String(e.message || e).slice(0, 200) + "。請再按一次永久刪除。", 502);
      }
      steps.push("已刪除 " + photos + " 張照片");
      try {
        await db2.remove("rental_sites", "id=eq." + siteId);
      } catch (e) {
        return fail("db_error", "外部資料已刪除，但資料庫紀錄沒有刪成功：" + String(e.message || e).slice(0, 200) + "。請再按一次永久刪除。", 502);
      }
      steps.push("已刪除資料庫紀錄");
      console.log("[admin-site] purged site " + siteId + " slug=" + site.slug + " by " + by + "；" + steps.join("；"));
      return reply({ ok: true, deleted: true, message: "已永久刪除：" + steps.join("、") + "。" }, 200);
    }
    case "restore_version": {
      if (typeof body.version_id !== "string" || !UUID.test(body.version_id)) return fail("bad_request", "缺少版本編號");
      if (!["live", "overdue"].includes(site.status)) return fail("not_allowed", "只有上線中或已逾期的網站可以還原版本", 409);
      const ver = await db2.getOne("site_versions", "id=eq." + body.version_id + "&site_id=eq." + siteId + "&select=id,content,palette,sections,created_at");
      if (!ver) return fail("not_found", "找不到這個版本", 404);
      const overwrite = body.overwrite_draft === true;
      if (overwrite) await db2.patch("rental_sites", "id=eq." + siteId, { content: ver.content, palette: ver.palette, sections: ver.sections });
      await event("version_restore_queued", { version_id: ver.id, overwrite_draft: overwrite });
      const d = await queueDeploy({ versionId: ver.id });
      return d.ok ? reply({ ok: true, message: "已排入還原" + (overwrite ? "（並已覆蓋會員草稿）" : "（會員草稿未更動）") + "，約 1–2 分鐘。" }, 200) : fail("dispatch_failed", "沒有送出成功：" + deployWarn, 502);
    }
    case "set_domain": {
      if (!deps.cf) return fail("cf_not_configured", "尚未設定 Cloudflare 金鑰（Supabase Secrets：CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID）", 501);
      const domain = normalizeDomain(body.domain);
      if (!domain) return fail("bad_request", "網域格式不正確（例如 www.example.com；不接受 pages.dev）");
      if (!site.cf_project_name) return fail("not_deployed", "網站還沒有部署過，請先確認收款上線後再綁網域", 409);
      if (["draft", "cancelled"].includes(site.status)) return fail("not_allowed", "這個狀態的網站不能綁網域", 409);
      const used = await db2.getOne("rental_sites", "custom_domain=eq." + encodeURIComponent(domain) + "&id=neq." + siteId + "&select=id");
      if (used) return fail("domain_in_use", "這個網域已經綁在別的網站上", 409);
      let r;
      try {
        r = await deps.cf.addDomain(site.cf_project_name, domain);
      } catch (e) {
        await event("domain_failed", { domain, message: String(e.message || e).slice(0, 200) });
        return fail("cloudflare_error", "新增網域失敗：" + String(e.message || e).slice(0, 200), 502);
      }
      const active = r.status === "active";
      if (site.custom_domain && site.custom_domain !== domain) await deps.cf.removeDomain(site.cf_project_name, site.custom_domain).catch(() => {
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
        message: active ? "網域已生效。" : "請客戶（或網域管理者）到網域的 DNS 設定新增一筆 CNAME：名稱 " + domain + " → " + r.target + "。設定後等幾分鐘到數小時，再按「檢查網域」。"
      }, 200);
    }
    case "check_domain": {
      if (!deps.cf) return fail("cf_not_configured", "尚未設定 Cloudflare 金鑰（Supabase Secrets：CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID）", 501);
      if (!site.custom_domain || !site.cf_project_name) return fail("no_domain", "這個網站還沒有設定自訂網域", 409);
      let r;
      try {
        r = await deps.cf.getDomain(site.cf_project_name, site.custom_domain);
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
      if (deps.cf && site.cf_project_name) {
        try {
          await deps.cf.removeDomain(site.cf_project_name, site.custom_domain);
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
        body: JSON.stringify({ sender: SENDER, replyTo: { email: SENDER.email }, to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text }),
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

// supabase/functions/admin-site/main.mjs
var need = (k) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error("missing secret " + k);
  return v;
};
var SUPABASE_URL = need("SUPABASE_URL");
var db = makeSupabase({ url: SUPABASE_URL, serviceKey: need("SUPABASE_SERVICE_ROLE_KEY") });
var getUser = makeGetUser({ supabaseUrl: SUPABASE_URL, anonKey: need("SUPABASE_ANON_KEY") });
var sendMail = makeBrevoSender({ apiKey: Deno.env.get("BREVO_API_KEY") || "" });
var dispatch = makeDispatcher({ token: Deno.env.get("GITHUB_DISPATCH_TOKEN") || "", repo: Deno.env.get("GITHUB_REPO") || "chi1017/yc-axiom-sites", ref: Deno.env.get("GITHUB_REF") || "main" });
var CF_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN") || "";
var CF_ACCOUNT = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
var cf = CF_TOKEN && CF_ACCOUNT ? makeCloudflare({ token: CF_TOKEN, accountId: CF_ACCOUNT }) : void 0;
Deno.serve((req) => handleAdmin(req, { allowedOrigins: parseOrigins(Deno.env.get("ALLOWED_ORIGINS")), db, getUser, sendMail, dispatch, cf }));
