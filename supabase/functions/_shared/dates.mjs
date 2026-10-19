// 排程用的日期工具。所有日期都是「台灣日期」（UTC+8）的 YYYY-MM-DD 字串，字串可直接比大小。
export function taipeiDate(d) { return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10); }
export const isDateStr = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const dayNum = (s) => Math.round(Date.parse(s + 'T00:00:00Z') / 86400000);
export function addDays(s, n) { return new Date((dayNum(s) + n) * 86400000).toISOString().slice(0, 10); }
// b - a（天）
export function diffDays(a, b) { return dayNum(b) - dayNum(a); }
// 星期幾：0 = 週日 … 1 = 週一
export function weekdayOf(s) { return new Date(s + 'T00:00:00Z').getUTCDay(); }
export const firstOfMonth = (s) => s.slice(0, 8) + '01';
export function prevMonthFirst(s) { const [y, m] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10); }
