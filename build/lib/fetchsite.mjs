// 抓取客戶網站（首頁、robots.txt、llms.txt）給月報檢測用。fetchImpl 可注入，方便測試。
const UA = 'YC-AXIOM-Monthly-Report/1.0 (+https://chi1017.github.io/yc-axiom-site/)';
const MAX_BYTES = 3 * 1024 * 1024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(fetchImpl, url, timeoutMs) {
  const res = await fetchImpl(url, { redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' }, signal: AbortSignal.timeout(timeoutMs) });
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new Error('頁面太大');
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('頁面太大');
  return { status: res.status, type: res.headers.get('content-type') || '', text, finalUrl: res.url || url };
}

// 回傳 { ok:true, html, finalUrl, robots:{status,text}, llms:{status,text} } 或 { ok:false, error }
export function makeFetchPage({ fetchImpl = fetch, retries = 1, retryDelayMs = 2000, timeoutMs = 15000 } = {}) {
  return async function fetchPage(url) {
    let home, lastErr = '';
    for (let i = 0; i <= retries; i++) {
      try {
        const r = await getText(fetchImpl, url, timeoutMs);
        if (r.status >= 500 && i < retries) { lastErr = 'HTTP ' + r.status; await sleep(retryDelayMs); continue; }
        home = r; break;
      } catch (e) {
        lastErr = String(e && e.name === 'TimeoutError' ? '連線逾時' : (e && e.message) || e).slice(0, 120);
        if (i < retries) await sleep(retryDelayMs);
      }
    }
    if (!home) return { ok: false, error: '抓不到網站：' + lastErr };
    if (home.status !== 200) return { ok: false, error: '網站回應 HTTP ' + home.status };
    if (!/html/i.test(home.type) || !/<html|<!doctype/i.test(home.text.slice(0, 2000))) return { ok: false, error: '網站回傳的不是網頁' };
    if (/網站維護中/.test(home.text.slice(0, 5000)) && /noindex/i.test(home.text.slice(0, 5000))) return { ok: false, error: '網站目前顯示維護頁' };
    const origin = new URL(home.finalUrl || url).origin;
    const side = async (path) => {
      try {
        const r = await getText(fetchImpl, origin + path, 10000);
        if (r.status === 200) return { status: 'ok', text: r.text };
        if (r.status === 404 || r.status === 410) return { status: 'none', text: '' };
        return { status: 'unknown', text: '' };
      } catch { return { status: 'unknown', text: '' }; }
    };
    const [robots, llms] = await Promise.all([side('/robots.txt'), side('/llms.txt')]);
    return { ok: true, html: home.text, finalUrl: home.finalUrl || url, robots, llms };
  };
}
