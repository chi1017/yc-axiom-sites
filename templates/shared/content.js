// 內容 JSON 的上限、預設值與正規化。編輯器、Edge Function、建置腳本共用同一份。
import { safeHttpsUrl, cleanPhone, clip } from './escape.js';
import { isValidPaletteId } from './palettes.js';

export const LIMITS = {
  name: 40, tagline: 60, intro: 600, address: 120, phone: 24, hoursNote: 80,
  bookingLabel: 12, menu: 12, menuName: 40, price: 99999,
  faq: 8, faqQ: 60, faqA: 300, news: 6, newsTitle: 60,
  room: 6, alt: 60, social: 200,
  reviews: 6, reviewName: 20, reviewText: 200,
  posts: 12, postTitle: 60, postBody: 3000,
  enName: 60, enTagline: 100, enIntro: 1000, enAddress: 160,
  shopItems: 24, shopName: 40, shopDesc: 200, shopPrice: 200000, shopNote: 300, deposit: 100000,
  blocks: 6, blockTitle: 40, blockBody: 1500, btnLabel: 16, seoTitle: 60, seoDesc: 160, sub: 60
};
// 首頁區塊（可調整順序）。主視覺固定在最上面；自訂區塊的 key 是 'b:<代碼>'
export const ORDER_KEYS = ['about', 'video', 'menu', 'interior', 'shop', 'reviews', 'news', 'posts', 'faq', 'blocks', 'booking', 'visit', 'contact'];
export const ORDER_LABELS = { about: '關於我們', video: '影片', menu: '價目', interior: '環境照片', shop: '線上購買', reviews: '客人評價', news: '最新消息', posts: '文章', faq: '常見問題', booking: '線上預約', visit: '來店資訊', contact: '聯絡表單' };
export const BLOCK_ID_RE = /^[a-z0-9]{4,12}$/;
// 標題字型：serif＝明體（預設）、sans＝黑體、round＝圓體（jf open 粉圓）、kai＝楷體（霞鶩文楷）
export const FONTS = ['serif', 'sans', 'round', 'kai'];
export const FONT_LABELS = { serif: '明體（典雅）', sans: '黑體（俐落）', round: '圓體（親切）', kai: '楷體（手寫感）' };
export const BUTTONS = ['pill', 'round', 'square'];
export const BUTTON_LABELS = { pill: '膠囊', round: '圓角', square: '方角' };
// 外觀細節：背景紋理、捲動動畫、區塊排版（全部用 CSS 做，不增加網站載入的程式）
export const TEXTURES = ['none', 'paper', 'dots', 'grid', 'glow', 'contour'];
export const TEXTURE_LABELS = { none: '無', paper: '紙張顆粒', dots: '細點', grid: '方格紙', glow: '柔光暈染', contour: '等高線' };
// 區塊標題樣式：plain＝只有標題、num＝編號（01、02…，像雜誌目錄）、bar＝左側色塊、chip＝標題上方的小標籤
export const HEAD_STYLES = ['plain', 'num', 'bar', 'chip'];
export const HEAD_LABELS = { plain: '簡潔', num: '編號', bar: '左側色塊', chip: '上方小標籤' };
export const MOTIONS = ['rise', 'fade', 'zoom', 'none'];
export const MOTION_LABELS = { rise: '向上浮現', fade: '淡入', zoom: '輕微放大', none: '不要動畫' };
export const MENU_STYLES = ['list', 'cards'];
export const GALLERY_STYLES = ['masonry', 'grid', 'slide'];
export const REVIEW_STYLES = ['cards', 'quote'];
// 可以加副標題的區塊
export const SUB_KEYS = ['about', 'video', 'menu', 'interior', 'shop', 'reviews', 'news', 'posts', 'faq', 'booking', 'visit', 'contact'];
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_LABELS = { mon: '週一', tue: '週二', wed: '週三', thu: '週四', fri: '週五', sat: '週六', sun: '週日' };
export const HERO_STYLES = ['card', 'full'];
// 首頁樣式：standard＝區塊依序排列；magazine＝滿版主視覺＋圖文左右交錯大區塊＋資訊帶＋照片牆（雜誌式）
export const HOME_STYLES = ['standard', 'magazine'];
export const SECTION_KEYS = ['menu', 'interior', 'faq', 'news'];
export const SECTION_LABELS = { menu: '菜單', interior: '店內環境', faq: '常見問題', news: '最新消息' };

