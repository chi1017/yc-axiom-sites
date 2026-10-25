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
| `templates/shared/` | 共用模組：內容正規化 `content.js`、必填檢查 `validate.js`、營業時間 `hours.js`、SEO/JSON-LD `seo.js`、配色 `palettes.js`、slug 規則 `slug.js`、一頁版／多頁版與可勾選頁面 `pages.js`、行業設定 `industries.js`、入口 `site.js` |
| `templates/base/` | 通用版型（所有行業共用；`index.js` 輸出 HTML、`styles.js` 輸出 CSS），一頁版與多頁版都由這裡產生 |
| `templates/cafe/sample.json` | 範例內容（測試與 `npm run build:sample` 用） |
| `build/` | 部署腳本：`build-site.mjs`（Actions 進入點）、`run.mjs`（流程）、`lib/`（Supabase、Cloudflare） |
| `supabase/migrations/005_rental.sql` | 資料表、RLS、Storage 權限 |
| `supabase/functions/publish-site/` | 發佈用 Edge Function（`dist/index.ts` 是可直接貼進 Supabase 的單一檔案） |
| `supabase/migrations/007_rental_cron.sql`、`supabase/cron/` | 第三階段：排程記號欄位、月報、排程紀錄；`schedule_rental_cron.sql` 是 pg_cron 排程範本（要先填入專案代號與密碼，不進 repo） |
| `supabase/migrations/010_layout_pages.sql` | 多頁租用版第一階段：`layout`（一頁／多頁）、`pages`（多頁要開哪些頁）、只能升級不能改回 |
| `supabase/functions/rental-cron/` | 每日排程（到期提醒、逾期、自動暫停、暫停滿 30 天通知）與每週一管理員摘要 |
| `build/monthly-report.mjs`、`build/cleanup-photos.mjs` | 每月 1 日的 SEO／GEO 月報與舊照片清理（`.github/workflows/monthly-report.yml`） |
| `tests/`、`supabase/tests/` | Node 單元測試、資料庫權限測試 |
| `tools/` | 用官網的 SEO／GEO 引擎替建置結果打分數（驗收用） |

## 常用指令

```bash
npm install
npm test                 # 單元測試
npm run build:sample     # 用 sample.json 產出 dist-sample/（一頁版咖啡店）
npm run bundle:function  # 重新打包 publish-site（改過 handler 或 templates/shared 後要做）
```

## 新增行業

在 `templates/shared/industries.js` 的 `ROWS` 加一列（key、名稱、群組、schema.org 類型、價目／照片／來店頁的說法）即可。
版面、一頁版／多頁版、SEO 全行業共用；資料庫只檢查 key 的格式（`011_industries.sql`），不必改 SQL。

```bash
node build/build-sample.mjs dist-sample multi salon   # 用範例內容產出美髮沙龍的多頁版
```

## GitHub Actions Secrets（Settings → Secrets and variables → Actions）

`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`BREVO_API_KEY`（寄信）。

這些值只存在 GitHub Secrets 與 Supabase Secrets，**不可以**寫進程式碼或 repo。
