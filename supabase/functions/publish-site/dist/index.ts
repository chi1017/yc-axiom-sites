// 由 npm run bundle:function 產生，請勿手改。來源：supabase/functions/publish-site/ 與 templates/shared/。

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
var CUSTOM_RE = /^c-([0-9a-f]{6})-([ld])$/;
function isCustomPalette(id) {
  return typeof id === "string" && CUSTOM_RE.test(id);
}
function isValidPaletteId(id) {
  return PALETTE_IDS.includes(id) || isCustomPalette(id);
}

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
  room: 3,
  alt: 60,
  social: 200
};
var DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var DAY_LABELS = { mon: "週一", tue: "週二", wed: "週三", thu: "週四", fri: "週五", sat: "週六", sun: "週日" };
var SECTION_KEYS = ["menu", "interior", "faq", "news"];
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
    menu: [],
    faq: [],
    news: []
  };
}
function defaultSections() {
  return { menu: true, interior: true, faq: true, news: true };
}
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
  return c;
}
function normalizePalette(p) {
  return isValidPaletteId(p) ? p : "forest";
}
function normalizeSections(s) {
  const o = defaultSections();
  const r = s && typeof s === "object" ? s : {};
  SECTION_KEYS.forEach((k) => {
    if (typeof r[k] === "boolean") o[k] = r[k];
  });
  return o;
}

// templates/shared/hours.js
function dayState(h) {
  if (!h) return { kind: "unset" };
  if (h.closed) return { kind: "closed" };
  if (h.open && h.close) return { kind: "open", open: h.open, close: h.close };
  return { kind: "unset" };
}
function hasAnyHours(hours) {
  return DAYS.some((d) => dayState(hours && hours[d]).kind === "open");
}

// templates/shared/slug.js
var RESERVED_SLUGS = [
  "admin",
  "administrator",
  "www",
  "yc",
  "ycaxiom",
  "yc-axiom",
  "api",
  "test",
  "tests",
  "demo",
  "app",
  "apps",
  "mail",
  "email",
  "support",
  "help",
  "static",
  "assets",
  "cdn",
  "dev",
  "staging",
  "preview",
  "dashboard",
  "login",
  "logout",
  "signup",
  "register",
  "billing",
  "pay",
  "payment",
  "status",
  "blog",
  "docs",
  "ftp",
  "smtp",
  "root",
  "null",
  "undefined",
  "cloudflare",
  "pages",
  "workers",
  "builder",
  "terms",
  "privacy",
  "about",
  "contact",
  "services",
  "pricing",
  "works",
  "seo",
  "geo",
  "supabase",
  "github"
];
function slugError(slug) {
  const s = String(slug == null ? "" : slug);
  if (!s) return "請填網址代稱";
  if (s.length < 3 || s.length > 30) return "網址代稱要 3–30 個字";
  if (!/^[a-z0-9-]+$/.test(s)) return "只能使用小寫英文、數字與連字號（-）";
  if (s.startsWith("-") || s.endsWith("-")) return "開頭與結尾不能是連字號";
  if (s.includes("--")) return "不能連續兩個連字號";
  if (RESERVED_SLUGS.includes(s)) return "這個名稱是系統保留字，請換一個";
  return "";
}

// templates/shared/validate.js
function validateForPublish(content, sections, slug, raw) {
  const errors = [];
  const add = (field, msg) => errors.push({ field, msg });
  if (!content.name) add("name", "請填店名");
  if (!content.address) add("address", "請填店家地址");
  if (!hasAnyHours(content.hours)) add("hours", "請至少設定一天的營業時間（或標示公休以外的時段）");
  DAYS.forEach((d) => {
    const h = content.hours[d];
    if (!h.closed && (h.open || h.close) && !(validTime(h.open) && validTime(h.close))) add("hours." + d, DAY_LABELS[d] + "的營業時間要同時填開始與結束");
  });
  if (!content.photos.hero) add("photos.hero", "請上傳一張主視覺照片");
  const b = content.booking, rawB = raw && raw.booking || b;
  const rawUrl = String(rawB.url || "").trim();
  if (rawUrl && !safeHttpsUrl(rawUrl)) add("booking.url", "訂位連結必須是 https:// 開頭的有效網址");
  else if (b.label && !b.url || !b.label && b.url) add("booking", "訂位按鈕要同時填「按鈕文字」與「連結」，或兩者都留空");
  const rawS = raw && raw.social || {};
  [["instagram", "Instagram"], ["facebook", "Facebook"], ["line", "LINE"]].forEach(([k, label]) => {
    const v = String(rawS[k] || "").trim();
    if (v && !safeHttpsUrl(v)) add("social." + k, label + " 連結必須是 https:// 開頭的有效網址");
  });
  if (sections.menu) {
    content.menu.forEach((m, i) => {
      if (!m.name && !(m.price == null)) add("menu." + i, "菜單第 " + (i + 1) + " 項缺少品名");
      else if (m.name && m.price == null) add("menu." + i, "菜單第 " + (i + 1) + " 項（" + m.name + "）缺少價格");
    });
  }
  if (sections.faq) {
    content.faq.forEach((f, i) => {
      if (f.q && !f.a) add("faq." + i, "常見問題第 " + (i + 1) + " 題缺少回答");
      if (!f.q && f.a) add("faq." + i, "常見問題第 " + (i + 1) + " 題缺少問題");
    });
  }
  if (sections.news) {
    content.news.forEach((n, i) => {
      if (n.title && !n.date) add("news." + i, "最新消息第 " + (i + 1) + " 則缺少日期");
      if (!n.title && n.date) add("news." + i, "最新消息第 " + (i + 1) + " 則缺少標題");
    });
  }
  const se = slugError(slug);
  if (se) add("slug", se);
  return { ok: errors.length === 0, errors };
}

