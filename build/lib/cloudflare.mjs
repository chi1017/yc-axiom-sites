// Cloudflare Pages：建立專案（Direct Upload）並讀回實際網域。
export function makeCloudflare({ token, accountId, fetchImpl = fetch }) {
  const api = 'https://api.cloudflare.com/client/v4/accounts/' + accountId + '/pages/projects';
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  async function call(url, opts) {
    const res = await fetchImpl(url, { ...opts, headers: h });
    let j = null; try { j = await res.json(); } catch { /* ignore */ }
    return { status: res.status, json: j };
  }
  return {
    // 取得專案；不存在就建立。回傳 { name, subdomain }（subdomain 例如 my-cafe.pages.dev 或 my-cafe-abc.pages.dev）
    async ensureProject(name) {
      const got = await call(api + '/' + encodeURIComponent(name), { method: 'GET' });
      if (got.status === 200 && got.json && got.json.result) return { name: got.json.result.name, subdomain: got.json.result.subdomain, created: false };
      if (got.status !== 404) throw new Error('Cloudflare 讀取專案失敗 (' + got.status + ')：' + errText(got.json));
      const made = await call(api, { method: 'POST', body: JSON.stringify({ name, production_branch: 'main' }) });
      if (made.status >= 300 || !made.json || !made.json.result) throw new Error('Cloudflare 建立專案失敗 (' + made.status + ')：' + errText(made.json));
      return { name: made.json.result.name, subdomain: made.json.result.subdomain, created: true };
    },
    // 把客戶網域加到 Pages 專案。回傳 { name, status, target }：target 是客戶要設定 CNAME 指向的主機（專案的 pages.dev 網域）。
    async addDomain(project, domain) {
      const p = await call(api + '/' + encodeURIComponent(project), { method: 'GET' });
      if (p.status !== 200 || !p.json || !p.json.result) throw new Error('Cloudflare 讀取專案失敗 (' + p.status + ')：' + errText(p.json));
      const target = p.json.result.subdomain;
      const got = await call(api + '/' + encodeURIComponent(project) + '/domains/' + encodeURIComponent(domain), { method: 'GET' });
      if (got.status === 200 && got.json && got.json.result) return { name: got.json.result.name || domain, status: got.json.result.status || 'pending', target, created: false };
      if (got.status !== 404) throw new Error('Cloudflare 讀取網域失敗 (' + got.status + ')：' + errText(got.json));
      const made = await call(api + '/' + encodeURIComponent(project) + '/domains', { method: 'POST', body: JSON.stringify({ name: domain }) });
      if (made.status >= 300 || !made.json || !made.json.result) throw new Error('Cloudflare 新增網域失敗 (' + made.status + ')：' + errText(made.json));
      return { name: made.json.result.name || domain, status: made.json.result.status || 'pending', target, created: true };
    },
    // 從 Pages 專案移除網域（找不到視為已移除）
    async removeDomain(project, domain) {
      const r = await call(api + '/' + encodeURIComponent(project) + '/domains/' + encodeURIComponent(domain), { method: 'DELETE' });
      if (r.status === 404) return { removed: false };
      if (r.status >= 300) throw new Error('Cloudflare 移除網域失敗 (' + r.status + ')：' + errText(r.json));
      return { removed: true };
    },
    // 查詢網域狀態：Cloudflare 的 status 為 initializing／pending／active／deactivated／blocked／error
    async getDomain(project, domain) {
      const got = await call(api + '/' + encodeURIComponent(project) + '/domains/' + encodeURIComponent(domain), { method: 'GET' });
      if (got.status === 404) return null;
      if (got.status !== 200 || !got.json || !got.json.result) throw new Error('Cloudflare 讀取網域失敗 (' + got.status + ')：' + errText(got.json));
      const r = got.json.result;
      return { name: r.name || domain, status: r.status || 'pending', error: (r.validation_data && r.validation_data.error_message) || (r.verification_data && r.verification_data.error_message) || '' };
    }
  };
}
function errText(j) { return j && j.errors && j.errors.length ? j.errors.map((e) => e.message).join('; ') : 'unknown'; }
