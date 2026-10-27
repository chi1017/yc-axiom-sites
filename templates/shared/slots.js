// 預約行事曆的時段計算（Edge Function 檢查與回傳剩餘名額、版型預覽都用這一份）。
// 時間一律以台灣時間（UTC+8）計算；日期字串 YYYY-MM-DD、時間 HH:MM。
import { DAYS } from './content.js';

const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
export const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
export const dowOf = (d) => DAYS[(new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7];
// 現在的台灣日期與當天分鐘數
export function taipeiNow(now) { const t = new Date(now.getTime() + 8 * 3600 * 1000); return { date: t.toISOString().slice(0, 10), min: t.getUTCHours() * 60 + t.getUTCMinutes() }; }

// 某一天店家開放的時段開始時間（不考慮名額與提前時間）
export function slotsForDate(cal, date) {
  if (!cal || !cal.enabled || (cal.closed || []).includes(date)) return [];
  const out = [];
  for (const r of cal.weekly[dowOf(date)] || []) {
    for (let m = toMin(r.start); m + cal.slotMinutes <= toMin(r.end); m += cal.slotMinutes) out.push(hhmm(m));
  }
  return [...new Set(out)].sort();
}

// 從今天起可以預約的日期與時段：usage＝{ 'YYYY-MM-DD HH:MM': 已預約組數 }
// 回傳 [{ date, slots: [{ time, left }] }]，只列出還有時段的日期（已過或太近的時段不列）
export function availability(cal, now, usage = {}) {
  const { date: today, min } = taipeiNow(now);
  const lead = (cal.leadHours || 0) * 60;
  const days = [];
  for (let i = 0; i <= cal.maxDays; i++) {
    const date = addDays(today, i);
    const slots = slotsForDate(cal, date).filter((t) => i * 1440 + toMin(t) - min >= lead)
      .map((t) => ({ time: t, left: Math.max(0, cal.capacity - (usage[date + ' ' + t] || 0)) }));
    if (slots.length) days.push({ date, slots });
  }
  return days;
}

// 送出時再檢查一次：時段存在、在可預約範圍內（名額由資料庫函式檢查）
export function checkSlot(cal, date, time, now) {
  if (!cal || !cal.enabled) return { ok: false, msg: '這個網站目前沒有開放線上選時段預約' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) return { ok: false, msg: '請選擇預約日期與時段' };
  const { date: today, min } = taipeiNow(now);
  const days = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
  if (Number.isNaN(days) || days < 0 || days > cal.maxDays) return { ok: false, msg: '這個日期不在可預約的範圍內' };
  if (!slotsForDate(cal, date).includes(time)) return { ok: false, msg: '這個時段沒有開放預約，請重新選擇' };
  if (days * 1440 + toMin(time) - min < (cal.leadHours || 0) * 60) return { ok: false, msg: '這個時段太接近了，請改選較晚的時段' };
  return { ok: true, msg: '' };
}
