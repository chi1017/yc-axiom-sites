# yc-axiom-sites

YC AXIOM「網站租用」系統的版型與建置腳本。**這個 repo 是公開的，不放任何金鑰與客戶資料。**

## 運作方式

1. 客戶在官網的編輯器（`/builder/`）填內容，內容存在 Supabase。
2. 按「發佈」→ Supabase Edge Function `publish-site` 檢查並存下版本；
   - 第一次發佈：狀態變成 `pending`，只通知管理員，**不部署**。
   - 狀態是 `live` 時：觸發本 repo 的 GitHub Actions（`deploy-site.yml`）。
3. Actions 讀取該版本 → 用 `templates/` 產生完整 HTML → `wrangler pages deploy` 到客戶自己的 Cloudflare Pages 專案（專案名稱 = slug）。

網站是**建置時就產生完整 HTML**，不靠瀏覽器 JavaScript 載入資料，所以搜尋引擎與 AI 爬蟲都讀得到。
編輯器預覽與正式建置用的是**同一份** `templates/shared/site.js`。

## 目錄

| 路徑 | 內容 |
| --- | --- |
| `templates/shared/` | 共用模組：內容正規化 `content.js`、必填檢查 `validate.js`、營業時間 `hours.js`、SEO/JSON-LD `seo.js`、配色 `palettes.js`、slug 規則 `slug.js`、入口 `site.js` |
| `templates/cafe/` | 咖啡店版型（`index.js` 輸出 HTML、`styles.js` 輸出 CSS、`sample.json` 範例內容） |
| `build/` | 部署腳本：`build-site.mjs`（Actions 進入點）、`run.mjs`（流程）、`lib/`（Supabase、Cloudflare） |
| `supabase/migrations/005_rental.sql` | 資料表、RLS、Storage 權限 |
| `supabase/functions/publish-site/` | 發佈用 Edge Function（`dist/index.ts` 是可直接貼進 Supabase 的單一檔案） |
| `tests/`、`supabase/tests/` | Node 單元測試、資料庫權限測試 |
| `tools/` | 用官網的 SEO／GEO 引擎替建置結果打分數（驗收用） |

## 常用指令

```bash
npm install
npm test                 # 單元測試
npm run build:sample     # 用 sample.json 產出 dist-sample/
npm run bundle:function  # 重新打包 publish-site（改過 handler 或 templates/shared 後要做）
```

## 新增行業版型

1. 複製 `templates/cafe/` 為新資料夾，改 `index.js` 的內容與 `kindLabel`、`schemaType`。
2. 在 `templates/shared/registry.js` 加入。
3. 資料庫 `rental_sites.template` 的 check 與編輯器的版型選項各加一項。

## GitHub Actions Secrets（Settings → Secrets and variables → Actions）

`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`。

這些值只存在 GitHub Secrets 與 Supabase Secrets，**不可以**寫進程式碼或 repo。
