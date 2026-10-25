import { esc, paragraphs, safeHttpsUrl, telHref } from '../shared/escape.js';
import { buildHead } from '../shared/seo.js';
import { liveMenu, liveFaq, liveNews } from '../shared/content.js';
import { groupHours, hoursSummary, hasAnyHours } from '../shared/hours.js';
import { pagesFor } from '../shared/pages.js';
import { baseCss } from './styles.js';

// 多頁版首頁放前幾題常見問題（含 FAQPage 結構化資料），其餘在常見問題頁
export const FAQ_TEASER = 3;
const PH_NAME = '店名', PH_TAG = '一句話介紹你的店', PH_ADDR = '店家地址', PH_PHONE = '電話';

// 頁面輸出的小工具。m.page：目前輸出的頁面 key；m.layout：single／multi；m.pageList：會輸出的頁面（含首頁）
function ctx(m) {
  const { content: c, preview } = m;
  const ph = (hint) => (preview ? '<span class="ph">[' + esc(hint) + ']</span>' : '');
  const nm = c.name || (preview ? '[店名]' : '本店');
  const region = m.address.region;
  const t = m.tpl;   // 行業設定：kindLabel、offer、space、visit
  return {
    c, m, t, ph, nm, region, preview,
    label: Object.fromEntries(pagesFor(t.id).map((p) => [p.key, p.label])),
    name: c.name ? esc(c.name) : ph(PH_NAME),
    tel: telHref(c.phone),
    bookUrl: safeHttpsUrl(c.booking.url),
    menu: liveMenu(c), faq: liveFaq(c), news: liveNews(c),
    mapUrl: c.address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.address) : '',
    plainAddr: region ? m.address.region + m.address.street : c.address,   // 內文敘述不帶郵遞區號
    on: (key) => m.pageList.some((p) => p.key === key)
  };
}

function img(x, role, p, alt, eager) {
  const tall = p.w && p.h && p.h > p.w;
  return '<img src="' + esc(x.m.imageSrc(role, p)) + '" alt="' + esc(p.alt || alt) + '"' +
    (p.w ? ' width="' + p.w + '" height="' + p.h + '"' : '') + (tall ? ' class="tall"' : '') +
    (eager === 'high' ? ' fetchpriority="high" decoding="async"' : eager ? ' decoding="async"' : ' loading="lazy" decoding="async"') + '>';
}
const more = (x, key, text) => '<p class="more"><a href="' + esc(x.m.href(key)) + '">' + text + '</a></p>';

