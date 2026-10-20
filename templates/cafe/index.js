import { esc, paragraphs, safeHttpsUrl, telHref } from '../shared/escape.js';
import { buildHead } from '../shared/seo.js';
import { liveMenu, liveFaq, liveNews } from '../shared/content.js';
import { groupHours, hoursSummary, hasAnyHours } from '../shared/hours.js';
import { cafeCss } from './styles.js';

const PH_NAME = '店名', PH_TAG = '一句話介紹你的店', PH_ADDR = '店家地址', PH_PHONE = '電話';

function render(m) {
  const { content: c, show, preview, colors } = m;
  const ph = (hint) => (preview ? '<span class="ph">[' + esc(hint) + ']</span>' : '');
  const name = c.name ? esc(c.name) : ph(PH_NAME);
  const region = m.address.region;
  const hasHours = hasAnyHours(c.hours);
  const tel = telHref(c.phone);
  const bookUrl = safeHttpsUrl(c.booking.url);
  const menu = liveMenu(c), faq = liveFaq(c), news = liveNews(c);
  const mapUrl = c.address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.address) : '';
  const nm = c.name || (preview ? '[店名]' : '本店');
  const plainAddr = region ? m.address.region + m.address.street : c.address;   // 內文敘述不帶郵遞區號

  // ── 導覽 ──
  const nav = [['about', '關於我們', true], ['menu', '菜單', show.menu], ['interior', '店內環境', show.interior],
    ['news', '最新消息', show.news], ['faq', '常見問題', show.faq], ['visit', '來店資訊', true]]
    .filter((x) => x[2]).map((x) => '<a href="#' + x[0] + '">' + x[1] + '</a>').join('');

  // ── Hero ──
  const heroPhoto = c.photos.hero;
  const heroImg = heroPhoto
    ? '<img src="' + esc(m.imageSrc('hero', heroPhoto)) + '" alt="' + esc(heroPhoto.alt || nm + ' 店家主視覺') + '"' +
      (heroPhoto.w ? ' width="' + heroPhoto.w + '" height="' + heroPhoto.h + '"' : '') + ' fetchpriority="high" decoding="async">'
    : (preview ? '<div class="ph-img">[主視覺照片]</div>' : '');
  const actions = [];
  if (bookUrl && c.booking.label) actions.push('<a class="btn" href="' + esc(bookUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(c.booking.label) + '</a>');
  else if (preview) actions.push('<span class="btn ph">[訂位按鈕]</span>');
  if (tel) actions.push('<a class="btn ghost" href="' + esc(tel) + '">撥打電話</a>');
  const hero = '<section class="hero" id="top"><div class="wrap hero-grid"><div>' +
    '<p class="kicker">' + (region ? esc(region) + '｜' : '') + '咖啡店</p>' +
    '<h1>' + name + '</h1>' +
    '<p class="lead">' + (c.tagline ? esc(c.tagline) : ph(PH_TAG)) + '</p>' +
    (actions.length ? '<div class="actions">' + actions.join('') + '</div>' : '') +
    '</div><figure>' + heroImg + '</figure></div></section>';

  // ── 關於 ──
  const introParas = paragraphs(c.intro);
  const prices = menu.map((x) => x.price).filter((x) => x != null);
  const auto = [];
  if (c.name) {
    let s = esc(c.name) + (c.address ? '位於' + esc(plainAddr) : '') + '，是一間' + (region ? esc(region) + '的' : '') + '咖啡店。';
    if (menu.length && show.menu) {
      s += '店內提供' + esc(menu.slice(0, 4).map((x) => x.name).join('、')) + '等品項';
      if (prices.length) {
        const lo = Math.min(...prices), hi = Math.max(...prices);
        s += lo === hi ? '，價格為 NT$ ' + lo : '，價格大約落在 NT$ ' + lo + ' 到 NT$ ' + hi + ' 之間';
      }
      s += '。';
    }
    auto.push(s);
  }
  const about = '<section class="about" id="about"><div class="wrap"><h2>關於' + (c.name ? esc(c.name) : ph(PH_NAME)) + '</h2>' +
    (introParas.length ? introParas.map((p) => '<p>' + esc(p) + '</p>').join('') : (preview ? '<p>' + ph('店家介紹：這間店的故事、特色與想讓客人知道的事') + '</p>' : '')) +
    auto.map((p) => '<p>' + p + '</p>').join('') + '</div></section>';

  // ── 菜單 ──
  let menuSec = '';
  if (show.menu) {
    const items = menu.length ? menu : (preview ? [{ name: null, price: null }, { name: null, price: null }, { name: null, price: null }] : []);
    menuSec = '<section id="menu"><div class="wrap"><h2>菜單與價格</h2><ul class="menu">' +
      items.map((x) => '<li><span>' + (x.name ? esc(x.name) : ph('品名')) + '</span><span class="price">' +
        (x.price != null ? 'NT$ ' + x.price : ph('價格')) + '</span></li>').join('') + '</ul>' +
      '<p class="note">價格以現場公告為準。</p></div></section>';
  }

  // ── 店內環境 ──
  let interior = '';
  if (show.interior) {
    const rooms = c.photos.room;
    const figs = rooms.map((p, i) => '<figure><img src="' + esc(m.imageSrc('room-' + (i + 1), p)) + '" alt="' + esc(p.alt || nm + ' 店內環境 ' + (i + 1)) + '"' +
      (p.w ? ' width="' + p.w + '" height="' + p.h + '"' : '') + ' loading="lazy" decoding="async"></figure>');
    if (!rooms.length && preview) for (let i = 0; i < 3; i++) figs.push('<figure><div class="ph-img">[店內照片 ' + (i + 1) + ']</div></figure>');
    interior = '<section id="interior"><div class="wrap"><h2>店內環境</h2><div class="gallery">' + figs.join('') + '</div></div></section>';
  }

  // ── 最新消息 ──
  let newsSec = '';
  if (show.news) {
    const items = news.length ? news : (preview ? [{ date: '', title: '' }, { date: '', title: '' }] : []);
    newsSec = '<section id="news"><div class="wrap"><h2>最新消息</h2><ul class="news">' +
      items.map((x) => '<li>' + (x.date ? '<time datetime="' + esc(x.date) + '">' + esc(x.date.replace(/-/g, '/')) + '</time>' : '<span>' + ph('日期') + '</span>') +
        '<span>' + (x.title ? esc(x.title) : ph('消息標題')) + '</span></li>').join('') + '</ul></div></section>';
  }

  // ── 常見問題 ──
  let faqSec = '';
  if (show.faq) {
    const items = faq.length ? faq : (preview ? [{ q: '', a: '' }, { q: '', a: '' }] : []);
    const q = (s) => (/[？?]$/.test(s) ? s : s + '？');
    faqSec = '<section id="faq"><div class="wrap"><h2>常見問題</h2>' +
      items.map((x) => '<div class="faq-item"><h3>' + (x.q ? esc(q(x.q)) : ph('你的問題')) + '</h3><p>' + (x.a ? esc(x.a) : ph('你的回答')) + '</p></div>').join('') +
      '</div></section>';
  }

  // ── 來店資訊 ──
  const groups = groupHours(c.hours);
  const hoursTable = groups.length
    ? '<table class="hours"><caption class="sr" style="position:absolute;left:-999px">營業時間</caption><tbody>' +
      groups.map((g) => '<tr><th scope="row">' + esc(g.label) + '</th><td>' + esc(g.text) + '</td></tr>').join('') + '</tbody></table>'
    : (preview ? '<p>' + ph('營業時間') + '</p>' : '');
  const social = [['Instagram', c.social.instagram], ['Facebook', c.social.facebook], ['LINE', c.social.line]].filter((x) => x[1]);
  const visitText = [];
  if (c.name && c.address) visitText.push(esc(c.name) + '的地址是' + esc(plainAddr) + '，可以用下方的地圖連結直接導航。');
  if (hasHours) visitText.push('營業時間為' + esc(hoursSummary(c.hours)) + '。' + (c.hoursNote ? esc(c.hoursNote) : ''));
  if (c.phone) visitText.push('如果想先確認座位或詢問餐點，歡迎來電 ' + esc(c.phone) + '。');
  if (bookUrl && c.booking.label) visitText.push('也可以點選頁面上的「' + esc(c.booking.label) + '」按鈕直接預約。');
  const visit = '<section id="visit"><div class="wrap"><h2>來店資訊</h2><div class="visit-grid"><div>' +
    '<dl class="info"><dt>地址</dt><dd>' + (c.address ? esc(c.address) + (mapUrl ? '（<a href="' + esc(mapUrl) + '" target="_blank" rel="noopener noreferrer">Google 地圖</a>）' : '') : ph(PH_ADDR)) + '</dd>' +
    '<dt>電話</dt><dd>' + (c.phone ? (tel ? '<a href="' + esc(tel) + '">' + esc(c.phone) + '</a>' : esc(c.phone)) : ph(PH_PHONE)) + '</dd>' +
    (social.length ? '<dt>社群</dt><dd class="social">' + social.map((s) => '<a href="' + esc(s[1]) + '" target="_blank" rel="noopener noreferrer me">' + s[0] + '</a>').join('') + '</dd>' : '') +
    '</dl></div><div><h3 style="font-size:18px;margin-bottom:8px">營業時間</h3>' + hoursTable +
    (c.hoursNote ? '<p class="note">' + esc(c.hoursNote) + '</p>' : '') + '</div></div>' +
    (visitText.length ? '<div style="margin-top:24px">' + visitText.map((p) => '<p>' + p + '</p>').join('') + '</div>' : '') +
    '</div></section>';

  const footer = '<footer><div class="wrap"><span>© ' + new Date().getFullYear() + ' ' + (c.name ? esc(c.name) : ph(PH_NAME)) + '</span></div></footer>';

  return '<!doctype html>\n<html lang="zh-Hant">\n<head>\n' + buildHead(m) + '\n<style>' + cafeCss(colors) + '</style>\n</head>\n<body>\n' +
    '<a class="skip" href="#main">跳到主要內容</a>\n' +
    '<header class="top"><div class="wrap"><a class="brand" href="#top">' + name + '</a><nav aria-label="頁面選單">' + nav + '</nav></div></header>\n' +
    '<main id="main">\n' + hero + '\n' + about + '\n' + menuSec + '\n' + interior + '\n' + newsSec + '\n' + faqSec + '\n' + visit + '\n</main>\n' +
    footer + '\n</body>\n</html>\n';
}

export const cafe = {
  id: 'cafe',
  label: '咖啡店',
  kindLabel: '咖啡店',
  schemaType: 'CafeOrCoffeeShop',
  render
};
