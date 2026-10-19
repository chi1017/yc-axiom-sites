// 把 publish-site 與它用到的共用模組打包成「單一檔案」，方便直接貼進 Supabase Dashboard 的 Edge Function 編輯器。
// 輸出：supabase/functions/publish-site/dist/index.ts
import { build } from 'esbuild';
await build({
  entryPoints: ['supabase/functions/publish-site/main.mjs'],
  outfile: 'supabase/functions/publish-site/dist/index.ts',
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', legalComments: 'none',
  banner: { js: '// 由 npm run bundle:function 產生，請勿手改。來源：supabase/functions/publish-site/ 與 templates/shared/。' }
});
console.log('done');
