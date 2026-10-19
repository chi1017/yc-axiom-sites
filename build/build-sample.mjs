// 本機試跑：用 sample.json 產出 dist-sample/（圖片用同一張測試圖）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildSite } from '../templates/shared/site.js';
const s = JSON.parse(readFileSync(new URL('../templates/cafe/sample.json', import.meta.url)));
const out = process.argv[2] || 'dist-sample';
const r = buildSite({ template: 'cafe', siteUrl: 'https://sample-cafe.pages.dev/', ...s });
mkdirSync(out + '/images', { recursive: true });
for (const [f, c] of Object.entries(r.files)) writeFileSync(out + '/' + f, c);
console.log(r.title, '\n', r.description, r.description.length);
