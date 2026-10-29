// 把 templates/base/fonts/*.woff2 轉成未壓縮的 OpenType／TrueType，放在 templates/base/fonts/sfnt/。
// 給 Edge Function font-subset 用（harfbuzz 不能直接讀 WOFF2）。字型更新時重新執行：node build/make-sfnt-fonts.mjs
// hb-subset.wasm 是固定版本（harfbuzzjs 0.4.15）的檔案，直接放在 sfnt/，不由這支程式產生。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import fontverter from 'fontverter';
const DIR = new URL('../templates/base/fonts/', import.meta.url).pathname;
mkdirSync(DIR + 'sfnt', { recursive: true });
for (const [src, out] of [['NotoSerifTC-Bold-common', 'NotoSerifTC-Bold-common.otf'], ['NotoSansTC-Bold-common', 'NotoSansTC-Bold-common.ttf'], ['Huninn-common', 'Huninn-common.ttf'], ['LXGWWenKaiTC-Bold-common', 'LXGWWenKaiTC-Bold-common.ttf']]) {
  writeFileSync(DIR + 'sfnt/' + out, await fontverter.convert(readFileSync(DIR + src + '.woff2'), 'sfnt'));
  console.log(out);
}
