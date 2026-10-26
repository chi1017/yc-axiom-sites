// 瀏覽器預覽與 Node 建置共用的入口：同一份內容 → 同一份 HTML。
import { normalizeContent, normalizePalette, normalizeSections, liveMenu, liveFaq, liveNews, livePosts, liveItems } from './content.js';
import { clip } from './escape.js';
import { getPalette } from './palettes.js';
import { getTemplate } from './registry.js';
import { buildTitle, buildDescription, pageTitle, pageDescription, pageLead, fitDescription, absUrl, robotsTxt, sitemapXml, llmsTxt } from './seo.js';
import { normalizeLayout, normalizePages, enabledPages } from './pages.js';
import { parseAddress } from './region.js';

export function effectiveSections(content, sections, preview) {
  const on = (k, has) => !!sections[k] && (preview || has);
  return {
    menu: on('menu', liveMenu(content).length > 0),
    interior: on('interior', content.photos.room.length > 0),
    faq: on('faq', liveFaq(content).length > 0),
    news: on('news', liveNews(content).length > 0)
  };
}

function ext(path) { const m = String(path).match(/\.(webp|jpe?g|png)$/i); return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'webp'; }

// 部署包裡的圖片檔名（固定，與客戶上傳檔名無關）
// sizes：手機用的小尺寸版本（寬 480／800px、WebP），建置時由原圖產生（build/lib/images.mjs makeSmall）
// small 是 800px 版本（相容舊程式）；480px 給手機上兩欄的照片牆用，檔案約 800px 版的三分之一
export const SMALL_WIDTH = 800;
export const VARIANT_WIDTHS = [480, 800];
export function imagePlan(content) {
  const out = [];
  const add = (role, p) => out.push({ role, file: 'images/' + role + '.' + ext(p.path), small: 'images/' + role + '-' + SMALL_WIDTH + '.webp',
    variants: VARIANT_WIDTHS.map((w) => ({ w, file: 'images/' + role + '-' + w + '.webp' })), path: p.path, w: p.w || 0 });
  if (content.photos.hero) add('hero', content.photos.hero);
  content.photos.room.forEach((p, i) => add('room-' + (i + 1), p));
  if (content.shop.enabled) liveItems(content).forEach((it) => { if (it.photo) add('item-' + it.id, it.photo); });
  return out;
}

/**
 * input: { template, content, palette, sections, layout?, pages?, page?, siteUrl, preview?, imageSrc?(role, photo, plannedFile), lastmod?, headingFont?, siteId?, publicApi? }
 *  - siteId／publicApi：聯絡表單送出與瀏覽計數用（publicApi＝Edge Function site-public 的網址）
 *  - payReady：店家已在會員專區設定綠界收款（線上購買與預約訂金才會開放付款）
 *  - imageVariants：true 時圖片加上 srcset（呼叫端要另外寫入 images/<role>-800.webp）
 *  - headingFont：true 時 CSS 加上標題網頁字型（呼叫端要另外寫入 fonts/heading.woff2）
 *  - template：行業 key（industries.js），所有行業共用同一套版型
 *  - layout：'single'（預設，一頁版）｜'multi'（多頁版，依 pages 勾選輸出各頁）
 *  - page：預覽時要看哪一頁（多頁版），省略為首頁
 * 回傳: { html, files, images, title, description, pages }
 *  - html：首頁（或 page 指定的頁）
 *  - files：正式建置的所有檔案（多頁版含 <path>index.html）
 *  - preview=true：空欄位顯示 [提示]，圖片由 imageSrc 決定（通常是 Supabase 公開網址）
 *  - preview=false：不輸出任何提示；圖片一律是 images/ 下的相對路徑
 */
