// 把 Edge Function 與它用到的共用模組各打包成「單一檔案」，方便直接貼進 Supabase Dashboard 的 Edge Function 編輯器。
// 輸出：supabase/functions/<名稱>/dist/index.ts
import { build } from 'esbuild';
for (const name of ['publish-site', 'admin-site', 'rental-cron']) {
  await build({
    entryPoints: ['supabase/functions/' + name + '/main.mjs'],
    outfile: 'supabase/functions/' + name + '/dist/index.ts',
    bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', legalComments: 'none', charset: 'utf8',
    banner: { js: '// 由 npm run bundle:function 產生，請勿手改。來源：supabase/functions/' + name + '/ 與 templates/shared/。' }
  });
  console.log('done ' + name);
}