// ── 首頁主視覺 ──
function heroSec(x) {
  const { c, preview } = x;
  const heroPhoto = c.photos.hero;
  const full = c.heroStyle === 'full' && (heroPhoto || preview);
  const heroImg = heroPhoto ? img(x, 'hero', heroPhoto, x.nm + ' 店家主視覺', 'high')
    : (preview ? '<div class="ph-img">[主視覺照片]</div>' : '');
  const actions = [];
  if (x.bookUrl && c.booking.label) actions.push('<a class="btn" href="' + esc(x.bookUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(c.booking.label) + '</a>');
  else if (preview) actions.push('<span class="btn ph">[訂位按鈕]</span>');
  if (x.tel) actions.push('<a class="btn ghost" href="' + esc(x.tel) + '">撥打電話</a>');
  const text = '<div class="hero-text"><p class="kicker">' + (x.region ? esc(x.region) + '｜' : '') + esc(x.t.kindLabel) + '</p>' +
    '<h1>' + x.name + '</h1>' +
    '<p class="lead">' + (c.tagline ? esc(c.tagline) : x.ph(PH_TAG)) + '</p>' +
    (actions.length ? '<div class="actions">' + actions.join('') + '</div>' : '') + '</div>';
  if (full) return '<section class="hero full" id="top"><figure>' + heroImg + '</figure><div class="wrap">' + text + '</div></section>';
  return '<section class="hero" id="top"><div class="wrap hero-grid">' + text + '<figure>' + heroImg + '</figure></div></section>';
}

// ── 子頁的頁首（多頁版每頁一個 h1）──
// 子頁頁首：頁名（h1）＋一段介紹（與 meta description 相同）；本頁沒有照片時放主視覺照片
function pageHead(x, title, key) {
  const hero = x.c.photos.hero;
  const withImg = hero && !['interior', 'about'].includes(key);
  const text = '<div><p class="kicker">' + x.name + '</p><h1>' + title + '</h1><p class="lead">' + esc(x.m.description) + '</p></div>';
  if (!withImg) return '<section class="page-head" id="top"><div class="wrap">' + text + '</div></section>';
  return '<section class="page-head" id="top"><div class="wrap hero-grid">' + text + '<figure>' + img(x, 'hero', hero, x.nm + ' 店家主視覺', 'high') + '</figure></div></section>';
}

// 子頁底部：來店資訊摘要（每頁都有店名、地址、電話，有利在地搜尋）
function contactStrip(x) {
  const { c } = x;
  const hs = hasAnyHours(c.hours) ? hoursSummary(c.hours) : '';
  const rows = [];
  if (c.address) rows.push('<dt>地址</dt><dd>' + esc(c.address) + (x.mapUrl ? '（<a href="' + esc(x.mapUrl) + '" target="_blank" rel="noopener noreferrer">Google 地圖</a>）' : '') + '</dd>');
  if (c.phone) rows.push('<dt>電話</dt><dd>' + (x.tel ? '<a href="' + esc(x.tel) + '">' + esc(c.phone) + '</a>' : esc(c.phone)) + '</dd>');
  if (hs) rows.push('<dt>營業時間</dt><dd>' + esc(hs) + '</dd>');
  if (!rows.length) return '';
  return '<section class="contact-strip"><div class="wrap"><h2>' + x.name + ' ' + esc(x.t.visit.label) + '</h2><dl class="info">' + rows.join('') + '</dl>' +
    (x.on('visit') ? more(x, 'visit', '交通與完整' + esc(x.t.visit.label)) : more(x, 'home', '回首頁')) + '</div></section>';
}

// 自動產生的介紹句（店名、位置、菜單價格區間）
function autoAbout(x) {
  const { c } = x;
  if (!c.name) return [];
  let s = esc(c.name) + (c.address ? '位於' + esc(x.plainAddr) : '') + '，是一間' + (x.region ? esc(x.region) + '的' : '') + esc(x.t.kindLabel) + '。';
  if (x.menu.length && x.m.show.menu) {
    const prices = x.menu.map((i) => i.price).filter((i) => i != null);
    s += x.t.offer.provide + esc(x.menu.slice(0, 4).map((i) => i.name).join('、')) + '等' + x.t.offer.item;
    if (prices.length) {
      const lo = Math.min(...prices), hi = Math.max(...prices);
      s += lo === hi ? '，價格為 NT$ ' + lo : '，價格大約落在 NT$ ' + lo + ' 到 NT$ ' + hi + ' 之間';
    }
    s += '。';
  }
  return [s];
}

// ── 關於 ── mode: 'section'（一頁版）｜'page'（多頁版關於頁，含配圖）｜'teaser'（多頁版首頁摘要）
function aboutSec(x, mode) {
  const { c, preview } = x;
  const paras = paragraphs(c.intro);
  let body;
  if (mode === 'teaser') {
    // 首頁保留完整介紹（AI 搜尋與搜尋引擎最看重首頁的文字量）；關於頁另外有配圖
    body = (paras.length ? paras.map((p) => '<p>' + esc(p) + '</p>').join('') : (preview ? '<p>' + x.ph('店家介紹') + '</p>' : '')) +
      autoAbout(x).map((p) => '<p>' + p + '</p>').join('') + (x.on('about') ? more(x, 'about', '認識我們') : '');
  } else {
    body = (paras.length ? paras.map((p) => '<p>' + esc(p) + '</p>').join('') : (preview ? '<p>' + x.ph('店家介紹：這間店的故事、特色與想讓客人知道的事') + '</p>' : '')) +
      autoAbout(x).map((p) => '<p>' + p + '</p>').join('');
  }
  const photo = mode === 'page' && c.photos.room[0];
  const h = mode === 'page' ? '' : '<h2>關於' + x.name + '</h2>';
  if (photo) {
    return '<section class="about split" id="about"><div class="wrap split-grid"><div>' + body + '</div><figure>' +
      img(x, 'room-1', photo, x.nm + ' ' + x.t.space.label + ' 1', 'high') + '</figure></div></section>';
  }
  return '<section class="about" id="about"><div class="wrap">' + h + body + '</div></section>';
}

// ── 菜單 ── limit：首頁摘要只列前幾項
function menuSec(x, mode) {
  const items = x.menu.length ? x.menu : (x.preview ? [{ name: null, price: null }, { name: null, price: null }, { name: null, price: null }] : []);
  const list = mode === 'teaser' ? items.slice(0, 4) : items;
  if (mode === 'page') {
    // 價目頁用表格：AI 搜尋與搜尋引擎較容易正確引用名稱與價格
    return '<section id="menu"><div class="wrap"><table class="price-table"><caption class="sr">' + esc(x.t.offer.label) + '</caption>' +
      '<thead><tr><th scope="col">' + esc(x.t.offer.item) + '</th><th scope="col">價格</th></tr></thead><tbody>' +
      list.map((i) => '<tr><th scope="row">' + (i.name ? esc(i.name) : x.ph(x.t.offer.item + '名稱')) + '</th><td>' + (i.price != null ? 'NT$ ' + i.price : x.ph('價格')) + '</td></tr>').join('') +
      '</tbody></table><p class="note">' + esc(x.t.offer.note) + '</p></div></section>';
  }
  return '<section id="menu"><div class="wrap"><h2>' + esc(x.t.offer.label) + '</h2><ul class="menu">' +
    list.map((i) => '<li><span>' + (i.name ? esc(i.name) : x.ph(x.t.offer.item + '名稱')) + '</span><span class="price">' +
      (i.price != null ? 'NT$ ' + i.price : x.ph('價格')) + '</span></li>').join('') + '</ul>' +
    (mode === 'teaser' ? more(x, 'menu', esc(x.t.offer.more)) : '<p class="note">' + esc(x.t.offer.note) + '</p>') + '</div></section>';
}

// ── 店內環境 ──
function interiorSec(x, mode) {
  const rooms = x.c.photos.room;
  const list = mode === 'teaser' ? rooms.slice(0, 3) : rooms;
  // 照片頁：照片就是主要內容，全部直接載入（第一張優先）；其他頁的照片延遲載入
  const figs = list.map((p, i) => '<figure>' + img(x, 'room-' + (i + 1), p, x.nm + ' ' + x.t.space.label + ' ' + (i + 1), mode === 'page' && (i === 0 ? 'high' : true)) + '</figure>');
  if (!rooms.length && x.preview) for (let i = 0; i < 3; i++) figs.push('<figure><div class="ph-img">[照片 ' + (i + 1) + ']</div></figure>');
  return '<section id="interior"><div class="wrap">' + (mode === 'page' ? '' : '<h2>' + esc(x.t.space.label) + '</h2>') + '<div class="gallery">' + figs.join('') + '</div>' +
    (mode === 'teaser' ? more(x, 'interior', esc(x.t.space.more)) : '') + '</div></section>';
}

// ── 最新消息 ──
function newsSec(x, mode) {
  const items = x.news.length ? x.news : (x.preview ? [{ date: '', title: '' }, { date: '', title: '' }] : []);
  const list = mode === 'teaser' ? items.slice(0, 2) : items;
  return '<section id="news"><div class="wrap">' + (mode === 'page' ? '' : '<h2>最新消息</h2>') + '<ul class="news">' +
    list.map((i) => '<li>' + (i.date ? '<time datetime="' + esc(i.date) + '">' + esc(i.date.replace(/-/g, '/')) + '</time>' : '<span>' + x.ph('日期') + '</span>') +
      '<span>' + (i.title ? esc(i.title) : x.ph('消息標題')) + '</span></li>').join('') + '</ul>' +
    (mode === 'teaser' ? more(x, 'news', '所有消息') : '') + '</div></section>';
}

// ── 常見問題 ──
function faqSec(x, mode) {
  const items = x.faq.length ? x.faq : (x.preview ? [{ q: '', a: '' }, { q: '', a: '' }] : []);
  const q = (s) => (/[？?]$/.test(s) ? s : s + '？');
  const hq = mode === 'page' ? 'h2' : 'h3';
  const list = mode === 'teaser' ? items.slice(0, FAQ_TEASER) : items;
  return '<section id="faq"><div class="wrap">' + (mode === 'page' ? '' : '<h2>常見問題</h2>') +
    list.map((i) => '<div class="faq-item"><' + hq + '>' + (i.q ? esc(q(i.q)) : x.ph('你的問題')) + '</' + hq + '><p>' + (i.a ? esc(i.a) : x.ph('你的回答')) + '</p></div>').join('') +
    (mode === 'teaser' && items.length > FAQ_TEASER ? more(x, 'faq', '看所有問題') : '') + '</div></section>';
}

// ── 來店資訊 ── mode 'teaser'：首頁只放地址、電話、營業時間摘要與連結
function visitSec(x, mode) {
  const { c } = x;
  const hasHours = hasAnyHours(c.hours);
  const addrDd = c.address ? esc(c.address) + (x.mapUrl ? '（<a href="' + esc(x.mapUrl) + '" target="_blank" rel="noopener noreferrer">Google 地圖</a>）' : '') : x.ph(PH_ADDR);
  const telDd = c.phone ? (x.tel ? '<a href="' + esc(x.tel) + '">' + esc(c.phone) + '</a>' : esc(c.phone)) : x.ph(PH_PHONE);
  const h2 = mode === 'page' ? '' : '<h2>' + esc(x.t.visit.label) + '</h2>';
  if (mode === 'teaser') {
    return '<section id="visit"><div class="wrap">' + h2 + '<dl class="info"><dt>地址</dt><dd>' + addrDd + '</dd><dt>電話</dt><dd>' + telDd + '</dd>' +
      (hasHours ? '<dt>營業時間</dt><dd>' + esc(hoursSummary(c.hours)) + '</dd>' : '') + '</dl>' + more(x, 'visit', '交通與完整營業時間') + '</div></section>';
  }
  const groups = groupHours(c.hours);
  const hoursTable = groups.length
    ? '<table class="hours"><caption class="sr">營業時間</caption><tbody>' +
      groups.map((g) => '<tr><th scope="row">' + esc(g.label) + '</th><td>' + esc(g.text) + '</td></tr>').join('') + '</tbody></table>'
    : (x.preview ? '<p>' + x.ph('營業時間') + '</p>' : '');
  const social = [['Instagram', c.social.instagram], ['Facebook', c.social.facebook], ['LINE', c.social.line]].filter((s) => s[1]);
  const text = [];
  if (c.name && c.address) text.push(esc(c.name) + '的地址是' + esc(x.plainAddr) + '，可以用地圖連結直接導航。');
  if (hasHours) text.push('營業時間為' + esc(hoursSummary(c.hours)) + '。' + (c.hoursNote ? esc(c.hoursNote) : ''));
  if (c.phone) text.push(x.t.visit.ask + '，歡迎來電 ' + esc(c.phone) + '。');
  if (x.bookUrl && c.booking.label) text.push('也可以點選頁面上的「' + esc(c.booking.label) + '」按鈕直接預約。');
  const hh = mode === 'page' ? 'h2' : 'h3';
  return '<section id="visit"><div class="wrap">' + h2 + '<div class="visit-grid"><div>' +
    '<dl class="info"><dt>地址</dt><dd>' + addrDd + '</dd><dt>電話</dt><dd>' + telDd + '</dd>' +
    (social.length ? '<dt>社群</dt><dd class="social">' + social.map((s) => '<a href="' + esc(s[1]) + '" target="_blank" rel="noopener noreferrer me">' + s[0] + '</a>').join('') + '</dd>' : '') +
    '</dl></div><div><' + hh + ' class="sub">營業時間</' + hh + '>' + hoursTable +
    (c.hoursNote ? '<p class="note">' + esc(c.hoursNote) + '</p>' : '') + '</div></div>' +
    (text.length ? '<div class="visit-text">' + text.map((p) => '<p>' + p + '</p>').join('') + '</div>' : '') +
    '</div></section>';
}

// 一頁版：全部區塊在首頁
function singleMain(x) {
  const s = x.m.show;
  return [heroSec(x), aboutSec(x, 'section'), s.menu ? menuSec(x, 'section') : '', s.interior ? interiorSec(x, 'section') : '',
    s.news ? newsSec(x, 'section') : '', s.faq ? faqSec(x, 'section') : '', visitSec(x, 'section')];
}

// 多頁版首頁：主視覺 + 各頁摘要（頁面有開才放）；來店資訊頁沒開時把完整資訊放首頁
function multiHomeMain(x) {
  const s = x.m.show;
  return [heroSec(x), aboutSec(x, 'teaser'),
    x.on('menu') && s.menu ? menuSec(x, 'teaser') : '',
    x.on('interior') && s.interior ? interiorSec(x, 'teaser') : '',
    x.on('news') && s.news ? newsSec(x, 'teaser') : '',
    x.on('faq') && s.faq ? faqSec(x, 'teaser') : '',
    x.on('visit') ? visitSec(x, 'teaser') : visitSec(x, 'section')];
}

function multiPageMain(x, key) {
  const title = key === 'about' ? '關於' + x.name : esc(x.label[key]);
  const body = { about: () => aboutSec(x, 'page'), menu: () => menuSec(x, 'page'), interior: () => interiorSec(x, 'page'),
    news: () => newsSec(x, 'page'), faq: () => faqSec(x, 'page'), visit: () => visitSec(x, 'page') }[key];
  return [pageHead(x, title, key), body(), key === 'visit' ? '' : contactStrip(x)];
}

// 區塊交替底色、捲動進場動態（首屏不套用，避免拖慢 LCP）
function finish(sections) {
  let i = 0;
  return sections.filter(Boolean).map((html, idx) => {
    if (idx === 0) return html;
    const cls = (i++ % 2 === 1 ? 'alt ' : '') + 'rv';
    return html.replace(/^<section( class="([^"]*)")?/, (_, __, had) => '<section class="' + (had ? had + ' ' : '') + cls + '"');
  }).join('\n');
}

// 手機漢堡選單與捲動進場（沒有 JavaScript 時選單直接展開、內容直接顯示）
const SCRIPT = '<script>(function(){var d=document.documentElement,b=document.querySelector(".nav-btn"),n=document.getElementById("site-nav");' +
  'if(b&&n){d.classList.add("js-nav");b.hidden=false;var s=function(o){b.setAttribute("aria-expanded",o?"true":"false");n.classList.toggle("open",o)};' +
  'b.addEventListener("click",function(){s(b.getAttribute("aria-expanded")!=="true")});n.addEventListener("click",function(e){if(e.target.tagName==="A")s(false)})}' +
  'if("IntersectionObserver"in window&&!matchMedia("(prefers-reduced-motion: reduce)").matches){d.classList.add("js-rv");' +
  'var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}})},{rootMargin:"0px 0px -8% 0px"});' +
  'document.querySelectorAll(".rv").forEach(function(el){if(el.getBoundingClientRect().top<innerHeight)el.classList.add("in");io.observe(el)});' +
  'addEventListener("beforeprint",function(){document.querySelectorAll(".rv").forEach(function(el){el.classList.add("in")})})}})();</script>';

function render(m) {
  const x = ctx(m);
  const { c } = x;
  const multi = m.layout === 'multi';
  // 一頁版導覽用短名稱（錨點）；多頁版用頁名（連結）
  const short = { about: '關於我們', menu: x.t.offer.nav, interior: x.t.space.label, news: '最新消息', faq: '常見問題', visit: x.t.visit.label };
  const navItems = multi
    ? m.pageList.filter((p) => p.key !== 'home').map((p) => [p.key, esc(p.label), m.href(p.key)])
    : [['about', true], ['menu', m.show.menu], ['interior', m.show.interior], ['news', m.show.news], ['faq', m.show.faq], ['visit', true]]
      .filter((i) => i[1]).map((i) => [i[0], esc(short[i[0]]), '#' + i[0]]);
  const nav = navItems.map((i) => '<a href="' + esc(i[2]) + '"' + (multi && i[0] === m.page ? ' aria-current="page"' : '') + '>' + i[1] + '</a>').join('');
  const main = multi ? (m.page === 'home' ? multiHomeMain(x) : multiPageMain(x, m.page)) : singleMain(x);
  const footNav = multi ? '<nav class="foot-nav" aria-label="頁尾選單"><a href="' + esc(m.href('home')) + '">首頁</a>' + navItems.map((i) => '<a href="' + esc(i[2]) + '">' + i[1] + '</a>').join('') + '</nav>' : '';
  const footer = '<footer><div class="wrap"><span>© ' + new Date().getFullYear() + ' ' + (c.name ? esc(c.name) : x.ph(PH_NAME)) + '</span>' + footNav + '</div></footer>';
  return '<!doctype html>\n<html lang="zh-Hant">\n<head>\n' + buildHead(m) + '\n<style>' + baseCss(m.colors) + '</style>\n</head>\n<body>\n' +
    '<a class="skip" href="#main">跳到主要內容</a>\n' +
    '<header class="top"><div class="wrap"><a class="brand" href="' + esc(multi ? m.href('home') : '#top') + '">' + x.name + '</a>' +
    '<button class="nav-btn" type="button" aria-expanded="false" aria-controls="site-nav" hidden><span class="bars" aria-hidden="true"></span>選單</button>' +
    '<nav id="site-nav" aria-label="頁面選單">' + nav + '</nav></div></header>\n' +
    '<main id="main">\n' + finish(main) + '\n</main>\n' + footer + '\n' + SCRIPT + '\n</body>\n</html>\n';
}

// 404 頁：不存在的網址回傳真正的 404（避免「軟 404」被當成重複首頁收錄）。
// 部署在網站根目錄，但可能從任何深度的網址顯示，所以連結一律用根目錄路徑。
function renderNotFound(m) {
  const c = m.content;
  const name = c.name ? esc(c.name) : '';
  const links = [['/', '回首頁'], ...m.pageList.filter((p) => p.key !== 'home').map((p) => ['/' + p.path, p.label])];
  return '<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>找不到這個頁面' + (name ? '｜' + name : '') + '</title>\n<meta name="robots" content="noindex">\n' +
    '<style>' + baseCss(m.colors) + '</style>\n</head>\n<body>\n' +
    '<header class="top"><div class="wrap"><a class="brand" href="/">' + name + '</a></div></header>\n' +
    '<main id="main"><section class="page-head"><div class="wrap"><p class="kicker">404</p><h1>找不到這個頁面</h1>' +
    '<p class="lead">網址可能打錯了，或這個頁面已經不存在。</p><p class="more">' +
    links.map((l) => '<a href="' + esc(l[0]) + '">' + esc(l[1]) + '</a>').join('　') + '</p></div></section></main>\n' +
    '<footer><div class="wrap"><span>© ' + new Date().getFullYear() + ' ' + name + '</span></div></footer>\n</body>\n</html>\n';
}

// 依行業設定產生版型物件：版面與流程全行業共用，只有用詞與 schema.org 類型不同
export function makeTemplate(industry) {
  return {
    id: industry.key, label: industry.label, kindLabel: industry.kindLabel, schemaType: industry.schemaType,
    offer: industry.offer, space: industry.space, visit: industry.visit, render, renderNotFound
  };
}
