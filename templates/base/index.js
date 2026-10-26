import { esc, paragraphs, safeHttpsUrl, telHref, jsonForScript } from '../shared/escape.js';
import { buildHead, buildBusinessLd, absUrl, FAVICON } from '../shared/seo.js';
import { liveMenu, liveFaq, liveNews, liveReviews, livePosts, liveItems, liveBlocks, youtubeId } from '../shared/content.js';
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
    menu: liveMenu(c), faq: liveFaq(c), news: liveNews(c), reviews: liveReviews(c), posts: livePosts(c),
    items: c.shop.enabled ? liveItems(c) : [],
    blocks: preview ? c.blocks.filter((b) => !b.hidden) : liveBlocks(c),
    mapUrl: c.address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.address) : '',
    plainAddr: region ? m.address.region + m.address.street : c.address,   // 內文敘述不帶郵遞區號
    on: (key) => m.pageList.some((p) => p.key === key)
  };
}

// sizes：圖片在版面上的顯示寬度，瀏覽器據此從 srcset 挑小圖（手機）或原圖（電腦）
const EAGER_GALLERY = 2;
const SZ = { full: '100vw', half: '(min-width:760px) 50vw, 100vw', third: '(min-width:760px) 33vw, 50vw' };
function img(x, role, p, alt, eager, sizes = SZ.half) {
  const tall = p.w && p.h && p.h > p.w;
  const set = x.m.srcsetOf ? x.m.srcsetOf(role) : '';
  return '<img src="' + esc(x.m.imageSrc(role, p)) + '"' + (set ? ' srcset="' + esc(set) + '" sizes="' + esc(sizes) + '"' : '') + ' alt="' + esc(p.alt || alt) + '"' +
    (p.w ? ' width="' + p.w + '" height="' + p.h + '"' : '') + (tall ? ' class="tall"' : '') +
    // 非首屏照片標低優先，避免和主視覺（LCP）搶頻寬
    (eager === 'high' ? ' fetchpriority="high" decoding="async"' : eager ? ' decoding="async"' : ' loading="lazy" fetchpriority="low" decoding="async"') + '>';
}
const more = (x, key, text) => '<p class="more"><a href="' + esc(x.m.href(key)) + '">' + text + '</a></p>';

