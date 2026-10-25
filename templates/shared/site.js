// 瀏覽器預覽與 Node 建置共用的入口：同一份內容 → 同一份 HTML。
import { normalizeContent, normalizePalette, normalizeSections, liveMenu, liveFaq, liveNews } from './content.js';
import { getPalette } from './palettes.js';
import { getTemplate } from './registry.js';
import { buildTitle, buildDescription, pageTitle, pageDescription, absUrl, robotsTxt, sitemapXml, llmsTxt } from './seo.js';
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
export function imagePlan(content) {
  const out = [];
  if (content.photos.hero) out.push({ role: 'hero', file: 'images/hero.' + ext(content.photos.hero.path), path: content.photos.hero.path });
  content.photos.room.forEach((p, i) => out.push({ role: 'room-' + (i + 1), file: 'images/room-' + (i + 1) + '.' + ext(p.path), path: p.path }));
  return out;
}

/**
 * input: { template, content, palette, sections, layout?, pages?, page?, siteUrl, preview?, imageSrc?(role, photo, plannedFile), lastmod? }
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
  const fileOf = {}; plan.forEach((p) => { fileOf[p.role] = p.file; });
  const show = effectiveSections(content, sections, preview);
  // 實際輸出的頁面：勾選了、而且（正式建置時）有內容可放
  const hasContent = { about: true, visit: true, menu: show.menu, interior: show.interior, news: show.news, faq: show.faq };
  const pageList = enabledPages(layout, pagesOn, input.template).filter((p) => p.key === 'home' || hasContent[p.key]);
  const pathOf = Object.fromEntries(pageList.map((p) => [p.key, p.path]));
  const base = {
    tpl, content, paletteId, colors: getPalette(paletteId), sections, show, siteUrl, preview, layout, pageList,
    address: parseAddress(content.address),
    images: plan.map((p) => p.file),
    heroFile: fileOf.hero || '',
    pageLinks: pageList.map((p) => ({ label: p.label, path: p.path }))
  };
  const renderPage = (pg) => {
    const depth = pg.path ? 1 : 0;
    const up = depth ? '../' : '';
    // 建置時不傳 imageSrc → 一律用 images/ 相對路徑（子頁加 ../）；預覽頁傳入 Supabase 公開網址
    const imageSrc = (role, photo) => (input.imageSrc ? input.imageSrc(role, photo, fileOf[role]) : (fileOf[role] ? up + fileOf[role] : ''));
    const href = (key) => (key === 'home' ? (up || './') : up + (pathOf[key] || ''));
    const model = {
      ...base, page: pg.key, pageInfo: multi ? pg : null, imageSrc, href,
      pageUrl: absUrl(siteUrl, pg.path),
      faqOnPage: multi ? pg.key === 'faq' : true,
      title: multi ? pageTitle(content, tpl, pg) : buildTitle(content, tpl),
      description: multi ? pageDescription(content, tpl, pg) : buildDescription(content, tpl)
    };
    return { html: tpl.render(model), title: model.title, description: model.description };
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
      'sitemap.xml': sitemapXml(siteUrl, lastmod, pageList.map((p) => p.path)),
      'llms.txt': llmsTxt({ ...base, title: home.title, description: home.description })
    };
    pageList.filter((p) => p.path).forEach((p) => { out.files[p.path + 'index.html'] = renderPage(p).html; });
  }
  return out;
}
