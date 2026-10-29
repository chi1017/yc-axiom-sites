// 編輯器載入的 templates/dist/builder-lib.js 必須和 templates/shared/ 原始檔一致（忘了 npm run bundle:builder 時失敗）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundleBuilderLib } from '../build/bundle-builder.mjs';

test('templates/dist/builder-lib.js 是最新的打包結果', async () => {
  const fresh = await bundleBuilderLib();
  assert.equal(readFileSync('templates/dist/builder-lib.js', 'utf8'), fresh, '請執行 npm run bundle:builder');
});

test('打包檔提供編輯器需要的函式', async () => {
  const lib = await import('../templates/dist/builder-lib.js');
  for (const [ns, names] of Object.entries({ site: ['buildSite'], content: ['normalizeContent'], valid: ['validateForPublish', 'suggestions'], slug: ['slugError'], pal: ['PALETTES', 'getPalette', 'paletteFrom4', 'colorWarnings'], pages: ['pagesFor', 'normalizeLayout'], ind: ['INDUSTRIES', 'getIndustry'], code: ['codeHash', 'hasCustomCode'] })) {
    for (const n of names) assert.ok(lib[ns] && lib[ns][n] !== undefined, ns + '.' + n);
  }
});
