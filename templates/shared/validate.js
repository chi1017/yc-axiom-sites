import { SECTION_LABELS, validDate, validTime, DAYS, DAY_LABELS } from './content.js';
import { hasAnyHours } from './hours.js';
import { safeHttpsUrl } from './escape.js';
import { slugError } from './slug.js';

// 發佈前檢查。回傳 { ok, errors:[{field,msg}] }；errors 的 msg 直接給使用者看。
// raw：使用者輸入的原始內容（選填）。正規化會把不合格的網址直接丟掉，帶入 raw 才能明確告訴使用者「哪個連結不合格」。
export function validateForPublish(content, sections, slug, raw) {
  const errors = [];
  const add = (field, msg) => errors.push({ field, msg });
  if (!content.name) add('name', '請填店名');
  if (!content.address) add('address', '請填店家地址');
  if (!hasAnyHours(content.hours)) add('hours', '請至少設定一天的營業時間（或標示公休以外的時段）');
  DAYS.forEach((d) => {
    const h = content.hours[d];
    if (!h.closed && (h.open || h.close) && !(validTime(h.open) && validTime(h.close))) add('hours.' + d, DAY_LABELS[d] + '的營業時間要同時填開始與結束');
  });
  if (!content.photos.hero) add('photos.hero', '請上傳一張主視覺照片');

  const b = content.booking, rawB = (raw && raw.booking) || b;
  const rawUrl = String(rawB.url || '').trim();
  if (rawUrl && !safeHttpsUrl(rawUrl)) add('booking.url', '訂位連結必須是 https:// 開頭的有效網址');
  else if ((b.label && !b.url) || (!b.label && b.url)) add('booking', '訂位按鈕要同時填「按鈕文字」與「連結」，或兩者都留空');
  const rawS = (raw && raw.social) || {};
  [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['line', 'LINE']].forEach(([k, label]) => {
    const v = String(rawS[k] || '').trim();
    if (v && !safeHttpsUrl(v)) add('social.' + k, label + ' 連結必須是 https:// 開頭的有效網址');
  });

  if (sections.menu) {
    content.menu.forEach((m, i) => {
      if (!m.name && !(m.price == null)) add('menu.' + i, '菜單第 ' + (i + 1) + ' 項缺少品名');
      else if (m.name && m.price == null) add('menu.' + i, '菜單第 ' + (i + 1) + ' 項（' + m.name + '）缺少價格');
    });
  }
  if (sections.faq) {
    content.faq.forEach((f, i) => {
      if (f.q && !f.a) add('faq.' + i, '常見問題第 ' + (i + 1) + ' 題缺少回答');
      if (!f.q && f.a) add('faq.' + i, '常見問題第 ' + (i + 1) + ' 題缺少問題');
    });
  }
  if (sections.news) {
    content.news.forEach((n, i) => {
      if (n.title && !n.date) add('news.' + i, '最新消息第 ' + (i + 1) + ' 則缺少日期');
      if (!n.title && n.date) add('news.' + i, '最新消息第 ' + (i + 1) + ' 則缺少標題');
    });
  }
  const se = slugError(slug);
  if (se) add('slug', se);
  return { ok: errors.length === 0, errors };
}

export { SECTION_LABELS, validDate };

// 不擋發佈、但會影響「搜尋與 AI 找得到你」的建議事項（依重要性排序）
export function suggestions(content, sections) {
  const out = [];
  const faqOk = content.faq.filter((f) => f.q && f.a);
  if (sections.faq && faqOk.length < 3) out.push({ field: 'faq', msg: '常見問題建議至少填 3 題（例如：需要訂位嗎？有插座嗎？可以帶寵物嗎？），搜尋與 AI 最常引用這種問與答' });
  else if (sections.faq && faqOk.some((f) => [...f.a].length < 30)) out.push({ field: 'faq', msg: '常見問題的回答建議寫 30 字以上，太短不容易被引用' });
  if ([...content.intro].length < 150) out.push({ field: 'intro', msg: '店家介紹建議寫 150 字以上：店的特色、座位、使用方式，讓人（與 AI）知道你是怎樣的店' });
  if (!content.tagline) out.push({ field: 'tagline', msg: '填一句話介紹，會顯示在首頁標題下方，也會用在搜尋結果的說明文字' });
  if (sections.menu && content.menu.filter((m) => m.name).length < 3) out.push({ field: 'menu', msg: '菜單建議至少列 3 項，客人與搜尋都更容易看懂你賣什麼' });
  if (!content.phone) out.push({ field: 'phone', msg: '建議填電話，客人與搜尋結果都會用到' });
  if (sections.interior && content.photos.room.length < 1) out.push({ field: 'photos.room', msg: '建議上傳 1–3 張店內照片' });
  if (!content.social.instagram && !content.social.facebook && !content.social.line) out.push({ field: 'social', msg: '有 Instagram、Facebook 或 LINE 的話建議填上連結，可幫助搜尋確認這是同一家店' });
  return out;
}
