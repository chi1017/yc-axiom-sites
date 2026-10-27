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

// ───────────────────────── 第三階段：排程通知 ─────────────────────────
const rowsTable = (rows) => '<table style="border-collapse:collapse;width:100%">' + rows.map((r) => '<tr><td style="padding:6px 12px 6px 0;color:#777;white-space:nowrap;vertical-align:top">' + esc(r[0]) + '</td><td style="padding:6px 0">' + esc(r[1]) + '</td></tr>').join('') + '</table>';
const LINE_HINT = '有任何問題都可以直接回覆這封信，或用 LINE ' + CONTACT.line + ' 聯絡我們。';

// 到期前 7 天（含）內的提醒
export function customerReminder({ shopName, paidUntil, daysLeft, dashboardUrl }) {
  const when = daysLeft <= 0 ? '今天' : daysLeft + ' 天後';
  const subject = '【YC AXIOM】你的網站租用即將到期（' + paidUntil + '）：' + shopName;
  const html = layout('網站租用即將到期',
    '<p>' + esc(shopName) + ' 的網站租用服務將於 <b>' + esc(paidUntil) + '</b>（' + esc(when) + '）到期。</p>' +
    '<p>為了讓網站不中斷，請在到期日前完成續約匯款。匯款資訊與方案可以在會員專區的「我的網站」查看：</p>' + (dashboardUrl ? button(dashboardUrl, '前往會員專區') : '') +
    '<p>匯款後請用 LINE（' + CONTACT.line + '）或直接回覆這封信告訴我們匯款帳號末五碼，我們確認後會更新到期日。</p>' +
    '<p style="color:#666;font-size:13px">如果已經匯款，請忽略這封信；若不打算續約，也歡迎讓我們知道。' + esc(ADD_CONTACT) + '</p>');
  const text = [shopName + ' 的網站租用服務將於 ' + paidUntil + '（' + when + '）到期。', '', '請在到期日前完成續約匯款，匯款資訊在會員專區「我的網站」：' + (dashboardUrl || ''), '匯款後請用 LINE（' + CONTACT.line + '）或回覆這封信告訴我們匯款帳號末五碼。', '', ADD_CONTACT].join('\n');
  return { subject, html, text };
}

// 到期日已過（狀態改為逾期）
export function customerOverdue({ shopName, paidUntil, suspendOn, dashboardUrl }) {
  const subject = '【YC AXIOM】網站租用已到期：' + shopName;
  const html = layout('網站租用已到期',
    '<p>' + esc(shopName) + ' 的網站租用已於 <b>' + esc(paidUntil) + '</b> 到期，目前網站仍可正常瀏覽。</p>' +
    '<p>若在 <b>' + esc(suspendOn) + '</b> 之前仍未完成續約，網站會自動改為「維護中」頁面（資料與內容都會保留，不會刪除），續約後即可恢復。</p>' +
    (dashboardUrl ? button(dashboardUrl, '查看匯款資訊') : '') +
    '<p style="color:#666;font-size:13px">' + esc(LINE_HINT) + ' ' + esc(ADD_CONTACT) + '</p>');
  const text = [shopName + ' 的網站租用已於 ' + paidUntil + ' 到期，網站目前仍可瀏覽。', '', '若在 ' + suspendOn + ' 之前仍未續約，網站會自動改為「維護中」頁面（資料與內容會保留，續約後即可恢復）。', '匯款資訊：' + (dashboardUrl || ''), '', LINE_HINT, ADD_CONTACT].join('\n');
  return { subject, html, text };
}

// 自動暫停（逾期未續約）
export function customerSuspended({ shopName, reason, dashboardUrl }) {
  const subject = '【YC AXIOM】網站已暫停：' + shopName;
  const html = layout('你的網站目前已暫停',
    '<p>' + esc(shopName) + ' 的網站因「' + esc(reason || '逾期未續約') + '」已暫停，訪客目前會看到「網站維護中」的頁面。</p>' +
    '<p>你的網站內容、照片與歷史版本都完整保留。完成續約後，我們確認款項就會恢復網站（約 1–2 分鐘生效）。</p>' +
    (dashboardUrl ? button(dashboardUrl, '查看匯款資訊') : '') +
    '<p style="color:#666;font-size:13px">' + esc(LINE_HINT) + ' ' + esc(ADD_CONTACT) + '</p>');
  const text = [shopName + ' 的網站因「' + (reason || '逾期未續約') + '」已暫停，訪客目前會看到「網站維護中」頁面。', '', '網站內容、照片與歷史版本都完整保留，完成續約並確認款項後即可恢復。', '匯款資訊：' + (dashboardUrl || ''), '', LINE_HINT, ADD_CONTACT].join('\n');
  return { subject, html, text };
}

