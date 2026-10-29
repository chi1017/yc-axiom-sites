// 編輯器（官網的 builder/）用的共用版型模組總入口。
// npm run bundle:builder 會把這裡用到的所有檔案打包成 templates/dist/builder-lib.js（單一壓縮檔），
// 編輯器只要下載一個檔案，不用一個一個下載 20 多個小檔。改了 templates/ 之後要重新打包（npm test 會檢查）。
export * as site from './site.js';
export * as content from './content.js';
export * as valid from './validate.js';
export * as slug from './slug.js';
export * as pal from './palettes.js';
export * as hours from './hours.js';
export * as pages from './pages.js';
export * as ind from './industries.js';
export * as code from './code.js';
