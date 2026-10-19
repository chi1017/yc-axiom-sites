import { DAYS, DAY_LABELS } from './content.js';

const SCHEMA_DAY = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const ZH_SHORT = { mon: '一', tue: '二', wed: '三', thu: '四', fri: '五', sat: '六', sun: '日' };

// 某天狀態：{kind:'open',open,close} | {kind:'closed'} | {kind:'unset'}
export function dayState(h) {
  if (!h) return { kind: 'unset' };
  if (h.closed) return { kind: 'closed' };
  if (h.open && h.close) return { kind: 'open', open: h.open, close: h.close };
  return { kind: 'unset' };
}
const key = (s) => (s.kind === 'open' ? s.open + '-' + s.close : s.kind);

export function hasAnyHours(hours) {
  return DAYS.some((d) => dayState(hours && hours[d]).kind === 'open');
}

// 連續且相同的天合併：[{days:['mon','tue'], state, label:'週一至週二'}]
export function groupHours(hours) {
  const groups = [];
  DAYS.forEach((d) => {
    const st = dayState(hours && hours[d]);
    if (st.kind === 'unset') return;
    const last = groups[groups.length - 1];
    const prevDay = last ? last.days[last.days.length - 1] : null;
    if (last && key(last.state) === key(st) && DAYS.indexOf(prevDay) === DAYS.indexOf(d) - 1) last.days.push(d);
    else groups.push({ days: [d], state: st });
  });
  groups.forEach((g) => {
    const a = g.days[0], b = g.days[g.days.length - 1];
    g.label = g.days.length === 1 ? DAY_LABELS[a]
      : g.days.length === 2 ? DAY_LABELS[a] + '、' + DAY_LABELS[b]
      : DAY_LABELS[a] + '至' + DAY_LABELS[b];
    g.text = g.state.kind === 'open' ? g.state.open + '–' + g.state.close : '公休';
  });
  return groups;
}

// 「週一至週五 08:00–18:00；週六、週日 09:00–17:00；週三公休」
export function hoursSummary(hours) {
  return groupHours(hours).map((g) => g.label + ' ' + g.text).join('；');
}

// 依 schema.org：同樣時段的日子合成一筆
export function openingHoursSpec(hours) {
  const map = new Map();
  DAYS.forEach((d) => {
    const st = dayState(hours && hours[d]);
    if (st.kind !== 'open') return;
    const k = key(st);
    if (!map.has(k)) map.set(k, { st, days: [] });
    map.get(k).days.push(d);
  });
  return [...map.values()].map(({ st, days }) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: days.map((d) => 'https://schema.org/' + SCHEMA_DAY[d]),
    opens: st.open,
    closes: st.close
  }));
}
export { ZH_SHORT };
