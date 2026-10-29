// Edge Function 共用的小工具：CORS、JSON 回應、UUID 檢查。
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function corsHeaders(req, allowed) {
  const origin = req.headers.get('origin') || '';
  const h = { Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Max-Age': '86400' };
  if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
// 官網的兩個網址（GitHub Pages 與 Cloudflare Pages）一律允許，ALLOWED_ORIGINS 可再加其他來源
export const OFFICIAL_ORIGINS = ['https://chi1017.github.io', 'https://yc-axiom.pages.dev'];
export function parseOrigins(v) {
  const list = (v || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  return [...new Set([...OFFICIAL_ORIGINS, ...list])];
}
export const json = (body, status, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
