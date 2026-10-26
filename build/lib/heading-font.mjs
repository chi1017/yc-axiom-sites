// 標題網頁字型：只取出網站標題實際用到的字，產生一個小的 WOFF2（通常 10–40 KB），放在客戶網站的 fonts/ 下。
// 不連 Google Fonts（不多一個第三方網域），字型載入前先用系統字（font-display: swap）。
// 來源：templates/base/fonts/NotoSerifTC-Bold-common.woff2（Noto Serif CJK TC Bold 的常用字子集，SIL OFL）。
import { readFileSync } from 'node:fs';
import subsetFont from 'subset-font';

// 依店家選的標題字型（content.style.font）挑來源檔；都是常用字子集、SIL OFL
export const FONT_FILES = { serif: 'NotoSerifTC-Bold-common.woff2', sans: 'NotoSansTC-Bold-common.woff2', round: 'Huninn-common.woff2', kai: 'LXGWWenKaiTC-Bold-common.woff2' };
const srcOf = (font) => new URL('../../templates/base/fonts/' + (FONT_FILES[font] || FONT_FILES.serif), import.meta.url);
export const HEADING_FONT_FILE = 'fonts/heading.woff2';

const decode = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// 用標題字型的元素：h1–h3、店名（.brand）、大標（.big）
export function headingText(files) {
  const chars = new Set();
  for (const [f, html] of Object.entries(files)) {
    if (!f.endsWith('.html')) continue;
    const re = /<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>|<a class="brand"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html))) for (const ch of decode(m[2] || m[3] || '')) if (ch.trim()) chars.add(ch);
  }
  return [...chars].sort().join('');
}

export async function buildHeadingFont(files, font = 'serif') {
  const text = headingText(files);
  if (!text) return null;
  return subsetFont(readFileSync(srcOf(font)), text, { targetFormat: 'woff2' });
}
