// 版型展示：每個行業用 templates/gallery/samples.mjs 的虛構店家建一個範例網站，全部放在同一個 Cloudflare Pages 專案（yc-templates）的子路徑 /<行業代碼>/。
// 範例店家是虛構的：一律 noindex，頁尾標示「示範網站」。照片來自 Unsplash（只用免費授權的照片，不用 Unsplash+）。
// 用法（GitHub Actions）：node build/deploy-gallery.mjs [--no-deploy] [--offline] [--refresh-photos]
//   --offline：不連網，照片用灰色色塊（本機測試用）
//   --refresh-photos：重新挑照片（預設沿用 templates/gallery/photos.json，缺的行業才挑）
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { buildSite } from '../templates/shared/site.js';
import { emptyContent } from '../templates/shared/content.js';
import { INDUSTRIES } from '../templates/shared/industries.js';
import { SAMPLES, HOURS } from '../templates/gallery/samples.mjs';
import { makeCloudflare } from './lib/cloudflare.mjs';
import { HEADERS_FILE } from './run.mjs';
import { buildHeadingFont, HEADING_FONT_FILE } from './lib/heading-font.mjs';
import { makeSmall } from './lib/images.mjs';

// 錯誤訊息用 ::error:: 輸出，GitHub Actions 的摘要畫面看得到
const fail = (e) => { process.exitCode = 1; process.stdout.write('::error::' + String(e && e.message || e).replace(/\n/g, ' ') + '\n'); };
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
const args = process.argv.slice(2);
const OFFLINE = args.includes('--offline'), NO_DEPLOY = args.includes('--no-deploy') || OFFLINE, REFRESH = args.includes('--refresh-photos');
const PROJECT = 'yc-templates';
const OUT = 'dist-gallery';
const PHOTOS_FILE = new URL('../templates/gallery/photos.json', import.meta.url).pathname;
const NOTE = '<p class="demo-note" style="margin:8px 0 0;font-size:13px">此為版型範例：店家、地址、電話與內容皆為虛構，照片來自 Unsplash。</p>';
const FONT_BY_GROUP = { 餐飲: 'serif', 美業: 'serif', 運動與健康: 'sans', 教育: 'round', 零售: 'serif', 生活服務: 'sans', 住宿: 'kai', 專業服務: 'sans', 其他: 'serif' };

// ── 1. 每個行業都要有範例 ──
const byKey = Object.fromEntries(SAMPLES.map((s) => [s.k, s]));
const missing = INDUSTRIES.filter((i) => !byKey[i.key]).map((i) => i.key);
if (missing.length) throw new Error('這些行業還沒有範例內容：' + missing.join(', '));