export function buildSite(input) {
  const tpl = getTemplate(input.template);
  if (!tpl) throw new Error('unknown template: ' + input.template);
  const preview = !!input.preview;
  const content = normalizeContent(input.content);
  const paletteId = normalizePalette(input.palette);
  const layout = normalizeLayout(input.layout);
  const multi = layout === 'multi';
  const pagesOn = normalizePages(input.pages);
  // 多頁版：區塊開關跟著頁面勾選走；一頁版：用 sections
  const sections = multi ? { menu: pagesOn.menu, interior: pagesOn.interior, faq: pagesOn.faq, news: pagesOn.news } : normalizeSections(input.sections);
  const siteUrl = String(input.siteUrl || 'https://example.pages.dev/').replace(/\/?$/, '/');
  const plan = imagePlan(content);
  const fileOf = {}, planOf = {}; plan.forEach((p) => { fileOf[p.role] = p.file; planOf[p.role] = p; });
  const variants = !preview && !!input.imageVariants;   // 建置端會另外寫入 small 檔
  const show = effectiveSections(content, sections, preview);
  // 實際輸出的頁面：勾選了、而且（正式建置時）有內容可放
  const hasContent = { about: true, visit: true, menu: show.menu, interior: show.interior, news: show.news, faq: show.faq };
  const pageList = enabledPages(layout, pagesOn, input.template).filter((p) => p.key === 'home' || hasContent[p.key]);
  const pathOf = Object.fromEntries(pageList.map((p) => [p.key, p.path]));
  const base = {
    tpl, content, paletteId, colors: getPalette(paletteId), sections, show, siteUrl, preview, layout, pageList,
    // 聯絡表單與瀏覽計數（正式建置時由 build/run.mjs 傳入；沒有時表單顯示為示範、不送統計）
    siteId: input.siteId || '', bookingAction: input.publicApi ? input.publicApi.replace(/\/$/, '') + '/booking' : '', formAction: input.publicApi ? input.publicApi.replace(/\/$/, '') + '/contact' : '', hitUrl: input.publicApi ? input.publicApi.replace(/\/$/, '') + '/hit' : '',
    shopAction: input.publicApi ? input.publicApi.replace(/\/$/, '') + '/shop' : '', payReady: !!input.payReady,
    headingFont: !preview && !!input.headingFont,   // 建置端會另外產生 fonts/heading.woff2（build/lib/heading-font.mjs）
    address: parseAddress(content.address),
    images: plan.map((p) => p.file),
    heroFile: fileOf.hero || '',
    pageLinks: pageList.map((p) => ({ label: p.label, path: p.path }))
  };
  // srcset：原圖寬度大於小圖才提供；寬度不明時當作 1600（編輯器上傳上限）
  const srcsetFor = (up) => (role) => {
    const p = planOf[role]; if (!variants || !p) return '';
    const w = p.w || 1600;
    const smaller = p.variants.filter((v) => v.w < w);
    return smaller.length ? smaller.map((v) => up + v.file + ' ' + v.w + 'w').concat(up + p.file + ' ' + w + 'w').join(', ') : '';
  };
  const posts = livePosts(content);
  // 多頁版的線上購買有自己的頁面 shop/；一頁版放在首頁
  const shopPage = multi && content.shop.enabled && liveItems(content).length > 0;
  const hasEn = content.en.enabled && !!content.en.name && !!content.en.intro;
  const renderPage = (pg, extra = {}) => {
    const depth = extra.depth != null ? extra.depth : (pg.path ? 1 : 0);
    const up = '../'.repeat(depth);
    // 建置時不傳 imageSrc → 一律用 images/ 相對路徑（子頁加 ../）；預覽頁傳入 Supabase 公開網址
    const imageSrc = (role, photo) => (input.imageSrc ? input.imageSrc(role, photo, fileOf[role]) : (fileOf[role] ? up + fileOf[role] : ''));
    const href = (key) => (key === 'home' ? (up || './') : up + (pathOf[key] || ''));
    // srcset：原圖寬度大於 800 才提供小圖；寬度不明時當作 1600（編輯器上傳上限）
    const srcsetOf = srcsetFor(up);
    const model = {
      ...base, page: pg.key, pageInfo: multi ? pg : null, imageSrc, srcsetOf, href,
      postsHref: up + 'posts/', shopHref: up + 'shop/', postHref: (id) => up + 'posts/' + id + '/', anchorBase: depth ? up : '', enHref: up + 'en/',
      // 英文版開啟時，中文首頁與英文頁用 hreflang 互相對應
      alternates: hasEn && pg.key === 'home' ? [['zh-Hant', siteUrl], ['en', absUrl(siteUrl, 'en/')], ['x-default', siteUrl]] : null,
      pageUrl: absUrl(siteUrl, pg.path),
      // FAQPage：一頁版在首頁；多頁版在常見問題頁（全部）與首頁（前幾題，與畫面上顯示的一致）
      faqOnPage: multi ? (pg.key === 'faq' ? true : pg.key === 'home' ? 'teaser' : false) : true,
      title: multi ? pageTitle(content, tpl, pg) : buildTitle(content, tpl),
      description: multi ? pageDescription(content, tpl, pg) : buildDescription(content, tpl),
      lead: multi ? pageLead(content, tpl, pg) : '',
      ...(extra.model || {})
    };
    return { html: tpl.render(model), title: model.title, description: model.description };
  };
  // 文章列表頁與每篇文章頁（一頁版、多頁版都有）
  const name = content.name || '本店';
  const homeCrumb = { name, url: siteUrl };
  const renderPostList = () => renderPage({ key: 'posts', label: '文章', path: 'posts/' }, { depth: 1, model: {
    pageInfo: { key: 'posts', label: '文章' }, faqOnPage: false,
    title: pageTitle(content, tpl, { key: 'posts', label: '文章' }), description: fitDescription(clip(name + '的文章：' + posts.slice(0, 5).map((p) => p.title).join('、'), 100) + '。', content, tpl), lead: name + '的文章與分享。',
    crumbs: [homeCrumb, { name: '文章', url: absUrl(siteUrl, 'posts/') }] } });
  const renderPost = (post) => {
    const url = absUrl(siteUrl, 'posts/' + post.id + '/');
    const desc = fitDescription(clip(post.body.replace(/\s+/g, ' '), 120), content, tpl);
    return renderPage({ key: 'post', label: post.title, path: 'posts/' + post.id + '/' }, { depth: 2, model: {
      post, pageInfo: { key: 'post', label: post.title }, faqOnPage: false, title: post.title + '｜' + name, description: desc,
      crumbs: [homeCrumb, { name: '文章', url: absUrl(siteUrl, 'posts/') }, { name: post.title, url }],
      extraLd: [{ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, datePublished: post.date || undefined, dateModified: post.date || undefined,
        mainEntityOfPage: url, url, description: desc, author: { '@type': 'Organization', name, url: siteUrl }, publisher: { '@id': siteUrl + '#business' },
        ...(fileOf.hero ? { image: absUrl(siteUrl, fileOf.hero) } : {}) }] } });
  };
  const want = pageList.find((p) => p.key === input.page) || pageList[0];
  const main = renderPage(want);
  const out = { html: main.html, title: main.title, description: main.description, images: plan, pages: pageList.map((p) => ({ key: p.key, label: p.label, path: p.path })) };
  if (!preview) {
    const lastmod = input.lastmod || new Date().toISOString().slice(0, 10);
    const home = want.key === 'home' ? main : renderPage(pageList[0]);
    out.files = {
      'index.html': home.html,
      'robots.txt': robotsTxt(siteUrl),
      'sitemap.xml': sitemapXml(siteUrl, lastmod, pageList.map((p) => p.path).concat(shopPage ? ['shop/'] : []).concat(posts.length ? ['posts/', ...posts.map((p) => 'posts/' + p.id + '/')] : []).concat(hasEn ? ['en/'] : [])),
      'llms.txt': llmsTxt({ ...base, title: home.title, description: home.description })
    };
    pageList.filter((p) => p.path).forEach((p) => { out.files[p.path + 'index.html'] = renderPage(p).html; });
    // Cloudflare Pages 沒有 404.html 時會把所有網址都回首頁（狀態 200），有了才會回真正的 404
    out.files['404.html'] = tpl.renderNotFound(base);
    if (content.contactForm || content.bookingForm) out.files['thanks/index.html'] = tpl.renderThanks(base);
    if ((content.shop.enabled && liveItems(content).length) || (content.bookingForm && content.bookingDeposit)) out.files['order/index.html'] = tpl.renderOrderDone(base);
    if (shopPage) {
      out.files['shop/index.html'] = renderPage({ key: 'shop', label: '線上購買', path: 'shop/' }, { depth: 1, model: {
        pageInfo: { key: 'shop', label: '線上購買' }, faqOnPage: false,
        title: pageTitle(content, tpl, { key: 'shop', label: '線上購買' }),
        description: fitDescription(clip(name + '線上購買：' + liveItems(content).slice(0, 6).map((i) => i.name).join('、'), 100) + '。', content, tpl),
        lead: '選好品項與數量，填寫訂購單後線上付款。',
        crumbs: [homeCrumb, { name: '線上購買', url: absUrl(siteUrl, 'shop/') }] } }).html;
    }
    if (hasEn) {
      const enModel = { ...base, page: 'en', pageInfo: null, href: (k) => '../' + (k === 'home' ? '' : (pathOf[k] || '')), imageSrc: (role) => (fileOf[role] ? '../' + fileOf[role] : ''),
        srcsetOf: srcsetFor('../'), pageUrl: absUrl(siteUrl, 'en/'), title: content.en.name, description: content.en.intro };
      out.files['en/index.html'] = tpl.renderEn(enModel);
    }
    if (posts.length) {
      out.files['posts/index.html'] = renderPostList().html;
      posts.forEach((p) => { out.files['posts/' + p.id + '/index.html'] = renderPost(p).html; });
    }
  }
  return out;
}
