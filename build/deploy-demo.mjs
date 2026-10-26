// 公開示範站：用 templates/cafe/sample.json 與 demo-images 建置後部署到 Cloudflare Pages，
// 用來和其他平台的示範站做公平比較（內容量、照片大小與客戶網站相同）。
// 示範店家是虛構的，所以一律 noindex（與 Wix 示範站相同的起跑點），也不會出現在搜尋結果。
// 用法（GitHub Actions）：node build/deploy-demo.mjs [--no-deploy]
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildSite, VARIANT_WIDTHS } from '../templates/shared/site.js';
import { makeCloudflare } from './lib/cloudflare.mjs';
import { HEADERS_FILE } from './run.mjs';
import { buildHeadingFont, HEADING_FONT_FILE } from './lib/heading-font.mjs';
import { makeSmall } from './lib/images.mjs';
import { DEMO_PHOTOS } from '../templates/cafe/demo-photos.mjs';

const sample = JSON.parse(readFileSync(new URL('../templates/cafe/sample.json', import.meta.url)));
const IMG_DIR = new URL('../templates/cafe/demo-images/', import.meta.url).pathname;
// 只保留一個對外展示用的示範站：多頁版＋雜誌式首頁（滿版主視覺、圖文交錯、照片牆），可以直接給客戶看、發文分享
const DEMOS = [
  { project: 'wuhou-cafe-demo', layout: 'multi', homeStyle: 'magazine' }
];
// 已停用的舊示範站：改成轉址到上面這個（不刪除 Cloudflare 專案；要刪除請在 Cloudflare 後台手動處理）
const RETIRED = ['wuhou-cafe-demo-multi', 'wuhou-cafe-demo-magazine'];
const DEMO_NOTE = '<p class="demo-note" style="margin:8px 0 0;font-size:13px">此為示範網站：店家與內容皆為虛構，照片來自 Unsplash。</p>';
const noDeploy = process.argv.includes('--no-deploy');
// --compare：只部署「與 Wix Brew 範本同內容量」的比較用示範站（一頁版、標準首頁：主視覺、介紹、3 張照片、6 個附圖商品、1 個大圖區塊）
const compareOnly = process.argv.includes('--compare');
export const COMPARE = { project: 'yc-compare-cafe' };

export async function buildCompare({ siteUrl, outDir }) {
  const sharp = (await import('sharp')).default;
  const photo = (f, w, h, alt) => ({ path: 'demo/' + f + '.webp', w, h, alt });
  const content = {
    name: '晨焙咖啡', tagline: '當地烘焙的咖啡豆與手沖',
    intro: '我們的咖啡豆來自世界各地的小農，每週在店裡少量烘焙，保留每支豆子原本的香氣與甜感。\n\n不論是早上外帶一杯濃縮，或是午後坐下來慢慢喝一杯手沖，都歡迎你來。',
    address: '高雄市苓雅區四維三路100號', phone: '07-123-4567',
    hours: { mon: { open: '08:00', close: '18:00' }, tue: { open: '08:00', close: '18:00' }, wed: { open: '08:00', close: '18:00' }, thu: { open: '08:00', close: '18:00' }, fri: { open: '08:00', close: '18:00' }, sat: { open: '09:00', close: '17:00' }, sun: { closed: true } },
    heroStyle: 'full', homeStyle: 'standard',
    photos: { hero: photo('hero', 1600, 1067, '店內靠窗座位'), room: [photo('room-2', 1200, 1600, '濃縮咖啡'), photo('room-3', 1600, 1200, '手沖咖啡'), photo('room-6', 1600, 1200, '滴濾咖啡')] },
    blocks: [{ id: 'fresh', title: '新鮮送達', body: '烘焙後一週內寄出，讓你在家也能喝到最新鮮的味道。', photo: photo('room-1', 1600, 1200, '新鮮烘焙的咖啡豆'), side: 'left' }],
    shop: { enabled: true, note: '', items: [1, 2, 3, 4, 5, 6].map((i) => ({ id: 'blend0' + i, name: '綜合豆 0' + i, price: [850, 850, 300, 230, 750, 450][i - 1], desc: '半磅裝', photo: photo('item-' + i, 800, 800, '綜合豆 0' + i) })) },
    order: ['about', 'interior', 'blocks', 'shop', 'visit']
  };
  const r = buildSite({ template: 'cafe', content, palette: 'caramel', sections: { menu: false, interior: true, faq: false, news: false }, layout: 'single', siteUrl, headingFont: true, imageVariants: true });
  const font = await buildHeadingFont(r.files, 'serif');
  rmSync(outDir, { recursive: true, force: true });
  for (const [f, c] of Object.entries(r.files)) {
    const dest = join(outDir, f); mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, f.endsWith('.html') ? c.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex, nofollow">').replace('</footer>', '<div class="wrap">' + DEMO_NOTE + '</div></footer>') : c);
  }
  mkdirSync(join(outDir, 'images'), { recursive: true });
  // 圖片檔名依建置計畫（hero、room-1..3、blk-fresh、item-blend0N）；商品圖從示範照片裁成 800×800 的正方形（每張不同）
  const srcOf = { hero: 'hero', 'room-1': 'room-2', 'room-2': 'room-3', 'room-3': 'room-6', 'blk-fresh': 'room-1' };
  const itemSrc = ['room-4', 'room-5', 'room-1', 'room-2', 'room-3', 'room-6'];
  for (const p of r.images) {
    let buf;
    const m = p.role.match(/^item-blend0(\d)$/);
    if (m) {
      const i = Number(m[1]) - 1;
      buf = await sharp(readFileSync(join(IMG_DIR, itemSrc[i] + '.webp'))).resize(800, 800, { fit: 'cover', position: ['centre', 'north', 'south', 'east', 'west', 'entropy'][i] }).webp({ quality: 82 }).toBuffer();
    } else buf = readFileSync(join(IMG_DIR, srcOf[p.role] + '.webp'));
    writeFileSync(join(outDir, p.file), buf);
    for (const v of p.variants) writeFileSync(join(outDir, v.file), await makeSmall(buf, v.w));
  }
  if (font) { mkdirSync(join(outDir, 'fonts'), { recursive: true }); writeFileSync(join(outDir, HEADING_FONT_FILE), font); }
  writeFileSync(join(outDir, '_headers'), HEADERS_FILE + '/*\n  X-Robots-Tag: noindex, nofollow\n');
  return r;
}

