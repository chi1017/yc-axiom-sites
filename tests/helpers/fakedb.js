// 測試用的記憶體資料庫：模擬 makeSupabase 的 REST 介面與 PostgREST 篩選語法（eq/neq/lt/lte/gt/gte/is.null/in/or）。
export function makeFakeDb(clock = { iso: '2026-10-20T01:00:00.000Z' }) {
  const t = { rental_sites: [], members: [], site_events: [], site_reports: [], cron_runs: [], site_versions: [] };
  let eventId = 1;
  const stats = { patches: 0, inserts: 0, removes: 0 };
  const dec = (v) => decodeURIComponent(v);
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  function test(row, key, expr) {
    const v = row[key];
    const [op, ...rest] = expr.split('.'); const arg = dec(rest.join('.'));
    if (expr === 'is.null') return v == null;
    if (expr === 'not.is.null') return v != null;
    const vs = v == null ? null : String(v);
    switch (op) {
      case 'eq': return vs === arg;
      case 'neq': return vs != null && vs !== arg;   // 和 PostgreSQL 一樣：NULL <> x 不成立，所以呼叫端必須搭配 is.null 才會涵蓋 NULL
      case 'lt': return vs != null && cmp(vs, arg) < 0;
      case 'lte': return vs != null && cmp(vs, arg) <= 0;
      case 'gt': return vs != null && cmp(vs, arg) > 0;
      case 'gte': return vs != null && cmp(vs, arg) >= 0;
      case 'in': return arg.replace(/^\(|\)$/g, '').split(',').includes(vs);
    }
    throw new Error('fakedb: unsupported filter ' + key + '=' + expr);
  }
  function splitTop(s) { const out = []; let d = 0, cur = ''; for (const c of s) { if (c === '(') d++; if (c === ')') d--; if (c === ',' && d === 0) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; }
  function matches(row, filters) {
    return filters.every(([k, expr]) => {
      if (k === 'or') return splitTop(expr.replace(/^\(|\)$/g, '')).some((part) => { const i = part.indexOf('.'); const key = part.slice(0, i); return test(row, key, part.slice(i + 1)); });
      return test(row, k, expr);
    });
  }
  function parse(query) {
    const filters = []; let limit = Infinity, offset = 0, order = null; let select = '*';
    for (const part of query.split('&')) {
      if (!part) continue;
      const i = part.indexOf('='); const k = part.slice(0, i), v = part.slice(i + 1);
      if (k === 'select') select = v; else if (k === 'limit') limit = Number(v); else if (k === 'offset') offset = Number(v); else if (k === 'order') order = v.split('.'); else filters.push([k, v]);
    }
    return { filters, limit, select, offset, order };
  }
  const project = (table, row, select) => {
    const r = JSON.parse(JSON.stringify(row));
    if (table === 'rental_sites' && /shop_name:content->>name/.test(select)) { r.shop_name = (row.content && row.content.name) || null; delete r.content; }
    return r;
  };
  const db = {
    tables: t, stats,
    async list(table, q) {
      const { filters, limit, select, offset, order } = parse(q);
      let rows = t[table].filter((r) => matches(r, filters));
      if (order) { const [col, dir] = order; rows = [...rows].sort((a, b) => (cmp(String(a[col]), String(b[col]))) * (dir === 'desc' ? -1 : 1)); }
      return rows.slice(offset, offset + limit).map((r) => project(table, r, select));
    },
    async getOne(table, q) { const r = await db.list(table, q + '&limit=1'); return r[0] || null; },
    async patch(table, q, body) { await db.patchReturning(table, q, body); },
    async patchReturning(table, q, body) { const { filters } = parse(q); const rows = t[table].filter((r) => matches(r, filters)); rows.forEach((r) => Object.assign(r, body)); stats.patches += rows.length; return rows.map((r) => JSON.parse(JSON.stringify(r))); },
    async insert(table, row) {
      if (table === 'cron_runs' && row.job === 'weekly' && row.mode === 'real' && t.cron_runs.some((x) => x.job === 'weekly' && x.mode === 'real' && x.run_date === row.run_date)) throw new Error('Supabase POST cron_runs → 409 duplicate key value violates unique constraint');
      const r = { ...JSON.parse(JSON.stringify(row)) };
      if (table === 'site_events') { r.id = eventId++; r.created_at = r.created_at || clock.iso; }
      if (table === 'site_reports' && !r.id) r.id = 'rep-' + (t[table].length + 1);
      t[table].push(r); stats.inserts++; return null;
    },
    async remove(table, q) { const { filters } = parse(q); const before = t[table].length; t[table] = t[table].filter((r) => !matches(r, filters)); stats.removes += before - t[table].length; }
  };
  return db;
}
