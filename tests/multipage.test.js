import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { parseHTML } from 'linkedom';
import { buildSite } from '../templates/shared/site.js';
import { INDUSTRIES } from '../templates/shared/industries.js';

const sample = JSON.parse(readFileSync(new URL('../templates/cafe/sample.json', import.meta.url)));
const URL_ = 'https://wuhou-cafe.pages.dev/';
const build = (over = {}) => buildSite({ template: 'cafe', siteUrl: URL_, ...sample, lastmod: '2026-10-25', ...over });
const multi = (over = {}) => build({ layout: 'multi', ...over });
const htmlFiles = (files) => Object.entries(files).filter(([f]) => f.endsWith('.html') && f !== '404.html');   // 404 頁另有專屬測試
const BRAND = /yc[ _-]?axiom|ycaxiom|chi1017|788cblaq|generator|powered by/i;

test('multi: one file per enabled page, single: only the home page', () => {
  assert.deepEqual(htmlFiles(build().files).map(([f]) => f), ['index.html']);
  assert.deepEqual(htmlFiles(multi().files).map(([f]) => f).sort(),
    ['about/index.html', 'faq/index.html', 'index.html', 'menu/index.html', 'news/index.html', 'space/index.html', 'visit/index.html']);
  const some = multi({ pages: { menu: false, faq: false } });
  assert.deepEqual(htmlFiles(some.files).map(([f]) => f).sort(), ['about/index.html', 'index.html', 'news/index.html', 'space/index.html', 'visit/index.html']);
});

test('multi: pages with nothing to show are not built (no empty pages)', () => {
  const c = JSON.parse(JSON.stringify(sample.content));
  c.menu = []; c.faq = []; c.news = []; c.photos.room = [];
  assert.deepEqual(htmlFiles(multi({ content: c }).files).map(([f]) => f).sort(), ['about/index.html', 'index.html', 'visit/index.html']);
});

test('multi: every page has one h1, its own canonical, title and 80–160 description; titles are unique', () => {
  const { files } = multi();
  const titles = new Set();
  for (const [f, html] of htmlFiles(files)) {
    const { document: d } = parseHTML(html);
    assert.equal(d.querySelectorAll('h1').length, 1, f);
    const path = f.replace(/index\.html$/, '');
    assert.equal(d.querySelector('link[rel=canonical]').getAttribute('href'), URL_ + path, f);
    assert.equal(d.querySelector('meta[property="og:url"]').getAttribute('content'), URL_ + path, f);
    const desc = d.querySelector('meta[name=description]').getAttribute('content');
    assert.ok([...desc].length >= 80 && [...desc].length <= 160, f + ' desc ' + [...desc].length);
    titles.add(d.querySelector('title').textContent);
    // 標題階層不跳級
    let last = 1;
    d.querySelectorAll('h1,h2,h3').forEach((h) => { const n = Number(h.tagName[1]); assert.ok(n <= last + 1, f + ' heading skip ' + h.tagName); last = n; });
  }
  assert.equal(titles.size, htmlFiles(files).length);
});

test('multi: every internal link and image resolves to a built file', () => {
  const { files } = multi();
  const exists = (p) => p in files || (p.endsWith('/') && (p + 'index.html') in files) || p === '' || /^images\//.test(p);
  for (const [f, html] of htmlFiles(files)) {
    const { document: d } = parseHTML(html);
    const dir = posix.dirname(f) === '.' ? '' : posix.dirname(f) + '/';
    for (const a of d.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href');
      if (/^(https?:|tel:|mailto:|#)/.test(h)) continue;
      const target = posix.normalize(dir + h).replace(/^\.\/?/, '');
      assert.ok(exists(target === '.' ? '' : target), f + ' → ' + h);
    }
    for (const i of d.querySelectorAll('img')) assert.match(posix.normalize(dir + i.getAttribute('src')), /^images\/(hero|room-\d)\.webp$/, f);
  }
});

test('multi: nav marks the current page; home teasers link to their pages', () => {
  const { files } = multi();
  const { document: menu } = parseHTML(files['menu/index.html']);
  assert.equal(menu.querySelector('nav#site-nav a[aria-current=page]').textContent, '菜單與價格');
  const { document: home } = parseHTML(files['index.html']);
  const more = [...home.querySelectorAll('.more a')].map((a) => a.getAttribute('href'));
  assert.ok(more.includes('about/') && more.includes('menu/') && more.includes('visit/'), more.join(','));
});

test('multi: structured data on the right pages (business on every page, FAQ on faq page + top questions on home, breadcrumbs on subpages)', () => {
  const { files } = multi();
  const types = (f) => [...parseHTML(files[f]).document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent)['@type']);
  assert.deepEqual(types('index.html'), ['CafeOrCoffeeShop', 'FAQPage']);
  // 首頁的 FAQPage 題數與畫面上顯示的題數一致（前 3 題），常見問題頁是全部
  const { document: home } = parseHTML(files['index.html']);
  const homeLd = [...home.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent)).find((l) => l['@type'] === 'FAQPage');
  assert.equal(homeLd.mainEntity.length, home.querySelectorAll('.faq-item').length);
  assert.equal(homeLd.mainEntity.length, Math.min(3, sample.content.faq.length));
  const faqLd = [...parseHTML(files['faq/index.html']).document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent)).find((l) => l['@type'] === 'FAQPage');
  assert.equal(faqLd.mainEntity.length, sample.content.faq.length);
  // 首頁保留完整介紹
  assert.ok(home.querySelector('#about').textContent.includes(sample.content.intro.split('\n')[0].slice(0, 20)));
  assert.deepEqual(types('visit/index.html'), ['CafeOrCoffeeShop', 'BreadcrumbList']);
  assert.deepEqual(types('faq/index.html'), ['CafeOrCoffeeShop', 'FAQPage', 'BreadcrumbList']);
  assert.deepEqual(types('menu/index.html'), ['CafeOrCoffeeShop', 'BreadcrumbList']);
});

