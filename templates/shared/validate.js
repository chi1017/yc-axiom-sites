import { SECTION_LABELS, validDate, validTime, DAYS, DAY_LABELS, youtubeId, GA4_RE } from './content.js';
import { hasAnyHours } from './hours.js';
import { safeHttpsUrl } from './escape.js';
import { slugError } from './slug.js';
import { getIndustry } from './industries.js';

// 價目的稱呼依行業（菜單／服務項目／課程…）；不知道行業時用「價目表」
const offerWord = (template) => { const i = getIndustry(template); return i ? i.offer.nav : '價目表'; };

// 發佈前檢查。回傳 { ok, errors:[{field,msg}] }；errors 的 msg 直接給使用者看。
// raw：使用者輸入的原始內容（選填）。正規化會把不合格的網址直接丟掉，帶入 raw 才能明確告訴使用者「哪個連結不合格」。
// checkBrand：是否檢查網址代稱裡的平台品牌字樣。只有還能改代稱的草稿（第一次發佈前）才檢查；
//   已發佈過的網站代稱已鎖定，沿用舊代稱不擋。編輯器在輸入代稱時另外用 slugError() 檢查，所以預設 false。
// template：行業 key（選填），只影響錯誤訊息的用詞
export function validateForPublish(content, sections, slug, raw, { checkBrand = false, template } = {}) {
  const W = offerWord(template);
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
      if (!m.name && !(m.price == null)) add('menu.' + i, W + '第 ' + (i + 1) + ' 項缺少名稱');
      else if (m.name && m.price == null) add('menu.' + i, W + '第 ' + (i + 1) + ' 項（' + m.name + '）缺少價格');
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
  // 更多內容
  const rawVideo = String((raw && raw.video) || '').trim();
  if (rawVideo && !youtubeId(rawVideo)) add('video', '影片網址要是 YouTube 的影片連結（例如 https://www.youtube.com/watch?v=…）');
  const rawGa = String((raw && raw.ga4) || '').trim();
  if (rawGa && !GA4_RE.test(rawGa.toUpperCase())) add('ga4', 'Google Analytics 評估 ID 格式是 G- 開頭（例如 G-AB12CD34EF）');
  content.reviews.forEach((r, i) => { if (r.name && !r.text) add('reviews.' + i, '客人評價第 ' + (i + 1) + ' 則缺少內容'); });
  content.posts.forEach((p, i) => {
    if ((p.title || p.body) && !(p.title && p.body)) add('posts.' + i, '文章第 ' + (i + 1) + ' 篇要同時有標題與內容');
    if (p.title && !p.date) add('posts.' + i, '文章第 ' + (i + 1) + ' 篇缺少日期');
  });
  if (content.en.enabled && (!content.en.name || !content.en.intro)) add('en', '英文版要填英文店名與英文介紹（或先關閉英文版）');
  if (content.shop.enabled) content.shop.items.forEach((it, i) => {
    if (it.name && !it.price) add('shop.' + i, '線上購買第 ' + (i + 1) + ' 項（' + it.name + '）缺少價格');
    else if (!it.name && (it.price || it.desc || it.photo)) add('shop.' + i, '線上購買第 ' + (i + 1) + ' 項缺少商品名稱');
  });
  const rawBlocks = Array.isArray(raw && raw.blocks) ? raw.blocks : [];
  content.blocks.forEach((b, i) => {
    const rawUrl2 = String((rawBlocks.find((r) => r && String(r.id || '').toLowerCase() === b.id) || {}).btnUrl || '').trim();
    if (rawUrl2 && !safeHttpsUrl(rawUrl2)) add('blocks.' + i, '自訂區塊「' + (b.title || i + 1) + '」的按鈕連結必須是 https:// 開頭的有效網址');
    else if ((b.btnLabel && !b.btnUrl) || (!b.btnLabel && b.btnUrl)) add('blocks.' + i, '自訂區塊「' + (b.title || i + 1) + '」的按鈕要同時填文字與連結，或兩者都留空');
  });
  if (content.style.floatLine && !content.social.line) add('social.line', '要顯示 LINE 浮動按鈕，請先填 LINE 連結');
  if (content.bookingForm && content.bookingCal && content.bookingCal.enabled && !Object.values(content.bookingCal.weekly).some((r) => r.length)) add('bookingCal', '預約行事曆要至少設定一個每週可預約的時段（或先關閉行事曆）');
  if (content.showMap && !content.address) add('address', '要顯示地圖，請先填店家地址');
  if (template !== undefined && !getIndustry(template)) add('template', '不支援的行業類型，請重新選擇');
  const se = slugError(slug, { allowBrand: !checkBrand });
  if (se) add('slug', se);
  return { ok: errors.length === 0, errors };
}

export { SECTION_LABELS, validDate };

// 不擋發佈、但會影響「搜尋與 AI 找得到你」的建議事項（依重要性排序）
export function suggestions(content, sections, template) {
  const W = offerWord(template);
  const out = [];
  const faqOk = content.faq.filter((f) => f.q && f.a);
  if (sections.faq && faqOk.length < 3) out.push({ field: 'faq', msg: '常見問題建議至少填 3 題（例如：需要預約嗎？怎麼付款？附近好停車嗎？），搜尋與 AI 最常引用這種問與答' });
  else if (sections.faq && faqOk.some((f) => [...f.a].length < 30)) out.push({ field: 'faq', msg: '常見問題的回答建議寫 30 字以上，太短不容易被引用' });
  if ([...content.intro].length < 150) out.push({ field: 'intro', msg: '店家介紹建議寫 150 字以上：特色、服務方式、適合誰，讓人（與 AI）知道你是怎樣的店' });
  if (!content.tagline) out.push({ field: 'tagline', msg: '填一句話介紹，會顯示在首頁標題下方，也會用在搜尋結果的說明文字' });
  if (sections.menu && content.menu.filter((m) => m.name).length < 3) out.push({ field: 'menu', msg: W + '建議至少列 3 項，客人與搜尋都更容易看懂你提供什麼' });
  if (!content.phone) out.push({ field: 'phone', msg: '建議填電話，客人與搜尋結果都會用到' });
  if (sections.interior && content.photos.room.length < 1) out.push({ field: 'photos.room', msg: '建議上傳 1–6 張照片' });
  if (!content.social.instagram && !content.social.facebook && !content.social.line) out.push({ field: 'social', msg: '有 Instagram、Facebook 或 LINE 的話建議填上連結，可幫助搜尋確認這是同一家店' });
  return out;
}
