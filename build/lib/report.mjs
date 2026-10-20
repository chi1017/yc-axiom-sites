// 月報的純函式：月份標籤、挑「最該改的 3 件事」。
const TIER = { high: 3, medium: 2, low: 1 };
const plain = (s, n) => String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

export function monthLabel(first) { const [y, m] = first.split('-'); return y + ' 年 ' + Number(m) + ' 月'; }
export const clampScore = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null);

/**
 * seoActions: SEO 工具回傳的 actions [{priority, title, detail}]
 * geoIssues:  GEO 引擎回傳的 issues  [{title, level, loss, fix, why, note}]
 * 依嚴重度排序，同一個工具最多取 2 項（湊不滿才放寬），標題重複的只留一個。
 */
export function pickTopIssues({ seoActions = [], geoIssues = [] }, max = 3) {
  const all = [];
  seoActions.forEach((a, i) => all.push({ tool: 'SEO', title: plain(a.title, 60), detail: plain(a.detail, 120), tier: TIER[a.priority] || 1, rank: i }));
  geoIssues.forEach((g, i) => all.push({ tool: 'GEO', title: plain(g.title, 60), detail: plain(g.fix || g.why || g.note, 120), tier: TIER[g.level] || 1, rank: i }));
  all.sort((a, b) => (b.tier - a.tier) || (a.rank - b.rank) || (a.tool < b.tool ? -1 : 1));
  const seen = new Set(), picked = [], per = { SEO: 0, GEO: 0 };
  for (const x of all) {
    if (!x.title || seen.has(x.title)) continue;
    if (per[x.tool] >= 2) continue;
    seen.add(x.title); per[x.tool]++; picked.push(x);
    if (picked.length >= max) break;
  }
  if (picked.length < max) for (const x of all) { if (picked.length >= max) break; if (x.title && !seen.has(x.title)) { seen.add(x.title); picked.push(x); } }
  return picked.map((x) => ({ tool: x.tool, title: x.title, detail: x.detail, level: x.tier === 3 ? 'high' : x.tier === 2 ? 'medium' : 'low' }));
}
