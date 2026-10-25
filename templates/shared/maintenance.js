// 「網站維護中」頁：網站被暫停時，部署到同一個 Pages 專案（網址不變）。
// 不含任何客戶內容，只顯示店名與店家自己填的電話／LINE（已逃脫）；不出現任何平台名稱或平台聯絡方式；noindex，避免搜尋引擎收錄暫停頁。
import { esc } from './escape.js';

// 店家自己的聯絡方式（只用店家在編輯器填的電話與 LINE 連結；沒有就整段不顯示）
// 電話至少要有一個數字；LINE 只接受 line.me／lin.ee 的 https 連結（編輯器存的一定是網址，normalizeContent 會丟掉非 https）
const LINE_HOST_RE = /^https:\/\/(?:[a-z0-9-]+\.)*(?:line\.me|lin\.ee)(?:[/?#]|$)/i;
export function shopContactHtml({ phone = '', line = '' } = {}) {
  const items = [];
  const tel = String(phone || '').replace(/[^0-9+]/g, '');
  if (/\d/.test(tel)) items.push('電話 <a href="tel:' + esc(tel) + '">' + esc(String(phone).trim().slice(0, 24)) + '</a>');
  const url = String(line || '').trim();
  if (LINE_HOST_RE.test(url)) items.push('<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">LINE</a>');
  return items.length ? '<p>如需聯絡店家：<br>' + items.join('<br>') + '</p>\n' : '';
}

// 從網站資料取出店家聯絡方式（run.mjs 的維護頁與停止服務頁共用）
export function shopContact(site) {
  const c = (site && site.content) || {};
  return { shopName: c.name || '', phone: c.phone || '', line: (c.social && c.social.line) || '' };
}

export function buildMaintenancePage({ shopName = '', phone = '', line = '' } = {}) {
  const name = String(shopName || '').trim().slice(0, 60);
  const title = (name ? name + '｜' : '') + '網站維護中';
  const html = '<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n' +
    '<meta name="robots" content="noindex,nofollow">\n' +
    '<meta name="description" content="此網站目前維護中，請稍後再訪。">\n' +
    '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f4f0;color:#222;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans TC","Microsoft JhengHei",sans-serif;line-height:1.7}' +
    'main{max-width:480px;margin:24px;background:#fff;border-radius:12px;padding:32px 28px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.06)}' +
    'h1{font-size:1.4rem;margin:0 0 12px}p{margin:8px 0;color:#555}a{color:#2f4a3a}</style>\n</head>\n<body>\n<main>\n' +
    (name ? '<p style="margin:0;color:#888;font-size:.9rem">' + esc(name) + '</p>\n' : '') +
    '<h1>網站維護中</h1>\n<p>這個網站目前暫時無法瀏覽，我們會盡快恢復。</p>\n' +
    shopContactHtml({ phone, line }) +
    '</main>\n</body>\n</html>\n';
  return {
    html,
    files: { 'index.html': html, 'robots.txt': 'User-agent: *\nAllow: /\n' },
    title
  };
}