export function emptyHours() {
  const h = {};
  DAYS.forEach((d) => { h[d] = { open: '', close: '', closed: false }; });
  return h;
}
export function emptyContent() {
  return {
    name: '', tagline: '', intro: '', address: '', phone: '',
    social: { instagram: '', facebook: '', line: '' },
    hours: emptyHours(), hoursNote: '',
    booking: { label: '', url: '' },
    photos: { hero: null, room: [] },
    heroStyle: 'card',
    homeStyle: 'standard',
    menu: [], faq: [], news: [],
    // 更多內容（都是選用）
    contactForm: false,          // 網站顯示聯絡表單，留言寄到網站擁有者的 Email
    showMap: false,              // 來店資訊顯示 Google 地圖（依地址）
    video: '',                   // YouTube 影片網址
    reviews: [],                 // 客人評價 [{ name, text }]
    ga4: '',                     // Google Analytics 4 評估 ID（G-XXXXXXX），選填
    posts: [],                   // 文章 [{ id, title, date, body }]：每篇一個網頁 posts/<id>/
    bookingForm: false,          // 線上預約表單（客人送出預約申請，店家收到通知後再確認）
    en: { enabled: false, name: '', tagline: '', intro: '', address: '' },   // 英文版頁面 /en/
    // 線上購買：店家用自己的綠界帳號收款（金鑰在會員專區設定，不放在內容裡）
    shop: { enabled: false, items: [], note: '' },   // items: [{ id, name, price, desc, photo }]
    bookingDeposit: 0,           // 線上預約要先付的訂金（0＝不收）
    order: [],                   // 首頁區塊順序（ORDER_KEYS 與 'b:<代碼>'）；空的＝預設順序
    blocks: [],                  // 自訂圖文區塊 [{ id, title, body, photo, btnLabel, btnUrl, side, hidden }]
    style: { font: 'serif', button: 'pill', floatLine: false, texture: 'none', motion: 'rise', head: 'plain', menuStyle: 'list', gallery: 'masonry', reviewStyle: 'cards' },
    subs: {},                    // 各區塊標題下方的一句副標題（選填）
    seo: { title: '', description: '', share: null }              // 自訂首頁標題、描述、分享圖片（空的＝自動產生）
  };
}

// YouTube 網址 → 影片 ID（watch?v=、youtu.be/、shorts/、embed/、live/）；不是 YouTube 就回傳空字串
export function youtubeId(url) {
  const u = String(url || '').trim();
  const m = u.match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/);
  return m ? m[1] : '';
}
export const GA4_RE = /^G-[A-Z0-9]{4,15}$/;
// 文章網址代碼（posts/<id>/）：建立時由編輯器產生，之後不變
export const POST_ID_RE = /^[a-z0-9][a-z0-9-]{4,38}[a-z0-9]$/;
// 商品代碼：建立時由編輯器產生，之後不變（結帳時用代碼對價格，不相信瀏覽器送來的金額）
export const ITEM_ID_RE = /^[a-z0-9]{4,12}$/;
export function defaultSections() { return { menu: true, interior: true, faq: true, news: true }; }

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export function validTime(t) { return TIME_RE.test(String(t || '')); }
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function validDate(d) {
  if (!DATE_RE.test(String(d || ''))) return false;
  const t = new Date(d + 'T00:00:00Z');
  return !isNaN(t) && t.toISOString().slice(0, 10) === d;
}

const str = (v, n) => clip(String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim(), n);
const line = (v, n) => str(v, n).replace(/\s*\n\s*/g, ' ');
const arr = (v) => (Array.isArray(v) ? v : []);

