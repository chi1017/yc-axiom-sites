// Edge Function 進入點共用的外部呼叫：驗證登入者、觸發 GitHub Actions 部署。
// 這裡不讀環境變數，由 main.mjs 傳入，方便測試。
export function makeGetUser({ supabaseUrl, anonKey, fetchImpl = fetch }) {
  return async function getUser(token) {
    const res = await fetchImpl(supabaseUrl + '/auth/v1/user', { headers: { apikey: anonKey, Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const u = await res.json();
    if (!u || !u.id) return null;
    // app_metadata 只有後端能改（使用者改不了），所以管理員身分以它為準
    return { id: u.id, email: u.email, isAdmin: !!(u.app_metadata && u.app_metadata.role === 'admin') };
  };
}

// ref：要執行哪個分支上的 deploy-site.yml（預設 main；驗收新版本、尚未合併時，可用 GITHUB_REF 秘密暫時指到功能分支）
export function makeDispatcher({ token, repo, ref = 'main', fetchImpl = fetch }) {
  return async function dispatch({ siteId, versionId, mode }) {
    if (!token) return { ok: false, error: 'GITHUB_DISPATCH_TOKEN 未設定' };
    const inputs = { site_id: siteId };
    if (versionId) inputs.version_id = versionId;
    if (mode) inputs.mode = mode;
    const res = await fetchImpl('https://api.github.com/repos/' + repo + '/actions/workflows/deploy-site.yml/dispatches', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'yc-axiom-sites-functions' },
      body: JSON.stringify({ ref: ref || 'main', inputs }),
      signal: AbortSignal.timeout(10000)
    });
    return res.status === 204 ? { ok: true } : { ok: false, error: 'github ' + res.status };
  };
}
