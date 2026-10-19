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
    '<p style="color:#666;font-size:13px">狀態目前是「待上線」。確認收到款項後，到管理後台「租用網站」按「確認收款」，系統會自動部署上線並通知客戶。</p>' +
    (adminUrl ? '<p style="font-size:13px"><a href="' + esc(adminUrl) + '">開啟管理後台</a></p>' : ''));
  const text = ['有客戶提出網站上線申請', '', '店名：' + shopName, '網址代稱：' + slug, '會員信箱：' + memberEmail, '預覽：' + previewUrl, '', '狀態目前是「待上線」，確認收到款項後，到管理後台「租用網站」按「確認收款」即可上線。'].join('\n');
  return { subject, html, text };
}

const ADD_CONTACT = '為避免我們的信件被歸到垃圾信匣，請把 ' + CONTACT.email + ' 加入你的聯絡人；直接回覆這封信也會寄到我們的信箱。';
const button = (href, label) => '<p><a href="' + esc(href) + '" style="display:inline-block;background:#2f4a3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">' + esc(label) + '</a></p>';

// 網站第一次成功上線 → 通知客戶
export function customerGoLive({ shopName, url }) {
  const subject = '【YC AXIOM】你的網站上線了：' + shopName;
  const html = layout('你的網站已經上線',
    '<p>' + esc(shopName) + ' 的網站已完成部署，現在任何人都可以瀏覽：</p>' + button(url, '開啟我的網站') +
    '<p style="font-size:13px;color:#666;word-break:break-all">' + esc(url) + '</p>' +
    '<p>之後想修改內容，登入會員專區的編輯器、按「發佈」就會更新（約 1–2 分鐘生效）。</p>' +
    '<p style="color:#666;font-size:13px">' + esc(ADD_CONTACT) + '</p>');
  const text = ['你的網站已經上線', '', shopName + ' 的網站已完成部署：', url, '', '之後想修改內容，登入會員專區的編輯器按「發佈」即可更新（約 1–2 分鐘生效）。', '', ADD_CONTACT].join('\n');
  return { subject, html, text };
}

// 管理員確認收款 → 寄收據給客戶
export function customerReceipt({ shopName, amount, months, paidOn, periodTo, reference }) {
  const subject = '【YC AXIOM】已收到你的款項：' + shopName;
  const rows = [['網站', shopName], ['金額', 'NT$ ' + Number(amount).toLocaleString('en-US')], ['租用月數', months + ' 個月'], ['收款日', paidOn], ['服務到期日', periodTo]];
  if (reference) rows.push(['匯款備註', reference]);
  const html = layout('已收到你的款項',
    '<p>謝謝你！我們已確認收到匯款，服務期間已更新：</p>' +
    '<table style="border-collapse:collapse;width:100%">' + rows.map((r) => '<tr><td style="padding:6px 12px 6px 0;color:#777;white-space:nowrap">' + esc(r[0]) + '</td><td style="padding:6px 0">' + esc(r[1]) + '</td></tr>').join('') + '</table>' +
    '<p style="color:#666;font-size:13px">這封信作為收款通知；如需正式收據或發票請聯絡我們。' + esc(ADD_CONTACT) + '</p>');
  const text = ['已收到你的款項', '', ...rows.map((r) => r[0] + '：' + r[1]), '', ADD_CONTACT].join('\n');
  return { subject, html, text };
}
