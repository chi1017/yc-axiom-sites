// 最小 Supabase REST 封裝（只用 fetch，不裝 SDK）。service role 金鑰只存在於 Actions 的環境變數。
export function makeSupabase({ url, serviceKey, fetchImpl = fetch }) {
  const base = url.replace(/\/$/, '');
  const headers = (extra = {}) => ({ apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, ...extra });
  async function rest(path, { method = 'GET', body, prefer } = {}) {
    const res = await fetchImpl(base + '/rest/v1/' + path, {
      method,
      headers: headers({ 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    if (!res.ok) throw new Error('Supabase ' + method + ' ' + path.split('?')[0] + ' → ' + res.status + ' ' + text.slice(0, 200));
    return text ? JSON.parse(text) : null;
  }
  return {
    async getOne(table, query) { const r = await rest(table + '?' + query + '&limit=1'); return r && r[0] ? r[0] : null; },
    async patch(table, query, body) { return rest(table + '?' + query, { method: 'PATCH', body, prefer: 'return=minimal' }); },
    // 條件式更新並回傳實際被更新的列（沒有符合條件的列 → 空陣列）。排程用它「先佔位再動作」，避免兩個執行同時處理同一個網站。
    async patchReturning(table, query, body) { const r = await rest(table + '?' + query, { method: 'PATCH', body, prefer: 'return=representation' }); return r || []; },
    async remove(table, query) { return rest(table + '?' + query, { method: 'DELETE', prefer: 'return=minimal' }); },
    async insert(table, body) { return rest(table, { method: 'POST', body, prefer: 'return=minimal' }); },
    async insertReturning(table, body) { const r = await rest(table, { method: 'POST', body, prefer: 'return=representation' }); return r && r[0] ? r[0] : null; },
    async list(table, query) { return (await rest(table + '?' + query)) || []; },
    // Storage：列出某個資料夾（prefix）底下的物件；回傳 [{name,id,created_at,...}]（資料夾的 id 為 null）
    async storageList(bucket, prefix, { offset = 0, limit = 100 } = {}) {
      const res = await fetchImpl(base + '/storage/v1/object/list/' + bucket, { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefix, limit, offset, sortBy: { column: 'name', order: 'asc' } }) });
      if (!res.ok) throw new Error('Storage list ' + prefix + ' → ' + res.status);
      return res.json();
    },
    async storageRemove(bucket, paths) {
      const res = await fetchImpl(base + '/storage/v1/object/' + bucket, { method: 'DELETE', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: paths }) });
      if (!res.ok) throw new Error('Storage remove → ' + res.status);
      return res.json();
    },
    async download(bucket, path) {
      const res = await fetchImpl(base + '/storage/v1/object/' + bucket + '/' + path.split('/').map(encodeURIComponent).join('/'), { headers: headers() });
      if (!res.ok) throw new Error('Storage download ' + path + ' → ' + res.status);
      return Buffer.from(await res.arrayBuffer());
    }
  };
}