export async function buildDemo({ layout, homeStyle, siteUrl, outDir }) {
  const content = JSON.parse(JSON.stringify(sample.content));
  content.heroStyle = 'full';
  if (homeStyle) content.homeStyle = homeStyle;
  // 展示新功能：客人評價、Google 地圖（點了才載入）、聯絡表單（示範站不會送出）
  content.reviews = [
    { name: '常客 林小姐', text: '平日下午來最舒服，窗邊的位子曬得到太陽，手沖每次都會跟我聊今天的豆子。' },
    { name: '附近上班族', text: '午休會外帶冰滴，甜點是自己烤的，司康外酥內軟，週末常常賣完。' },
    { name: '第一次來訪的旅客', text: '巷子裡很安靜，店員推薦的淺焙單品很順口，下次來高雄還會再來。' }
  ];
  content.showMap = true;
  content.contactForm = true;
  content.bookingForm = true;
  content.posts = [
    { id: '2026-10-08-new-beans', title: '秋天的新豆：衣索比亞淺焙', date: '2026-10-08', body: '這個秋天我們進了一支衣索比亞的水洗豆，淺焙之後有明顯的花香與柑橘的酸甜，很適合用手沖慢慢喝。\n\n第一次喝淺焙的朋友可以先試冰手沖，酸感會更柔和。豆子也有少量分裝販售，歡迎來店詢問。' },
    { id: '2026-10-20-scone-day', title: '週末限定：現烤司康', date: '2026-10-20', body: '每週六、週日早上會烤一批原味與伯爵茶司康，通常下午就會賣完。\n\n想確定吃得到的話，可以先用網站的線上預約留下時間，我們會幫你保留。' }
  ];
  content.en = { enabled: true, name: 'Afternoon Sun Coffee', tagline: 'Pour-over coffee and home-baked desserts in Kaohsiung', intro: 'Afternoon Sun Coffee is a small independent café tucked in a quiet lane of Lingya District, Kaohsiung. We brew single-origin pour-over coffee and bake our own scones and cakes every week.\n\nThe window seats get warm afternoon light, and every seat has a power outlet. Walk-ins are welcome on weekdays; we recommend booking on weekend afternoons.', address: 'No. 100, Siwei 3rd Rd., Lingya Dist., Kaohsiung City 802, Taiwan' };
  const dims = (f) => (/room-(2|5)/.test(f) ? { w: 1200, h: 1600 } : f === 'hero' ? { w: 1600, h: 1067 } : { w: 1600, h: 1200 });
  const alt = (f) => (DEMO_PHOTOS.find((p) => p.file === f + '.webp') || {}).alt || '';
  content.photos.hero = { path: 'demo/hero.webp', ...dims('hero'), alt: alt('hero') };
  content.photos.room = [1, 2, 3, 4, 5, 6].map((i) => ({ path: 'demo/room-' + i + '.webp', ...dims('room-' + i), alt: alt('room-' + i) }));
  const r = buildSite({ template: 'cafe', ...sample, content, layout, siteUrl, headingFont: true, imageVariants: true });
  const font = await buildHeadingFont(r.files);
  rmSync(outDir, { recursive: true, force: true });
  for (const [f, c] of Object.entries(r.files)) {
    const dest = join(outDir, f); mkdirSync(dirname(dest), { recursive: true });
    // 虛構店家：不讓搜尋引擎收錄（與 Wix 示範站一樣用 robots meta，robots.txt 維持允許）
    writeFileSync(dest, f.endsWith('.html') ? c.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex, nofollow">').replace('</footer>', '<div class="wrap">' + DEMO_NOTE + '</div></footer>') : c);
  }
  mkdirSync(join(outDir, 'images'), { recursive: true });
  for (const f of readdirSync(IMG_DIR)) {
    copyFileSync(join(IMG_DIR, f), join(outDir, 'images', f));
    for (const w of VARIANT_WIDTHS) writeFileSync(join(outDir, 'images', f.replace(/\.webp$/, '-' + w + '.webp')), await makeSmall(readFileSync(join(IMG_DIR, f)), w));
  }
  mkdirSync(join(outDir, 'fonts'), { recursive: true }); writeFileSync(join(outDir, HEADING_FONT_FILE), font);
  writeFileSync(join(outDir, '_headers'), HEADERS_FILE + '/*\n  X-Robots-Tag: noindex, nofollow\n');
  return r;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const cf = noDeploy ? null : makeCloudflare({ token: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID });
  if (compareOnly) {
    const project = cf ? await cf.ensureProject(COMPARE.project) : { name: COMPARE.project, subdomain: COMPARE.project + '.pages.dev' };
    const siteUrl = 'https://' + project.subdomain + '/', out = 'dist-demo/' + COMPARE.project;
    const r = await buildCompare({ siteUrl, outDir: out });
    console.log('compare', siteUrl, Object.keys(r.files).length, 'files', r.images.length, 'images');
    if (cf) {
      const p = spawnSync('npx', ['wrangler', 'pages', 'deploy', out, '--project-name', project.name, '--branch', 'main', '--commit-dirty=true'], { stdio: 'inherit', env: process.env });
      if (p.status !== 0) process.exit(1);
      console.log('::notice::比較用示範站：' + siteUrl);
    }
    process.exit(0);
  }
  for (const name of RETIRED) {
    const out = 'dist-demo/' + name;
    rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
    const target = 'https://' + DEMOS[0].project + '.pages.dev/';
    writeFileSync(join(out, '_redirects'), '/* ' + target + ' 301\n');
    writeFileSync(join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=' + target + '"><link rel="canonical" href="' + target + '"><a href="' + target + '">示範網站已搬到新網址</a>');
    if (cf) {
      const p = spawnSync('npx', ['wrangler', 'pages', 'deploy', out, '--project-name', name, '--branch', 'main', '--commit-dirty=true'], { stdio: 'inherit', env: process.env });
      if (p.status !== 0) process.exit(1);
      console.log('::notice::舊示範站 ' + name + ' 已改為轉址到 ' + target);
    }
  }
  for (const d of DEMOS) {
    const project = cf ? await cf.ensureProject(d.project) : { name: d.project, subdomain: d.project + '.pages.dev' };
    const siteUrl = 'https://' + project.subdomain + '/';
    const out = 'dist-demo/' + d.project;
    const r = await buildDemo({ layout: d.layout, homeStyle: d.homeStyle, siteUrl, outDir: out });
    console.log(d.layout, d.homeStyle || '', siteUrl, Object.keys(r.files).length, 'files');
    if (cf) {
      const p = spawnSync('npx', ['wrangler', 'pages', 'deploy', out, '--project-name', project.name, '--branch', 'main', '--commit-dirty=true'], { stdio: 'inherit', env: process.env });
      if (p.status !== 0) process.exit(1);
      console.log('::notice::示範站（' + d.layout + (d.homeStyle ? '／' + d.homeStyle : '') + '）：' + siteUrl);
    }
  }
}
