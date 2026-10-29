// 把編輯器用的共用版型模組打包成單一壓縮檔：templates/dist/builder-lib.js
// --check：只檢查是否為最新（tests/dist.test.js 使用）
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
export async function bundleBuilderLib() {
  const r = await build({
    entryPoints: ['templates/shared/builder-lib.js'], bundle: true, format: 'esm', platform: 'browser',
    target: ['es2020'], minify: true, legalComments: 'none', charset: 'utf8', write: false,
    banner: { js: '/* 由 npm run bundle:builder 產生，請勿手改。來源：templates/shared/ */' }
  });
  return r.outputFiles[0].text;
}
const OUT = 'templates/dist/builder-lib.js';
if (import.meta.url === 'file://' + process.argv[1]) {
  const text = await bundleBuilderLib();
  if (process.argv.includes('--check')) {
    const ok = existsSync(OUT) && readFileSync(OUT, 'utf8') === text;
    if (!ok) { console.error(OUT + ' 不是最新，請執行 npm run bundle:builder'); process.exit(1); }
    console.log(OUT + ' 是最新');
  } else { mkdirSync('templates/dist', { recursive: true }); writeFileSync(OUT, text); console.log(OUT, (text.length / 1024).toFixed(1) + 'KB'); }
}