function intIn(v, min, max) {
  let n = typeof v === 'string' ? v.replace(/[,\s$NT元]/gi, '') : v;
  if (n === '' || n == null) return null;
  n = Math.round(Number(n));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function photo(p) {
  if (!p || typeof p !== 'object') return null;
  const path = String(p.path || '').trim();
  if (!path || path.length > 200 || /\.\./.test(path) || /^\//.test(path)) return null;
  const o = { path };
  const w = Math.round(Number(p.w)), h = Math.round(Number(p.h));
  if (w > 0 && h > 0 && w <= 10000 && h <= 10000) { o.w = w; o.h = h; }
  const alt = line(p.alt, LIMITS.alt);
  if (alt) o.alt = alt;
  return o;
}

// 不信任任何輸入：回傳一定符合結構的內容。不會丟例外。
export function normalizeContent(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const c = emptyContent();
  c.name = line(r.name, LIMITS.name);
  c.tagline = line(r.tagline, LIMITS.tagline);
  c.intro = str(r.intro, LIMITS.intro);
  c.address = line(r.address, LIMITS.address);
  c.phone = clip(cleanPhone(r.phone), LIMITS.phone);
  c.hoursNote = line(r.hoursNote, LIMITS.hoursNote);

  const s = r.social && typeof r.social === 'object' ? r.social : {};
  ['instagram', 'facebook', 'line'].forEach((k) => { c.social[k] = clip(safeHttpsUrl(s[k]), LIMITS.social); });

  const h = r.hours && typeof r.hours === 'object' ? r.hours : {};
  DAYS.forEach((d) => {
    const x = h[d] && typeof h[d] === 'object' ? h[d] : {};
    const closed = x.closed === true;
    c.hours[d] = {
      open: validTime(x.open) ? x.open : '',
      close: validTime(x.close) ? x.close : '',
      closed
    };
    if (closed) { c.hours[d].open = ''; c.hours[d].close = ''; }
  });

  const b = r.booking && typeof r.booking === 'object' ? r.booking : {};
  c.booking = { label: line(b.label, LIMITS.bookingLabel), url: clip(safeHttpsUrl(b.url), 500) };

  const ph = r.photos && typeof r.photos === 'object' ? r.photos : {};
  c.photos.hero = photo(ph.hero);
  c.photos.room = arr(ph.room).map(photo).filter(Boolean).slice(0, LIMITS.room);
  // 主視覺樣式：card＝右側圓角照片（原本的樣式，舊網站預設）；full＝滿版大圖疊字
  c.heroStyle = HERO_STYLES.includes(r.heroStyle) ? r.heroStyle : 'card';
  c.homeStyle = HOME_STYLES.includes(r.homeStyle) ? r.homeStyle : 'standard';

  c.menu = arr(r.menu).slice(0, LIMITS.menu).map((m) => {
    const o = m && typeof m === 'object' ? m : {};
    let p = o.price;
    if (typeof p === 'string') p = p.replace(/[,\s$NT元]/gi, '');
    p = p === '' || p == null ? null : Number(p);
    if (p != null && (!Number.isFinite(p) || p < 0 || p > LIMITS.price)) p = null;
    if (p != null) p = Math.round(p);
    return { name: line(o.name, LIMITS.menuName), price: p };
  });
  c.faq = arr(r.faq).slice(0, LIMITS.faq).map((f) => {
    const o = f && typeof f === 'object' ? f : {};
    return { q: line(o.q, LIMITS.faqQ), a: str(o.a, LIMITS.faqA) };
  });
  c.news = arr(r.news).slice(0, LIMITS.news).map((n) => {
    const o = n && typeof n === 'object' ? n : {};
    return { date: validDate(o.date) ? o.date : '', title: line(o.title, LIMITS.newsTitle) };
  });
  c.contactForm = r.contactForm === true;
  c.bookingForm = r.bookingForm === true;
  const en = r.en && typeof r.en === 'object' ? r.en : {};
  c.en = { enabled: en.enabled === true, name: line(en.name, LIMITS.enName), tagline: line(en.tagline, LIMITS.enTagline), intro: str(en.intro, LIMITS.enIntro), address: line(en.address, LIMITS.enAddress) };
  c.showMap = r.showMap === true;
  const vid = youtubeId(r.video);
  c.video = vid ? 'https://www.youtube.com/watch?v=' + vid : '';
  c.reviews = arr(r.reviews).slice(0, LIMITS.reviews).map((x) => {
    const o = x && typeof x === 'object' ? x : {};
    return { name: line(o.name, LIMITS.reviewName), text: str(o.text, LIMITS.reviewText) };
  });
  const seen = new Set();
  c.posts = arr(r.posts).slice(0, LIMITS.posts).map((x) => {
    const o = x && typeof x === 'object' ? x : {};
    let id = String(o.id || '').toLowerCase();
    if (!POST_ID_RE.test(id) || seen.has(id)) id = '';
    if (id) seen.add(id);
    return { id, title: line(o.title, LIMITS.postTitle), date: validDate(o.date) ? o.date : '', body: str(o.body, LIMITS.postBody) };
  });
  const ga = String(r.ga4 || '').trim().toUpperCase();
  c.ga4 = GA4_RE.test(ga) ? ga : '';
  const sh = r.shop && typeof r.shop === 'object' ? r.shop : {};
  const ids = new Set();
  c.shop = {
    enabled: sh.enabled === true,
    note: str(sh.note, LIMITS.shopNote),
    items: arr(sh.items).slice(0, LIMITS.shopItems).map((x) => {
      const o = x && typeof x === 'object' ? x : {};
      let id = String(o.id || '').toLowerCase();
      if (!ITEM_ID_RE.test(id) || ids.has(id)) id = '';
      if (id) ids.add(id);
      return { id, name: line(o.name, LIMITS.shopName), price: intIn(o.price, 1, LIMITS.shopPrice), desc: str(o.desc, LIMITS.shopDesc), photo: photo(o.photo) };
    })
  };
  c.bookingDeposit = intIn(r.bookingDeposit, 0, LIMITS.deposit) || 0;
  const bids = new Set();
  c.blocks = arr(r.blocks).slice(0, LIMITS.blocks).map((x) => {
    const o = x && typeof x === 'object' ? x : {};
    let id = String(o.id || '').toLowerCase();
    if (!BLOCK_ID_RE.test(id) || bids.has(id)) id = '';
    if (id) bids.add(id);
    return { id, title: line(o.title, LIMITS.blockTitle), body: str(o.body, LIMITS.blockBody), photo: photo(o.photo),
      btnLabel: line(o.btnLabel, LIMITS.btnLabel), btnUrl: clip(safeHttpsUrl(o.btnUrl), 500), side: o.side === 'left' ? 'left' : 'right', hidden: o.hidden === true };
  }).filter((b) => b.id);
  c.order = normalizeOrder(r.order, c.blocks);
  const st = r.style && typeof r.style === 'object' ? r.style : {};
  const pick = (list, v) => (list.includes(v) ? v : list[0]);
  c.style = { font: FONTS.includes(st.font) ? st.font : 'serif', button: BUTTONS.includes(st.button) ? st.button : 'pill', floatLine: st.floatLine === true,
    texture: pick(TEXTURES, st.texture), motion: pick(MOTIONS, st.motion), head: pick(HEAD_STYLES, st.head),
    menuStyle: pick(MENU_STYLES, st.menuStyle), gallery: pick(GALLERY_STYLES, st.gallery), reviewStyle: pick(REVIEW_STYLES, st.reviewStyle) };
  const sb = r.subs && typeof r.subs === 'object' ? r.subs : {};
  c.subs = {};
  SUB_KEYS.forEach((k) => { const v = line(sb[k], LIMITS.sub); if (v) c.subs[k] = v; });
  const so = r.seo && typeof r.seo === 'object' ? r.seo : {};
  c.seo = { title: line(so.title, LIMITS.seoTitle), description: line(so.description, LIMITS.seoDesc), share: photo(so.share) };
  return c;
}

export function normalizePalette(p) { return isValidPaletteId(p) ? p : 'forest'; }
export function normalizeSections(s) {
  const o = defaultSections();
  const r = s && typeof s === 'object' ? s : {};
  SECTION_KEYS.forEach((k) => { if (typeof r[k] === 'boolean') o[k] = r[k]; });
  return o;
}

// 取出有內容的列表項（上線時會濾掉空白）
export const liveMenu = (c) => c.menu.filter((m) => m.name);
export const liveFaq = (c) => c.faq.filter((f) => f.q && f.a);
export const liveNews = (c) => c.news.filter((n) => n.title);
export const liveReviews = (c) => c.reviews.filter((r) => r.text);
// 上線的文章：有代碼、標題、內容；依日期新到舊
// 區塊順序：保留有效、不重複的 key；缺的依預設順序補回（自訂區塊預設放在常見問題之後）
export function normalizeOrder(raw, blocks) {
  const valid = new Set([...ORDER_KEYS.filter((k) => k !== 'blocks'), ...(blocks || []).map((b) => 'b:' + b.id)]);
  const out = [];
  arr(raw).forEach((k) => { if (typeof k === 'string' && valid.has(k) && !out.includes(k)) out.push(k); });
  const defaults = [];
  ORDER_KEYS.forEach((k) => { if (k === 'blocks') (blocks || []).forEach((b) => defaults.push('b:' + b.id)); else defaults.push(k); });
  defaults.forEach((k, i) => {
    if (out.includes(k)) return;
    // 放在預設順序中「前一個已存在的 key」後面
    let at = 0;
    for (let j = i - 1; j >= 0; j--) { const p = out.indexOf(defaults[j]); if (p >= 0) { at = p + 1; break; } }
    out.splice(at, 0, k);
  });
  return out;
}
export const liveBlocks = (c) => c.blocks.filter((b) => !b.hidden && (b.title || b.body || b.photo));

// 上線的商品：有代碼、名稱、價格
export const liveItems = (c) => c.shop.items.filter((i) => i.id && i.name && i.price);
export const livePosts = (c) => c.posts.filter((p) => p.id && p.title && p.body).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
