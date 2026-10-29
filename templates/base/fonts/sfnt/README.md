Edge Function `font-subset`（編輯器預覽的標題字型子集）讀取的原始檔。

- 字型：與上一層的 WOFF2 相同（SIL Open Font License，見 ../OFL.txt），只是轉成未壓縮格式，因為 harfbuzz 不能直接讀 WOFF2。
- hb-subset.wasm：harfbuzzjs 0.4.15（MIT License，https://github.com/harfbuzz/harfbuzzjs）。
- 重新產生字型：`node build/make-sfnt-fonts.mjs`（hb-subset.wasm 固定版本，不重新產生）
