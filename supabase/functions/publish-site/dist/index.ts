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
  forest: { label: "\u68EE\u6797\u7DA0", bg: "#F6F3EC", surface: "#EAE4D6", text: "#22301F", muted: "#4F5A4B", accent: "#2F4A3A", onAccent: "#F6F3EC", line: "#D8D1C1" },
  caramel: { label: "\u7126\u7CD6\u68D5", bg: "#FBF6F0", surface: "#F0E3D3", text: "#3A2618", muted: "#6B5444", accent: "#8A5A3B", onAccent: "#FBF6F0", line: "#E2D2BE" },
  ink: { label: "\u58A8\u591C\u91D1", bg: "#17161A", surface: "#24222A", text: "#F1ECE2", muted: "#B9B2A5", accent: "#C9A66B", onAccent: "#17161A", line: "#36333C" },
  mist: { label: "\u9727\u85CD\u7070", bg: "#F3F5F6", surface: "#DDE5EA", text: "#1D2A33", muted: "#4C5C67", accent: "#3E5A6E", onAccent: "#F3F5F6", line: "#C9D3D9" }
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
  room: 3,
  alt: 60,
  social: 200
};
var DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var DAY_LABELS = { mon: "\u9031\u4E00", tue: "\u9031\u4E8C", wed: "\u9031\u4E09", thu: "\u9031\u56DB", fri: "\u9031\u4E94", sat: "\u9031\u516D", sun: "\u9031\u65E5" };
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
  return PALETTE_IDS.includes(p) ? p : "forest";
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
  if (!s) return "\u8ACB\u586B\u7DB2\u5740\u4EE3\u7A31";
  if (s.length < 3 || s.length > 30) return "\u7DB2\u5740\u4EE3\u7A31\u8981 3\u201330 \u500B\u5B57";
  if (!/^[a-z0-9-]+$/.test(s)) return "\u53EA\u80FD\u4F7F\u7528\u5C0F\u5BEB\u82F1\u6587\u3001\u6578\u5B57\u8207\u9023\u5B57\u865F\uFF08-\uFF09";
  if (s.startsWith("-") || s.endsWith("-")) return "\u958B\u982D\u8207\u7D50\u5C3E\u4E0D\u80FD\u662F\u9023\u5B57\u865F";
  if (s.includes("--")) return "\u4E0D\u80FD\u9023\u7E8C\u5169\u500B\u9023\u5B57\u865F";
  if (RESERVED_SLUGS.includes(s)) return "\u9019\u500B\u540D\u7A31\u662F\u7CFB\u7D71\u4FDD\u7559\u5B57\uFF0C\u8ACB\u63DB\u4E00\u500B";
  return "";
}

