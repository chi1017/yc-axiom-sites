import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSite } from '../templates/shared/site.js';
import { emptyContent } from '../templates/shared/content.js';
import { PALETTE_IDS, PALETTES } from '../templates/shared/palettes.js';
import { parseHTML } from 'linkedom';

const sample = JSON.parse(readFileSync(new URL('../templates/cafe/sample.json', import.meta.url)));
const URL_ = 'https://wuhou-cafe.pages.dev/';
const live = (over = {}) => buildSite({ template: 'cafe', siteUrl: URL_, ...sample, ...over });
const prev = (over = {}) => buildSite({ template: 'cafe', siteUrl: URL_, preview: true, imageSrc: (r, p) => 'https://x.supabase.co/' + p.path, ...sample, ...over });

test('live build: structure, one h1, headings do not skip', () => {
  const { html } = live();
  const { document: d } = parseHTML(html);
  assert.equal(d.querySelectorAll('h1').length, 1);
  assert.equal(d.querySelector('h1').textContent, '午後日光咖啡');
  assert.equal(d.documentElement.getAttribute('lang'), 'zh-Hant');
  assert.ok(d.querySelectorAll('h2').length >= 5);
  assert.equal(d.querySelectorAll('script:not([type="application/ld+json"])').length, 0, 'no client-side JS');
  assert.equal(d.querySelector('link[rel=canonical]').getAttribute('href'), URL_);
  assert.ok(html.includes('網站設計：<a href="https://chi1017.github.io/yc-axiom-site/"'));
});
test('live build: images have alt, local paths, hero eager and rest lazy', () => {
  const { document: d } = parseHTML(live().html);
  const imgs = [...d.querySelectorAll('img')];
  assert.equal(imgs.length, 4);
  imgs.forEach((i) => { assert.ok(i.getAttribute('alt').includes('午後日光咖啡')); assert.match(i.getAttribute('src'), /^images\/(hero|room-\d)\.webp$/); });
  assert.equal(imgs[0].getAttribute('loading'), null);
  assert.equal(imgs[0].getAttribute('fetchpriority'), 'high');
  imgs.slice(1).forEach((i) => assert.equal(i.getAttribute('loading'), 'lazy'));
});
test('live build never shows placeholders even with empty optional content', () => {
  const c = JSON.parse(JSON.stringify(sample.content));
  c.tagline = ''; c.intro = ''; c.menu = []; c.faq = []; c.news = []; c.booking = { label: '', url: '' }; c.phone = ''; c.photos.room = [];
  const { html } = live({ content: c });
  assert.ok(!/class="ph/.test(html) && !/\[[^\]]*(價格|品名|你的|店名|照片)[^\]]*\]/.test(html));
  const { document: d } = parseHTML(html);
  for (const id of ['menu', 'faq', 'news', 'interior']) assert.equal(d.getElementById(id), null, id + ' should be hidden when empty');
  assert.equal(d.querySelectorAll('a.btn').length, 0);
});
test('preview shows hints for empty fields', () => {
  const { html } = prev({ content: emptyContent() });
  for (const h of ['[店名]', '[價格]', '[你的回答]', '[你的問題]', '[品名]', '[主視覺照片]', '[訂位按鈕]']) assert.ok(html.includes(h), h);
});
test('section toggles hide sections', () => {
  const { document: d } = parseHTML(live({ sections: { menu: false, interior: false, faq: false, news: false } }).html);
  for (const id of ['menu', 'faq', 'news', 'interior']) assert.equal(d.getElementById(id), null);
  assert.equal(d.querySelectorAll('script[type="application/ld+json"]').length, 1, 'no FAQPage when FAQ hidden');
});
test('XSS: hostile content is escaped everywhere', () => {
  const evil = '"><img src=x onerror=alert(1)><script>alert(1)</script>';
  const c = JSON.parse(JSON.stringify(sample.content));
  c.name = evil; c.tagline = evil; c.intro = evil; c.address = '高雄市苓雅區' + evil; c.phone = evil; c.hoursNote = evil;
  c.menu[0].name = evil; c.faq[0].q = evil; c.faq[0].a = evil; c.news[0].title = evil; c.booking.label = evil;
  const { html } = live({ content: c });
  const { document: d } = parseHTML(html);
  assert.equal(d.querySelectorAll('script:not([type="application/ld+json"])').length, 0);
  assert.equal([...d.querySelectorAll('img')].filter((i) => i.getAttribute('onerror')).length, 0);
  assert.ok(!/<img src=x/i.test(html));
  d.querySelectorAll('script[type="application/ld+json"]').forEach((s) => JSON.parse(s.textContent));
});
test('JSON-LD: business + FAQPage, parseable and consistent with the page', () => {
  const { document: d } = parseHTML(live().html);
  const lds = [...d.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));
  const biz = lds.find((x) => x['@type'] === 'CafeOrCoffeeShop');
  assert.equal(biz.name, '午後日光咖啡'); assert.equal(biz.url, URL_);
  assert.equal(biz.address.addressCountry, 'TW'); assert.equal(biz.address.addressRegion, '高雄市'); assert.equal(biz.address.addressLocality, '苓雅區'); assert.equal(biz.address.postalCode, '802');
  assert.equal(biz.openingHoursSpecification.length, 2);
  assert.deepEqual(biz.sameAs, ['https://www.instagram.com/example_cafe']);
  assert.equal(biz.image[0], URL_ + 'images/hero.webp');
  const faq = lds.find((x) => x['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity.length, 4);
});
test('meta description 80–160 and title', () => {
  const r = live();
  assert.ok([...r.description].length >= 80 && [...r.description].length <= 160);
  assert.equal(r.title, '午後日光咖啡｜高雄市苓雅區咖啡店');
});
test('all palettes render with their variables', () => {
  for (const id of PALETTE_IDS) {
    const { html } = live({ palette: id });
    assert.ok(html.includes('--bg:' + PALETTES[id].bg) && html.includes('--accent:' + PALETTES[id].accent), id);
  }
  assert.ok(live({ palette: 'nope' }).html.includes('--bg:' + PALETTES.forest.bg), 'unknown palette falls back');
});
test('extra files: robots allows AI bots, sitemap, llms', () => {
  const { files } = live();
  for (const b of ['OAI-SearchBot', 'GPTBot', 'PerplexityBot', 'ClaudeBot', 'Google-Extended']) assert.ok(files['robots.txt'].includes('User-agent: ' + b));
  assert.ok(!/Disallow:\s*\//.test(files['robots.txt']));
  assert.ok(files['robots.txt'].includes('Sitemap: ' + URL_ + 'sitemap.xml'));
  assert.ok(files['sitemap.xml'].includes('<loc>' + URL_ + '</loc>'));
  assert.ok(files['llms.txt'].startsWith('# 午後日光咖啡'));
});
test('deterministic output', () => {
  const a = live({ lastmod: '2026-10-01' }).files, b = live({ lastmod: '2026-10-01' }).files;
  assert.deepEqual(a, b);
});
