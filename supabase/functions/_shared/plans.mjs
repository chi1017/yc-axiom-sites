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

// 一頁版升級多頁版的差額（剩下的已付天數 × 兩種方案的價差）。
// 月繳：每天 =（多頁月費 − 一頁月費）÷ 30；年繳（付 10 個月用 12 個月）：每天 =（兩種年費的差）÷ 365。四捨五入到元。
// paidUntil：服務到期日（含當天）；today：台灣日期；yearly：最近一次付款是 12 個月以上。
export function upgradeQuote({ paidUntil, today, yearly = false }) {
  if (!paidUntil || paidUntil < today) return { days: 0, amount: 0, yearly };
  const days = Math.round((Date.parse(paidUntil + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000) + 1;
  const perDay = yearly ? ((PLANS.multi.monthly - PLANS.single.monthly) * PLANS.single.yearPaidMonths) / 365 : (PLANS.multi.monthly - PLANS.single.monthly) / 30;
  return { days, amount: Math.round(days * perDay), yearly };
}
