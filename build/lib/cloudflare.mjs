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
    }
  };
}
function errText(j) { return j && j.errors && j.errors.length ? j.errors.map((e) => e.message).join('; ') : 'unknown'; }