// supabase/functions/_shared/emails.mjs
var esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var CONTACT = { line: "@788cblaq", email: "ycaxiom@gmail.com" };
function layout(title, bodyHtml) {
  return `<!doctype html><html lang="zh-Hant"><body style="margin:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#222"><div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border-radius:10px;padding:24px 26px;line-height:1.7;font-size:15px"><h2 style="margin:0 0 14px;font-size:18px">` + esc(title) + "</h2>" + bodyHtml + '</div><p style="color:#888;font-size:12px;text-align:center;margin:14px 0 0">YC AXIOM 網站租用 · LINE ' + CONTACT.line + " · " + CONTACT.email + "</p></div></body></html>";
}
function adminFirstPublish({ shopName, slug, previewUrl, memberEmail, adminUrl }) {
  const subject = "【網站租用】新的上線申請：" + shopName;
  const rows = [["店名", shopName], ["網址代稱", slug], ["會員信箱", memberEmail]];
  const html = layout(
    "有客戶提出網站上線申請",
    '<table style="border-collapse:collapse;width:100%">' + rows.map((r) => '<tr><td style="padding:6px 12px 6px 0;color:#777;white-space:nowrap">' + esc(r[0]) + '</td><td style="padding:6px 0">' + esc(r[1]) + "</td></tr>").join("") + '</table><p><a href="' + esc(previewUrl) + '" style="display:inline-block;background:#2f4a3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">預覽客戶網站</a></p><p style="color:#666;font-size:13px">狀態目前是「待上線」。確認收到款項後，到管理後台「租用網站」按「確認收款」，系統會自動部署上線並通知客戶。</p>' + (adminUrl ? '<p style="font-size:13px"><a href="' + esc(adminUrl) + '">開啟管理後台</a></p>' : "")
  );
  const text = ["有客戶提出網站上線申請", "", "店名：" + shopName, "網址代稱：" + slug, "會員信箱：" + memberEmail, "預覽：" + previewUrl, "", "狀態目前是「待上線」，確認收到款項後，到管理後台「租用網站」按「確認收款」即可上線。"].join("\n");
  return { subject, html, text };
}
var ADD_CONTACT = "為避免我們的信件被歸到垃圾信匣，請把 " + CONTACT.email + " 加入你的聯絡人；直接回覆這封信也會寄到我們的信箱。";

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

