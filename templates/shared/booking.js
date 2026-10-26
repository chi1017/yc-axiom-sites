// 線上預約的檢查（網站表單送出時由 Edge Function site-public 使用；測試也用同一份）
import { DAYS } from './content.js';
import { dayState } from './hours.js';

export const BOOKING_DAYS_AHEAD = 90;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

// today：台灣日期 YYYY-MM-DD。回傳 { ok, msg }，msg 給客人看
export function checkBooking({ hours, date, time, today }) {
  if (!DATE_RE.test(date || '') || Number.isNaN(Date.parse(date + 'T00:00:00Z'))) return { ok: false, msg: '請選擇預約日期' };
  if (!TIME_RE.test(time || '')) return { ok: false, msg: '請選擇預約時間' };
  if (date < today) return { ok: false, msg: '預約日期不能早於今天' };
  if (date > addDays(today, BOOKING_DAYS_AHEAD)) return { ok: false, msg: '只能預約 ' + BOOKING_DAYS_AHEAD + ' 天內的日期' };
  const dow = DAYS[(new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7];   // getUTCDay：0=週日
  const st = dayState(hours && hours[dow]);
  if (st.kind === 'closed') return { ok: false, msg: '那天公休，請選擇其他日期' };
  if (st.kind === 'open') {
    const inside = st.open <= st.close ? time >= st.open && time < st.close : time >= st.open || time < st.close;   // 營業到隔天凌晨
    if (!inside) return { ok: false, msg: '那個時間不在營業時間內（' + st.open + '–' + st.close + '），請重新選擇' };
  }
  return { ok: true, msg: '' };
}
