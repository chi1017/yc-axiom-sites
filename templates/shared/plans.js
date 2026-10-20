// 網站租用方案與價格：單一來源。編輯器（發佈前顯示金額）、/admin/（確認收款預填金額）、
// admin-site（驗證方案與早鳥名額）、測試共用這一份。純資料與純函式，無相依。
// 改價格＝改這個檔案（走 PR），官網靜態頁面的文字需同步更新。
export const PLAN_IDS = ['self', 'standard', 'pro'];

export const PLANS = {
  self: {
    id: 'self', name: '自助版', monthly: 690, setup: 0, edits: 0, domain: false, recommended: false,
    summary: '自己在線上編輯器填內容，按發佈就上線',
    features: ['自己填內容、隨時修改、換照片', '12 款配色可選，也可自選主色', 'SEO／GEO 已內建，每月寄送檢測報告', '免費網址：店名.pages.dev']
  },
  standard: {
    id: 'standard', name: '標準版', monthly: 990, setup: 3000, edits: 2, domain: true, recommended: true,
    summary: 'YC 幫你把內容填好、上線',
    features: ['包含自助版所有功能', 'YC 幫你把內容填好、上線', '每月 2 次由 YC 代為修改內容', '可綁定自己的網域']
  },
  pro: {
    id: 'pro', name: '進階版', monthly: 1990, setup: 3000, edits: 5, domain: true, recommended: false,
    summary: '更多代改，並保障同區域同業種不撞版',
    features: ['包含標準版所有功能', '每月 5 次由 YC 代為修改內容', '每月檢測報告由 YC 人工解讀並提供改善建議', '同區域同業種不撞版：同一個版型在你的區域只租給你一家']
  }
};

export const YEARLY_PAID_MONTHS = 10;   // 年繳（12 個月）只付 10 個月
export const EARLY_BIRD = { plan: 'standard', monthly: 690, slots: 10 };   // 前 10 位客戶：標準版月租 690

export const isPlanId = (p) => typeof p === 'string' && PLAN_IDS.includes(p);

export function monthlyFor(plan, earlyBird = false) {
  if (!isPlanId(plan)) throw new Error('unknown plan');
  return earlyBird && plan === EARLY_BIRD.plan ? EARLY_BIRD.monthly : PLANS[plan].monthly;
}

/**
 * 報價。months 為租用月數（整數 1–60）；每滿 12 個月只付 10 個月，不足 12 個月的部分按月計。
 * firstPayment：第一次付款才加開通費（自助版為 0）。
 * 回傳 { plan, months, monthly, rent, setup, total, saved }（金額皆為新台幣整數）。
 */
export function quote({ plan, months, earlyBird = false, firstPayment = false }) {
  if (!Number.isInteger(months) || months < 1 || months > 60) throw new Error('months out of range');
  const monthly = monthlyFor(plan, earlyBird);
  const years = Math.floor(months / 12), rest = months % 12;
  const rent = monthly * (years * YEARLY_PAID_MONTHS + rest);
  const setup = firstPayment ? PLANS[plan].setup : 0;
  return { plan, months, monthly, rent, setup, total: rent + setup, saved: monthly * months - rent };
}

export const money = (n) => 'NT$' + Number(n).toLocaleString('en-US');
