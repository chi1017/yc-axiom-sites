// 用官方網站的 GEO 引擎在本機替建置結果打分數（驗收用）。
// 用法：GEO_ENGINE=/path/to/assets/geo-engine.js node tools/score-local.mjs <dist-dir> <site-url>
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseHTML } from 'linkedom';
const require = createRequire(import.meta.url);
const dir = process.argv[2], url = process.argv[3] || 'https://sample-cafe.pages.dev/';
const GEO = require(process.env.GEO_ENGINE || './geo-engine.js');
const read = (f) => readFileSync(dir + '/' + f, 'utf8');
const html = read('index.html');
const { document, window } = parseHTML(html);
globalThis.DOMParser = window.DOMParser;
const r = GEO.analyze({ url, html, doc: document, mode: 'url', robots: { status: 'ok', text: read('robots.txt') }, llms: { status: 'ok', text: read('llms.txt') } });
console.log('GEO score:', r.score, '(base', r.baseScore, '+ bonus', r.bonus + ')');
r.categories.forEach((c) => console.log(' ', c.id, c.name, c.earned + '/' + c.countedMax));
r.items.filter((i) => i.status !== 'pass' && i.status !== 'na').forEach((i) => console.log('  -', i.status, i.title, '|', i.note));