// ── 2. 挑照片（Unsplash 網站的公開搜尋，只取免費授權、橫式的照片）──
const photos = existsSync(PHOTOS_FILE) ? JSON.parse(readFileSync(PHOTOS_FILE, 'utf8')) : {};
// 公開搜尋頁：只取 images.unsplash.com/photo-（免費授權；Unsplash+ 的照片在 plus.unsplash.com，不會被取到）
async function pickFromPage(s) {
  const r = await fetch('https://unsplash.com/s/photos/' + encodeURIComponent(s.q.replace(/\s+/g, '-')) + '?orientation=landscape', { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', Accept: 'text/html' } });
  if (!r.ok) throw new Error('Unsplash 搜尋頁失敗 ' + s.k + ' ' + r.status);
  const ids = [...new Set([...(await r.text()).matchAll(/https:\/\/images\.unsplash\.com\/(photo-[0-9]+-[0-9a-f]+)/g)].map((m) => m[1]))];
  if (ids.length < 3) throw new Error(s.k + ' 搜尋頁的免費照片不足 3 張（' + s.q + '）');
  return ids.slice(0, 3).map((id) => ({ id, alt: '' }));
}
async function pickPhotos(s) {
  const url = 'https://unsplash.com/napi/search/photos?per_page=30&orientation=landscape&query=' + encodeURIComponent(s.q);
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (YC AXIOM template gallery)', Accept: 'application/json' } });
  if (!r.ok) return pickFromPage(s);
  const j = await r.json();
  const free = (j.results || []).filter((p) => !p.premium && !p.plus && p.urls && /^https:\/\/images\.unsplash\.com\/photo-/.test(p.urls.raw || ''));
  if (free.length < 3) throw new Error(s.k + ' 免費照片不足 3 張（' + s.q + '）');
  return free.slice(0, 3).map((p) => ({ id: p.urls.raw.split('/').pop().split('?')[0], alt: p.alt_description || '', page: p.links && p.links.html, by: p.user && p.user.name }));
}
async function download(id, w, h) {
  if (OFFLINE) return sharp({ create: { width: w, height: h, channels: 3, background: { r: 180, g: 170, b: 160 } } }).webp({ quality: 60 }).toBuffer();
  const r = await fetch('https://images.unsplash.com/' + id + '?w=' + w + '&h=' + h + '&fit=crop&crop=entropy&q=80&fm=jpg');
  if (!r.ok) throw new Error('下載照片失敗 ' + id + ' ' + r.status);
  return sharp(Buffer.from(await r.arrayBuffer())).resize({ width: w, height: h, fit: 'cover' }).webp({ quality: 78 }).toBuffer();
}

const ROOT_URL = 'https://' + PROJECT + '.pages.dev/';
const fixedAddress = (s, i) => s.area + (s.area.endsWith('全區') ? '' : '示範路 ' + (100 + i) + ' 號');
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const list = [];
let i = 0;
for (const ind of INDUSTRIES) {
  const s = byKey[ind.key]; i++;
  if (!OFFLINE && (REFRESH || !photos[s.k])) { photos[s.k] = await pickPhotos(s); console.log('挑照片', s.k, photos[s.k].map((p) => p.id).join(' ')); }
  const ph = photos[s.k] || [{ id: 'x', alt: '' }, { id: 'y', alt: '' }, { id: 'z', alt: '' }];
  const c = emptyContent();
  Object.assign(c, {
    name: s.name, tagline: s.tag, intro: s.intro, address: fixedAddress(s, i), phone: '04-0000-0000',
    hours: HOURS[s.h], menu: s.items.map(([name, price]) => ({ name, price: price || null })),
    faq: s.faq.map(([q, a]) => ({ q, a })),
    heroStyle: s.home === 'magazine' || s.home === 'center' ? 'full' : 'card', homeStyle: s.home,
    photos: { hero: { path: 'g/' + s.k + '-hero.webp', w: 1600, h: 1067, alt: ph[0].alt || s.name }, room: [1, 2].map((n) => ({ path: 'g/' + s.k + '-room-' + n + '.webp', w: 1200, h: 900, alt: ph[n].alt || s.name })) }
  });
  c.style.font = FONT_BY_GROUP[ind.group] || 'serif';
  const siteUrl = ROOT_URL + s.k + '/';
  const r = buildSite({ template: s.k, content: c, palette: s.pal, sections: {}, layout: 'multi', siteUrl, headingFont: true, imageVariants: true });
  const font = await buildHeadingFont(r.files, c.style.font);
  const out = join(OUT, s.k);
  for (const [f, html] of Object.entries(r.files)) {
    const dest = join(out, f); mkdirSync(dirname(dest), { recursive: true });
    if (!f.endsWith('.html')) { if (!/^(robots\.txt|sitemap\.xml|llms\.txt)$/.test(f)) writeFileSync(dest, html); continue; }
    writeFileSync(dest, html
      .replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex, nofollow">')
      .replace(/url\(\/fonts\/heading\.woff2\)/g, 'url(/' + s.k + '/fonts/heading.woff2)')   // 子路徑：字型改成這個範例網站底下的路徑
      .replace('</footer>', '<div class="wrap">' + NOTE + '</div></footer>'));
  }
  const src = { hero: [ph[0].id, 1600, 1067], 'room-1': [ph[1].id, 1200, 900], 'room-2': [ph[2].id, 1200, 900] };
  let heroBuf = null;
  for (const p of r.images) {
    const [id, w, h] = src[p.role] || src['room-1'];
    const buf = await download(id, w, h); if (p.role === 'hero') heroBuf = buf;
    mkdirSync(dirname(join(out, p.file)), { recursive: true }); writeFileSync(join(out, p.file), buf);
    for (const v of p.variants) writeFileSync(join(out, v.file), await makeSmall(buf, v.w));
  }
  if (heroBuf) writeFileSync(join(out, 'thumb.webp'), await sharp(heroBuf).resize(640, 427, { fit: 'cover' }).webp({ quality: 72 }).toBuffer());
  if (font) { mkdirSync(join(out, 'fonts'), { recursive: true }); writeFileSync(join(out, HEADING_FONT_FILE), font); }
  list.push({ key: s.k, label: ind.label, group: ind.group, name: s.name, url: siteUrl, home: s.home, palette: s.pal });
}
if (!OFFLINE) writeFileSync(PHOTOS_FILE, JSON.stringify(photos, null, 1) + '\n');
writeFileSync(join(OUT, 'gallery.json'), JSON.stringify(list, null, 1));
writeFileSync(join(OUT, 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=https://chi1017.github.io/yc-axiom-site/rental/templates/"><a href="https://chi1017.github.io/yc-axiom-site/rental/templates/">YC AXIOM 網站租用版型展示</a>');
writeFileSync(join(OUT, 'robots.txt'), 'User-agent: *\nDisallow:\n');
writeFileSync(join(OUT, '_headers'), HEADERS_FILE + '/*\n  X-Robots-Tag: noindex, nofollow\n');
console.log('範例網站', list.length, '個 →', OUT);

if (!NO_DEPLOY) {
  const cf = makeCloudflare({ token: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID });
  const project = await cf.ensureProject(PROJECT);
  const p = spawnSync('npx', ['wrangler', 'pages', 'deploy', OUT, '--project-name', project.name, '--branch', 'main', '--commit-dirty=true'], { stdio: 'inherit', env: process.env });
  if (p.status !== 0) process.exit(1);
  console.log('::notice::版型展示：https://' + project.subdomain + '/');
}
