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
  midnight: { label: "夜海藍", bg: "#13171B", surface: "#1E2429", text: "#E9EDF1", muted: "#A8B3BD", accent: "#6FA8DC", onAccent: "#13171B", line: "#323B43" },
  matcha: { label: "抹茶綠", bg: "#F6F7EF", surface: "#E6EAD5", text: "#1F2614", muted: "#4D5640", accent: "#4A6B22", onAccent: "#FFFFFF", line: "#D2D8BD" },
  lake: { label: "湖水青", bg: "#0E1A1C", surface: "#152528", text: "#E6F1F0", muted: "#A9C0BE", accent: "#5CC8B8", onAccent: "#0E1A1C", line: "#26393C" },
  paper: { label: "宣紙朱", bg: "#FAF7F0", surface: "#EFE7D6", text: "#2A241C", muted: "#5C5244", accent: "#9E2B25", onAccent: "#FFFFFF", line: "#DED3BE" },
  navy: { label: "藏青金", bg: "#F7F6F1", surface: "#E8E5DB", text: "#18202F", muted: "#4A5162", accent: "#1F3B6B", onAccent: "#FFFFFF", line: "#D6D1C3" }
};
var PALETTE_IDS = Object.keys(PALETTES);
var CUSTOM_RE = /^c-([0-9a-f]{6})-([ld])$/;
function isCustomPalette(id) {
  return typeof id === "string" && CUSTOM_RE.test(id);
}
function isValidPaletteId(id) {
  return PALETTE_IDS.includes(id) || isCustomPalette(id);
}
var HEX_RE = /^#[0-9A-F]{6}$/;
function normalizeColors4(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = {};
  for (const k of ["bg", "surface", "accent", "text"]) {
    const v = String(raw[k] || "").toUpperCase();
    if (!HEX_RE.test(v)) return null;
    o[k] = v;
  }
  return o;
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
  deposit: 1e5,
  blocks: 6,
  blockTitle: 40,
  blockBody: 1500,
  btnLabel: 16,
  seoTitle: 60,
  seoDesc: 160,
  sub: 60,
  html: 2e4,
  code: 2e4,
  fontName: 40,
  calRanges: 4,
  calClosed: 60
};
var ORDER_KEYS = ["about", "video", "menu", "interior", "shop", "reviews", "news", "posts", "faq", "blocks", "booking", "visit", "contact"];
var BLOCK_ID_RE = /^[a-z0-9]{4,12}$/;
var FONTS = ["serif", "sans", "round", "kai", "custom"];
var FONT_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/font-[a-z0-9]{6,20}\.(woff2|woff|ttf|otf)$/;
var BUTTONS = ["pill", "round", "square"];
var TEXTURES = ["none", "paper", "dots", "grid", "glow", "contour"];
var HEAD_STYLES = ["plain", "num", "bar", "chip"];
var MOTIONS = ["rise", "fade", "zoom", "none"];
var MENU_STYLES = ["list", "cards"];
var GALLERY_STYLES = ["masonry", "grid", "slide"];
var REVIEW_STYLES = ["cards", "quote"];
var SUB_KEYS = ["about", "video", "menu", "interior", "shop", "reviews", "news", "posts", "faq", "booking", "visit", "contact"];
var DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var DAY_LABELS = { mon: "週一", tue: "週二", wed: "週三", thu: "週四", fri: "週五", sat: "週六", sun: "週日" };
var HERO_STYLES = ["card", "full"];
var HOME_STYLES = ["standard", "magazine", "center", "bento", "sidebar"];
var SLOT_MINUTES = [15, 20, 30, 45, 60, 90, 120, 180];
function emptyCal() {
  const weekly = {};
  DAYS.forEach((d) => {
    weekly[d] = [];
  });
  return { enabled: false, slotMinutes: 60, capacity: 1, leadHours: 2, maxDays: 30, weekly, closed: [] };
}
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
    bookingDeposit: 0,
    // 線上預約要先付的訂金（0＝不收）
    order: [],
    // 首頁區塊順序（ORDER_KEYS 與 'b:<代碼>'）；空的＝預設順序
    blocks: [],
    // 自訂區塊 [{ id, kind, title, body, photo, btnLabel, btnUrl, side, hidden, html }]
    style: { font: "serif", button: "pill", floatLine: false, texture: "none", motion: "rise", head: "plain", menuStyle: "list", gallery: "masonry", reviewStyle: "cards", colors: null, customFont: null },
    code: { head: "", body: "" },
    // 全站自訂程式碼（進階方案，需管理員審核）：head＝放在 </head> 前；body＝放在 </body> 前
    bookingCal: emptyCal(),
    // 預約行事曆（進階方案）
    subs: {},
    // 各區塊標題下方的一句副標題（選填）
    seo: { title: "", description: "", share: null }
    // 自訂首頁標題、描述、分享圖片（空的＝自動產生）
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
  const bids = /* @__PURE__ */ new Set();
  c.blocks = arr(r.blocks).slice(0, LIMITS.blocks).map((x) => {
    const o = x && typeof x === "object" ? x : {};
    let id = String(o.id || "").toLowerCase();
    if (!BLOCK_ID_RE.test(id) || bids.has(id)) id = "";
    if (id) bids.add(id);
    const kind = o.kind === "html" ? "html" : "text";
    return {
      id,
      kind,
      title: line(o.title, LIMITS.blockTitle),
      body: str(o.body, LIMITS.blockBody),
      photo: photo(o.photo),
      btnLabel: line(o.btnLabel, LIMITS.btnLabel),
      btnUrl: clip(safeHttpsUrl(o.btnUrl), 500),
      side: o.side === "left" ? "left" : "right",
      hidden: o.hidden === true,
      ...kind === "html" ? { html: rawCode(o.html, LIMITS.html) } : {}
    };
  }).filter((b2) => b2.id);
  c.order = normalizeOrder(r.order, c.blocks);
  const st = r.style && typeof r.style === "object" ? r.style : {};
  const pick = (list, v) => list.includes(v) ? v : list[0];
  c.style = {
    font: FONTS.includes(st.font) ? st.font : "serif",
    button: BUTTONS.includes(st.button) ? st.button : "pill",
    floatLine: st.floatLine === true,
    texture: pick(TEXTURES, st.texture),
    motion: pick(MOTIONS, st.motion),
    head: pick(HEAD_STYLES, st.head),
    menuStyle: pick(MENU_STYLES, st.menuStyle),
    gallery: pick(GALLERY_STYLES, st.gallery),
    reviewStyle: pick(REVIEW_STYLES, st.reviewStyle),
    colors: normalizeColors4(st.colors),
    customFont: customFontOf(st.customFont)
  };
  if (c.style.font === "custom" && !c.style.customFont) c.style.font = "serif";
  const cd = r.code && typeof r.code === "object" ? r.code : {};
  c.code = { head: rawCode(cd.head, LIMITS.code), body: rawCode(cd.body, LIMITS.code) };
  c.bookingCal = normalizeCal(r.bookingCal);
  const sb = r.subs && typeof r.subs === "object" ? r.subs : {};
  c.subs = {};
  SUB_KEYS.forEach((k) => {
    const v = line(sb[k], LIMITS.sub);
    if (v) c.subs[k] = v;
  });
  const so = r.seo && typeof r.seo === "object" ? r.seo : {};
  c.seo = { title: line(so.title, LIMITS.seoTitle), description: line(so.description, LIMITS.seoDesc), share: photo(so.share) };
  return c;
}
function rawCode(v, n) {
  return clip(String(v == null ? "" : v).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim(), n);
}
function customFontOf(f) {
  if (!f || typeof f !== "object") return null;
  const path = String(f.path || "");
  if (!FONT_PATH_RE.test(path)) return null;
  return { path, name: line(f.name, LIMITS.fontName) || "自訂字型" };
}
var toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
function normalizeCal(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const c = emptyCal();
  c.enabled = r.enabled === true;
  c.slotMinutes = SLOT_MINUTES.includes(Number(r.slotMinutes)) ? Number(r.slotMinutes) : 60;
  c.capacity = intIn(r.capacity, 1, 50) || 1;
  c.leadHours = intIn(r.leadHours, 0, 168) ?? 2;
  c.maxDays = intIn(r.maxDays, 1, 90) || 30;
  const w = r.weekly && typeof r.weekly === "object" ? r.weekly : {};
  DAYS.forEach((d) => {
    c.weekly[d] = arr(w[d]).map((x) => x && typeof x === "object" ? { start: String(x.start || ""), end: String(x.end || "") } : null).filter((x) => x && validTime(x.start) && validTime(x.end) && toMin(x.start) < toMin(x.end)).sort((a, b) => a.start.localeCompare(b.start)).slice(0, LIMITS.calRanges);
  });
  c.closed = [...new Set(arr(r.closed).filter(validDate))].sort().slice(0, LIMITS.calClosed);
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
function normalizeOrder(raw, blocks) {
  const valid = /* @__PURE__ */ new Set([...ORDER_KEYS.filter((k) => k !== "blocks"), ...(blocks || []).map((b) => "b:" + b.id)]);
  const out = [];
  arr(raw).forEach((k) => {
    if (typeof k === "string" && valid.has(k) && !out.includes(k)) out.push(k);
  });
  const defaults = [];
  ORDER_KEYS.forEach((k) => {
    if (k === "blocks") (blocks || []).forEach((b) => defaults.push("b:" + b.id));
    else defaults.push(k);
  });
  defaults.forEach((k, i) => {
    if (out.includes(k)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const p = out.indexOf(defaults[j]);
      if (p >= 0) {
        at = p + 1;
        break;
      }
    }
    out.splice(at, 0, k);
  });
  return out;
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
var BRAND_RE = /(^|-)yc(-|$)|ycaxiom/;
function slugError(slug, { allowBrand = false } = {}) {
  const s = String(slug == null ? "" : slug);
  if (!s) return "請填網址代稱";
  if (s.length < 3 || s.length > 30) return "網址代稱要 3–30 個字";
  if (!/^[a-z0-9-]+$/.test(s)) return "只能使用小寫英文、數字與連字號（-）";
  if (s.startsWith("-") || s.endsWith("-")) return "開頭與結尾不能是連字號";
  if (s.includes("--")) return "不能連續兩個連字號";
  if (RESERVED_SLUGS.includes(s) || !allowBrand && BRAND_RE.test(s)) return "這個名稱是系統保留字，請換一個";
  return "";
}

// templates/shared/industries.js
var OFFERS = {
  menu: { label: "菜單與價格", nav: "菜單", path: "menu/", item: "品項", provide: "店內提供", note: "價格以現場公告為準。", more: "看完整菜單" },
  service: { label: "服務與價格", nav: "服務項目", path: "services/", item: "服務", provide: "提供", note: "實際價格依現場評估為準。", more: "看所有服務" },
  course: { label: "課程與費用", nav: "課程", path: "courses/", item: "課程", provide: "開設", note: "費用以最新公告為準。", more: "看所有課程" },
  product: { label: "商品與價格", nav: "商品", path: "products/", item: "商品", provide: "販售", note: "價格以門市公告為準。", more: "看更多商品" },
  treatment: { label: "診療項目", nav: "診療項目", path: "treatments/", item: "項目", provide: "提供", note: "費用依實際診療內容為準。", more: "看所有診療項目" },
  room: { label: "房型與價格", nav: "房型", path: "rooms/", item: "房型", provide: "提供", note: "房價依日期與方案調整，以訂房時為準。", more: "看所有房型" }
};
var SPACES = {
  store: { label: "店內環境", path: "space/", more: "看更多照片" },
  space: { label: "環境介紹", path: "space/", more: "看更多照片" },
  classroom: { label: "教室環境", path: "space/", more: "看更多照片" },
  clinic: { label: "診所環境", path: "space/", more: "看更多照片" },
  school: { label: "園所環境", path: "space/", more: "看更多照片" },
  lodging: { label: "空間介紹", path: "space/", more: "看更多照片" },
  portfolio: { label: "作品集", path: "works/", more: "看更多作品" }
};
var VISITS = {
  store: { label: "來店資訊", path: "visit/", intro: "來店", ask: "如果想先確認座位或詢問細節" },
  clinic: { label: "看診資訊", path: "visit/", intro: "看診", ask: "如果想先確認看診時間或預約" },
  school: { label: "交通與聯絡", path: "visit/", intro: "參觀", ask: "如果想預約參觀或詢問課程" },
  contact: { label: "聯絡我們", path: "contact/", intro: "洽詢", ask: "如果想詢問報價或預約時間" },
  lodging: { label: "交通與入住", path: "visit/", intro: "入住", ask: "如果想詢問空房或交通方式" }
};
var ROWS = [
  ["cafe", "咖啡店", "餐飲", "CafeOrCoffeeShop", "menu", "store", "store"],
  ["bakery", "烘焙坊", "餐飲", "Bakery", "menu", "store", "store"],
  ["drink", "飲料店", "餐飲", "FoodEstablishment", "menu", "store", "store"],
  ["dessert", "甜點店", "餐飲", "FoodEstablishment", "menu", "store", "store"],
  ["restaurant", "餐廳", "餐飲", "Restaurant", "menu", "store", "store"],
  ["brunch", "早午餐店", "餐飲", "Restaurant", "menu", "store", "store"],
  ["bar", "酒吧", "餐飲", "BarOrPub", "menu", "store", "store"],
  ["tea", "茶館", "餐飲", "FoodEstablishment", "menu", "store", "store"],
  ["salon", "美髮沙龍", "美業", "HairSalon", "service", "store", "store"],
  ["beauty", "美容美體", "美業", "BeautySalon", "service", "store", "store"],
  ["nail", "美甲美睫", "美業", "NailSalon", "service", "store", "store"],
  ["spa", "按摩 SPA", "美業", "DaySpa", "service", "store", "store"],
  ["pet", "寵物美容", "美業", "PetStore", "service", "store", "store"],
  ["gym", "健身房", "運動與健康", "ExerciseGym", "course", "space", "store"],
  ["yoga", "瑜珈教室", "運動與健康", "SportsActivityLocation", "course", "classroom", "school"],
  ["medical", "診所", "運動與健康", "MedicalClinic", "treatment", "clinic", "clinic"],
  ["dental", "牙醫診所", "運動與健康", "Dentist", "treatment", "clinic", "clinic"],
  ["tcm", "中醫診所", "運動與健康", "MedicalClinic", "treatment", "clinic", "clinic"],
  ["physio", "物理治療所", "運動與健康", "Physiotherapy", "treatment", "clinic", "clinic"],
  ["vet", "動物醫院", "運動與健康", "VeterinaryCare", "treatment", "clinic", "clinic"],
  ["edu", "補習班", "教育", "EducationalOrganization", "course", "classroom", "school"],
  ["arts", "才藝教室", "教育", "EducationalOrganization", "course", "classroom", "school"],
  ["music", "音樂教室", "教育", "EducationalOrganization", "course", "classroom", "school"],
  ["kindergarten", "幼兒園", "教育", "Preschool", "course", "school", "school"],
  ["daycare", "托嬰中心", "教育", "ChildCare", "course", "school", "school"],
  ["fashion", "服飾店", "零售", "ClothingStore", "product", "store", "store"],
  ["furniture", "家具店", "零售", "FurnitureStore", "product", "store", "store"],
  ["florist", "花店", "零售", "Florist", "product", "store", "store"],
  ["bookstore", "書店", "零售", "BookStore", "product", "store", "store"],
  ["eyewear", "眼鏡行", "零售", "Optician", "product", "store", "store"],
  ["gift", "選物店", "零售", "Store", "product", "store", "store"],
  ["grocery", "雜貨店", "零售", "GroceryStore", "product", "store", "store"],
  ["car-detailing", "汽車美容", "生活服務", "AutoWash", "service", "store", "store"],
  ["auto-repair", "汽車維修", "生活服務", "AutoRepair", "service", "store", "store"],
  ["motorcycle", "機車行", "生活服務", "MotorcycleRepair", "service", "store", "store"],
  ["laundry", "洗衣店", "生活服務", "DryCleaningOrLaundry", "service", "store", "store"],
  ["cleaning", "居家清潔", "生活服務", "ProfessionalService", "service", "portfolio", "contact"],
  ["photo", "攝影工作室", "生活服務", "ProfessionalService", "service", "portfolio", "contact"],
  ["interior", "室內設計", "生活服務", "HomeAndConstructionBusiness", "service", "portfolio", "contact"],
  ["renovation", "裝修工程", "生活服務", "GeneralContractor", "service", "portfolio", "contact"],
  ["lodging", "民宿", "住宿", "BedAndBreakfast", "room", "lodging", "lodging"],
  ["law", "法律事務所", "專業服務", "LegalService", "service", "space", "contact"],
  ["accounting", "會計記帳", "專業服務", "AccountingService", "service", "space", "contact"],
  ["realestate", "房屋仲介", "專業服務", "RealEstateAgent", "service", "space", "contact"],
  ["other", "其他店家", "其他", "LocalBusiness", "service", "store", "store"]
];
var INDUSTRIES = ROWS.map(([key, label, group, schemaType, offer, space, visit]) => ({
  key,
  label,
  group,
  schemaType,
  kindLabel: label,
  offer: OFFERS[offer],
  space: SPACES[space],
  visit: VISITS[visit]
}));
var INDUSTRY_KEYS = INDUSTRIES.map((i) => i.key);
var INDUSTRY_GROUPS = [...new Set(INDUSTRIES.map((i) => i.group))];
var BY_KEY = Object.fromEntries(INDUSTRIES.map((i) => [i.key, i]));
function getIndustry(key) {
  return BY_KEY[key] || null;
}

// templates/shared/validate.js
var offerWord = (template) => {
  const i = getIndustry(template);
  return i ? i.offer.nav : "價目表";
};
function validateForPublish(content, sections, slug, raw, { checkBrand = false, template } = {}) {
  const W = offerWord(template);
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
      if (!m.name && !(m.price == null)) add("menu." + i, W + "第 " + (i + 1) + " 項缺少名稱");
      else if (m.name && m.price == null) add("menu." + i, W + "第 " + (i + 1) + " 項（" + m.name + "）缺少價格");
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
  const rawVideo = String(raw && raw.video || "").trim();
  if (rawVideo && !youtubeId(rawVideo)) add("video", "影片網址要是 YouTube 的影片連結（例如 https://www.youtube.com/watch?v=…）");
  const rawGa = String(raw && raw.ga4 || "").trim();
  if (rawGa && !GA4_RE.test(rawGa.toUpperCase())) add("ga4", "Google Analytics 評估 ID 格式是 G- 開頭（例如 G-AB12CD34EF）");
  content.reviews.forEach((r, i) => {
    if (r.name && !r.text) add("reviews." + i, "客人評價第 " + (i + 1) + " 則缺少內容");
  });
  content.posts.forEach((p, i) => {
    if ((p.title || p.body) && !(p.title && p.body)) add("posts." + i, "文章第 " + (i + 1) + " 篇要同時有標題與內容");
    if (p.title && !p.date) add("posts." + i, "文章第 " + (i + 1) + " 篇缺少日期");
  });
  if (content.en.enabled && (!content.en.name || !content.en.intro)) add("en", "英文版要填英文店名與英文介紹（或先關閉英文版）");
  if (content.shop.enabled) content.shop.items.forEach((it, i) => {
    if (it.name && !it.price) add("shop." + i, "線上購買第 " + (i + 1) + " 項（" + it.name + "）缺少價格");
    else if (!it.name && (it.price || it.desc || it.photo)) add("shop." + i, "線上購買第 " + (i + 1) + " 項缺少商品名稱");
  });
  const rawBlocks = Array.isArray(raw && raw.blocks) ? raw.blocks : [];
  content.blocks.forEach((b2, i) => {
    const rawUrl2 = String((rawBlocks.find((r) => r && String(r.id || "").toLowerCase() === b2.id) || {}).btnUrl || "").trim();
    if (rawUrl2 && !safeHttpsUrl(rawUrl2)) add("blocks." + i, "自訂區塊「" + (b2.title || i + 1) + "」的按鈕連結必須是 https:// 開頭的有效網址");
    else if (b2.btnLabel && !b2.btnUrl || !b2.btnLabel && b2.btnUrl) add("blocks." + i, "自訂區塊「" + (b2.title || i + 1) + "」的按鈕要同時填文字與連結，或兩者都留空");
  });
  if (content.style.floatLine && !content.social.line) add("social.line", "要顯示 LINE 浮動按鈕，請先填 LINE 連結");
  if (content.bookingForm && content.bookingCal && content.bookingCal.enabled && !Object.values(content.bookingCal.weekly).some((r) => r.length)) add("bookingCal", "預約行事曆要至少設定一個每週可預約的時段（或先關閉行事曆）");
  if (content.showMap && !content.address) add("address", "要顯示地圖，請先填店家地址");
  if (template !== void 0 && !getIndustry(template)) add("template", "不支援的行業類型，請重新選擇");
  const se = slugError(slug, { allowBrand: !checkBrand });
  if (se) add("slug", se);
  return { ok: errors.length === 0, errors };
}

// templates/shared/pages.js
var LAYOUTS = ["single", "multi"];
var PAGES = [
  { key: "about", label: "關於", path: "about/" },
  { key: "menu", label: "菜單與價格", path: "menu/" },
  { key: "interior", label: "店內環境", path: "space/" },
  { key: "news", label: "最新消息", path: "news/" },
  { key: "faq", label: "常見問題", path: "faq/" },
  { key: "visit", label: "來店資訊", path: "visit/" }
];
var PAGE_KEYS = PAGES.map((p) => p.key);
function normalizeLayout(v) {
  return LAYOUTS.includes(v) ? v : "single";
}
function defaultPages() {
  const o = {};
  PAGE_KEYS.forEach((k) => {
    o[k] = true;
  });
  return o;
}
function normalizePages(raw) {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const o = defaultPages();
  PAGE_KEYS.forEach((k) => {
    if (typeof r[k] === "boolean") o[k] = r[k];
  });
  return o;
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
var button = (href, label) => '<p><a href="' + esc(href) + '" style="display:inline-block;background:#2f4a3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">' + esc(label) + "</a></p>";
var LINE_HINT = "有任何問題都可以直接回覆這封信，或用 LINE " + CONTACT.line + " 聯絡我們。";
function adminCodeReview({ shopName, slug, memberEmail, adminUrl }) {
  const subject = "【網站租用】自訂程式碼待審核：" + shopName;
  const html = layout(
    "有自訂程式碼等待審核",
    "<p>「" + esc(shopName) + "」（" + esc(slug) + "，" + esc(memberEmail) + "）發佈了含自訂程式碼的版本。</p><p>核准前，網站會照常更新但不含這段程式碼。請到管理後台的網站詳情查看程式碼並核准或退回。</p>" + (adminUrl ? button(adminUrl, "開啟管理後台") : "")
  );
  const text = ["有自訂程式碼等待審核", "", shopName + "（" + slug + "，" + memberEmail + "）發佈了含自訂程式碼的版本。", "核准前網站照常更新但不含程式碼。請到管理後台的網站詳情核准或退回。"].join("\n");
  return { subject, html, text };
}

// templates/shared/code.js
function customCode(c) {
  const blocks = (c.blocks || []).filter((b) => b.kind === "html" && !b.hidden && b.html).map((b) => ({ id: b.id, html: b.html }));
  const head = c.code && c.code.head || "", body = c.code && c.code.body || "";
  return { head, body, blocks };
}
function hasCustomCode(c) {
  const x = customCode(c);
  return !!(x.head || x.body || x.blocks.length);
}
async function codeHash(c) {
  const data = new TextEncoder().encode(JSON.stringify(customCode(c)));
  const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
  let site = await db2.getOne("rental_sites", "id=eq." + siteId + "&member_id=eq." + user.id + "&select=*");
  if (!site) {
    const cm = await db2.getOne("site_members", "site_id=eq." + siteId + "&member_id=eq." + user.id + "&status=eq.active&select=site_id");
    const s2 = cm ? await db2.getOne("rental_sites", "id=eq." + siteId + "&select=*") : null;
    if (s2 && s2.tier === "pro") site = s2;
  }
  if (!site) return reply({ error: "not_found", message: "找不到這個網站" }, 404);
  const member = await db2.getOne("members", "id=eq." + user.id + "&select=consented_at,email");
  if (!member || !member.consented_at) return reply({ error: "consent_required", message: "請先同意服務條款與隱私權政策" }, 403);
  if (site.status === "suspended" || site.status === "cancelled") {
    return reply({ error: "not_allowed", message: site.status === "suspended" ? "網站目前已暫停，請聯絡 YC AXIOM（LINE @788cblaq）" : "這個網站已終止服務" }, 403);
  }
  if (site.status === "draft" && !site.terms_accepted_at) return reply({ error: "terms_required", message: "請先閱讀並同意網站租用條款" }, 403);
  const content = normalizeContent(site.content), palette = normalizePalette(site.palette), sections = normalizeSections(site.sections);
  const check = validateForPublish(content, sections, site.slug, site.content, { checkBrand: site.status === "draft", template: site.template });
  if (!check.ok) return reply({ error: "validation", message: "還有必填項目沒完成", errors: check.errors }, 422);
  const since = new Date(now.getTime() - 24 * 3600 * 1e3).toISOString();
  const recent = await db2.list("site_events", "site_id=eq." + siteId + "&type=in.(published_first,version_saved,deploy_queued)&created_at=gte." + encodeURIComponent(since) + "&select=created_at&order=created_at.desc&limit=" + MAX_PER_DAY);
  if (recent.length && now.getTime() - new Date(recent[0].created_at).getTime() < MIN_GAP_SECONDS * 1e3) return reply({ error: "rate_limited", message: "操作太頻繁，請稍候幾秒再試" }, 429);
  if (recent.length >= MAX_PER_DAY) return reply({ error: "rate_limited", message: "今天的發佈次數已達上限，請明天再試" }, 429);
  const version = await db2.insertReturning("site_versions", { site_id: siteId, content, palette, sections, layout: normalizeLayout(site.layout), pages: normalizePages(site.pages) });
  if (!version || !version.id) return reply({ error: "server_error", message: "儲存版本失敗，請稍後再試" }, 500);
  const event = (type, detail) => db2.insert("site_events", { site_id: siteId, type, detail }).catch(() => {
  });
  let codeNote = "";
  if (site.tier === "pro" && hasCustomCode(content)) {
    const hash = await codeHash(content);
    const rv = await db2.getOne("site_code_reviews", "site_id=eq." + siteId + "&hash=eq." + hash + "&select=status");
    if (!rv) {
      await db2.insert("site_code_reviews", { site_id: siteId, hash, status: "pending", version_id: version.id });
      await event("code_review_requested", { version_id: version.id });
      const mail = adminCodeReview({ shopName: content.name, slug: site.slug, memberEmail: member.email || user.email || "", adminUrl: deps.adminUrl });
      await deps.sendMail({ to: deps.adminEmail, ...mail }).catch(() => null);
    }
    const st = rv ? rv.status : "pending";
    if (st === "pending") codeNote = "自訂程式碼需要審核，核准後會自動放進網站。";
    else if (st === "rejected") codeNote = "這段自訂程式碼沒有通過審核，不會放進網站。";
  }
  const withNote = (msg) => codeNote ? msg + codeNote : msg;
  if (site.status === "draft") {
    await db2.patch("rental_sites", "id=eq." + siteId + "&status=eq.draft", { status: "pending" });
    await event("published_first", { version_id: version.id });
    const mail = adminFirstPublish({ shopName: content.name, slug: site.slug, previewUrl: deps.previewBase + "?site=" + siteId, memberEmail: member.email || user.email || "", adminUrl: deps.adminUrl });
    const r = await deps.sendMail({ to: deps.adminEmail, ...mail }).catch((e) => ({ ok: false, error: String(e) }));
    await event(r.ok ? "email_sent" : "email_failed", { template: "adminFirstPublish", ...r.ok ? {} : { error: String(r.error || "").slice(0, 200) } });
    return reply({ ok: true, status: "pending", version_id: version.id, message: withNote("已送出上線申請。我們確認後會為你開通，並以 Email 通知。") }, 200);
  }
  if (site.status === "pending") {
    await event("version_saved", { version_id: version.id });
    return reply({ ok: true, status: "pending", version_id: version.id, message: withNote("已更新送審的內容。網站開通後會使用最新版本。") }, 200);
  }
  await event("deploy_queued", { version_id: version.id });
  const d = await deps.dispatch({ siteId, versionId: version.id }).catch((e) => ({ ok: false, error: String(e) }));
  if (!d.ok) {
    await event("deploy_failed", { message: "無法啟動部署：" + String(d.error || "").slice(0, 200), version_id: version.id });
    return reply({ error: "dispatch_failed", message: "更新沒有送出成功，請稍後再按一次發佈。你的網站仍維持舊版上線。" }, 502);
  }
  return reply({ ok: true, status: site.status, updating: true, version_id: version.id, message: withNote("更新已送出，約 1–2 分鐘後生效。") }, 200);
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
