# Edge Function 部署方式

Supabase 上的四個函式（site-public、member-site、publish-site、admin-site）的 index.ts 只有一行：
從 GitHub 固定 commit 載入本 repo 打包好的 `supabase/functions/<名稱>/dist/index.ts`。

更新步驟：
1. 改程式後執行 `npm run bundle:function`，把 dist 一起合併進 main。
2. 取得 main 最新的 commit SHA。
3. 用 Supabase 部署（verify_jwt 關閉），index.ts 內容改成：
   `import 'https://raw.githubusercontent.com/chi1017/yc-axiom-sites/<SHA>/supabase/functions/<名稱>/dist/index.ts';`

固定 commit 的好處：部署的程式和 repo 某一版完全相同，之後 main 再改也不會影響已部署的函式。
