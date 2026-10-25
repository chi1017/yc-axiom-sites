import { esc, jsonForScript, len, clip } from './escape.js';
import { hoursSummary, openingHoursSpec } from './hours.js';
import { parseAddress } from './region.js';
import { liveMenu, liveFaq, liveNews } from './content.js';

const MIN_DESC = 80, MAX_DESC = 160;

export function regionLabel(content) {
  const r = parseAddress(content.address);
  return r.region || r.city || '';
}

export function buildTitle(content, tpl) {
  const name = content.name || '你的店名';
  const region = regionLabel(content);
  return clip(name + '｜' + region + tpl.kindLabel, 60);
}

function firstSentence(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const m = t.match(/^[^。！？!?]+[。！？!?]?/);
  const s = (m ? m[0] : t).trim();
  return len(s) > max ? '' : (/[。！？!?]$/.test(s) ? s : s + '。');
}

// 目標 80–160 字（以字元計）。依序加入可用資訊，不夠就補通用句，過長就停止加入。
export function buildDescription(content, tpl) {
  const name = content.name || '本店';
  const region = regionLabel(content);
  const where = region ? '位於' + region : '';
  const lead = content.tagline
    ? name + where + '，' + content.tagline.replace(/[。.]+$/, '') + '。'
    : name + (where ? where + '的' : '是一間') + tpl.kindLabel + '。';
  const parts = [clip(lead, 120)];
  const hs = hoursSummary(content.hours);
  const menu = liveMenu(content).slice(0, 3).map((m) => m.name);
  const candidates = [
    hs && len(hs) <= 60 ? '營業時間：' + hs + '。' : '',
    firstSentence(content.intro, 50),
    menu.length ? tpl.offer.provide + menu.join('、') + '等' + tpl.offer.item + '。' : '',
    '網站提供地址、電話' + (content.booking.url ? '與線上預約' : '') + '等' + tpl.visit.label + '。'
  ];
  const fillers = ['歡迎來訪，網站上有完整的營業時間與交通資訊。', '想了解更多，歡迎直接來電或到店詢問。', '網站上整理了地址、電話與營業時間，方便你規劃行程。', '來訪前建議先確認營業時間，讓你的行程更順利。'];
  let out = parts.join('');
  for (const c of candidates) {
    if (c && len(out) + len(c) <= MAX_DESC) out += c;
  }
  for (const f of fillers) {
    if (len(out) >= MIN_DESC) break;
    if (len(out) + len(f) <= MAX_DESC) out += f;
  }
  if (len(out) > MAX_DESC) out = clip(out, MAX_DESC - 1) + '…';
  return out;
}

// 多頁版子頁的標題：「頁名｜店名」；首頁沿用 buildTitle
export function pageTitle(content, tpl, page) {
  if (!page || page.key === 'home') return buildTitle(content, tpl);
  const name = content.name || '你的店名';
  const where = regionLabel(content) + tpl.kindLabel;   // 例如「苓雅區咖啡店」，讓子頁標題也帶地區與行業
  return clip((page.key === 'about' ? '關於' + name : page.label + '｜' + name) + '｜' + where, 60);
}

const joinFit = (items, max) => { let out = ''; for (const it of items) { const next = out ? out + '、' + it : it; if (len(next) > max) break; out = next; } return out; };

// 多頁版子頁的描述：先放這一頁的重點，不足 80 字再補首頁描述，最多 160 字
export function pageDescription(content, tpl, page) {
  const home = buildDescription(content, tpl);
  if (!page || page.key === 'home') return home;
  const name = content.name || '本店';
  const hs = hoursSummary(content.hours);
  let lead = '';
  if (page.key === 'about') lead = firstSentence(content.intro, 90) ? name + '：' + firstSentence(content.intro, 90) : '認識' + name + '。';
  else if (page.key === 'menu') { const m = joinFit(liveMenu(content).map((i) => i.name + (i.price != null ? ' NT$' + i.price : '')), 90); lead = name + '的' + page.label + (m ? '：' + m + '。' : '。'); }
  else if (page.key === 'interior') lead = name + '的' + page.label + '，用照片看看實際的樣子。';
  else if (page.key === 'news') { const n = joinFit(liveNews(content).map((i) => i.title), 90); lead = name + '最新消息' + (n ? '：' + n + '。' : '。'); }
  else if (page.key === 'faq') { const f = joinFit(liveFaq(content).map((i) => i.q.replace(/[？?]$/, '')), 90); lead = name + '常見問題' + (f ? '：' + f + '？' : '。'); }
  else if (page.key === 'visit') lead = name + page.label + '：' + (content.address ? '地址' + content.address + '。' : '') + (hs && len(hs) <= 60 ? '營業時間' + hs + '。' : '') + (content.phone ? '電話 ' + content.phone + '。' : '');
  let out = lead;
  if (len(out) < MIN_DESC) out += home;
  if (len(out) > MAX_DESC) out = clip(out, MAX_DESC - 1) + '…';
  return out;
}

