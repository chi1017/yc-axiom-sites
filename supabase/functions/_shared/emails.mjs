// 所有寄出的信件範本集中在這裡。新增信件 = 新增一個函式並回傳 { subject, html, text }。
// 寄件者／回覆地址在 publish-site 的設定裡，不在範本中。
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CONTACT = { line: '@788cblaq', email: 'ycaxiom@gmail.com' };

function layout(title, bodyHtml) {
  return '<!doctype html><html lang="zh-Hant"><body style="margin:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,\'Noto Sans TC\',\'Microsoft JhengHei\',sans-serif;color:#222">' +
    '<div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border-radius:10px;padding:24px 26px;line-height:1.7;font-size:15px">' +
    '<h2 style="margin:0 0 14px;font-size:18px">' + esc(title) + '</h2>' + bodyHtml + '</div>' +
    '<p style="color:#888;font-size:12px;text-align:center;margin:14px 0 0">YC AXIOM 網站租用 · LINE ' + CONTACT.line + ' · ' + CONTACT.email + '</p></div></body></html>';
}

// 客戶第一次按下「發佈」→ 通知管理員（不會自動上線，需要確認款項）
export function adminFirstPublish({ shopName, slug, previewUrl, memberEmail, adminUrl }) {
  const subject = '【網站租用】新的上線申請：' + shopName;
  const rows = [['店名', shopName], ['網址代稱', slug], ['會員信箱', memberEmail]];
  const html = layout('有客戶提出網站上線申請',
    '<table style="border-collapse:collapse;width:100%">' + rows.map((r) => '<tr><td style="padding:6px 12px 6px 0;color:#777;white-space:nowrap">' + esc(r[0]) + '</td><td style="padding:6px 0">' + esc(r[1]) + '</td></tr>').join('') + '</table>' +
    '<p><a href="' + esc(previewUrl) + '" style="display:inline-block;background:#2f4a3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">預覽客戶網站</a></p>' +
    '<p style="color:#666;font-size:13px">狀態目前是「待上線」。確認款項後，到 Supabase 將狀態改為 live，再請客戶按一次發佈（或由管理後台上線，第二階段提供）。</p>' +
    (adminUrl ? '<p style="font-size:13px"><a href="' + esc(adminUrl) + '">開啟管理後台</a></p>' : ''));
  const text = ['有客戶提出網站上線申請', '', '店名：' + shopName, '網址代稱：' + slug, '會員信箱：' + memberEmail, '預覽：' + previewUrl, '', '狀態目前是「待上線」，確認款項後再上線。'].join('\n');
  return { subject, html, text };
}
