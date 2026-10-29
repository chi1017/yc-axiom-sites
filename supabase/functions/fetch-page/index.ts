// YC AXIOM 抓網頁服務：給 SEO／GEO 檢測工具用（取代不穩定的公開轉送服務）。
// GET ?url=<網址>  →  200 JSON，格式與 allorigins 相容：{ contents, status: { url, http_code, content_type, content_length } }
//   ‧ 目標網站回 404／403…也是 200（http_code 放在 status 裡）；抓不到（DNS、逾時、被擋的位址）回 4xx／5xx 的 { error }。
// 安全：只允許 http／https 與常見連接埠、擋內網／本機／雲端中繼位址（含 DNS 解析結果與每一次轉址）、
//       限制回應大小與逾時、只接受指定網域的瀏覽器呼叫（CORS＋Origin 檢查）、每個來源限流。不使用、也不需要任何金鑰。

interface Deps {
  allowedOrigins: string[];
  resolve(host: string): Promise<string[] | null>;            // 回傳該主機的所有 IP；null＝這個環境無法解析（只做名稱檢查）
  fetch(url: string, init: RequestInit): Promise<Response>;
  now(): number;
  rate?: { limit: number; windowMs: number; hit(key: string, now: number, limit: number, windowMs: number): boolean };
}

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 5;
const PORTS = new Set(["", "80", "443", "8080", "8443"]);
const UA = "Mozilla/5.0 (compatible; YCAXIOM-Checker/1.0; +https://chi1017.github.io/yc-axiom-site/)";

function parseOrigins(v: string | undefined): string[] {
  // 官網的兩個網址（GitHub Pages 與 Cloudflare Pages）一律允許，ALLOWED_ORIGINS 可再加其他來源
  const list = (v ?? "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  return [...new Set(["https://chi1017.github.io", "https://yc-axiom.pages.dev", ...list])];
}

// ── IP 判斷 ──
function v4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/); if (!m) return null;
  const p = m.slice(1).map(Number); if (p.some((n) => n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];
function isPrivateV4(ip: string): boolean {
  const n = v4ToInt(ip); if (n === null) return true;       // 看不懂就當作不安全
  return V4_BLOCKS.some(([b, bits]) => { const bn = v4ToInt(b)!; const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0; return ((n & mask) >>> 0) === ((bn & mask) >>> 0); });
}
function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const m4 = s.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (m4) { const n = v4ToInt(m4[2]); if (n === null) return null; s = m4[1] + ((n >>> 16).toString(16)) + ":" + ((n & 0xffff).toString(16)); }
  const parts = s.split("::"); if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [], tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const fill = parts.length === 2 ? 8 - head.length - tail.length : 0; if (fill < 0 || (parts.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array(fill).fill("0"), ...tail]; if (all.length !== 8) return null;
  const out = all.map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN)); return out.some(Number.isNaN) ? null : out;
}
function isPrivateV6(ip: string): boolean {
  const g = expandV6(ip); if (!g) return true;
  if (g.every((x) => x === 0)) return true;                                   // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true;         // ::1
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return isPrivateV4(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);  // ::ffff:a.b.c.d、::a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return isPrivateV4(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);                                    // 64:ff9b::/96 NAT64
  if ((g[0] & 0xfe00) === 0xfc00) return true;                                // fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true;                                // fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return true;                                // fec0::/10
  if ((g[0] & 0xff00) === 0xff00) return true;                                // ff00::/8
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;                        // 文件用
  if (g[0] === 0x2002) return isPrivateV4(`${g[1] >> 8}.${g[1] & 255}.${g[2] >> 8}.${g[2] & 255}`);   // 6to4
  return false;
}
function isPrivateIp(ip: string): boolean { return ip.includes(":") ? isPrivateV6(ip) : isPrivateV4(ip); }
function ipLiteral(host: string): string | null {
  const h = host.replace(/^\[|\]$/g, "");
  if (h.includes(":")) return h;
  if (/^[\d.]+$/.test(h)) return h;
  if (/^0x[0-9a-f]+$/i.test(h) || /^\d+$/.test(h)) return h;                    // 十六進位／整數寫法的 IP
  return null;
}

type Check = { ok: true; url: URL } | { ok: false; status: number; error: string };
async function checkTarget(raw: string, d: Deps): Promise<Check> {
  let u: URL; try { u = new URL(raw); } catch { return { ok: false, status: 400, error: "bad_url" }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, status: 400, error: "bad_protocol" };
  if (u.username || u.password) return { ok: false, status: 400, error: "credentials_not_allowed" };
  if (!PORTS.has(u.port)) return { ok: false, status: 400, error: "port_not_allowed" };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home.arpa") || host.endsWith(".onion")) return { ok: false, status: 403, error: "host_not_allowed" };
  const lit = ipLiteral(host);
  if (lit !== null) {
    const ip = /^(0x[0-9a-f]+|\d+)$/i.test(lit) ? null : lit;                   // 純數字或 0x 寫法一律拒絕
    if (ip === null || isPrivateIp(ip)) return { ok: false, status: 403, error: "host_not_allowed" };
    return { ok: true, url: u };
  }
  if (!host.includes(".")) return { ok: false, status: 400, error: "bad_host" };
  const ips = await d.resolve(host).catch(() => null);
  if (ips !== null) {
    if (ips.length === 0) return { ok: false, status: 502, error: "dns_failed" };
    if (ips.some(isPrivateIp)) return { ok: false, status: 403, error: "host_not_allowed" };
  }
  return { ok: true, url: u };
}

