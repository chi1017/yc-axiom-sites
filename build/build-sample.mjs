// 本機試跑：用 sample.json 產出 dist-sample/（圖片用同一張測試圖）
// 用法：node build/build-sample.mjs [輸出資料夾] [single|multi] [行業 key]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildSite } from '../templates/shared/site.js';
const s = JSON.parse(readFileSync(new URL('../templates/cafe/sample.json', import.meta.url)));
const out = process.argv[2] || 'dist-sample';
const layout = process.argv[3] || 'single';
const template = process.argv[4] || 'cafe';
const r = buildSite({ template, siteUrl: 'https://sample-cafe.pages.dev/', ...s, layout });
mkdirSync(out + '/images', { recursive: true });
for (const [f, c] of Object.entries(r.files)) { mkdirSync(dirname(out + '/' + f), { recursive: true }); writeFileSync(out + '/' + f, c); }
console.log(r.title, '\n', r.description, r.description.length, '\n', Object.keys(r.files).join(' '));
