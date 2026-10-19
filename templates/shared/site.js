// 瀏覽器預覽與 Node 建置共用的入口：同一份內容 → 同一份 HTML。
import { normalizeContent, normalizePalette, normalizeSections, liveMenu, liveFaq, liveNews } from './content.js';
import { getPalette } from './palettes.js';
import { getTemplate } from './registry.js';
import { buildTitle, buildDescription, robotsTxt, sitemapXml, llmsTxt } from './seo.js';
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
 * input: { template, content, palette, sections, siteUrl, preview?, imageSrc?(role, photo, plannedFile), lastmod? }
 * 回傳: { html, files, images, title, description }
 *  - preview=true：空欄位顯示 [提示]，圖片由 imageSrc 決定（通常是 Supabase 公開網址）
 *  - preview=false：不輸出任何提示；圖片一律是 images/ 下的相對路徑
 */
export function buildSite(input) {
  const tpl = getTemplate(input.template);
  if (!tpl) throw new Error('unknown template: ' + input.template);
  const preview = !!input.preview;
  const content = normalizeContent(input.content);
  const paletteId = normalizePalette(input.palette);
  const sections = normalizeSections(input.sections);
  const siteUrl = String(input.siteUrl || 'https://example.pages.dev/').replace(/\/?$/, '/');
  const plan = imagePlan(content);
  const fileOf = {}; plan.forEach((p) => { fileOf[p.role] = p.file; });
  // 建置時不傳 imageSrc → 一律用 images/ 相對路徑；預覽頁（編輯器、管理員預覽）傳入 Supabase 公開網址
  const imageSrc = (role, photo) => (input.imageSrc ? input.imageSrc(role, photo, fileOf[role]) : (fileOf[role] || ''));
  const show = effectiveSections(content, sections, preview);
  const model = {
    tpl, content, paletteId, colors: getPalette(paletteId), sections, show, siteUrl, preview,
    address: parseAddress(content.address), imageSrc,
    images: plan.map((p) => p.file),
    heroFile: fileOf.hero || '',
    title: buildTitle(content, tpl),
    description: buildDescription(content, tpl)
  };
  const html = tpl.render(model);
  const out = { html, title: model.title, description: model.description, images: plan };
  if (!preview) {
    const lastmod = input.lastmod || new Date().toISOString().slice(0, 10);
    out.files = {
      'index.html': html,
      'robots.txt': robotsTxt(siteUrl),
      'sitemap.xml': sitemapXml(siteUrl, lastmod),
      'llms.txt': llmsTxt(model)
    };
  }
  return out;
}
