// 用官網同一套評分引擎替客戶網站打分：
//   SEO：官網 seo-tool.html 內的 analyzeHTML（需要瀏覽器環境 → Playwright 開本機檔案）
//   GEO：官網 assets/geo-engine.js（用 linkedom 提供 DOM）
// 兩個檔案由 workflow checkout 官網 repo 取得（SEO_TOOL、GEO_ENGINE 環境變數指到路徑），不複製進本 repo，確保與官網評分永遠一致。
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parseHTML } from 'linkedom';

export async function makeAnalyzers({ seoTool, geoEngine, chromePath } = {}) {
  if (!seoTool || !geoEngine) throw new Error('缺少 SEO_TOOL／GEO_ENGINE 路徑（官網 repo 的 seo-tool.html、assets/geo-engine.js）');
  const require = createRequire(import.meta.url);
  const GEO = require(geoEngine);
  let pw;
  try { pw = require(process.env.PW_ROOT ? require.resolve('playwright', { paths: [process.env.PW_ROOT] }) : 'playwright'); }
  catch { throw new Error('找不到 playwright（workflow 會安裝；本機請設定 PW_ROOT 指到 node_modules 目錄）'); }
  const browser = await pw.chromium.launch({ executablePath: chromePath || undefined });
  const page = await browser.newPage();
  await page.goto(pathToFileURL(seoTool).href);
  const ready = await page.evaluate(() => typeof analyzeHTML === 'function');
  if (!ready) { await browser.close(); throw new Error('seo-tool.html 裡找不到 analyzeHTML'); }

  return {
    async analyze({ url, html, robots, llms }) {
      const host = new URL(url).hostname;
      const seo = await page.evaluate(([h, d]) => { const r = analyzeHTML(h, [], '', '', 'html', d); return { score: r.score, actions: r.actions || [] }; }, [html, host]);
      const { document, window } = parseHTML(html);
      globalThis.DOMParser = window.DOMParser;
      const g = GEO.analyze({ url, html, doc: document, mode: 'url', robots, llms });
      return { seo: { score: seo.score, actions: seo.actions }, geo: { score: g.score, issues: g.issues || [] } };
    },
    async close() { await browser.close(); }
  };
}