test('multi: sitemap lists every page, llms.txt lists page links', () => {
  const { files } = multi();
  for (const [f] of htmlFiles(files)) assert.ok(files['sitemap.xml'].includes('<loc>' + URL_ + f.replace(/index\.html$/, '') + '</loc>'), f);
  assert.ok(files['llms.txt'].includes('## 網站頁面') && files['llms.txt'].includes(URL_ + 'menu/'));
  assert.ok(!build().files['llms.txt'].includes('## 網站頁面'));
});

test('every industry renders single and multi with its own wording, schema type and no platform brand', () => {
  for (const ind of INDUSTRIES) {
    for (const layout of ['single', 'multi']) {
      const { files } = build({ template: ind.key, layout });
      for (const [f, c] of Object.entries(files)) assert.ok(!BRAND.test(c), ind.key + ' ' + f);
      const home = files['index.html'];
      const { document: d } = parseHTML(home);
      assert.ok(d.querySelector('.kicker').textContent.includes(ind.kindLabel), ind.key);
      assert.equal(JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent)['@type'], ind.schemaType, ind.key);
      if (layout === 'multi') {
        assert.ok((ind.offer.path + 'index.html') in files, ind.key + ' offer page');
        assert.ok(parseHTML(files[ind.offer.path + 'index.html']).document.querySelector('h1').textContent === ind.offer.label, ind.key);
      }
      if (ind.offer.label !== '菜單與價格') assert.ok(!home.includes('菜單與價格') && !home.includes('看完整菜單'), ind.key + ' leaks cafe wording');
    }
  }
});

test('hero: full-bleed style, falls back to the card style without a photo; old content keeps the card', () => {
  const c = JSON.parse(JSON.stringify(sample.content));
  assert.ok(build().html.includes('<section class="hero" id="top">'));
  c.heroStyle = 'full';
  assert.ok(build({ content: c }).html.includes('<section class="hero full" id="top">'));
  c.photos.hero = null;
  assert.ok(!build({ content: c }).html.includes('hero full'));
  c.heroStyle = 'weird';
  assert.ok(build({ content: c }).html.includes('<section class="hero" id="top">'));
});

test('preview: renders the requested page with the given image URLs and placeholders', () => {
  const r = buildSite({ template: 'salon', siteUrl: URL_, ...sample, layout: 'multi', page: 'menu', preview: true, imageSrc: (role, p) => 'https://x.supabase.co/' + p.path });
  const { document: d } = parseHTML(r.html);
  assert.equal(d.querySelector('h1').textContent, '服務與價格');
  assert.equal(r.files, undefined);
  assert.deepEqual(r.pages.map((p) => p.key), ['home', 'about', 'menu', 'interior', 'news', 'faq', 'visit']);
});

test('404 page: built for single and multi, noindex, root links to every page, not in sitemap', () => {
  for (const layout of ['single', 'multi']) {
    const { files } = build({ layout });
    const nf = files['404.html'];
    assert.ok(nf, layout);
    const { document: d } = parseHTML(nf);
    assert.equal(d.querySelector('meta[name=robots]').getAttribute('content'), 'noindex');
    assert.equal(d.querySelectorAll('h1').length, 1);
    assert.equal(d.querySelectorAll('link[rel=canonical]').length, 0);
    const hrefs = [...d.querySelectorAll('main a')].map((a) => a.getAttribute('href'));
    assert.equal(hrefs[0], '/');
    for (const h of hrefs) assert.ok(h === '/' || (h.slice(1) + 'index.html') in files, layout + ' ' + h);
    assert.ok(!files['sitemap.xml'].includes('404'));
    assert.ok(!BRAND.test(nf));
  }
});

