// YC AXIOM 標題字型子集：編輯器預覽用。只回傳指定文字用到的字，取代一次載入 1–3MB 的完整字型。
// GET ?f=serif|sans|round|kai&t=<文字>  →  字型檔（OpenType／TrueType），可長期快取。
// 字型來源是公開的 SIL OFL 字型（yc-axiom-sites 的 templates/base/fonts/sfnt/），不需要金鑰、不讀寫資料庫。
const SRC_BASE = Deno.env.get("FONT_SRC_BASE") ?? "https://chi1017.github.io/yc-axiom-sites/templates/base/fonts/sfnt/";
const WASM_URL = SRC_BASE + "hb-subset.wasm";   // harfbuzzjs 0.4.15（MIT），和字型放在同一個地方
const FONTS: Record<string, { file: string; type: string }> = {
  serif: { file: "NotoSerifTC-Bold-common.otf", type: "font/otf" },
  sans: { file: "NotoSansTC-Bold-common.ttf", type: "font/ttf" },
  round: { file: "Huninn-common.ttf", type: "font/ttf" },
  kai: { file: "LXGWWenKaiTC-Bold-common.ttf", type: "font/ttf" },
};
const MAX_CHARS = 400;

// deno-lint-ignore no-explicit-any
let hbP: Promise<any> | null = null;
function hb() {
  hbP ??= (async () => {
    const r = await fetch(WASM_URL); if (!r.ok) throw new Error("wasm " + r.status);
    const { instance } = await WebAssembly.instantiate(await r.arrayBuffer());
    return instance.exports;
  })().catch((e) => { hbP = null; throw e; });
  return hbP;
}
const fontCache = new Map<string, Promise<Uint8Array>>();
function source(key: string) {
  let p = fontCache.get(key);
  if (!p) {
    p = fetch(SRC_BASE + FONTS[key].file).then(async (r) => { if (!r.ok) throw new Error("font " + r.status); return new Uint8Array(await r.arrayBuffer()); });
    p.catch(() => fontCache.delete(key));
    fontCache.set(key, p);
  }
  return p;
}

// deno-lint-ignore no-explicit-any
export function subset(ex: any, font: Uint8Array, codepoints: number[]): Uint8Array {
  const fontPtr = ex.malloc(font.byteLength);
  new Uint8Array(ex.memory.buffer).set(font, fontPtr);
  const blob = ex.hb_blob_create(fontPtr, font.byteLength, 2, 0, 0);
  const face = ex.hb_face_create(blob, 0);
  ex.hb_blob_destroy(blob);
  const input = ex.hb_subset_input_create_or_fail();
  const set = ex.hb_subset_input_unicode_set(input);
  for (const cp of codepoints) ex.hb_set_add(set, cp);
  const sub = ex.hb_subset_or_fail(face, input);
  ex.hb_subset_input_destroy(input);
  try {
    if (!sub) throw new Error("subset_failed");
    const res = ex.hb_face_reference_blob(sub);
    const ptr = ex.hb_blob_get_data(res, 0), len = ex.hb_blob_get_length(res);
    const out = new Uint8Array(ex.memory.buffer).slice(ptr, ptr + len);
    ex.hb_blob_destroy(res); ex.hb_face_destroy(sub);
    if (!len) throw new Error("subset_empty");
    return out;
  } finally { ex.hb_face_destroy(face); ex.free(fontPtr); }
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Vary": "Origin" };
export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return new Response("method_not_allowed", { status: 405, headers: CORS });
  const q = new URL(req.url).searchParams;
  const key = q.get("f") ?? "serif";
  if (!FONTS[key]) return new Response("bad_font", { status: 400, headers: CORS });
  const cps = [...new Set([...(q.get("t") ?? "")].map((c) => c.codePointAt(0)!).filter((c) => c > 32))].sort((a, b) => a - b);
  if (!cps.length || cps.length > MAX_CHARS) return new Response("bad_text", { status: 400, headers: CORS });
  try {
    const [ex, font] = await Promise.all([hb(), source(key)]);
    const out = subset(ex, font, cps);
    return new Response(out, { headers: { ...CORS, "Content-Type": FONTS[key].type, "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch (e) {
    return new Response("subset_error: " + String((e as Error)?.message ?? e), { status: 502, headers: CORS });
  }
}

if (import.meta.main) Deno.serve(handle);
