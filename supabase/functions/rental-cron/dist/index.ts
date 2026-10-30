// 由 npm run bundle:function 產生，請勿手改。來源：supabase/functions/rental-cron/ 與 templates/shared/。

// supabase/functions/_shared/http.mjs
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function corsHeaders(req, allowed) {
  const origin = req.headers.get("origin") || "";
  const h = { Vary: "Origin", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Max-Age": "86400" };
  if (origin && allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
var OFFICIAL_ORIGINS = ["https://chi1017.github.io", "https://yc-axiom.pages.dev"];
function parseOrigins(v) {
  const list = (v || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  return [.../* @__PURE__ */ new Set([...OFFICIAL_ORIGINS, ...list])];
}
var json = (body, status, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });

// supabase/functions/_shared/dates.mjs
function taipeiDate(d) {
  return new Date(d.getTime() + 8 * 3600 * 1e3).toISOString().slice(0, 10);
}
var isDateStr = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) && (/* @__PURE__ */ new Date(v + "T00:00:00Z")).toISOString().slice(0, 10) === v;
var dayNum = (s) => Math.round(Date.parse(s + "T00:00:00Z") / 864e5);
function addDays(s, n) {
  return new Date((dayNum(s) + n) * 864e5).toISOString().slice(0, 10);
}
function diffDays(a, b) {
  return dayNum(b) - dayNum(a);
}
function weekdayOf(s) {
  return (/* @__PURE__ */ new Date(s + "T00:00:00Z")).getUTCDay();
}
var firstOfMonth = (s) => s.slice(0, 8) + "01";
function prevMonthFirst(s) {
  const [y, m] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
}

// supabase/functions/_shared/emails.mjs
var esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var CONTACT = { line: "@788cblaq", email: "ycaxiom@gmail.com" };
function layout(title, bodyHtml) {
  return `<!doctype html><html lang="zh-Hant"><body style="margin:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#222"><div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border-radius:10px;padding:24px 26px;line-height:1.7;font-size:15px"><h2 style="margin:0 0 14px;font-size:18px">` + esc(title) + "</h2>" + bodyHtml + '</div><p style="color:#888;font-size:12px;text-align:center;margin:14px 0 0">YC AXIOM 網站租用 · LINE ' + CONTACT.line + " · " + CONTACT.email + "</p></div></body></html>";
}
var ADD_CONTACT = "為避免我們的信件被歸到垃圾信匣，請把 " + CONTACT.email + " 加入你的聯絡人；直接回覆這封信也會寄到我們的信箱。";
var button = (href, label) => '<p><a href="' + esc(href) + '" style="display:inline-block;background:#2f4a3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">' + esc(label) + "</a></p>";
var rowsTable = (rows) => '<table style="border-collapse:collapse;width:100%">' + rows.map((r) => '<tr><td style="padding:6px 12px 6px 0;color:#777;white-space:nowrap;vertical-align:top">' + esc(r[0]) + '</td><td style="padding:6px 0">' + esc(r[1]) + "</td></tr>").join("") + "</table>";
var LINE_HINT = "有任何問題都可以直接回覆這封信，或用 LINE " + CONTACT.line + " 聯絡我們。";
function customerReminder({ shopName, paidUntil, daysLeft, dashboardUrl, priceText = "" }) {
  const when = daysLeft <= 0 ? "今天" : daysLeft + " 天後";
  const subject = "【YC AXIOM】你的網站租用即將到期（" + paidUntil + "）：" + shopName;
  const html = layout(
    "網站租用即將到期",
    "<p>" + esc(shopName) + " 的網站租用服務將於 <b>" + esc(paidUntil) + "</b>（" + esc(when) + "）到期。</p>" + (priceText ? "<p>續約費用：<b>" + esc(priceText) + "</b></p>" : "") + "<p>為了讓網站不中斷，請在到期日前完成續約匯款。匯款資訊與方案可以在會員專區的「我的網站」查看：</p>" + (dashboardUrl ? button(dashboardUrl, "前往會員專區") : "") + "<p>匯款後請用 LINE（" + CONTACT.line + '）或直接回覆這封信告訴我們匯款帳號末五碼，我們確認後會更新到期日。</p><p style="color:#666;font-size:13px">如果已經匯款，請忽略這封信；若不打算續約，也歡迎讓我們知道。' + esc(ADD_CONTACT) + "</p>"
  );
  const text = [shopName + " 的網站租用服務將於 " + paidUntil + "（" + when + "）到期。", priceText ? "續約費用：" + priceText : "", "", "請在到期日前完成續約匯款，匯款資訊在會員專區「我的網站」：" + (dashboardUrl || ""), "匯款後請用 LINE（" + CONTACT.line + "）或回覆這封信告訴我們匯款帳號末五碼。", "", ADD_CONTACT].join("\n");
  return { subject, html, text };
}
function customerOverdue({ shopName, paidUntil, suspendOn, dashboardUrl }) {
  const subject = "【YC AXIOM】網站租用已到期：" + shopName;
  const html = layout(
    "網站租用已到期",
    "<p>" + esc(shopName) + " 的網站租用已於 <b>" + esc(paidUntil) + "</b> 到期，目前網站仍可正常瀏覽。</p><p>若在 <b>" + esc(suspendOn) + "</b> 之前仍未完成續約，網站會自動改為「維護中」頁面（資料與內容都會保留，不會刪除），續約後即可恢復。</p>" + (dashboardUrl ? button(dashboardUrl, "查看匯款資訊") : "") + '<p style="color:#666;font-size:13px">' + esc(LINE_HINT) + " " + esc(ADD_CONTACT) + "</p>"
  );
  const text = [shopName + " 的網站租用已於 " + paidUntil + " 到期，網站目前仍可瀏覽。", "", "若在 " + suspendOn + " 之前仍未續約，網站會自動改為「維護中」頁面（資料與內容會保留，續約後即可恢復）。", "匯款資訊：" + (dashboardUrl || ""), "", LINE_HINT, ADD_CONTACT].join("\n");
  return { subject, html, text };
}
function customerSuspended({ shopName, reason, dashboardUrl }) {
  const subject = "【YC AXIOM】網站已暫停：" + shopName;
  const html = layout(
    "你的網站目前已暫停",
    "<p>" + esc(shopName) + " 的網站因「" + esc(reason || "逾期未續約") + "」已暫停，訪客目前會看到「網站維護中」的頁面。</p><p>你的網站內容、照片與歷史版本都完整保留。完成續約後，我們確認款項就會恢復網站（約 1–2 分鐘生效）。</p>" + (dashboardUrl ? button(dashboardUrl, "查看匯款資訊") : "") + '<p style="color:#666;font-size:13px">' + esc(LINE_HINT) + " " + esc(ADD_CONTACT) + "</p>"
  );
  const text = [shopName + " 的網站因「" + (reason || "逾期未續約") + "」已暫停，訪客目前會看到「網站維護中」頁面。", "", "網站內容、照片與歷史版本都完整保留，完成續約並確認款項後即可恢復。", "匯款資訊：" + (dashboardUrl || ""), "", LINE_HINT, ADD_CONTACT].join("\n");
  return { subject, html, text };
}
function adminSiteAlert({ kind, shopName, slug, memberEmail, paidUntil, reason, since, days, adminUrl }) {
  const title = kind === "auto_suspended" ? "網站已自動暫停" : "網站已暫停滿 " + days + " 天";
  const subject = "【網站租用】" + title + "：" + shopName;
  const rows = [["店名", shopName], ["網址代稱", slug], ["會員信箱", memberEmail || "（找不到）"], ["到期日", paidUntil || "—"]];
  if (reason) rows.push(["暫停原因", reason]);
  if (since) rows.push(["暫停時間", since]);
  const note = kind === "auto_suspended" ? "系統已把狀態改為「暫停」並部署維護頁，客戶也收到通知信。收到款項後到管理後台按「確認收款」就會自動恢復。" : "這個網站已暫停超過 " + days + " 天。系統不會自動刪除或終止任何資料，請你決定要聯絡客戶、繼續保留，或手動終止。";
  const html = layout(title, rowsTable(rows) + '<p style="color:#666;font-size:13px">' + esc(note) + "</p>" + (adminUrl ? '<p style="font-size:13px"><a href="' + esc(adminUrl) + '">開啟管理後台</a></p>' : ""));
  const text = [title, "", ...rows.map((r) => r[0] + "：" + r[1]), "", note].join("\n");
  return { subject, html, text };
}
function adminWeeklySummary({ today, counts, sections, adminUrl }) {
  const subject = "【網站租用】每週摘要 " + today;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const label = { live: "上線中", pending: "待上線", overdue: "已逾期", suspended: "已暫停", draft: "草稿", cancelled: "已終止" };
  const countLine = Object.keys(label).map((k) => label[k] + " " + (counts[k] || 0)).join("　");
  const nonEmpty = sections.filter((s) => s.items.length);
  const block = (s) => '<h3 style="margin:18px 0 6px;font-size:15px">' + esc(s.title) + "（" + s.items.length + '）</h3><ul style="padding-left:18px;margin:0">' + s.items.map((x) => '<li style="margin-bottom:4px">' + esc(x) + "</li>").join("") + "</ul>";
  const html = layout(
    "每週摘要 · " + today,
    '<p style="margin:0 0 6px">共 ' + total + " 個網站：" + esc(countLine) + "</p>" + (nonEmpty.length ? nonEmpty.map(block).join("") : "<p>本週沒有需要處理的事項。</p>") + (adminUrl ? '<p style="font-size:13px;margin-top:18px"><a href="' + esc(adminUrl) + '">開啟管理後台</a></p>' : "")
  );
  const text = ["每週摘要 " + today, "共 " + total + " 個網站：" + countLine, "", ...nonEmpty.length ? nonEmpty.flatMap((s) => [s.title + "（" + s.items.length + "）", ...s.items.map((x) => "- " + x), ""]) : ["本週沒有需要處理的事項。"]].join("\n");
  return { subject, html, text };
}

// supabase/functions/_shared/plans.mjs
var PLANS = {
  single: { name: "自架版（一頁）", monthly: 599, yearPaidMonths: 10 },
  multi: { name: "自架版（多頁）", monthly: 899, yearPaidMonths: 10 }
};
var planFor = (layout2) => layout2 === "multi" ? PLANS.multi : PLANS.single;
var PRO_ADDON = { name: "進階功能", monthly: 400, yearPaidMonths: 10 };
var monthlyOf = (layout2, tier = "basic") => planFor(layout2).monthly + (tier === "pro" ? PRO_ADDON.monthly : 0);
function priceFor(layout2, months, tier = "basic") {
  const p = planFor(layout2);
  const years = Math.floor(months / 12);
  return (years * p.yearPaidMonths + months % 12) * monthlyOf(layout2, tier);
}

// supabase/functions/rental-cron/handler.mjs
var renewText = (site) => {
  const layout2 = site.next_layout || site.layout, tier = site.next_tier || site.tier || "basic";
  return "NT$ " + monthlyOf(layout2, tier).toLocaleString("en-US") + "／月（" + planFor(layout2).name + (tier === "pro" ? "＋" + PRO_ADDON.name : "") + "）；一次付 12 個月 NT$ " + priceFor(layout2, 12, tier).toLocaleString("en-US");
};
var REMINDER_DAYS = 7;
var GRACE_DAYS = 7;
var LONG_SUSPEND_DAYS = 30;
var AUTO_REASON = "逾期未續約";
var MAX_SIM_DAYS = 400;
var SOFT_DEADLINE_MS = 11e4;
var RULE_LABELS = {
  reminder: "寄「即將到期」提醒信給客戶",
  to_overdue: "狀態改為「已逾期」，並寄「已到期」通知給客戶",
  overdue_notice: "補寄「已到期」通知給客戶（狀態已是逾期但還沒通知）",
  auto_suspend: "自動暫停：部署維護頁，並通知客戶與管理員",
  long_suspend_notice: "通知管理員：已暫停滿 30 天（只通知，不刪除任何資料）",
  back_to_live: "到期日已在今天之後，狀態改回「上線中」",
  anomaly: "資料異常，需要人工檢查"
};
var suspendDateOf = (paidUntil, today) => {
  const d = addDays(paidUntil, GRACE_DAYS + 1);
  const t = addDays(today, 1);
  return d > t ? d : t;
};
function planSite(site, today) {
  const pu = site.paid_until || null;
  if (site.status === "live") {
    if (!pu) return [{ rule: "anomaly", detail: "狀態是上線中但沒有到期日（paid_until）" }];
    if (pu < today) return [{ rule: "to_overdue", detail: "到期日 " + pu + " 已過 " + diffDays(pu, today) + " 天" }];
    const left = diffDays(today, pu);
    if (left <= REMINDER_DAYS && site.reminder_sent_for !== pu) return [{ rule: "reminder", daysLeft: left, detail: "到期日 " + pu + "，剩 " + left + " 天" }];
    return [];
  }
  if (site.status === "overdue") {
    if (!pu) return [{ rule: "anomaly", detail: "狀態是已逾期但沒有到期日（paid_until）" }];
    if (pu >= today) return [{ rule: "back_to_live", detail: "到期日 " + pu + " 還沒到" }];
    if (pu < addDays(today, -GRACE_DAYS)) return [{ rule: "auto_suspend", detail: "逾期 " + diffDays(pu, today) + " 天，超過 " + GRACE_DAYS + " 天寬限" }];
    if (site.overdue_notified_for !== pu) return [{ rule: "overdue_notice", detail: "逾期 " + diffDays(pu, today) + " 天，尚未寄過通知" }];
    return [];
  }
  if (site.status === "suspended" && site.suspended_at) {
    const since = taipeiDate(new Date(site.suspended_at));
    const days = diffDays(since, today);
    if (days >= LONG_SUSPEND_DAYS && site.suspend_notified_for !== since) return [{ rule: "long_suspend_notice", days, since, detail: "已暫停 " + days + " 天（自 " + since + "）" }];
  }
  return [];
}
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
var SITE_COLS = "id,member_id,slug,status,layout,tier,next_layout,next_tier,paid_until,suspended_at,suspend_reason,reminder_sent_for,overdue_notified_for,suspend_notified_for,cf_project_name,public_url,shop_name:content->>name";
var shopOf = (s) => s.shop_name || s.slug;
var enc = encodeURIComponent;
async function handleCron(req, deps) {
  const cors = corsHeaders(req, deps.allowedOrigins);
  const reply = (b, s) => json(b, s, cors);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "method_not_allowed", message: "不支援的請求方式" }, 405);
  const origin = req.headers.get("origin") || "";
  if (origin && !deps.allowedOrigins.includes(origin)) return reply({ error: "forbidden_origin", message: "來源不被允許" }, 403);
  let caller = null;
  if (safeEqual(req.headers.get("x-cron-secret") || "", deps.cronSecret || "")) caller = "cron";
  else {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const user = token ? await deps.getUser(token).catch(() => null) : null;
    if (!user || !user.id) return reply({ error: "unauthorized", message: "請先登入" }, 401);
    if (!user.isAdmin) return reply({ error: "forbidden", message: "只有管理員可以使用" }, 403);
    caller = user.email || user.id;
  }
  let body = {};
  try {
    const t = await req.text();
    if (t.length > 2e3) throw new Error("too big");
    body = t.trim() ? JSON.parse(t) : {};
  } catch {
    return reply({ error: "bad_request", message: "請求格式不正確" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "bad_request", message: "請求格式不正確" }, 400);
  const job = body.job == null ? "daily" : body.job;
  if (!["daily", "weekly"].includes(job)) return reply({ error: "bad_request", message: "不支援的 job" }, 400);
  const dryRun = body.dry_run === true;
  if (body.dry_run != null && typeof body.dry_run !== "boolean") return reply({ error: "bad_request", message: "dry_run 必須是 true／false" }, 400);
  if (body.site_id != null && (typeof body.site_id !== "string" || !UUID.test(body.site_id))) return reply({ error: "bad_request", message: "網站編號格式不正確" }, 400);
  const now = (deps.now || (() => /* @__PURE__ */ new Date()))();
  const realToday = taipeiDate(now);
  let today = realToday, simulated = false;
  if (body.as_of != null) {
    if (!isDateStr(body.as_of)) return reply({ error: "bad_request", message: "模擬日期格式不正確（YYYY-MM-DD）" }, 400);
    if (Math.abs(diffDays(realToday, body.as_of)) > MAX_SIM_DAYS) return reply({ error: "bad_request", message: "模擬日期離今天太遠（最多 " + MAX_SIM_DAYS + " 天）" }, 400);
    today = body.as_of;
    simulated = body.as_of !== realToday;
  }
  if (simulated && !dryRun && job === "daily" && !body.site_id) return reply({ error: "site_required", message: "用模擬日期實際執行時，必須指定單一網站（避免誤對真實客戶寄信或暫停）" }, 400);
  const clock = simulated ? /* @__PURE__ */ new Date(today + "T01:00:00Z") : now;
  const { db: db2 } = deps;
  const by = "system";
  const ctx = { deps, db: db2, today, simulated, clock, caller, siteFilter: body.site_id || null };
  const out = { ok: true, job, mode: dryRun ? "dry_run" : simulated ? "simulated" : "real", today, as_of: simulated ? today : null, errors: [] };
  try {
    if (job === "daily") {
      const q = "select=" + SITE_COLS + "&status=in.(live,overdue,suspended)" + (ctx.siteFilter ? "&id=eq." + ctx.siteFilter : "") + "&order=created_at.asc&limit=1000";
      const sites = await db2.list("rental_sites", q);
      const planned = [];
      for (const s of sites) for (const p of planSite(s, today)) planned.push({ site: s, ...p });
      out.counts = { sites: sites.length, planned: planned.length };
      if (dryRun) {
        out.planned = planned.map((p) => view(p));
      } else {
        out.results = [];
        const t0 = Date.now();
        for (const p of planned) {
          if (Date.now() - t0 > SOFT_DEADLINE_MS) {
            out.truncated = true;
            break;
          }
          let r;
          try {
            r = await runRule(ctx, p);
          } catch (e) {
            r = { outcome: "failed", detail: String(e && e.message ? e.message : e).slice(0, 200) };
            out.errors.push(p.site.slug + "：" + r.detail);
          }
          out.results.push({ ...view(p), outcome: r.outcome, note: r.note || r.detail || "" });
        }
        await db2.insert("cron_runs", { job: "daily", run_date: today, mode: simulated ? "simulated" : "real", triggered_by: caller, summary: { counts: out.counts, results: out.results.map((x) => ({ slug: x.slug, rule: x.rule, outcome: x.outcome })), errors: out.errors, truncated: !!out.truncated } }).catch(() => {
        });
      }
    }
    const weeklyDue = job === "weekly" || job === "daily" && weekdayOf(today) === 1 && !ctx.siteFilter;
    if (weeklyDue) out.weekly = await runWeekly(ctx, { dryRun, force: job === "weekly" });
  } catch (e) {
    return reply({ ...out, ok: false, error: "server_error", message: "排程執行失敗：" + String(e && e.message ? e.message : e).slice(0, 200) }, 500);
  }
  return reply(out, 200);
}
var view = (p) => ({ site_id: p.site.id, slug: p.site.slug, shop_name: shopOf(p.site), status: p.site.status, paid_until: p.site.paid_until, rule: p.rule, label: RULE_LABELS[p.rule] || p.rule, detail: p.detail || "" });
async function runRule(ctx, p) {
  const { db: db2, deps, today, simulated } = ctx;
  const site = p.site;
  const event = (type, detail) => db2.insert("site_events", { site_id: site.id, type, detail: { by: "system", ...simulated ? { simulated_as_of: today } : {}, ...detail } }).catch(() => {
  });
  const memberEmail = async () => {
    const m = await db2.getOne("members", "id=eq." + enc(site.member_id) + "&select=email").catch(() => null);
    return m && m.email ? m.email : "";
  };
  const dash = deps.dashboardUrl || "";
  async function claimAndMail({ claimQuery, claimBody, releaseBody, to, build, template }) {
    const claimed = await db2.patchReturning("rental_sites", claimQuery, claimBody);
    if (!claimed.length) return "skipped";
    let r;
    try {
      if (!to) r = { ok: false, error: "找不到收件人 Email" };
      else r = await deps.sendMail({ to, ...build() });
    } catch (e) {
      r = { ok: false, error: String(e && e.message ? e.message : e) };
    }
    if (r && r.ok) {
      await event("email_sent", { template });
      return "sent";
    }
    await db2.patchReturning("rental_sites", "id=eq." + site.id, releaseBody).catch(() => {
    });
    await event("email_failed", { template, error: String(r && r.error || "unknown").slice(0, 200) });
    return "failed";
  }
  const mailNote = (s) => s === "sent" ? "已寄出" : s === "skipped" ? "已有人處理，略過" : "寄信失敗（已記錄，明天會重試）";
  switch (p.rule) {
    case "anomaly":
      await event("cron_anomaly", { message: p.detail });
      return { outcome: "failed", detail: p.detail };
    case "back_to_live": {
      const rows = await db2.patchReturning("rental_sites", "id=eq." + site.id + "&status=eq.overdue&paid_until=gte." + today, { status: "live" });
      if (!rows.length) return { outcome: "skipped", note: "狀態已被其他操作改變" };
      await event("auto_live", { paid_until: site.paid_until });
      return { outcome: "done", note: "已改回上線中" };
    }
    case "reminder": {
      const pu = site.paid_until;
      const s = await claimAndMail({
        claimQuery: "id=eq." + site.id + "&status=eq.live&paid_until=eq." + pu + "&or=(reminder_sent_for.is.null,reminder_sent_for.neq." + pu + ")",
        claimBody: { reminder_sent_for: pu },
        releaseBody: { reminder_sent_for: null },
        to: await memberEmail(),
        template: "customerReminder",
        build: () => customerReminder({ shopName: shopOf(site), paidUntil: pu, daysLeft: p.daysLeft, dashboardUrl: dash, priceText: renewText(site) })
      });
      if (s === "sent") await event("reminder_sent", { paid_until: pu, days_left: p.daysLeft });
      return { outcome: s === "failed" ? "failed" : s === "skipped" ? "skipped" : "done", note: mailNote(s) };
    }
    case "to_overdue":
    case "overdue_notice": {
      const pu = site.paid_until;
      if (p.rule === "to_overdue") {
        const rows = await db2.patchReturning("rental_sites", "id=eq." + site.id + "&status=eq.live&paid_until=lt." + today, { status: "overdue" });
        if (!rows.length) return { outcome: "skipped", note: "狀態已被其他操作改變" };
        await event("auto_overdue", { paid_until: pu });
      }
      const s = await claimAndMail({
        claimQuery: "id=eq." + site.id + "&status=eq.overdue&paid_until=eq." + pu + "&or=(overdue_notified_for.is.null,overdue_notified_for.neq." + pu + ")",
        claimBody: { overdue_notified_for: pu },
        releaseBody: { overdue_notified_for: null },
        to: await memberEmail(),
        template: "customerOverdue",
        build: () => customerOverdue({ shopName: shopOf(site), paidUntil: pu, suspendOn: suspendDateOf(pu, today), dashboardUrl: dash })
      });
      const base = p.rule === "to_overdue" ? "已改為逾期；" : "";
      return { outcome: s === "failed" ? "failed" : "done", note: base + "通知信：" + mailNote(s) };
    }
    case "auto_suspend": {
      const rows = await db2.patchReturning(
        "rental_sites",
        "id=eq." + site.id + "&status=eq.overdue&paid_until=lt." + addDays(today, -GRACE_DAYS),
        { status: "suspended", suspended_at: ctx.clock.toISOString(), suspend_reason: AUTO_REASON }
      );
      if (!rows.length) return { outcome: "skipped", note: "狀態已被其他操作改變（可能剛收款）" };
      await event("suspended", { auto: true, reason: AUTO_REASON, status_from: "overdue", paid_until: site.paid_until });
      const notes = ["已暫停"];
      const d = await deps.dispatch({ siteId: site.id, mode: "maintenance" }).catch((e) => ({ ok: false, error: String(e) }));
      if (d.ok) notes.push("已排入維護頁部署");
      else {
        await event("deploy_failed", { message: "無法啟動部署：" + String(d.error || "").slice(0, 200), mode: "maintenance" });
        notes.push("維護頁沒有啟動（請到後台按重新發佈）");
      }
      const sendOne = async (to, tpl, template) => {
        let r;
        try {
          r = to ? await deps.sendMail({ to, ...tpl }) : { ok: false, error: "找不到收件人 Email" };
        } catch (e) {
          r = { ok: false, error: String(e && e.message ? e.message : e) };
        }
        await event(r && r.ok ? "email_sent" : "email_failed", { template, ...r && r.ok ? {} : { error: String(r && r.error || "unknown").slice(0, 200) } });
        return !!(r && r.ok);
      };
      const mEmail = await memberEmail();
      const c = await sendOne(mEmail, customerSuspended({ shopName: shopOf(site), reason: AUTO_REASON, dashboardUrl: dash }), "customerSuspended");
      const a = await sendOne(deps.adminEmail, adminSiteAlert({ kind: "auto_suspended", shopName: shopOf(site), slug: site.slug, memberEmail: mEmail, paidUntil: site.paid_until, reason: AUTO_REASON, since: today, adminUrl: deps.adminUrl }), "adminAutoSuspended");
      notes.push("客戶信" + (c ? "已寄出" : "失敗") + "、管理員信" + (a ? "已寄出" : "失敗"));
      return { outcome: "done", note: notes.join("；") };
    }
    case "long_suspend_notice":
      return await longSuspend(ctx, p, event, memberEmail);
  }
  return { outcome: "skipped", note: "未知規則" };
}
async function longSuspend(ctx, p, event, memberEmail) {
  const { db: db2, deps } = ctx, site = p.site;
  const claimed = await db2.patchReturning("rental_sites", "id=eq." + site.id + "&status=eq.suspended&or=(suspend_notified_for.is.null,suspend_notified_for.neq." + p.since + ")", { suspend_notified_for: p.since });
  if (!claimed.length) return { outcome: "skipped", note: "已通知過或狀態已改變" };
  const mail = adminSiteAlert({ kind: "long_suspended", shopName: shopOf(site), slug: site.slug, memberEmail: await memberEmail(), paidUntil: site.paid_until, reason: site.suspend_reason, since: p.since, days: p.days, adminUrl: deps.adminUrl });
  let r;
  try {
    r = await deps.sendMail({ to: deps.adminEmail, ...mail });
  } catch (e) {
    r = { ok: false, error: String(e && e.message ? e.message : e) };
  }
  if (r && r.ok) {
    await event("email_sent", { template: "adminLongSuspended" });
    await event("long_suspend_notified", { since: p.since, days: p.days });
    return { outcome: "done", note: "已通知管理員" };
  }
  await db2.patchReturning("rental_sites", "id=eq." + site.id, { suspend_notified_for: null }).catch(() => {
  });
  await event("email_failed", { template: "adminLongSuspended", error: String(r && r.error || "unknown").slice(0, 200) });
  return { outcome: "failed", note: "寄信失敗（已記錄，明天會重試）" };
}
var fmtDate = (iso) => taipeiDate(new Date(iso));
var trunc = (s, n) => String(s == null ? "" : s).slice(0, n);
async function collectWeekly({ db: db2, today, clock }) {
  const iso = (days) => new Date(clock.getTime() - days * 864e5).toISOString();
  const sites = await db2.list("rental_sites", "select=" + SITE_COLS + "&order=created_at.asc&limit=2000");
  const byId = new Map(sites.map((s) => [s.id, s]));
  const name = (s) => shopOf(s) + "（" + s.slug + "）";
  const counts = {};
  for (const s of sites) counts[s.status] = (counts[s.status] || 0) + 1;
  const sections = [];
  const live = sites.filter((s) => s.status === "live" && s.paid_until);
  sections.push({ title: "7 天內到期", items: live.map((s) => ({ s, left: diffDays(today, s.paid_until) })).filter((x) => x.left >= 0 && x.left <= 7).sort((a, b) => a.left - b.left).map((x) => name(x.s) + " 到期 " + x.s.paid_until + "（剩 " + x.left + " 天）") });
  sections.push({ title: "已逾期（寬限中）", items: sites.filter((s) => s.status === "overdue" && s.paid_until).map((s) => name(s) + " 逾期 " + diffDays(s.paid_until, today) + " 天，寬限至 " + addDays(s.paid_until, GRACE_DAYS)) });
  const [susEv, deployEv, mailEv, rep, pendEv] = await Promise.all([
    db2.list("site_events", "type=eq.suspended&created_at=gte." + enc(iso(7)) + "&select=site_id,created_at,detail&order=created_at.desc&limit=200"),
    db2.list("site_events", "type=in.(deploy_ok,deploy_failed)&created_at=gte." + enc(iso(30)) + "&select=site_id,type,created_at,detail&order=created_at.desc&limit=1000"),
    db2.list("site_events", "type=eq.email_failed&created_at=gte." + enc(iso(7)) + "&select=site_id,created_at,detail&order=created_at.desc&limit=200"),
    db2.list("site_reports", "month=gte." + prevMonthFirst(firstOfMonth(today)) + "&select=site_id,month,status,error&limit=2000"),
    db2.list("site_events", "type=eq.published_first&select=site_id,created_at&order=created_at.desc&limit=1000")
  ]);
  sections.push({ title: "本週自動暫停", items: susEv.filter((e) => e.detail && e.detail.auto && byId.has(e.site_id)).map((e) => name(byId.get(e.site_id)) + " 於 " + fmtDate(e.created_at) + " 暫停（" + trunc(e.detail.reason, 40) + "）") });
  sections.push({ title: "已暫停滿 " + LONG_SUSPEND_DAYS + " 天，待你決定", items: sites.filter((s) => s.status === "suspended" && s.suspended_at && diffDays(fmtDate(s.suspended_at), today) >= LONG_SUSPEND_DAYS).map((s) => name(s) + " 已暫停 " + diffDays(fmtDate(s.suspended_at), today) + " 天") });
  const latestDeploy = /* @__PURE__ */ new Map();
  for (const e of deployEv) if (!latestDeploy.has(e.site_id)) latestDeploy.set(e.site_id, e);
  sections.push({ title: "最近一次部署失敗", items: [...latestDeploy.values()].filter((e) => e.type === "deploy_failed" && byId.has(e.site_id)).map((e) => name(byId.get(e.site_id)) + " " + fmtDate(e.created_at) + "：" + trunc(e.detail && e.detail.message, 80)) });
  sections.push({ title: "寄信失敗（近 7 天）", items: mailEv.filter((e) => byId.has(e.site_id)).map((e) => name(byId.get(e.site_id)) + " " + fmtDate(e.created_at) + " " + trunc(e.detail && e.detail.template, 30) + "：" + trunc(e.detail && e.detail.error, 60)) });
  const okKeys = new Set(rep.filter((r) => r.status === "ok").map((r) => r.site_id + "|" + r.month));
  sections.push({ title: "月報檢測失敗（本月與上月）", items: rep.filter((r) => r.status === "failed" && !okKeys.has(r.site_id + "|" + r.month) && byId.has(r.site_id)).map((r) => name(byId.get(r.site_id)) + " " + String(r.month).slice(0, 7) + "：" + trunc(r.error, 80)) });
  const firstPub = /* @__PURE__ */ new Map();
  for (const e of pendEv) if (!firstPub.has(e.site_id)) firstPub.set(e.site_id, e.created_at);
  sections.push({ title: "待上線超過 3 天還沒處理", items: sites.filter((s) => s.status === "pending" && firstPub.has(s.id) && new Date(firstPub.get(s.id)).getTime() <= clock.getTime() - 3 * 864e5).map((s) => name(s) + " 申請已 " + Math.floor((clock.getTime() - new Date(firstPub.get(s.id)).getTime()) / 864e5) + " 天") });
  return { today, counts, sections };
}
async function runWeekly(ctx, { dryRun, force }) {
  const { db: db2, deps, today, simulated, caller } = ctx;
  const data = await collectWeekly({ db: db2, today, clock: ctx.clock });
  const summary = { sections: data.sections.map((s) => ({ title: s.title, count: s.items.length })), counts: data.counts };
  if (dryRun) return { would_send: true, ...summary };
  const mode = simulated ? "simulated" : "real";
  let claimed = false;
  if (!simulated) {
    try {
      await db2.insert("cron_runs", { job: "weekly", run_date: today, mode, triggered_by: caller, summary: { status: "sending" } });
      claimed = true;
    } catch (e) {
      if (/409|23505|duplicate/i.test(String(e && e.message))) return { sent: false, skipped: true, note: "今天已經寄過週摘要" };
      throw e;
    }
  }
  let r;
  try {
    r = await deps.sendMail({ to: deps.adminEmail, ...adminWeeklySummary({ ...data, adminUrl: deps.adminUrl }) });
  } catch (e) {
    r = { ok: false, error: String(e && e.message ? e.message : e) };
  }
  if (r && r.ok) {
    if (claimed) await db2.patchReturning("cron_runs", "job=eq.weekly&run_date=eq." + today + "&mode=eq.real", { summary }).catch(() => {
    });
    else await db2.insert("cron_runs", { job: "weekly", run_date: today, mode, triggered_by: caller, summary }).catch(() => {
    });
    return { sent: true, ...summary };
  }
  if (claimed) await db2.remove("cron_runs", "job=eq.weekly&run_date=eq." + today + "&mode=eq.real").catch(() => {
  });
  return { sent: false, error: trunc(r && r.error || "unknown", 200), ...summary };
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

// supabase/functions/rental-cron/main.mjs
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
var SITE_BASE = Deno.env.get("OFFICIAL_SITE_URL") || "https://yc-axiom.pages.dev/";
var CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
Deno.serve((req) => handleCron(req, {
  allowedOrigins: parseOrigins(Deno.env.get("ALLOWED_ORIGINS")),
  cronSecret: CRON_SECRET,
  adminEmail: Deno.env.get("ADMIN_EMAIL") || "ycaxiom@gmail.com",
  dashboardUrl: SITE_BASE + "dashboard/",
  adminUrl: SITE_BASE + "admin/",
  db,
  getUser,
  sendMail,
  dispatch
}));
