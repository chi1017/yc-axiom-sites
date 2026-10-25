// 一頁版／多頁版的頁面規則（編輯器、發佈、建置共用；這裡是唯一來源）。
// - 建立網站時選 layout：'single'（一頁版，所有內容在首頁，用 sections 開關區塊）或 'multi'（多頁版）。
// - 多頁版：首頁一定開；其餘頁面由客戶勾選，存在 pages（{ about: true, menu: false, ... }）。
// - 只能從一頁升級到多頁，不能改回（資料庫 010 也有同一條規則）。
// 頁面清單與資料庫 supabase/migrations/010_layout_pages.sql 的允許鍵一致（tests 會比對）。
import { normalizeSections } from './content.js';
import { getIndustry } from './industries.js';

export const LAYOUTS = ['single', 'multi'];
export const LAYOUT_LABELS = { single: '一頁版', multi: '多頁版' };

export const HOME_PAGE = { key: 'home', label: '首頁', path: '' };
// 順序就是導覽列與 sitemap 的順序；path 是相對網站根目錄的資料夾（建置時輸出 <path>index.html）。
// 這裡是咖啡店的名稱；其他行業的頁名與網址由 pagesFor(industry) 依行業設定替換（menu／interior／visit 三頁）。
export const PAGES = [
  { key: 'about', label: '關於', path: 'about/' },
  { key: 'menu', label: '菜單與價格', path: 'menu/' },
  { key: 'interior', label: '店內環境', path: 'space/' },
  { key: 'news', label: '最新消息', path: 'news/' },
  { key: 'faq', label: '常見問題', path: 'faq/' },
  { key: 'visit', label: '來店資訊', path: 'visit/' }
];
export const PAGE_KEYS = PAGES.map((p) => p.key);

// 依行業回傳六個頁面的名稱與網址（key 不變，資料庫與編輯器只認 key）
export function pagesFor(industryKey) {
  const ind = getIndustry(industryKey);
  if (!ind) return PAGES;
  return PAGES.map((p) => {
    if (p.key === 'menu') return { ...p, label: ind.offer.label, path: ind.offer.path };
    if (p.key === 'interior') return { ...p, label: ind.space.label, path: ind.space.path };
    if (p.key === 'visit') return { ...p, label: ind.visit.label, path: ind.visit.path };
    return p;
  });
}

export function normalizeLayout(v) {
  return LAYOUTS.includes(v) ? v : 'single';
}

export function defaultPages() {
  const o = {};
  PAGE_KEYS.forEach((k) => { o[k] = true; });
  return o;
}

// 只留下認得的頁面、值一定是 boolean；沒給的頁面預設開啟
export function normalizePages(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const o = defaultPages();
  PAGE_KEYS.forEach((k) => { if (typeof r[k] === 'boolean') o[k] = r[k]; });
  return o;
}

// 一頁版升級成多頁版時的預設勾選：沿用一頁版的區塊開關；關於與來店資訊一定開
export function pagesFromSections(sections) {
  const s = normalizeSections(sections);
  return { about: true, menu: s.menu, interior: s.interior, news: s.news, faq: s.faq, visit: true };
}

// 版型能不能這樣改：同一種，或一頁升級到多頁
export function canChangeLayout(from, to) {
  const a = normalizeLayout(from), b = normalizeLayout(to);
  return a === b || (a === 'single' && b === 'multi');
}

// 會輸出的頁面（含首頁），依導覽順序。一頁版只有首頁。
export function enabledPages(layout, pages, industryKey) {
  if (normalizeLayout(layout) !== 'multi') return [HOME_PAGE];
  const p = normalizePages(pages);
  return [HOME_PAGE, ...pagesFor(industryKey).filter((x) => p[x.key])];
}