// 給管理員的即時通知：自動暫停、暫停滿 30 天
export function adminSiteAlert({ kind, shopName, slug, memberEmail, paidUntil, reason, since, days, adminUrl }) {
  const title = kind === 'auto_suspended' ? '網站已自動暫停' : '網站已暫停滿 ' + days + ' 天';
  const subject = '【網站租用】' + title + '：' + shopName;
  const rows = [['店名', shopName], ['網址代稱', slug], ['會員信箱', memberEmail || '（找不到）'], ['到期日', paidUntil || '—']];
  if (reason) rows.push(['暫停原因', reason]);
  if (since) rows.push(['暫停時間', since]);
  const note = kind === 'auto_suspended'
    ? '系統已把狀態改為「暫停」並部署維護頁，客戶也收到通知信。收到款項後到管理後台按「確認收款」就會自動恢復。'
    : '這個網站已暫停超過 ' + days + ' 天。系統不會自動刪除或終止任何資料，請你決定要聯絡客戶、繼續保留，或手動終止。';
  const html = layout(title, rowsTable(rows) + '<p style="color:#666;font-size:13px">' + esc(note) + '</p>' + (adminUrl ? '<p style="font-size:13px"><a href="' + esc(adminUrl) + '">開啟管理後台</a></p>' : ''));
  const text = [title, '', ...rows.map((r) => r[0] + '：' + r[1]), '', note].join('\n');
  return { subject, html, text };
}

const SCORE_LABEL = (n) => (n >= 80 ? '良好' : n >= 60 ? '普通' : '需加強');
function delta(cur, prev) {
  if (prev == null) return '首次檢測';
  const d = cur - prev;
  return d > 0 ? '比上月進步 ' + d + ' 分' : d < 0 ? '比上月退步 ' + (-d) + ' 分' : '與上月相同';
}
// 每月 SEO／GEO 月報
export function customerMonthlyReport({ shopName, url, monthLabel, seo, geo, prevSeo, prevGeo, issues, dashboardUrl }) {
  const subject = '【YC AXIOM】' + monthLabel + ' 網站體檢報告：' + shopName;
  const score = (name, cur, prev) => '<tr><td style="padding:8px 12px 8px 0;white-space:nowrap">' + esc(name) + '</td><td style="padding:8px 12px 8px 0;font-size:22px;font-weight:700">' + cur + '<span style="font-size:13px;font-weight:400;color:#777"> / 100　' + esc(SCORE_LABEL(cur)) + '</span></td><td style="padding:8px 0;color:#666;font-size:13px">' + esc(delta(cur, prev)) + '</td></tr>';
  const list = (issues || []).slice(0, 3);
  const html = layout(monthLabel + ' 網站體檢報告',
    '<p>' + esc(shopName) + ' 的網站（' + esc(url) + '）本月體檢結果：</p>' +
    '<table style="border-collapse:collapse;width:100%">' + score('SEO（搜尋引擎）', seo, prevSeo) + score('GEO（AI 搜尋）', geo, prevGeo) + '</table>' +
    (list.length ? '<p style="margin-top:16px"><b>最值得優先改善的 ' + list.length + ' 件事：</b></p><ol style="padding-left:20px;margin:6px 0">' + list.map((i) => '<li style="margin-bottom:6px">' + esc(i.title) + (i.detail ? '<br><span style="color:#666;font-size:13px">' + esc(i.detail) + '</span>' : '') + '</li>').join('') + '</ol>' : '<p style="margin-top:16px">本月沒有發現需要優先處理的問題，繼續保持。</p>') +
    '<p>想改內容可以到會員專區的編輯器修改後按「發佈」；不確定怎麼調整，也歡迎用 LINE ' + CONTACT.line + ' 問我們。</p>' +
    (dashboardUrl ? button(dashboardUrl, '前往會員專區') : '') +
    '<p style="color:#666;font-size:13px">分數是自動檢測的參考值，不代表實際排名。' + esc(ADD_CONTACT) + '</p>');
  const text = [monthLabel + ' 網站體檢報告 — ' + shopName, url, '', 'SEO：' + seo + ' / 100（' + SCORE_LABEL(seo) + '，' + delta(seo, prevSeo) + '）', 'GEO：' + geo + ' / 100（' + SCORE_LABEL(geo) + '，' + delta(geo, prevGeo) + '）', '', ...(list.length ? ['最值得優先改善的事：', ...list.map((i, n) => (n + 1) + '. ' + i.title + (i.detail ? '（' + i.detail + '）' : ''))] : ['本月沒有發現需要優先處理的問題。']), '', LINE_HINT, ADD_CONTACT].join('\n');
  return { subject, html, text };
}

