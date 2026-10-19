// 所有進入 HTML 的文字都必須經過這裡。
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => MAP[c]);
}
// 換行轉成多個段落（輸入已逃脫）
export function paragraphs(text) {
  return String(text == null ? '' : text)
    .split(/\n{1,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}
// 只允許 https:// 開頭、可被 URL 解析、沒有帳密的網址；否則回傳空字串
export function safeHttpsUrl(v) {
  const s = String(v == null ? '' : v).trim();
  if (!/^https:\/\//i.test(s)) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) return '';
    return u.href;
  } catch { return ''; }
}
// 電話：只留數字、空白、連字號、括號、加號、分機 #
export function cleanPhone(v) {
  return String(v == null ? '' : v).replace(/[^\d+\-()\s#]/g, '').replace(/\s+/g, ' ').trim();
}
export function telHref(v) {
  const p = cleanPhone(v);
  const plus = p.startsWith('+') ? '+' : '';
  const digits = p.replace(/\D/g, '');
  return digits ? 'tel:' + plus + digits : '';
}
// JSON-LD 放進 <script> 時要避免跳出標籤
export function jsonForScript(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
// 以 code point 計算長度（中文字、emoji 都算 1）
export function len(s) { return [...String(s == null ? '' : s)].length; }
export function clip(s, n) { const a = [...String(s)]; return a.length <= n ? String(s) : a.slice(0, n).join(''); }
