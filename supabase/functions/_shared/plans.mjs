// 線上付款的價格（伺服器端，不信任瀏覽器送來的金額）。
// 必須與官網 yc-axiom-site 的 assets/rental-plan.js 一致；改價格時兩邊一起改。
export const PLANS = {
  single: { name: '自架版（一頁）', monthly: 599, yearPaidMonths: 10 },
  multi: { name: '自架版（多頁）', monthly: 899, yearPaidMonths: 10 }
};
export const planFor = (layout) => (layout === 'multi' ? PLANS.multi : PLANS.single);

// 會員可以選的付款選項
export const PAY_OPTIONS = {
  card_monthly: { label: '信用卡每月自動扣款', kind: 'card_monthly', months: 1 },
  card_year: { label: '信用卡一次付 12 個月', kind: 'card', months: 12 },
  atm_1: { label: 'ATM 轉帳 1 個月', kind: 'atm', months: 1 },
  atm_12: { label: 'ATM 轉帳 12 個月', kind: 'atm', months: 12 }
};
export function priceFor(layout, months) {
  const p = planFor(layout);
  const years = Math.floor(months / 12);
  return (years * p.yearPaidMonths + (months % 12)) * p.monthly;
}
