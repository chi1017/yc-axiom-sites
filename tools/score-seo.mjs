// 用官方網站的 SEO 工具頁（瀏覽器內）替建置結果打分數。
// 用法：SEO_TOOL=/path/to/seo-tool.html node tools/score-seo.mjs <dist-dir> [site-name]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.env.PW_ROOT || '/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const html = readFileSync(process.argv[2] + '/index.html', 'utf8');
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const p = await b.newPage();
await p.goto('file://' + process.env.SEO_TOOL);
const r = await p.evaluate(([h, n]) => { const r = analyzeHTML(h, [], n, '', 'html', 'sample-cafe.pages.dev'); return { score: r.score, pass: r.pass, warn: r.warn, fail: r.fail, checks: (r.checks || []).filter((c) => c.status !== 'pass').map((c) => c.status + ' ' + c.title + ' | ' + (c.detail || '')) }; }, [html, process.argv[3] || '']);
console.log('SEO score:', r.score, 'pass', r.pass, 'warn', r.warn, 'fail', r.fail);
r.checks.forEach((c) => console.log('  -', c));
await b.close();
