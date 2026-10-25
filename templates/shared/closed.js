// 「網站已停止服務」頁：網站被終止租用（status = cancelled）時，部署到同一個 Pages 專案（網址不變）。
// 不含任何客戶內容，只顯示店名與店家自己填的電話／LINE（已逃脫）；不出現任何平台名稱或平台聯絡方式；noindex，避免搜尋引擎收錄。
import { esc } from './escape.js';
import { shopContactHtml } from './maintenance.js';

export function buildClosedPage({ shopName = '', phone = '', line = '' } = {}) {
  const name = String(shopName || '').trim().slice(0, 60);
  const title = (name ? name + '｜' : '') + '網站已停止服務';
  const html = '<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n' +
    '<meta name="robots" content="noindex,nofollow">\n' +
    '<meta name="description" content="此網站已停止服務。">\n' +
    '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f4f0;color:#222;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans TC","Microsoft JhengHei",sans-serif;line-height:1.7}' +
    'main{max-width:480px;margin:24px;background:#fff;border-radius:12px;padding:32px 28px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.06)}' +
    'h1{font-size:1.4rem;margin:0 0 12px}p{margin:8px 0;color:#555}a{color:#2f4a3a}</style>\n</head>\n<body>\n<main>\n' +
    (name ? '<p style="margin:0;color:#888;font-size:.9rem">' + esc(name) + '</p>\n' : '') +
    '<h1>網站已停止服務</h1>\n<p>這個網站已經不再提供瀏覽。</p>\n' +
    shopContactHtml({ phone, line }) +
    '</main>\n</body>\n</html>\n';
  return {
    html,
    files: { 'index.html': html, 'robots.txt': 'User-agent: *\nDisallow: /\n' },
    title
  };
}