// ── 雜誌式首頁、依螢幕挑圖、標題字型 ──
import { buildHeadingFont, headingText } from '../build/lib/heading-font.mjs';
import { makeSmall } from '../build/lib/images.mjs';

test('magazine home: full hero, alternating split blocks, info band, photo strip; every industry; links resolve', () => {
  const c = JSON.parse(JSON.stringify(sample.content)); c.homeStyle = 'magazine';
  c.photos.room = [1, 2, 3, 4, 5, 6].map((i) => ({ path: 'x/r' + i + '.webp', w: 1600, h: 1200 }));
  for (const layout of ['single', 'multi']) {
    const { files } = build({ content: c, layout });
    const { document: d } = parseHTML(files['index.html']);
    assert.ok(d.querySelector('section.hero.full'), layout);
    const splits = [...d.querySelectorAll('section.split-full')];
    assert.equal(splits.length, 3, layout);
    assert.deepEqual(splits.map((s) => s.classList.contains('right') ? 'R' : 'L'), ['R', 'L', 'R']);
    assert.ok(d.querySelector('section.band') && d.querySelectorAll('.strip img').length === 3, layout);
    assert.equal(d.querySelectorAll('h1').length, 1);
    let last = 1; d.querySelectorAll('h1,h2,h3').forEach((h) => { const n = Number(h.tagName[1]); assert.ok(n <= last + 1, layout + ' skip ' + h.tagName); last = n; });
  }
  for (const ind of INDUSTRIES) assert.ok(build({ template: ind.key, content: c }).html.includes('split-full'), ind.key);
});

test('responsive images: srcset only in real builds with variants; sizes match the layout', () => {
  const c = JSON.parse(JSON.stringify(sample.content)); c.homeStyle = 'magazine';
  c.photos.hero = { path: 'x/h.webp', w: 1600, h: 1067 };
  c.photos.room = [{ path: 'x/1.webp', w: 1600, h: 1200 }, { path: 'x/2.webp', w: 700, h: 900 }];
  const on = parseHTML(build({ content: c, imageVariants: true }).html).document;
  const hero = on.querySelector('#top img');
  assert.equal(hero.getAttribute('srcset'), 'images/hero-800.webp 800w, images/hero.webp 1600w');
  assert.equal(hero.getAttribute('sizes'), '100vw');
  assert.equal(on.querySelector('#about img').getAttribute('sizes'), '(min-width:760px) 50vw, 100vw');
  assert.equal(on.querySelector('#menu img').getAttribute('srcset'), null, 'narrow original gets no srcset');
  assert.equal(on.querySelector('#about img').getAttribute('fetchpriority'), 'low');
  assert.ok(!build({ content: c }).html.includes('srcset'));
  assert.ok(!buildSite({ template: 'cafe', siteUrl: URL_, ...sample, content: c, imageVariants: true, preview: true, imageSrc: () => 'https://x/y.webp' }).html.includes('srcset'));
  const multiFiles = build({ content: c, layout: 'multi', imageVariants: true }).files;
  assert.ok(parseHTML(multiFiles['about/index.html']).document.querySelector('img').getAttribute('srcset').startsWith('../images/room-1-800.webp'));
});

test('heading font: @font-face only when requested; subset holds exactly the heading characters', async () => {
  assert.ok(!build().html.includes('@font-face'));
  const { files } = build({ headingFont: true });
  assert.ok(files['index.html'].includes('font-family:"SiteHeading";src:url(/fonts/heading.woff2)'));
  assert.ok(!buildSite({ template: 'cafe', siteUrl: URL_, ...sample, headingFont: true, preview: true }).html.includes('@font-face'));
  const text = headingText(files);
  assert.ok(text.includes('午') && text.includes('問') && !text.includes('<'));
  const font = await buildHeadingFont(files);
  assert.equal(font.slice(0, 4).toString('latin1'), 'wOF2');
  assert.ok(font.length < 80 * 1024, 'subset stays small: ' + font.length);
});

test('makeSmall: 800px WebP from a large image, never enlarges', async () => {
  const { default: sharp } = await import('sharp');
  const big = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#a08060' } }).jpeg().toBuffer();
  const meta = await sharp(await makeSmall(big)).metadata();
  assert.equal(meta.format, 'webp'); assert.equal(meta.width, 800);
  const small = await sharp({ create: { width: 500, height: 400, channels: 3, background: '#ccc' } }).png().toBuffer();
  assert.equal((await sharp(await makeSmall(small)).metadata()).width, 500);
});