// ── 首頁主視覺 ──
function heroSec(x) {
  const { c, preview } = x;
  const heroPhoto = c.photos.hero;
  const full = (c.heroStyle === 'full' || c.homeStyle === 'magazine') && (heroPhoto || preview);
  const heroImg = heroPhoto ? img(x, 'hero', heroPhoto, x.nm + ' 店家主視覺', 'high', full ? SZ.full : SZ.half)
    : (preview ? '<div class="ph-img">[主視覺照片]</div>' : '');
  const actions = [];
  if (x.bookUrl && c.booking.label) actions.push('<a class="btn" href="' + esc(x.bookUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(c.booking.label) + '</a>');
  else if (c.bookingForm) actions.push('<a class="btn" href="' + esc(x.m.layout === 'multi' && x.on('visit') ? x.m.href('visit') + '#booking' : '#booking') + '">線上預約</a>');
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
// 子頁頁首：頁名（h1）＋一句簡短介紹（直接回答「這頁是什麼」）；本頁沒有照片時放主視覺照片
function pageHead(x, title, key) {
  const hero = x.c.photos.hero;
  const withImg = hero && !['interior', 'about'].includes(key);
  const text = '<div><p class="kicker">' + x.name + '</p><h1>' + title + '</h1><p class="lead">' + esc(x.m.lead || x.m.description) + '</p></div>';
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
  if (hs) rows.push('<dt>營業時間</dt><dd><ul class="hours-list">' + groupHours(c.hours).map((g) => '<li>' + esc(g.label) + ' ' + esc(g.text) + '</li>').join('') + '</ul></dd>');
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
  // 照片頁：前幾張（首屏內）直接載入，其餘延遲載入，避免同時下載搶頻寬拖慢首屏；其他頁的照片都延遲載入
  const figs = list.map((p, i) => '<figure>' + img(x, 'room-' + (i + 1), p, x.nm + ' ' + x.t.space.label + ' ' + (i + 1), mode === 'page' && i < EAGER_GALLERY, SZ.third) + '</figure>');
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
    mapBox(x) + '</div></section>';
}

// ── 文章 ── mode 'teaser'：首頁列最新 3 篇；'page'：文章列表頁列全部
const ymd = (d) => (d ? d.replace(/-/g, '/') : '');
const excerpt = (body, n) => { const t = String(body || '').replace(/\s+/g, ' ').trim(); return [...t].length > n ? [...t].slice(0, n).join('') + '…' : t; };
function postsSec(x, mode) {
  const list = mode === 'teaser' ? x.posts.slice(0, 3) : x.posts;
  if (!list.length) return '';
  return '<section id="posts"><div class="wrap">' + (mode === 'page' ? '' : '<h2>文章</h2>') + '<ul class="posts">' +
    list.map((p) => '<li><a href="' + esc(x.m.postHref(p.id)) + '"><h3>' + esc(p.title) + '</h3></a>' + (p.date ? '<time datetime="' + esc(p.date) + '">' + esc(ymd(p.date)) + '</time>' : '') +
      '<p>' + esc(excerpt(p.body, 80)) + '</p></li>').join('') + '</ul>' +
    (mode === 'teaser' && x.posts.length > 3 ? '<p class="more"><a href="' + esc(x.m.postsHref) + '">看所有文章</a></p>' : '') + '</div></section>';
}
function postMain(x, post) {
  const paras = paragraphs(post.body);
  return ['<section class="page-head" id="top"><div class="wrap"><p class="kicker">' + x.name + (post.date ? '・<time datetime="' + esc(post.date) + '">' + esc(ymd(post.date)) + '</time>' : '') + '</p><h1>' + esc(post.title) + '</h1></div></section>',
    '<section id="article"><div class="wrap"><article class="post-body">' + paras.map((t) => '<p>' + esc(t) + '</p>').join('') + '</article>' +
      '<p class="more"><a href="' + esc(x.m.postsHref) + '">所有文章</a></p></div></section>',
    contactStrip(x)];
}

// ── 客人評價（只顯示，不加 Review 結構化資料：店家自己放的評價不符合搜尋引擎的評價標記規範）──
function reviewsSec(x) {
  if (!x.reviews.length) return '';
  return '<section id="reviews"><div class="wrap"><h2>客人評價</h2><div class="reviews">' +
    x.reviews.map((r) => '<figure class="review"><blockquote><p>' + esc(r.text) + '</p></blockquote>' + (r.name ? '<figcaption>— ' + esc(r.name) + '</figcaption>' : '') + '</figure>').join('') +
    '</div></div></section>';
}

// ── YouTube 影片：先顯示縮圖，點了才載入播放器（不拖慢網頁）；沒有 JavaScript 時直接連到 YouTube ──
function videoSec(x) {
  const id = youtubeId(x.c.video);
  if (!id) return '';
  return '<section id="video"><div class="wrap"><h2>影片介紹</h2><a class="embed-load yt" href="https://www.youtube.com/watch?v=' + id + '" target="_blank" rel="noopener noreferrer" ' +
    'data-embed="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1" data-title="' + esc(x.nm) + ' 影片">' +
    '<img src="https://i.ytimg.com/vi/' + id + '/hqdefault.jpg" alt="' + esc(x.nm) + ' 影片" width="480" height="360" loading="lazy" decoding="async"><span class="play" aria-hidden="true"></span><span class="sr">播放影片</span></a></div></section>';
}

// ── Google 地圖：點了才載入（地圖程式很大，直接嵌入會拖慢網頁）──
function mapBox(x) {
  const { c } = x;
  if (!c.showMap || !c.address) return '';
  return '<div class="map-box"><a class="embed-load map" href="' + esc(x.mapUrl) + '" target="_blank" rel="noopener noreferrer" ' +
    'data-embed="https://www.google.com/maps?q=' + encodeURIComponent(c.address) + '&amp;output=embed" data-title="' + esc(x.nm) + ' 地圖">' +
    '<span>在這裡顯示 Google 地圖</span><small>' + esc(c.address) + '</small></a></div>';
}

// ── 聯絡表單：一般 HTML 表單，不需要 JavaScript；留言寄到網站擁有者的 Email ──
function contactSec(x, mode) {
  const { c, m } = x;
  if (!c.contactForm) return '';
  const live = !x.preview && m.siteId && m.formAction;
  const dis = live ? '' : ' disabled';
  const note = x.preview ? '<p class="note">（預覽：正式網站上可以送出）</p>' : (!live ? '<p class="note">（示範網站：此表單不會送出）</p>' : '');
  const h = mode === 'page' ? 'h2' : 'h2';
  return '<section id="contact"><div class="wrap"><' + h + '>留言給我們</' + h + '><p>有任何問題都可以留言，我們會盡快用你留下的聯絡方式回覆。</p>' + note +
    '<form class="contact-form" method="post" action="' + esc(live ? m.formAction : '#') + '">' +
    (live ? '<input type="hidden" name="site" value="' + esc(m.siteId) + '">' : '') +
    '<p class="hp" aria-hidden="true"><label>網站<input type="text" name="website" tabindex="-1" autocomplete="off"></label></p>' +
    '<p><label for="cf-name">姓名</label><input id="cf-name" name="name" type="text" maxlength="60" required autocomplete="name"' + dis + '></p>' +
    '<p><label for="cf-contact">Email 或電話</label><input id="cf-contact" name="contact" type="text" maxlength="120" required autocomplete="email"' + dis + '></p>' +
    '<p><label for="cf-message">留言內容</label><textarea id="cf-message" name="message" rows="5" maxlength="2000" required' + dis + '></textarea></p>' +
    '<p><button class="btn" type="submit"' + dis + '>送出留言</button></p>' +
    '<p class="note">你填寫的資料只會寄給' + x.name + '，用來回覆你的留言。</p></form></div></section>';
}

// ── 線上購買：商品卡片＋訂購單（一般 HTML 表單，沒有 JavaScript 也能填數量送出）；付款走店家自己的綠界帳號 ──
const money = (n) => 'NT$ ' + Number(n).toLocaleString('en-US');
function shopSec(x, mode) {
  const { c, m } = x;
  if (!c.shop.enabled) return '';
  const items = x.items.length ? x.items : (x.preview ? [{ id: 'demo1', name: null, price: null, desc: '' }, { id: 'demo2', name: null, price: null, desc: '' }] : []);
  if (!items.length) return '';
  const live = !x.preview && m.siteId && m.shopAction && m.payReady;
  const list = mode === 'teaser' ? items.slice(0, 3) : items;
  const card = (i, n) => '<li>' + (i.photo ? '<figure>' + img(x, 'item-' + i.id, i.photo, i.name || '', false, SZ.third) + '</figure>' : '') +
    '<div class="it"><h3>' + (i.name ? esc(i.name) : x.ph('商品名稱')) + '</h3><p class="price">' + (i.price ? money(i.price) : x.ph('價格')) + '</p>' +
    (i.desc ? '<p class="desc">' + esc(i.desc) + '</p>' : '<p class="desc"></p>') +
    (mode === 'teaser' ? '' : '<p><button class="btn small" type="button" data-add="' + esc(i.id) + '"' + (live ? '' : ' disabled') + '>加入訂購</button></p>') + '</div></li>';
  const grid = '<ul class="shop-grid">' + list.map(card).join('') + '</ul>';
  const title = mode === 'page' ? '' : '<h2>線上購買</h2>';
  if (mode === 'teaser') return '<section id="shop"><div class="wrap">' + title + grid + '<p class="more"><a href="' + esc(m.shopHref) + '">前往線上購買</a></p></div></section>';
  const note = c.shop.note ? '<p class="note">' + esc(c.shop.note) + '</p>' : '';
  if (!live) {
    const why = x.preview ? '（預覽：正式網站設定好收款後就能下單付款）' : !m.siteId ? '（示範網站：無法下單）' : '目前尚未開放線上付款，請用電話或 LINE 與我們聯絡訂購。';
    return '<section id="shop"><div class="wrap">' + title + grid + note + '<p class="note">' + why + '</p></div></section>';
  }
  const rows = items.map((i) => '<tr><th scope="row">' + esc(i.name) + '</th><td>' + money(i.price) + '</td><td><label class="sr" for="q-' + esc(i.id) + '">' + esc(i.name) + ' 數量</label>' +
    '<input id="q-' + esc(i.id) + '" name="q_' + esc(i.id) + '" type="number" min="0" max="99" step="1" value="0" inputmode="numeric" data-price="' + i.price + '"></td></tr>').join('');
  return '<section id="shop"><div class="wrap">' + title + grid + note +
    '<form class="contact-form shop-form" id="order" method="post" action="' + esc(m.shopAction) + '" style="max-width:640px">' +
    '<input type="hidden" name="site" value="' + esc(m.siteId) + '">' +
    '<p class="hp" aria-hidden="true"><label>網站<input type="text" name="website" tabindex="-1" autocomplete="off"></label></p>' +
    '<h3>訂購單</h3><table class="price-table cart"><thead><tr><th scope="col">品項</th><th scope="col">單價</th><th scope="col">數量</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p class="cart-total" aria-live="polite">合計 <b data-total>NT$ 0</b></p>' +
    '<div class="form-row"><p><label for="od-name">姓名</label><input id="od-name" name="name" type="text" maxlength="60" required autocomplete="name"></p>' +
    '<p><label for="od-phone">手機</label><input id="od-phone" name="phone" type="tel" maxlength="24" required autocomplete="tel"></p></div>' +
    '<p><label for="od-email">Email（付款結果會寄到這裡）</label><input id="od-email" name="email" type="email" maxlength="120" required autocomplete="email"></p>' +
    '<p><label for="od-addr">收件地址（需要寄送才填）</label><input id="od-addr" name="address" type="text" maxlength="160" autocomplete="street-address"></p>' +
    '<p><label for="od-note">備註（選填）</label><textarea id="od-note" name="note" rows="3" maxlength="500"></textarea></p>' +
    '<p><button class="btn" type="submit">前往付款</button></p><p class="note" data-cart-msg aria-live="polite"></p>' +
    '<p class="note">付款由綠界科技處理，可使用的付款方式依店家開通的項目而定。你填寫的資料只會提供給' + x.name + '處理這筆訂單。</p></form>' +
    '<div class="cart-bar" hidden><span data-bar>已選 0 件</span><a class="btn" href="#order">填寫訂購單</a></div></div></section>';
}
const SHOP_SCRIPT = '<script>(function(){var f=document.getElementById("order");if(!f)return;var q=[].slice.call(f.querySelectorAll("input[data-price]")),t=f.querySelector("[data-total]"),bar=document.querySelector(".cart-bar"),bt=bar&&bar.querySelector("[data-bar]"),msg=f.querySelector("[data-cart-msg]");' +
  'function n(i){var v=parseInt(i.value,10);return v>0?Math.min(v,99):0}function upd(){var s=0,c=0;q.forEach(function(i){s+=n(i)*+i.getAttribute("data-price");c+=n(i)});t.textContent="NT$ "+s.toLocaleString("en-US");if(bar){bar.hidden=!c;bt.textContent="已選 "+c+" 件，NT$ "+s.toLocaleString("en-US")}return s}' +
  'f.addEventListener("input",upd);document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-add]");if(!b)return;var i=document.getElementById("q-"+b.getAttribute("data-add"));if(!i)return;i.value=Math.min(n(i)+1,99);upd();b.textContent="已加入 ✓";setTimeout(function(){b.textContent="加入訂購"},1200)});' +
  'f.addEventListener("submit",function(e){if(!upd()){e.preventDefault();msg.textContent="請先選擇要購買的品項與數量";}});upd()})();</script>';

// ── 線上預約：送出「預約申請」，店家收到通知後再與客人確認（網站不保留時段）──
const PEOPLE_OFFERS = ['menu', 'room'];
function bookingSec(x) {
  const { c, m, t } = x;
  if (!c.bookingForm) return '';
  const live = !x.preview && m.siteId && m.bookingAction;
  const dis = live ? '' : ' disabled';
  const note = x.preview ? '<p class="note">（預覽：正式網站上可以送出）</p>' : (!live ? '<p class="note">（示範網站：此表單不會送出）</p>' : '');
  const people = PEOPLE_OFFERS.includes(t.offer.path === 'rooms/' ? 'room' : t.offer.path === 'menu/' ? 'menu' : '');
  const items = x.menu.map((i) => i.name);
  const itemField = !people && items.length
    ? '<p><label for="bk-item">想預約的' + esc(t.offer.item) + '</label><select id="bk-item" name="item"' + dis + '><option value="">（請選擇，可不選）</option>' + items.map((n) => '<option>' + esc(n) + '</option>').join('') + '</select></p>'
    : '';
  const hs = hasAnyHours(c.hours) ? '<p class="note">營業時間：' + esc(hoursSummary(c.hours)) + '</p>' : '';
  const dep = c.bookingDeposit && (x.preview || m.payReady) ? c.bookingDeposit : 0;
  const depNote = dep ? '<p><b>預約需先付訂金 ' + money(dep) + '</b>，送出後會前往付款頁，付款完成才算送出預約申請。</p>' : '';
  return '<section id="booking"><div class="wrap"><h2>線上預約</h2><p>填寫想預約的日期與時間，送出後我們會盡快與你聯絡確認，確認後才算預約成功。</p>' + depNote + hs + note +
    '<form class="contact-form" method="post" action="' + esc(live ? m.bookingAction : '#') + '">' +
    (live ? '<input type="hidden" name="site" value="' + esc(m.siteId) + '">' : '') +
    '<p class="hp" aria-hidden="true"><label>網站<input type="text" name="website" tabindex="-1" autocomplete="off"></label></p>' +
    '<div class="form-row"><p><label for="bk-date">日期</label><input id="bk-date" name="date" type="date" required' + dis + '></p>' +
    '<p><label for="bk-time">時間</label><input id="bk-time" name="time" type="time" step="900" required' + dis + '></p>' +
    (people ? '<p><label for="bk-people">人數</label><input id="bk-people" name="people" type="number" min="1" max="50" value="2" required' + dis + '></p>' : '') + '</div>' +
    itemField +
    '<p><label for="bk-name">姓名</label><input id="bk-name" name="name" type="text" maxlength="60" required autocomplete="name"' + dis + '></p>' +
    '<p><label for="bk-contact">電話或 Email</label><input id="bk-contact" name="contact" type="text" maxlength="120" required autocomplete="tel"' + dis + '></p>' +
    '<p><label for="bk-note">備註（選填）</label><textarea id="bk-note" name="message" rows="3" maxlength="500"' + dis + '></textarea></p>' +
    (dep ? '<p><label for="bk-email">Email（付款結果會寄到這裡）</label><input id="bk-email" name="email" type="email" maxlength="120" required autocomplete="email"' + dis + '></p>' : '') +
    '<p><button class="btn" type="submit"' + dis + '>' + (dep ? '送出並付訂金' : '送出預約申請') + '</button></p>' +
    '<p class="note">你填寫的資料只會寄給' + x.name + '，用來確認預約。</p></form></div></section>';
}

// ── 雜誌式首頁 ──
// 滿版圖文對半的大區塊（side：圖片在左 'left' 或右 'right'）
function splitBlock(x, id, title, body, photo, role, side) {
  if (!photo) return '<section id="' + id + '"><div class="wrap"><h2>' + title + '</h2>' + body + '</div></section>';
  return '<section class="split-full ' + side + '" id="' + id + '"><figure>' + img(x, role, photo, x.nm + ' ' + x.t.space.label) + '</figure>' +
    '<div class="txt"><h2 class="big">' + title + '</h2>' + body + '</div></section>';
}
function infoBand(x) {
  const { c } = x;
  const cols = [];
  if (c.address) cols.push('<div><h3>地址</h3><p>' + esc(x.plainAddr || c.address) + '</p>' + (x.mapUrl ? '<p><a href="' + esc(x.mapUrl) + '" target="_blank" rel="noopener noreferrer">Google 地圖</a></p>' : '') + '</div>');
  if (hasAnyHours(c.hours)) cols.push('<div><h3>營業時間</h3>' + groupHours(c.hours).map((g) => '<p>' + esc(g.label) + '：' + esc(g.text) + '</p>').join('') + '</div>');
  if (c.phone) cols.push('<div><h3>聯絡</h3><p>' + (x.tel ? '<a href="' + esc(x.tel) + '">' + esc(c.phone) + '</a>' : esc(c.phone)) + '</p>' +
    (x.bookUrl && c.booking.label ? '<p><a href="' + esc(x.bookUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(c.booking.label) + '</a></p>' : '') + '</div>');
  if (!cols.length) return '';
  return '<section class="band" id="info"><div class="wrap"><h2 class="big">歡迎來訪</h2><div class="band-grid">' + cols.join('') + '</div></div></section>';
}
function photoStrip(x, photos, from) {
  if (!photos.length) return '';
  return '<section class="strip" aria-label="' + esc(x.t.space.label) + '"><div class="strip-grid" style="--n:' + photos.length + '">' +
    photos.map((p, i) => '<figure>' + img(x, 'room-' + (from + i), p, x.nm + ' ' + x.t.space.label + ' ' + (from + i), false, '(min-width:760px) ' + Math.ceil(100 / photos.length) + 'vw, 50vw') + '</figure>').join('') + '</div></section>';
}
function magazineMain(x, multi) {
  const { c } = x, s = x.m.show;
  const rooms = c.photos.room;
  const paras = paragraphs(c.intro);
  const aboutBody = (paras.length ? paras.map((p) => '<p>' + esc(p) + '</p>').join('') : '') + autoAbout(x).map((p) => '<p>' + p + '</p>').join('') +
    (multi && x.on('about') ? more(x, 'about', '認識我們') : '');
  const menuItems = multi ? x.menu.slice(0, 6) : x.menu;
  const menuBody = '<ul class="menu one">' + menuItems.map((i) => '<li><span>' + esc(i.name) + '</span><span class="price">' + (i.price != null ? 'NT$ ' + i.price : '') + '</span></li>').join('') + '</ul>' +
    (multi && x.on('menu') ? more(x, 'menu', esc(x.t.offer.more)) : '<p class="note">' + esc(x.t.offer.note) + '</p>');
  const faqList = multi ? x.faq.slice(0, FAQ_TEASER) : x.faq;
  const q = (t) => (/[？?]$/.test(t) ? t : t + '？');
  const faqBody = faqList.map((i) => '<div class="qa"><h3>' + esc(q(i.q)) + '</h3><p>' + esc(i.a) + '</p></div>').join('') +
    (multi && x.on('faq') && x.faq.length > FAQ_TEASER ? more(x, 'faq', '看所有問題') : '');
  const blocks = [heroSec(x), splitBlock(x, 'about', '關於' + x.name, aboutBody, rooms[0], 'room-1', 'right'), videoSec(x)];
  if (s.menu && x.menu.length) blocks.push(splitBlock(x, 'menu', esc(x.t.offer.label), menuBody, rooms[1], 'room-2', 'left'));
  blocks.push(reviewsSec(x));
  if (s.faq && x.faq.length) blocks.push(splitBlock(x, 'faq', '常見問題', faqBody, rooms[2], 'room-3', 'right'));
  blocks.push(infoBand(x));
  if (s.interior) blocks.push(photoStrip(x, rooms.slice(3), 4));
  blocks.push(shopSec(x, multi ? 'teaser' : 'section'));
  x.blocks.forEach((b) => blocks.push(blockSec(x, b)));
  if (multi) {
    if (x.on('news') && s.news) blocks.push(newsSec(x, 'teaser'));
    blocks.push(postsSec(x, 'teaser'));
    if (!x.on('visit')) blocks.push(bookingSec(x), visitSec(x, 'section'), contactSec(x, 'section'));
  } else {
    if (s.news) blocks.push(newsSec(x, 'section'));
    blocks.push(postsSec(x, 'teaser'), bookingSec(x), visitSec(x, 'section'), contactSec(x, 'section'));
  }
  return blocks;
}

// 自訂圖文區塊：標題、文字、照片（左或右）、按鈕
function blockSec(x, b) {
  const paras = paragraphs(b.body);
  const body = (b.title ? '<h2>' + esc(b.title) + '</h2>' : (x.preview ? '<h2>' + x.ph('區塊標題') + '</h2>' : '')) +
    (paras.length ? paras.map((t) => '<p>' + esc(t) + '</p>').join('') : (x.preview && !b.title ? '<p>' + x.ph('區塊內容') + '</p>' : '')) +
    (b.btnLabel && b.btnUrl ? '<p><a class="btn" href="' + esc(b.btnUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(b.btnLabel) + '</a></p>' : '');
  const id = 'b-' + b.id;
  if (!b.photo) return '<section class="about block" id="' + id + '"><div class="wrap">' + body + '</div></section>';
  return '<section class="about split block' + (b.side === 'left' ? ' img-left' : '') + '" id="' + id + '"><div class="wrap split-grid"><div>' + body + '</div><figure>' +
    img(x, 'blk-' + b.id, b.photo, b.title || x.nm) + '</figure></div></section>';
}
// 依店家設定的順序排列首頁區塊（key → 產生 HTML 的函式）
function ordered(x, parts) {
  const byId = Object.fromEntries(x.blocks.map((b) => [b.id, b]));
  return x.c.order.map((k) => (k.startsWith('b:') ? (byId[k.slice(2)] ? blockSec(x, byId[k.slice(2)]) : '') : (parts[k] ? parts[k]() : '')));
}

// 一頁版：全部區塊在首頁（順序可在編輯器調整）
function singleMain(x) {
  const s = x.m.show;
  return [heroSec(x), ...ordered(x, {
    about: () => aboutSec(x, 'section'), video: () => videoSec(x), menu: () => (s.menu ? menuSec(x, 'section') : ''), interior: () => (s.interior ? interiorSec(x, 'section') : ''),
    shop: () => shopSec(x, 'section'), reviews: () => reviewsSec(x), news: () => (s.news ? newsSec(x, 'section') : ''), posts: () => postsSec(x, 'teaser'),
    faq: () => (s.faq ? faqSec(x, 'section') : ''), booking: () => bookingSec(x), visit: () => visitSec(x, 'section'), contact: () => contactSec(x, 'section')
  })];
}

// 多頁版首頁：主視覺 + 各頁摘要（頁面有開才放）；來店資訊頁沒開時把完整資訊放首頁
function multiHomeMain(x) {
  const s = x.m.show;
  return [heroSec(x), ...ordered(x, {
    about: () => aboutSec(x, 'teaser'), video: () => videoSec(x),
    menu: () => (x.on('menu') && s.menu ? menuSec(x, 'teaser') : ''), interior: () => (x.on('interior') && s.interior ? interiorSec(x, 'teaser') : ''),
    shop: () => shopSec(x, 'teaser'), reviews: () => reviewsSec(x), news: () => (x.on('news') && s.news ? newsSec(x, 'teaser') : ''), posts: () => postsSec(x, 'teaser'),
    faq: () => (x.on('faq') && s.faq ? faqSec(x, 'teaser') : ''), visit: () => (x.on('visit') ? visitSec(x, 'teaser') : visitSec(x, 'section')),
    booking: () => (x.on('visit') ? '' : bookingSec(x)), contact: () => (x.on('visit') ? '' : contactSec(x, 'section'))
  })];
}

function multiPageMain(x, key) {
  const title = key === 'about' ? '關於' + x.name : esc(x.label[key]);
  const body = { about: () => aboutSec(x, 'page'), menu: () => menuSec(x, 'page'), interior: () => interiorSec(x, 'page'),
    news: () => newsSec(x, 'page'), faq: () => faqSec(x, 'page'), visit: () => visitSec(x, 'page') }[key];
  // 其他頁面也放幾題常見問題（只顯示，不重複標記 FAQPage；完整標記在常見問題頁）
  const faqTeaser = key !== 'faq' && x.on('faq') && x.m.show.faq && x.faq.length ? faqSec(x, 'teaser') : '';
  const extra = key === 'about' ? [videoSec(x), reviewsSec(x)] : key === 'visit' ? [bookingSec(x), contactSec(x, 'page')] : [];
  return [pageHead(x, title, key), body(), ...extra, faqTeaser, key === 'visit' ? '' : contactStrip(x)];
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
  'addEventListener("beforeprint",function(){document.querySelectorAll(".rv").forEach(function(el){el.classList.add("in")})})}' +
  // 影片、地圖：點了才換成內嵌播放器
  'document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("[data-embed]");if(!a)return;e.preventDefault();var f=document.createElement("iframe");' +
  'f.src=a.getAttribute("data-embed");f.title=a.getAttribute("data-title")||"";f.allow="autoplay; encrypted-media; picture-in-picture; fullscreen";f.allowFullscreen=true;f.className="embed "+a.className.replace("embed-load","");a.replaceWith(f)})' +
  '})();</script>';

// 瀏覽次數（自家統計，不用 Cookie、不記錄個人資料）與選用的 Google Analytics（第一次互動或 6 秒後才載入，避免拖慢首屏）
function trackers(m) {
  if (m.preview) return '';
  let out = '';
  if (m.siteId && m.hitUrl) out += '<script>(function(){try{var u=' + JSON.stringify(m.hitUrl) + ',b=JSON.stringify({s:' + JSON.stringify(m.siteId) + ',p:location.pathname});' +
    'if(navigator.sendBeacon)navigator.sendBeacon(u,b);else fetch(u,{method:"POST",body:b,keepalive:true})}catch(e){}})();</script>\n';
  const ga = m.content.ga4;
  if (ga) out += '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config",' + JSON.stringify(ga) + ');' +
    '(function(){var l=0;function go(){if(l)return;l=1;var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id=' + ga + '";document.head.appendChild(s)}' +
    '["scroll","click","keydown","touchstart"].forEach(function(t){addEventListener(t,go,{once:true,passive:true})});setTimeout(go,6000)})();</script>\n';
  return out;
}

function render(m) {
  const x = ctx(m);
  const { c } = x;
  const multi = m.layout === 'multi';
  // 一頁版導覽用短名稱（錨點）；多頁版用頁名（連結）
  const short = { about: '關於我們', menu: x.t.offer.nav, interior: x.t.space.label, news: '最新消息', faq: '常見問題', visit: x.t.visit.label };
  // 一頁版的錨點在子頁（文章頁）要加回首頁的路徑
  const anchor = m.anchorBase || '';
  const navItems = multi
    ? m.pageList.filter((p) => p.key !== 'home').map((p) => [p.key, esc(p.label), m.href(p.key)])
    : [['about', true], ['menu', m.show.menu], ['interior', m.show.interior], ['news', m.show.news], ['faq', m.show.faq], ['visit', true]]
      .filter((i) => i[1]).map((i) => [i[0], esc(short[i[0]]), anchor + '#' + i[0]]);
  if (x.items.length) navItems.splice(Math.min(2, navItems.length), 0, ['shop', '線上購買', multi ? m.shopHref : anchor + '#shop']);
  if (x.posts.length && m.postsHref) navItems.push(['posts', '文章', m.postsHref]);
  const cur = m.post ? 'posts' : m.page;
  const nav = navItems.map((i) => '<a href="' + esc(i[2]) + '"' + ((multi || i[0] === 'posts' || i[0] === 'shop') && i[0] === cur ? ' aria-current="page"' : '') + '>' + i[1] + '</a>').join('');
  const magazine = c.homeStyle === 'magazine';
  const main = m.post ? postMain(x, m.post)
    : m.page === 'posts' ? [pageHead(x, '文章', 'posts'), postsSec(x, 'page'), contactStrip(x)]
    : m.page === 'shop' ? [pageHead(x, '線上購買', 'shop'), shopSec(x, 'page'), contactStrip(x)]
    : multi ? (m.page === 'home' ? (magazine ? magazineMain(x, true) : multiHomeMain(x)) : multiPageMain(x, m.page)) : (magazine ? magazineMain(x, false) : singleMain(x));
  const body = finish(main);
  const footNav = multi ? '<nav class="foot-nav" aria-label="頁尾選單"><a href="' + esc(m.href('home')) + '">首頁</a>' + navItems.map((i) => '<a href="' + esc(i[2]) + '">' + i[1] + '</a>').join('') + '</nav>' : '';
  const enLink = c.en.enabled && c.en.name && c.en.intro && m.enHref ? '<a class="lang-link" href="' + esc(m.enHref) + '" hreflang="en" lang="en">English</a>' : '';
  const footer = '<footer><div class="wrap"><span>© ' + new Date().getFullYear() + ' ' + (c.name ? esc(c.name) : x.ph(PH_NAME)) + (enLink ? '　' + enLink : '') + '</span>' + footNav + '</div></footer>';
  return '<!doctype html>\n<html lang="zh-Hant">\n<head>\n' + buildHead(m) + '\n<style>' + baseCss(m.colors, cssOpts(m)) + '</style>\n</head>\n<body>\n' +
    '<a class="skip" href="#main">跳到主要內容</a>\n' +
    '<header class="top"><div class="wrap"><a class="brand" href="' + esc(multi ? m.href('home') : (anchor || '#top')) + '">' + x.name + '</a>' +
    '<button class="nav-btn" type="button" aria-expanded="false" aria-controls="site-nav" hidden><span class="bars" aria-hidden="true"></span>選單</button>' +
    '<nav id="site-nav" aria-label="頁面選單">' + nav + '</nav></div></header>\n' +
    '<main id="main">\n' + body + '\n</main>\n' + footer + '\n' + SCRIPT + '\n' + (body.includes('id="order"') ? SHOP_SCRIPT + '\n' : '') + floatLine(m, body) + trackers(m) + '</body>\n</html>\n';
}

// 404 頁：不存在的網址回傳真正的 404（避免「軟 404」被當成重複首頁收錄）。
// 部署在網站根目錄，但可能從任何深度的網址顯示，所以連結一律用根目錄路徑。
function renderNotFound(m) {
  const c = m.content;
  const name = c.name ? esc(c.name) : '';
  const links = [['/', '回首頁'], ...m.pageList.filter((p) => p.key !== 'home').map((p) => ['/' + p.path, p.label])];
  return '<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>找不到這個頁面' + (name ? '｜' + name : '') + '</title>\n<meta name="robots" content="noindex">\n' +
    '<style>' + baseCss(m.colors, cssOpts(m)) + '</style>\n</head>\n<body>\n' +
    '<header class="top"><div class="wrap"><a class="brand" href="/">' + name + '</a></div></header>\n' +
    '<main id="main"><section class="page-head"><div class="wrap"><p class="kicker">404</p><h1>找不到這個頁面</h1>' +
    '<p class="lead">網址可能打錯了，或這個頁面已經不存在。</p><p class="more">' +
    links.map((l) => '<a href="' + esc(l[0]) + '">' + esc(l[1]) + '</a>').join('　') + '</p></div></section></main>\n' +
    '<footer><div class="wrap"><span>© ' + new Date().getFullYear() + ' ' + name + '</span></div></footer>\n</body>\n</html>\n';
}

// ── 英文版頁面 /en/（一頁，給外國客人；與中文首頁用 hreflang 互相對應）──
const EN_OFFER = { 'menu/': 'Menu & Prices', 'services/': 'Services & Prices', 'courses/': 'Classes & Fees', 'products/': 'Products & Prices', 'treatments/': 'Treatments', 'rooms/': 'Rooms & Rates' };
const EN_DAY = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
function enHours(hours) {
  return groupHours(hours).map((g) => {
    const a = EN_DAY[g.days[0]], b = EN_DAY[g.days[g.days.length - 1]];
    return { label: g.days.length === 1 ? a : g.days.length === 2 ? a + ', ' + b : a + '–' + b, text: g.state.kind === 'open' ? g.state.open + '–' + g.state.close : 'Closed' };
  });
}
function renderEn(m) {
  const x = ctx(m);
  const { c } = x, e = c.en;
  const name = esc(e.name), title = e.name + (e.tagline ? ' | ' + e.tagline : '');
  const flat = e.intro.replace(/\s+/g, ' ');
  const desc = [...flat].length > 155 ? [...flat].slice(0, 154).join('') + '…' : flat;
  const url = absUrl(m.siteUrl, 'en/'), zh = m.siteUrl;
  const addr = e.address || c.address;
  const ld = { ...buildBusinessLd(m), name: e.name, alternateName: c.name || undefined, url, description: desc, inLanguage: 'en' };
  if (ld.address) ld.address = { '@type': 'PostalAddress', streetAddress: addr, addressCountry: 'TW' };
  const hero = c.photos.hero;
  const hrs = enHours(c.hours);
  const offer = EN_OFFER[x.t.offer.path] || 'Prices';
  const sections = [
    '<section class="hero" id="top"><div class="wrap hero-grid"><div><h1>' + name + '</h1>' + (e.tagline ? '<p class="lead">' + esc(e.tagline) + '</p>' : '') +
      '<div class="actions">' + (x.bookUrl ? '<a class="btn" href="' + esc(x.bookUrl) + '" target="_blank" rel="noopener noreferrer">Book online</a>' : '') + (x.tel ? '<a class="btn ghost" href="' + esc(x.tel) + '">Call us</a>' : '') + '</div></div>' +
      (hero ? '<figure>' + img(x, 'hero', hero, e.name, 'high') + '</figure>' : '') + '</div></section>',
    '<section id="about"><div class="wrap"><h2>About us</h2>' + paragraphs(e.intro).map((p) => '<p>' + esc(p) + '</p>').join('') + '</div></section>',
    x.menu.length && m.show.menu ? '<section id="menu"><div class="wrap"><h2>' + esc(offer) + '</h2><table class="price-table"><tbody>' +
      x.menu.map((i) => '<tr><th scope="row">' + esc(i.name) + '</th><td>' + (i.price != null ? 'NT$ ' + i.price : '') + '</td></tr>').join('') + '</tbody></table><p class="note">Prices in New Taiwan dollars. Item names are shown in Chinese.</p></div></section>' : '',
    '<section id="visit"><div class="wrap"><h2>Visit us</h2><dl class="info">' + (addr ? '<dt>Address</dt><dd>' + esc(addr) + (x.mapUrl ? ' (<a href="' + esc(x.mapUrl) + '" target="_blank" rel="noopener noreferrer">Google Maps</a>)' : '') + '</dd>' : '') +
      (c.phone ? '<dt>Phone</dt><dd>' + (x.tel ? '<a href="' + esc(x.tel) + '">' + esc(c.phone) + '</a>' : esc(c.phone)) + '</dd>' : '') +
      (hrs.length ? '<dt>Opening hours</dt><dd><ul class="hours-list">' + hrs.map((h) => '<li>' + esc(h.label) + ' ' + esc(h.text) + '</li>').join('') + '</ul></dd>' : '') + '</dl></div></section>'
  ];
  const head = ['<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">', '<title>' + esc(title) + '</title>',
    '<meta name="description" content="' + esc(desc) + '">', '<meta name="robots" content="index, follow, max-image-preview:large">', '<link rel="canonical" href="' + esc(url) + '">',
    '<link rel="alternate" hreflang="zh-Hant" href="' + esc(zh) + '">', '<link rel="alternate" hreflang="en" href="' + esc(url) + '">', '<link rel="alternate" hreflang="x-default" href="' + esc(zh) + '">',
    '<link rel="icon" href="' + FAVICON(m.colors.accent) + '">', '<meta property="og:type" content="website">', '<meta name="twitter:card" content="' + (m.heroFile ? 'summary_large_image' : 'summary') + '">', '<meta property="og:title" content="' + esc(title) + '">', '<meta property="og:description" content="' + esc(desc) + '">', '<meta property="og:url" content="' + esc(url) + '">', '<meta property="og:locale" content="en_US">',
    (m.heroFile ? '<meta property="og:image" content="' + esc(absUrl(m.siteUrl, m.heroFile)) + '">' : ''), '<script type="application/ld+json">' + jsonForScript(ld) + '</script>'].filter(Boolean).join('\n');
  return '<!doctype html>\n<html lang="en">\n<head>\n' + head + '\n<style>' + baseCss(m.colors, { ...cssOpts(m), headingFont: false }) + '</style>\n</head>\n<body>\n' +
    '<header class="top"><div class="wrap"><a class="brand" href="./">' + name + '</a><nav aria-label="Menu"><a href="#about">About</a>' + (x.menu.length && m.show.menu ? '<a href="#menu">' + esc(offer.split(' &')[0]) + '</a>' : '') + '<a href="#visit">Visit</a><a href="../" hreflang="zh-Hant" lang="zh-Hant">中文</a></nav></div></header>\n' +
    '<main id="main">\n' + sections.filter(Boolean).join('\n') + '\n</main>\n' +
    '<footer><div class="wrap"><span>© ' + new Date().getFullYear() + ' ' + name + '</span><nav class="foot-nav"><a href="../" lang="zh-Hant">中文網站</a></nav></div></footer>\n' + trackers(m) + '</body>\n</html>\n';
}

// 聯絡表單送出後的感謝頁（noindex、不列入 sitemap）
function renderThanks(m) {
  const c = m.content;
  const name = c.name ? esc(c.name) : '';
  return '<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>已收到你的留言' + (name ? '｜' + name : '') + '</title>\n<meta name="robots" content="noindex">\n' +
    '<style>' + baseCss(m.colors, cssOpts(m)) + '</style>\n</head>\n<body>\n' +
    '<header class="top"><div class="wrap"><a class="brand" href="/">' + name + '</a></div></header>\n' +
    '<main id="main"><section class="page-head"><div class="wrap"><h1>已經收到了，謝謝</h1>' +
    '<p class="lead">我們會盡快用你留下的聯絡方式回覆你。如果是預約申請，要等我們確認後才算預約成功。</p><p class="more"><a href="/">回首頁</a></p></div></section></main>\n' +
    '<footer><div class="wrap"><span>© ' + new Date().getFullYear() + ' ' + name + '</span></div></footer>\n</body>\n</html>\n';
}

// 付款完成（或離開付款頁）後回到的頁面（noindex、不列入 sitemap）
function renderOrderDone(m) {
  const c = m.content;
  const name = c.name ? esc(c.name) : '';
  return '<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>謝謝你的訂購' + (name ? '｜' + name : '') + '</title>\n<meta name="robots" content="noindex">\n' +
    '<style>' + baseCss(m.colors, cssOpts(m)) + '</style>\n</head>\n<body>\n' +
    '<header class="top"><div class="wrap"><a class="brand" href="/">' + name + '</a></div></header>\n' +
    '<main id="main"><section class="page-head"><div class="wrap"><h1>謝謝你，訂單已送出</h1>' +
    '<p class="lead">付款成功後，你會收到確認信，我們也會收到通知並盡快處理。如果選擇 ATM 或超商付款，請在期限內完成繳費。沒有收到確認信，請直接與我們聯絡。</p><p class="more"><a href="/">回首頁</a></p></div></section></main>\n' +
    '<footer><div class="wrap"><span>© ' + new Date().getFullYear() + ' ' + name + '</span></div></footer>\n</body>\n</html>\n';
}

// 標題字型、按鈕形狀（預覽時 previewFontUrl 指向完整字型檔，正式建置用 fonts/heading.woff2 子集）
function cssOpts(m) {
  const st = (m.content && m.content.style) || {};
  return { headingFont: m.headingFont, font: st.font, button: st.button, fontUrl: m.previewFontUrl || '' };
}
// LINE 浮動按鈕（需要先填 LINE 連結）；頁面有購物車列時往上移，避免重疊
function floatLine(m, body) {
  const c = m.content;
  if (!c.style || !c.style.floatLine || !c.social.line) return '';
  return '<a class="float-line' + (body.includes('id="order"') ? ' up' : '') + '" href="' + esc(c.social.line) + '" target="_blank" rel="noopener noreferrer" aria-label="用 LINE 聯絡我們">LINE 聯絡</a>\n';
}

// 依行業設定產生版型物件：版面與流程全行業共用，只有用詞與 schema.org 類型不同
export function makeTemplate(industry) {
  return {
    id: industry.key, label: industry.label, kindLabel: industry.kindLabel, schemaType: industry.schemaType,
    offer: industry.offer, space: industry.space, visit: industry.visit, render, renderNotFound, renderThanks, renderEn, renderOrderDone
  };
}