// supabase/functions/publish-site/handler.mjs
var MIN_GAP_SECONDS = 20;
var MAX_PER_DAY = 30;
async function handlePublish(req, deps) {
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
  const siteId = body && body.site_id;
  if (typeof siteId !== "string" || !UUID.test(siteId)) return reply({ error: "bad_request", message: "缺少網站編號" }, 400);
  const { db: db2 } = deps;
  const now = (deps.now || (() => /* @__PURE__ */ new Date()))();
  const site = await db2.getOne("rental_sites", "id=eq." + siteId + "&member_id=eq." + user.id + "&select=*");
  if (!site) return reply({ error: "not_found", message: "找不到這個網站" }, 404);
  const member = await db2.getOne("members", "id=eq." + user.id + "&select=consented_at,email");
  if (!member || !member.consented_at) return reply({ error: "consent_required", message: "請先同意服務條款與隱私權政策" }, 403);
  if (site.status === "suspended" || site.status === "cancelled") {
    return reply({ error: "not_allowed", message: site.status === "suspended" ? "網站目前已暫停，請聯絡 YC AXIOM（LINE @788cblaq）" : "這個網站已終止服務" }, 403);
  }
  if (site.status === "draft" && !site.terms_accepted_at) return reply({ error: "terms_required", message: "請先閱讀並同意網站租用條款" }, 403);
  const content = normalizeContent(site.content), palette = normalizePalette(site.palette), sections = normalizeSections(site.sections);
  const check = validateForPublish(content, sections, site.slug, site.content);
  if (!check.ok) return reply({ error: "validation", message: "還有必填項目沒完成", errors: check.errors }, 422);
  const since = new Date(now.getTime() - 24 * 3600 * 1e3).toISOString();
  const recent = await db2.list("site_events", "site_id=eq." + siteId + "&type=in.(published_first,version_saved,deploy_queued)&created_at=gte." + encodeURIComponent(since) + "&select=created_at&order=created_at.desc&limit=" + MAX_PER_DAY);
  if (recent.length && now.getTime() - new Date(recent[0].created_at).getTime() < MIN_GAP_SECONDS * 1e3) return reply({ error: "rate_limited", message: "操作太頻繁，請稍候幾秒再試" }, 429);
  if (recent.length >= MAX_PER_DAY) return reply({ error: "rate_limited", message: "今天的發佈次數已達上限，請明天再試" }, 429);
  const version = await db2.insertReturning("site_versions", { site_id: siteId, content, palette, sections });
  if (!version || !version.id) return reply({ error: "server_error", message: "儲存版本失敗，請稍後再試" }, 500);
  const event = (type, detail) => db2.insert("site_events", { site_id: siteId, type, detail }).catch(() => {
  });
  if (site.status === "draft") {
    await db2.patch("rental_sites", "id=eq." + siteId + "&status=eq.draft", { status: "pending" });
    await event("published_first", { version_id: version.id });
    const mail = adminFirstPublish({ shopName: content.name, slug: site.slug, previewUrl: deps.previewBase + "?site=" + siteId, memberEmail: member.email || user.email || "", adminUrl: deps.adminUrl });
    const r = await deps.sendMail({ to: deps.adminEmail, ...mail }).catch((e) => ({ ok: false, error: String(e) }));
    await event(r.ok ? "email_sent" : "email_failed", { template: "adminFirstPublish", ...r.ok ? {} : { error: String(r.error || "").slice(0, 200) } });
    return reply({ ok: true, status: "pending", version_id: version.id, message: "已送出上線申請。我們確認後會為你開通，並以 Email 通知。" }, 200);
  }
  if (site.status === "pending") {
    await event("version_saved", { version_id: version.id });
    return reply({ ok: true, status: "pending", version_id: version.id, message: "已更新送審的內容。網站開通後會使用最新版本。" }, 200);
  }
  await event("deploy_queued", { version_id: version.id });
  const d = await deps.dispatch({ siteId, versionId: version.id }).catch((e) => ({ ok: false, error: String(e) }));
  if (!d.ok) {
    await event("deploy_failed", { message: "無法啟動部署：" + String(d.error || "").slice(0, 200), version_id: version.id });
    return reply({ error: "dispatch_failed", message: "更新沒有送出成功，請稍後再按一次發佈。你的網站仍維持舊版上線。" }, 502);
  }
  return reply({ ok: true, status: site.status, updating: true, version_id: version.id, message: "更新已送出，約 1–2 分鐘後生效。" }, 200);
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

// supabase/functions/publish-site/main.mjs
var need = (k) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error("missing secret " + k);
  return v;
};
var SUPABASE_URL = need("SUPABASE_URL");
var db = makeSupabase({ url: SUPABASE_URL, serviceKey: need("SUPABASE_SERVICE_ROLE_KEY") });
var ANON = need("SUPABASE_ANON_KEY");
var GH_TOKEN = Deno.env.get("GITHUB_DISPATCH_TOKEN") || "";
var BREVO = Deno.env.get("BREVO_API_KEY") || "";
var ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "ycaxiom@gmail.com";
var REPO = Deno.env.get("GITHUB_REPO") || "chi1017/yc-axiom-sites";
var sendMail = makeBrevoSender({ apiKey: BREVO });
var getUser = makeGetUser({ supabaseUrl: SUPABASE_URL, anonKey: ANON });
var dispatch = makeDispatcher({ token: GH_TOKEN, repo: REPO, ref: Deno.env.get("GITHUB_REF") || "main" });
var SITE_BASE = Deno.env.get("OFFICIAL_SITE_URL") || "https://chi1017.github.io/yc-axiom-site/";
Deno.serve((req) => handlePublish(req, {
  allowedOrigins: parseOrigins(Deno.env.get("ALLOWED_ORIGINS")),
  previewBase: SITE_BASE + "builder/preview/",
  adminUrl: SITE_BASE + "admin/",
  adminEmail: ADMIN_EMAIL,
  db,
  getUser,
  sendMail,
  dispatch
}));