export function absUrl(siteUrl, rel) {
  return siteUrl.replace(/\/?$/, '/') + String(rel).replace(/^\//, '');
}

export function buildBusinessLd(model) {
  const { content: c, tpl, siteUrl, images } = model;
  const a = parseAddress(c.address);
  const ld = {
    '@context': 'https://schema.org',
    '@type': tpl.schemaType,
    '@id': siteUrl + '#business',
    name: c.name,
    url: siteUrl,
    description: model.description
  };
  if (images.length) ld.image = images.map((f) => absUrl(siteUrl, f));
  if (c.phone) ld.telephone = c.phone;
  ld.address = {
    '@type': 'PostalAddress',
    streetAddress: a.street || c.address,
    addressCountry: 'TW'
  };
  if (a.district) ld.address.addressLocality = a.district;
  if (a.city) ld.address.addressRegion = a.city;
  if (a.postal) ld.address.postalCode = a.postal;
  const spec = openingHoursSpec(c.hours);
  if (spec.length) ld.openingHoursSpecification = spec;
  const same = [c.social.instagram, c.social.facebook, c.social.line].filter(Boolean);
  if (same.length) ld.sameAs = same;
  if (c.booking.url) ld.potentialAction = { '@type': 'ReserveAction', name: c.booking.label || '線上訂位', target: c.booking.url };
  return ld;
}

export function buildFaqLd(model) {
  const faq = liveFaq(model.content);
  if (!faq.length || !model.show.faq || model.faqOnPage === false) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: (model.faqOnPage === 'teaser' ? faq.slice(0, model.faqTeaser || 3) : faq).map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  };
}

export function buildBreadcrumbLd(model) {
  if (!model.pageUrl || !model.pageInfo || model.pageInfo.key === 'home') return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: model.content.name || '首頁', item: model.siteUrl },
      { '@type': 'ListItem', position: 2, name: model.pageInfo.label, item: model.pageUrl }
    ]
  };
}

const FAVICON = (color) => 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="' + color + '"/><circle cx="32" cy="32" r="12" fill="none" stroke="#fff" stroke-width="4"/></svg>');

// <head> 內容。preview 不輸出 canonical / OG / JSON-LD 以外的追蹤，但仍輸出 meta 讓預覽盡量接近成品。
export function buildHead(model) {
  const { content: c, tpl, siteUrl, colors } = model;
  const title = model.title, desc = model.description;
  const hero = model.heroFile ? absUrl(siteUrl, model.heroFile) : '';
  const url = model.pageUrl || siteUrl;
  // 店家資料每頁都放（同一個 @id），搜尋與 AI 從任何一頁進來都能對應到同一家店
  const lds = [buildBusinessLd(model), buildFaqLd(model), buildBreadcrumbLd(model)].filter(Boolean);
  const h = [];
  h.push('<meta charset="utf-8">');
  h.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  h.push('<title>' + esc(title) + '</title>');
  h.push('<meta name="description" content="' + esc(desc) + '">');
  h.push('<meta name="robots" content="index, follow, max-image-preview:large">');
  h.push('<link rel="canonical" href="' + esc(url) + '">');
  h.push('<meta name="theme-color" content="' + esc(colors.bg) + '">');
  h.push('<link rel="icon" href="' + FAVICON(colors.accent) + '">');
  h.push('<meta property="og:type" content="website">');
  h.push('<meta property="og:site_name" content="' + esc(c.name) + '">');
  h.push('<meta property="og:title" content="' + esc(title) + '">');
  h.push('<meta property="og:description" content="' + esc(desc) + '">');
  h.push('<meta property="og:url" content="' + esc(url) + '">');
  h.push('<meta property="og:locale" content="zh_TW">');
  if (hero) h.push('<meta property="og:image" content="' + esc(hero) + '">');
  h.push('<meta name="twitter:card" content="' + (hero ? 'summary_large_image' : 'summary') + '">');
  h.push('<meta name="twitter:title" content="' + esc(title) + '">');
  h.push('<meta name="twitter:description" content="' + esc(desc) + '">');
  if (hero) h.push('<meta name="twitter:image" content="' + esc(hero) + '">');
  lds.forEach((ld) => h.push('<script type="application/ld+json">' + jsonForScript(ld) + '</script>'));
  return h.join('\n');
}

export function robotsTxt(siteUrl) {
  return [
    'User-agent: *', 'Allow: /', '',
    'User-agent: OAI-SearchBot', 'Allow: /', '',
    'User-agent: GPTBot', 'Allow: /', '',
    'User-agent: PerplexityBot', 'Allow: /', '',
    'User-agent: ClaudeBot', 'Allow: /', '',
    'User-agent: Google-Extended', 'Allow: /', '',
    'Sitemap: ' + absUrl(siteUrl, 'sitemap.xml'), ''
  ].join('\n');
}

// paths：要列出的頁面（相對網址，首頁為 ''）；省略時只有首頁
export function sitemapXml(siteUrl, lastmod, paths = ['']) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    paths.map((p) => '  <url><loc>' + esc(absUrl(siteUrl, p)) + '</loc><lastmod>' + esc(lastmod) + '</lastmod></url>\n').join('') + '</urlset>\n';
}

export function llmsTxt(model) {
  const { content: c, siteUrl, tpl } = model;
  const L = ['# ' + c.name, '', '> ' + model.description, '', '## 基本資料', '',
    '- 類型：' + tpl.kindLabel, '- 地址：' + c.address];
  if (c.phone) L.push('- 電話：' + c.phone);
  const hs = hoursSummary(c.hours);
  if (hs) L.push('- 營業時間：' + hs);
  L.push('- 網站：' + siteUrl);
  if (c.booking.url) L.push('- ' + (c.booking.label || '線上訂位') + '：' + c.booking.url);
  const menu = liveMenu(c);
  if (menu.length && model.show.menu) {
    L.push('', '## ' + tpl.offer.label, '');
    menu.forEach((m) => L.push('- ' + m.name + (m.price != null ? '：NT$ ' + m.price : '')));
  }
  if (model.pageLinks && model.pageLinks.length > 1) {
    L.push('', '## 網站頁面', '');
    model.pageLinks.forEach((p) => L.push('- [' + p.label + '](' + absUrl(siteUrl, p.path) + ')'));
  }
  L.push('');
  return L.join('\n');
}
