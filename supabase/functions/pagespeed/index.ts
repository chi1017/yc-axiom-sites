// YC AXIOM PageSpeed 代理：SEO 工具的 PageSpeed Insights 改由這裡呼叫，使用存在 Supabase Secrets 的 PAGESPEED_API_KEY。
// GET ?url=<網址>&strategy=mobile|desktop  →  Google 回傳的 JSON（原樣）；失敗時回 { error: { code, message } }，message 是給使用者看的中文。
// 金鑰只在伺服器端使用，不會出現在網頁或回應裡。只接受官網來源（CORS＋Origin 檢查）、每個來源限流、相同網址 10 分鐘內共用結果（省額度）。
const API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const OFFICIAL = ["https://yc-axiom.pages.dev", "https://chi1017.github.io"];
const TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 60000;

export const MSG = {
  quota: "今天的 PageSpeed 檢測次數已經用完，請明天再試。其他 SEO 檢測項目不受影響。",
  bad_url: "網址格式不正確，請輸入 http:// 或 https:// 開頭的完整網址。",
  unreachable: "Google 無法讀取這個網址，請確認網址可以公開開啟（不需要登入、沒有擋搜尋引擎）。",
  timeout: "Google 分析這個網址花太久了，請稍後再試一次。",
  busy: "檢測太頻繁了，請等 30 秒再試。",
  failed: "PageSpeed 暫時無法分析，請稍後再試。其他 SEO 檢測項目不受影響。",
};

function origins(): string[] {
  const extra = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  return [...new Set([...OFFICIAL, ...extra])];
}
function cors(origin: string, allowed: string[]): Record<string, string> {
  const h: Record<string, string> = { "Vary": "Origin", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "86400" };
  if (origin && allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
const json = (body: unknown, status: number, h: Record<string, string>) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...h } });
const fail = (code: keyof typeof MSG, status: number, h: Record<string, string>) => json({ error: { code, message: MSG[code] } }, status, h);

// Google 的錯誤 → 我們的錯誤代碼（不把原始錯誤給使用者看）
export function classify(status: number, body: unknown): keyof typeof MSG {
  // deno-lint-ignore no-explicit-any
  const e = (body as any)?.error ?? {};
  const text = JSON.stringify(e).toLowerCase();
  if (status === 429 || e.status === "RESOURCE_EXHAUSTED" || text.includes("quota") || text.includes("rate limit")) return "quota";
  if (status === 400 || text.includes("failed_document_request") || text.includes("errored_document_request") || text.includes("dns") || text.includes("not_html") || text.includes("invalid url")) return "unreachable";
  return "failed";
}

const cache = new Map<string, { at: number; body: string }>();
const hits = new Map<string, number[]>();
function allow(key: string, now: number): boolean {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < 60000);
  if (arr.length >= 20) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return true;
}

export async function handle(req: Request, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<Response> {
  const allowed = origins();
  const origin = req.headers.get("origin") ?? "";
  const h = cors(origin, allowed);
  if (req.method === "OPTIONS") return new Response(null, { status: origin && allowed.includes(origin) ? 204 : 403, headers: h });
  if (req.method !== "GET") return fail("failed", 405, h);
  if (!origin || !allowed.includes(origin)) return json({ error: { code: "origin_not_allowed", message: "origin_not_allowed" } }, 403, h);

  const q = new URL(req.url).searchParams;
  const target = q.get("url") ?? "";
  const strategy = q.get("strategy") === "desktop" ? "desktop" : "mobile";
  let u: URL;
  try { u = new URL(target); } catch { return fail("bad_url", 400, h); }
  if (!/^https?:$/.test(u.protocol) || target.length > 2048 || u.username || u.password) return fail("bad_url", 400, h);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!allow(ip, now)) return fail("busy", 429, { ...h, "Retry-After": "30" });

  const key = strategy + " " + u.href;
  const c = cache.get(key);
  if (c && now - c.at < TTL_MS) return json(c.body, 200, h);

  const p = new URLSearchParams({ url: u.href, strategy });
  const apiKey = Deno.env.get("PAGESPEED_API_KEY");
  if (apiKey) p.set("key", apiKey);
  const ac = new AbortController(); const tid = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let r: Response;
  try { r = await fetchImpl(API + "?" + p, { signal: ac.signal }); }
  catch (e) { return fail((e as Error)?.name === "AbortError" ? "timeout" : "failed", 504, h); }
  finally { clearTimeout(tid); }
  const text = await r.text();
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* 不是 JSON */ }
  // deno-lint-ignore no-explicit-any
  if (!r.ok || !body || (body as any).error) {
    const code = classify(r.status, body);
    return fail(code, code === "quota" ? 429 : 502, h);
  }
  cache.set(key, { at: now, body: text });
  if (cache.size > 200) { const first = cache.keys().next().value; if (first) cache.delete(first); }
  return json(text, 200, h);
}

if (import.meta.main) Deno.serve((req) => handle(req));
