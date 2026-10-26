// 內容 JSON 的上限、預設值與正規化。編輯器、Edge Function、建置腳本共用同一份。
import { safeHttpsUrl, cleanPhone, clip } from './escape.js';
import { isValidPaletteId } from './palettes.js';

export const LIMITS = {
  name: 40, tagline: 60, intro: 600, address: 120, phone: 24, hoursNote: 80,
  bookingLabel: 12, menu: 12, menuName: 40, price: 99999,
  faq: 8, faqQ: 60, faqA: 300, news: 6, newsTitle: 60,
  room: 6, alt: 60, social: 200,
  reviews: 6, reviewName: 20, reviewText: 200
};
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
    ga4: ''                      // Google Analytics 4 評估 ID（G-XXXXXXX），選填
  };
}

// YouTube 網址 → 影片 ID（watch?v=、youtu.be/、shorts/、embed/、live/）；不是 YouTube 就回傳空字串
export function youtubeId(url) {
  const u = String(url || '').trim();
  const m = u.match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/);
  return m ? m[1] : '';
}
export const GA4_RE = /^G-[A-Z0-9]{4,15}$/;
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
  c.showMap = r.showMap === true;
  const vid = youtubeId(r.video);
  c.video = vid ? 'https://www.youtube.com/watch?v=' + vid : '';
  c.reviews = arr(r.reviews).slice(0, LIMITS.reviews).map((x) => {
    const o = x && typeof x === 'object' ? x : {};
    return { name: line(o.name, LIMITS.reviewName), text: str(o.text, LIMITS.reviewText) };
  });
  const ga = String(r.ga4 || '').trim().toUpperCase();
  c.ga4 = GA4_RE.test(ga) ? ga : '';
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