// ── 讀取內容 ──
function charsetOf(ct: string, head: Uint8Array): string {
  const m = ct.match(/charset\s*=\s*["']?([\w-]+)/i); if (m) return m[1].toLowerCase();
  const s = new TextDecoder("latin1").decode(head.slice(0, 4096));
  const m2 = s.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i) || s.match(/<meta[^>]+content\s*=\s*["'][^"']*charset=([\w-]+)/i);
  return m2 ? m2[1].toLowerCase() : "utf-8";
}
function decode(bytes: Uint8Array, ct: string): string {
  let cs = charsetOf(ct, bytes);
  try { return new TextDecoder(cs).decode(bytes); } catch { try { return new TextDecoder("utf-8").decode(bytes); } catch { return ""; } }
}
async function readCapped(res: Response, cap: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!res.body) return { bytes: new Uint8Array(), truncated: false };
  const reader = res.body.getReader(); const chunks: Uint8Array[] = []; let total = 0, truncated = false;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    if (total + value.length > cap) { chunks.push(value.slice(0, cap - total)); total = cap; truncated = true; try { await reader.cancel(); } catch { /* 略過 */ } break; }
    chunks.push(value); total += value.length;
  }
  const out = new Uint8Array(total); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return { bytes: out, truncated };
}
const TEXTY = /^(text\/|application\/(xhtml\+xml|xml|json|rss\+xml|atom\+xml|ld\+json|javascript)|image\/svg\+xml)/i;

function cors(req: Request, allowed: string[]): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const h: Record<string, string> = { "Vary": "Origin", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "86400" };
  if (origin && allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}

async function handle(req: Request, d: Deps): Promise<Response> {
  const h = cors(req, d.allowedOrigins);
  if (req.method === "OPTIONS") {
    const o = req.headers.get("origin") ?? "";
    return new Response(null, { status: o && d.allowedOrigins.includes(o) ? 204 : 403, headers: h });
  }
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405, h);
  const origin = req.headers.get("origin") ?? "";
  if (!origin || !d.allowedOrigins.includes(origin)) return json({ error: "origin_not_allowed" }, 403, h);

  if (d.rate) {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    if (!d.rate.hit(ip, d.now(), d.rate.limit, d.rate.windowMs)) return json({ error: "rate_limited" }, 429, { ...h, "Retry-After": "30" });
  }

  const target = new URL(req.url).searchParams.get("url") ?? "";
  if (!target || target.length > 2048) return json({ error: "bad_url" }, 400, h);

  let cur = target, res: Response | null = null, hops = 0;
  try {
    while (true) {
      const c = await checkTarget(cur, d);
      if (!c.ok) return json({ error: c.error }, c.status, h);
      const ac = new AbortController(); const tid = setTimeout(() => ac.abort(), TIMEOUT_MS);
      try {
        res = await d.fetch(c.url.href, { method: "GET", redirect: "manual", signal: ac.signal, headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.5", "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8" } });
      } finally { clearTimeout(tid); }
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        try { await res.body?.cancel(); } catch { /* 略過 */ }
        if (++hops > MAX_REDIRECTS) return json({ error: "too_many_redirects" }, 502, h);
        cur = new URL(loc, c.url).href; continue;
      }
      break;
    }
  } catch (e) {
    const msg = String((e as Error)?.name === "AbortError" ? "timeout" : "fetch_failed");
    return json({ error: msg }, msg === "timeout" ? 504 : 502, h);
  }

  const ct = res.headers.get("content-type") ?? "";
  const cl = Number(res.headers.get("content-length") ?? "") || 0;
  let contents = "", truncated = false;
  if (TEXTY.test(ct) || ct === "") {
    const r = await readCapped(res, MAX_BYTES); truncated = r.truncated; contents = decode(r.bytes, ct);
  } else { try { await res.body?.cancel(); } catch { /* 略過 */ } }
  return json({ contents, status: { url: cur, http_code: res.status, content_type: ct, content_length: cl || contents.length, truncated, redirects: hops } }, 200, h);
}

// 以來源 IP 限流（單一函式實例內；盡力而為）
function makeRateLimiter() {
  const m = new Map<string, number[]>();
  return { limit: 150, windowMs: 60_000, hit(key: string, now: number, limit: number, windowMs: number) {
    const arr = (m.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) { m.set(key, arr); return false; }
    arr.push(now); m.set(key, arr);
    if (m.size > 5000) { for (const k of m.keys()) { if (m.size <= 2500) break; m.delete(k); } }
    return true;
  } };
}

// ── 進入點（Supabase Edge Functions）──
const allowedOrigins = parseOrigins(Deno.env.get("ALLOWED_ORIGINS"));
const rate = makeRateLimiter();
let dnsOk: boolean | null = null;
async function resolveHost(host: string): Promise<string[] | null> {
  if (dnsOk === false) return null;
  try {
    const [a, aaaa] = await Promise.all([
      Deno.resolveDns(host, "A").catch((e: Error) => { if (String(e?.name).includes("NotSupported") || String(e).includes("not supported") || String(e).includes("permission")) throw e; return [] as string[]; }),
      Deno.resolveDns(host, "AAAA").catch((e: Error) => { if (String(e?.name).includes("NotSupported") || String(e).includes("not supported") || String(e).includes("permission")) throw e; return [] as string[]; }),
    ]);
    dnsOk = true; return [...a, ...aaaa];
  } catch { dnsOk = false; return null; }   // 這個環境無法解析 → 只做名稱檢查
}
Deno.serve((req) => handle(req, { allowedOrigins, resolve: resolveHost, fetch: (u, i) => fetch(u, i), now: () => Date.now(), rate }));
