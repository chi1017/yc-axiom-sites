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
    async insert(table, body) { return rest(table, { method: 'POST', body, prefer: 'return=minimal' }); },
    async insertReturning(table, body) { const r = await rest(table, { method: 'POST', body, prefer: 'return=representation' }); return r && r[0] ? r[0] : null; },
    async list(table, query) { return (await rest(table + '?' + query)) || []; },
    async download(bucket, path) {
      const res = await fetchImpl(base + '/storage/v1/object/' + bucket + '/' + path.split('/').map(encodeURIComponent).join('/'), { headers: headers() });
      if (!res.ok) throw new Error('Storage download ' + path + ' → ' + res.status);
      return Buffer.from(await res.arrayBuffer());
    }
  };
}
