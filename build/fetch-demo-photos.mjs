// 一次性：從 Unsplash 下載示範站照片（Unsplash License：可免費商用、不需標示來源），轉成 WebP 存到 templates/cafe/demo-images/。
// 用法（GitHub Actions，執行環境才連得到 Unsplash）：node build/fetch-demo-photos.mjs
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { DEMO_PHOTOS } from '../templates/cafe/demo-photos.mjs';

const dir = new URL('../templates/cafe/demo-images/', import.meta.url).pathname;
for (const p of DEMO_PHOTOS) {
  const url = 'https://images.unsplash.com/' + p.id + '?w=' + p.w + '&h=' + p.h + '&fit=crop&crop=entropy&q=85';
  const r = await fetch(url);
  if (!r.ok) throw new Error(p.file + ' ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  const out = await sharp(buf).resize({ width: p.w, height: p.h, fit: 'cover' }).webp({ quality: 80 }).toBuffer();
  writeFileSync(dir + p.file, out);
  console.log(p.file, p.w + 'x' + p.h, Math.round(out.length / 1024) + 'KB');
}