// templates/shared/validate.js
function validateForPublish(content, sections, slug, raw) {
  const errors = [];
  const add = (field, msg) => errors.push({ field, msg });
  if (!content.name) add("name", "\u8ACB\u586B\u5E97\u540D");
  if (!content.address) add("address", "\u8ACB\u586B\u5E97\u5BB6\u5730\u5740");
  if (!hasAnyHours(content.hours)) add("hours", "\u8ACB\u81F3\u5C11\u8A2D\u5B9A\u4E00\u5929\u7684\u71DF\u696D\u6642\u9593\uFF08\u6216\u6A19\u793A\u516C\u4F11\u4EE5\u5916\u7684\u6642\u6BB5\uFF09");
  DAYS.forEach((d) => {
    const h = content.hours[d];
    if (!h.closed && (h.open || h.close) && !(validTime(h.open) && validTime(h.close))) add("hours." + d, DAY_LABELS[d] + "\u7684\u71DF\u696D\u6642\u9593\u8981\u540C\u6642\u586B\u958B\u59CB\u8207\u7D50\u675F");
  });
  if (!content.photos.hero) add("photos.hero", "\u8ACB\u4E0A\u50B3\u4E00\u5F35\u4E3B\u8996\u89BA\u7167\u7247");
  const b = content.booking, rawB = raw && raw.booking || b;
  const rawUrl = String(rawB.url || "").trim();
  if (rawUrl && !safeHttpsUrl(rawUrl)) add("booking.url", "\u8A02\u4F4D\u9023\u7D50\u5FC5\u9808\u662F https:// \u958B\u982D\u7684\u6709\u6548\u7DB2\u5740");
  else if (b.label && !b.url || !b.label && b.url) add("booking", "\u8A02\u4F4D\u6309\u9215\u8981\u540C\u6642\u586B\u300C\u6309\u9215\u6587\u5B57\u300D\u8207\u300C\u9023\u7D50\u300D\uFF0C\u6216\u5169\u8005\u90FD\u7559\u7A7A");
  const rawS = raw && raw.social || {};
  [["instagram", "Instagram"], ["facebook", "Facebook"], ["line", "LINE"]].forEach(([k, label]) => {
    const v = String(rawS[k] || "").trim();
    if (v && !safeHttpsUrl(v)) add("social." + k, label + " \u9023\u7D50\u5FC5\u9808\u662F https:// \u958B\u982D\u7684\u6709\u6548\u7DB2\u5740");
  });
  if (sections.menu) {
    content.menu.forEach((m, i) => {
      if (!m.name && !(m.price == null)) add("menu." + i, "\u83DC\u55AE\u7B2C " + (i + 1) + " \u9805\u7F3A\u5C11\u54C1\u540D");
      else if (m.name && m.price == null) add("menu." + i, "\u83DC\u55AE\u7B2C " + (i + 1) + " \u9805\uFF08" + m.name + "\uFF09\u7F3A\u5C11\u50F9\u683C");
    });
  }
  if (sections.faq) {
    content.faq.forEach((f, i) => {
      if (f.q && !f.a) add("faq." + i, "\u5E38\u898B\u554F\u984C\u7B2C " + (i + 1) + " \u984C\u7F3A\u5C11\u56DE\u7B54");
      if (!f.q && f.a) add("faq." + i, "\u5E38\u898B\u554F\u984C\u7B2C " + (i + 1) + " \u984C\u7F3A\u5C11\u554F\u984C");
    });
  }
  if (sections.news) {
    content.news.forEach((n, i) => {
      if (n.title && !n.date) add("news." + i, "\u6700\u65B0\u6D88\u606F\u7B2C " + (i + 1) + " \u5247\u7F3A\u5C11\u65E5\u671F");
      if (!n.title && n.date) add("news." + i, "\u6700\u65B0\u6D88\u606F\u7B2C " + (i + 1) + " \u5247\u7F3A\u5C11\u6A19\u984C");
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
  return `<!doctype html><html lang="zh-Hant"><body style="margin:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#222"><div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border-radius:10px;padding:24px 26px;line-height:1.7;font-size:15px"><h2 style="margin:0 0 14px;font-size:18px">` + esc(title) + "</h2>" + bodyHtml + '</div><p style="color:#888;font-size:12px;text-align:center;margin:14px 0 0">YC AXIOM \u7DB2\u7AD9\u79DF\u7528 \xB7 LINE ' + CONTACT.line + " \xB7 " + CONTACT.email + "</p></div></body></html>";
}
function adminFirstPublish({ shopName, slug, previewUrl, memberEmail, adminUrl }) {
  const subject = "\u3010\u7DB2\u7AD9\u79DF\u7528\u3011\u65B0\u7684\u4E0A\u7DDA\u7533\u8ACB\uFF1A" + shopName;
  const rows = [["\u5E97\u540D", shopName], ["\u7DB2\u5740\u4EE3\u7A31", slug], ["\u6703\u54E1\u4FE1\u7BB1", memberEmail]];
  const html = layout(
    "\u6709\u5BA2\u6236\u63D0\u51FA\u7DB2\u7AD9\u4E0A\u7DDA\u7533\u8ACB",
    '<table style="border-collapse:collapse;width:100%">' + rows.map((r) => '<tr><td style="padding:6px 12px 6px 0;color:#777;white-space:nowrap">' + esc(r[0]) + '</td><td style="padding:6px 0">' + esc(r[1]) + "</td></tr>").join("") + '</table><p><a href="' + esc(previewUrl) + '" style="display:inline-block;background:#2f4a3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">\u9810\u89BD\u5BA2\u6236\u7DB2\u7AD9</a></p><p style="color:#666;font-size:13px">\u72C0\u614B\u76EE\u524D\u662F\u300C\u5F85\u4E0A\u7DDA\u300D\u3002\u78BA\u8A8D\u6B3E\u9805\u5F8C\uFF0C\u5230 Supabase \u5C07\u72C0\u614B\u6539\u70BA live\uFF0C\u518D\u8ACB\u5BA2\u6236\u6309\u4E00\u6B21\u767C\u4F48\uFF08\u6216\u7531\u7BA1\u7406\u5F8C\u53F0\u4E0A\u7DDA\uFF0C\u7B2C\u4E8C\u968E\u6BB5\u63D0\u4F9B\uFF09\u3002</p>' + (adminUrl ? '<p style="font-size:13px"><a href="' + esc(adminUrl) + '">\u958B\u555F\u7BA1\u7406\u5F8C\u53F0</a></p>' : "")
  );
  const text = ["\u6709\u5BA2\u6236\u63D0\u51FA\u7DB2\u7AD9\u4E0A\u7DDA\u7533\u8ACB", "", "\u5E97\u540D\uFF1A" + shopName, "\u7DB2\u5740\u4EE3\u7A31\uFF1A" + slug, "\u6703\u54E1\u4FE1\u7BB1\uFF1A" + memberEmail, "\u9810\u89BD\uFF1A" + previewUrl, "", "\u72C0\u614B\u76EE\u524D\u662F\u300C\u5F85\u4E0A\u7DDA\u300D\uFF0C\u78BA\u8A8D\u6B3E\u9805\u5F8C\u518D\u4E0A\u7DDA\u3002"].join("\n");
  return { subject, html, text };
}

// supabase/functions/publish-site/handler.mjs
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var MIN_GAP_SECONDS = 20;
var MAX_PER_DAY = 30;
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
async function handlePublish(req, deps) {
  const cors = corsHeaders(req, deps.allowedOrigins);
  const reply = (b, s) => json(b, s, cors);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "method_not_allowed", message: "\u4E0D\u652F\u63F4\u7684\u8ACB\u6C42\u65B9\u5F0F" }, 405);
  const origin = req.headers.get("origin") || "";
  if (origin && !deps.allowedOrigins.includes(origin)) return reply({ error: "forbidden_origin", message: "\u4F86\u6E90\u4E0D\u88AB\u5141\u8A31" }, 403);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const user = token ? await deps.getUser(token).catch(() => null) : null;
  if (!user || !user.id) return reply({ error: "unauthorized", message: "\u8ACB\u5148\u767B\u5165" }, 401);
  let body;
  try {
    const t = await req.text();
    if (t.length > 2e3) throw new Error("too big");
    body = JSON.parse(t);
  } catch {
    return reply({ error: "bad_request", message: "\u8ACB\u6C42\u683C\u5F0F\u4E0D\u6B63\u78BA" }, 400);
  }
  const siteId = body && body.site_id;
  if (typeof siteId !== "string" || !UUID.test(siteId)) return reply({ error: "bad_request", message: "\u7F3A\u5C11\u7DB2\u7AD9\u7DE8\u865F" }, 400);
  const { db: db2 } = deps;
  const now = (deps.now || (() => /* @__PURE__ */ new Date()))();
  const site = await db2.getOne("rental_sites", "id=eq." + siteId + "&member_id=eq." + user.id + "&select=*");
  if (!site) return reply({ error: "not_found", message: "\u627E\u4E0D\u5230\u9019\u500B\u7DB2\u7AD9" }, 404);
  const member = await db2.getOne("members", "id=eq." + user.id + "&select=consented_at,email");
  if (!member || !member.consented_at) return reply({ error: "consent_required", message: "\u8ACB\u5148\u540C\u610F\u670D\u52D9\u689D\u6B3E\u8207\u96B1\u79C1\u6B0A\u653F\u7B56" }, 403);
  if (site.status === "suspended" || site.status === "cancelled") {
    return reply({ error: "not_allowed", message: site.status === "suspended" ? "\u7DB2\u7AD9\u76EE\u524D\u5DF2\u66AB\u505C\uFF0C\u8ACB\u806F\u7D61 YC AXIOM\uFF08LINE @788cblaq\uFF09" : "\u9019\u500B\u7DB2\u7AD9\u5DF2\u7D42\u6B62\u670D\u52D9" }, 403);
  }
  const content = normalizeContent(site.content), palette = normalizePalette(site.palette), sections = normalizeSections(site.sections);
  const check = validateForPublish(content, sections, site.slug, site.content);
  if (!check.ok) return reply({ error: "validation", message: "\u9084\u6709\u5FC5\u586B\u9805\u76EE\u6C92\u5B8C\u6210", errors: check.errors }, 422);
  const since = new Date(now.getTime() - 24 * 3600 * 1e3).toISOString();
  const recent = await db2.list("site_events", "site_id=eq." + siteId + "&type=in.(published_first,version_saved,deploy_queued)&created_at=gte." + encodeURIComponent(since) + "&select=created_at&order=created_at.desc&limit=" + MAX_PER_DAY);
  if (recent.length && now.getTime() - new Date(recent[0].created_at).getTime() < MIN_GAP_SECONDS * 1e3) return reply({ error: "rate_limited", message: "\u64CD\u4F5C\u592A\u983B\u7E41\uFF0C\u8ACB\u7A0D\u5019\u5E7E\u79D2\u518D\u8A66" }, 429);
  if (recent.length >= MAX_PER_DAY) return reply({ error: "rate_limited", message: "\u4ECA\u5929\u7684\u767C\u4F48\u6B21\u6578\u5DF2\u9054\u4E0A\u9650\uFF0C\u8ACB\u660E\u5929\u518D\u8A66" }, 429);
  const version = await db2.insertReturning("site_versions", { site_id: siteId, content, palette, sections });
  if (!version || !version.id) return reply({ error: "server_error", message: "\u5132\u5B58\u7248\u672C\u5931\u6557\uFF0C\u8ACB\u7A0D\u5F8C\u518D\u8A66" }, 500);
  const event = (type, detail) => db2.insert("site_events", { site_id: siteId, type, detail }).catch(() => {
  });
  if (site.status === "draft") {
    await db2.patch("rental_sites", "id=eq." + siteId + "&status=eq.draft", { status: "pending" });
    await event("published_first", { version_id: version.id });
    const mail = adminFirstPublish({ shopName: content.name, slug: site.slug, previewUrl: deps.previewBase + "?site=" + siteId, memberEmail: member.email || user.email || "", adminUrl: deps.adminUrl });
    const r = await deps.sendMail({ to: deps.adminEmail, ...mail }).catch((e) => ({ ok: false, error: String(e) }));
    await event(r.ok ? "email_sent" : "email_failed", { template: "adminFirstPublish", ...r.ok ? {} : { error: String(r.error || "").slice(0, 200) } });
    return reply({ ok: true, status: "pending", version_id: version.id, message: "\u5DF2\u9001\u51FA\u4E0A\u7DDA\u7533\u8ACB\u3002\u6211\u5011\u78BA\u8A8D\u5F8C\u6703\u70BA\u4F60\u958B\u901A\uFF0C\u4E26\u4EE5 Email \u901A\u77E5\u3002" }, 200);
  }
  if (site.status === "pending") {
    await event("version_saved", { version_id: version.id });
    return reply({ ok: true, status: "pending", version_id: version.id, message: "\u5DF2\u66F4\u65B0\u9001\u5BE9\u7684\u5167\u5BB9\u3002\u7DB2\u7AD9\u958B\u901A\u5F8C\u6703\u4F7F\u7528\u6700\u65B0\u7248\u672C\u3002" }, 200);
  }
  await event("deploy_queued", { version_id: version.id });
  const d = await deps.dispatch({ siteId, versionId: version.id }).catch((e) => ({ ok: false, error: String(e) }));
  if (!d.ok) {
    await event("deploy_failed", { message: "\u7121\u6CD5\u555F\u52D5\u90E8\u7F72\uFF1A" + String(d.error || "").slice(0, 200), version_id: version.id });
    return reply({ error: "dispatch_failed", message: "\u66F4\u65B0\u6C92\u6709\u9001\u51FA\u6210\u529F\uFF0C\u8ACB\u7A0D\u5F8C\u518D\u6309\u4E00\u6B21\u767C\u4F48\u3002\u4F60\u7684\u7DB2\u7AD9\u4ECD\u7DAD\u6301\u820A\u7248\u4E0A\u7DDA\u3002" }, 502);
  }
  return reply({ ok: true, status: site.status, updating: true, version_id: version.id, message: "\u66F4\u65B0\u5DF2\u9001\u51FA\uFF0C\u7D04 1\u20132 \u5206\u9418\u5F8C\u751F\u6548\u3002" }, 200);
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
    if (!res.ok) throw new Error("Supabase " + method + " " + path.split("?")[0] + " \u2192 " + res.status + " " + text.slice(0, 200));
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
      if (!res.ok) throw new Error("Storage download " + path + " \u2192 " + res.status);
      return Buffer.from(await res.arrayBuffer());
    }
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
var SITE_BASE = Deno.env.get("OFFICIAL_SITE_URL") || "https://chi1017.github.io/yc-axiom-site/";
Deno.serve((req) => handlePublish(req, {
  allowedOrigins: parseOrigins(Deno.env.get("ALLOWED_ORIGINS")),
  previewBase: SITE_BASE + "builder/preview/",
  adminUrl: SITE_BASE + "admin/",
  adminEmail: ADMIN_EMAIL,
  db,
  async getUser(token) {
    const res = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: ANON, Authorization: "Bearer " + token }, signal: AbortSignal.timeout(8e3) });
    if (!res.ok) return null;
    const u = await res.json();
    return u && u.id ? { id: u.id, email: u.email } : null;
  },
  async sendMail(m) {
    if (!BREVO) return { ok: false, error: "BREVO_API_KEY \u672A\u8A2D\u5B9A" };
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { name: "YC AXIOM \u7DB2\u7AD9\u79DF\u7528", email: "ycaxiom@gmail.com" }, replyTo: { email: "ycaxiom@gmail.com" }, to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text }),
      signal: AbortSignal.timeout(1e4)
    });
    return res.ok ? { ok: true } : { ok: false, error: "brevo " + res.status + " " + (await res.text()).slice(0, 200) };
  },
  async dispatch({ siteId, versionId }) {
    if (!GH_TOKEN) return { ok: false, error: "GITHUB_DISPATCH_TOKEN \u672A\u8A2D\u5B9A" };
    const res = await fetch("https://api.github.com/repos/" + REPO + "/actions/workflows/deploy-site.yml/dispatches", {
      method: "POST",
      headers: { Authorization: "Bearer " + GH_TOKEN, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", "User-Agent": "yc-axiom-publish-site" },
      body: JSON.stringify({ ref: "main", inputs: { site_id: siteId, version_id: versionId } }),
      signal: AbortSignal.timeout(1e4)
    });
    return res.status === 204 ? { ok: true } : { ok: false, error: "github " + res.status };
  }
}));