// 管理員每週一摘要。data 的欄位見 rental-cron/handler.mjs 的 collectWeekly()
export function adminWeeklySummary({ today, counts, sections, adminUrl }) {
  const subject = '【網站租用】每週摘要 ' + today;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const label = { live: '上線中', pending: '待上線', overdue: '已逾期', suspended: '已暫停', draft: '草稿', cancelled: '已終止' };
  const countLine = Object.keys(label).map((k) => label[k] + ' ' + (counts[k] || 0)).join('　');
  const nonEmpty = sections.filter((s) => s.items.length);
  const block = (s) => '<h3 style="margin:18px 0 6px;font-size:15px">' + esc(s.title) + '（' + s.items.length + '）</h3><ul style="padding-left:18px;margin:0">' + s.items.map((x) => '<li style="margin-bottom:4px">' + esc(x) + '</li>').join('') + '</ul>';
  const html = layout('每週摘要 · ' + today,
    '<p style="margin:0 0 6px">共 ' + total + ' 個網站：' + esc(countLine) + '</p>' +
    (nonEmpty.length ? nonEmpty.map(block).join('') : '<p>本週沒有需要處理的事項。</p>') +
    (adminUrl ? '<p style="font-size:13px;margin-top:18px"><a href="' + esc(adminUrl) + '">開啟管理後台</a></p>' : ''));
  const text = ['每週摘要 ' + today, '共 ' + total + ' 個網站：' + countLine, '', ...(nonEmpty.length ? nonEmpty.flatMap((s) => [s.title + '（' + s.items.length + '）', ...s.items.map((x) => '- ' + x), '']) : ['本週沒有需要處理的事項。'])].join('\n');
  return { subject, html, text };
}

// 客戶的網站有新的自訂程式碼 → 通知管理員審核
export function adminCodeReview({ shopName, slug, memberEmail, adminUrl }) {
  const subject = '【網站租用】自訂程式碼待審核：' + shopName;
  const html = layout('有自訂程式碼等待審核',
    '<p>「' + esc(shopName) + '」（' + esc(slug) + '，' + esc(memberEmail) + '）發佈了含自訂程式碼的版本。</p>' +
    '<p>核准前，網站會照常更新但不含這段程式碼。請到管理後台的網站詳情查看程式碼並核准或退回。</p>' +
    (adminUrl ? button(adminUrl, '開啟管理後台') : ''));
  const text = ['有自訂程式碼等待審核', '', shopName + '（' + slug + '，' + memberEmail + '）發佈了含自訂程式碼的版本。', '核准前網站照常更新但不含程式碼。請到管理後台的網站詳情核准或退回。'].join('\n');
  return { subject, html, text };
}

// 自訂程式碼審核結果 → 通知客戶
export function customerCodeResult({ shopName, approved, note }) {
  const subject = '【YC AXIOM】自訂程式碼' + (approved ? '已核准' : '沒有通過審核') + '：' + shopName;
  const msg = approved ? '你網站的自訂程式碼已經核准，網站會在 1–2 分鐘內更新。' : '你網站的自訂程式碼沒有通過審核，所以沒有放進網站（網站其他內容照常）。';
  const html = layout(approved ? '自訂程式碼已核准' : '自訂程式碼沒有通過審核',
    '<p>' + esc(msg) + '</p>' + (note ? '<p>說明：' + esc(note) + '</p>' : '') +
    (approved ? '' : '<p>你可以在編輯器修改程式碼後重新發佈，我們會再審核一次。有問題可以直接回覆這封信。</p>'));
  const text = [msg, note ? '說明：' + note : '', approved ? '' : '可以在編輯器修改後重新發佈，我們會再審核一次。'].filter(Boolean).join('\n');
  return { subject, html, text };
}

// 預約行事曆：店家確認或取消 → 通知客人
export function guestBookingResult({ shopName, when, confirmed, note, base }) {
  const subject = '【' + shopName + '】你的預約' + (confirmed ? '已確認' : '已取消') + '：' + when;
  const msg = confirmed ? '你在 ' + shopName + ' 的預約已經確認：' + when + '。期待你的光臨！' : '很抱歉，你在 ' + shopName + ' 的預約（' + when + '）已經取消。';
  const html = '<p>' + esc(msg) + '</p>' + (note ? '<p>店家說明：' + esc(note) + '</p>' : '') +
    '<p style="color:#777;font-size:14px">需要更改，請直接回覆這封信，會寄給店家。' + (base ? '網站：' + esc(base) : '') + '</p>';
  const text = [msg, note ? '店家說明：' + note : '', '需要更改請直接回覆這封信。'].filter(Boolean).join('\n');
  return { subject, html, text };
}

// 多人協作：邀請信
export function collabInvite({ shopName, inviter, dashboardUrl }) {
  const subject = '【YC AXIOM】' + (inviter || '網站擁有者') + ' 邀請你一起編輯「' + shopName + '」的網站';
  const html = layout('你被邀請一起編輯網站',
    '<p>' + esc(inviter || '網站擁有者') + ' 邀請你一起編輯「' + esc(shopName) + '」的網站。</p>' +
    '<p>請用收到這封信的 Email 登入（或註冊）YC AXIOM 會員專區，登入後就會在「我的網站」看到這個網站。</p>' +
    (dashboardUrl ? button(dashboardUrl, '前往會員專區') : '') +
    '<p style="color:#666;font-size:13px">協作者可以編輯內容、發佈更新、處理預約；收款設定、網域與刪除網站只有擁有者能操作。</p>');
  const text = [(inviter || '網站擁有者') + ' 邀請你一起編輯「' + shopName + '」的網站。', '請用這個 Email 登入 YC AXIOM 會員專區，登入後就會看到這個網站。', dashboardUrl].filter(Boolean).join('\n');
  return { subject, html, text };
}
