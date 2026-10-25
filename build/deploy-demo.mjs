// 公開示範站：用 templates/cafe/sample.json 與 demo-images 建置後部署到 Cloudflare Pages，
// 用來和其他平台的示範站做公平比較（內容量、照片大小與客戶網站相同）。
// 示範店家是虛構的，所以一律 noindex（與 Wix 示範站相同的起跑點），也不會出現在搜尋結果。
// 用法（GitHub Actions）：node build/deploy-demo.mjs [--no-deploy]
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildSite } from '../templates/shared/site.js';
import { makeCloudflare } from './lib/cloudflare.mjs';
import { HEADERS_FILE } from './run.mjs';

const sample = JSON.parse(readFileSync(new URL('../templates/cafe/sample.json', import.meta.url)));
const IMG_DIR = new URL('../templates/cafe/demo-images/', import.meta.url).pathname;
const DEMOS = [
  { project: 'wuhou-cafe-demo', layout: 'single' },
  { project: 'wuhou-cafe-demo-multi', layout: 'multi' }
];
const noDeploy = process.argv.includes('--no-deploy');

export function buildDemo({ layout, siteUrl, outDir }) {
  const content = JSON.parse(JSON.stringify(sample.content));
  content.heroStyle = 'full';
  const dims = (f) => (/room-(2|5)/.test(f) ? { w: 1200, h: 1600 } : f === 'hero' ? { w: 1600, h: 1067 } : { w: 1600, h: 1200 });
  content.photos.hero = { path: 'demo/hero.webp', ...dims('hero') };
  content.photos.room = [1, 2, 3, 4, 5, 6].map((i) => ({ path: 'demo/room-' + i + '.webp', ...dims('room-' + i) }));
  const r = buildSite({ template: 'cafe', ...sample, content, layout, siteUrl });
  rmSync(outDir, { recursive: true, force: true });
  for (const [f, c] of Object.entries(r.files)) {
    const dest = join(outDir, f); mkdirSync(dirname(dest), { recursive: true });
    // 虛構店家：不讓搜尋引擎收錄（與 Wix 示範站一樣用 robots meta，robots.txt 維持允許）
    writeFileSync(dest, f.endsWith('.html') ? c.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex, nofollow">') : c);
  }
  mkdirSync(join(outDir, 'images'), { recursive: true });
  for (const f of readdirSync(IMG_DIR)) copyFileSync(join(IMG_DIR, f), join(outDir, 'images', f));
  writeFileSync(join(outDir, '_headers'), HEADERS_FILE + '/*\n  X-Robots-Tag: noindex, nofollow\n');
  return r;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const cf = noDeploy ? null : makeCloudflare({ token: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID });
  for (const d of DEMOS) {
    const project = cf ? await cf.ensureProject(d.project) : { name: d.project, subdomain: d.project + '.pages.dev' };
    const siteUrl = 'https://' + project.subdomain + '/';
    const out = 'dist-demo/' + d.project;
    const r = buildDemo({ layout: d.layout, siteUrl, outDir: out });
    console.log(d.layout, siteUrl, Object.keys(r.files).length, 'files');
    if (cf) {
      const p = spawnSync('npx', ['wrangler', 'pages', 'deploy', out, '--project-name', project.name, '--branch', 'main', '--commit-dirty=true'], { stdio: 'inherit', env: process.env });
      if (p.status !== 0) process.exit(1);
      console.log('::notice::示範站（' + d.layout + '）：' + siteUrl);
    }
  }
}
