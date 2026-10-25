export const RESERVED_SLUGS = [
  'admin', 'administrator', 'www', 'yc', 'ycaxiom', 'yc-axiom', 'api', 'test', 'tests', 'demo', 'app', 'apps', 'mail', 'email',
  'support', 'help', 'static', 'assets', 'cdn', 'dev', 'staging', 'preview', 'dashboard', 'login', 'logout', 'signup', 'register',
  'billing', 'pay', 'payment', 'status', 'blog', 'docs', 'ftp', 'smtp', 'root', 'null', 'undefined', 'cloudflare', 'pages', 'workers',
  'builder', 'terms', 'privacy', 'about', 'contact', 'services', 'pricing', 'works', 'seo', 'geo', 'supabase', 'github'
];
// 網址代稱不可以帶平台品牌字樣（yc、ycaxiom、yc-axiom 當作獨立單字或連字號分段），但一般英文字裡剛好出現 yc（例如 mycafe）不受影響。
// 這條規則只在「選擇／修改網址代稱」時套用：已經鎖定（發佈過）的舊網站沿用原本的代稱，不會因為規則變嚴而無法再發佈。
// 資料庫端同一條規則在 supabase/migrations/009_slug_brand.sql（tests 會比對兩邊的 regex 是否一致）。
export const BRAND_RE = /(^|-)yc(-|$)|ycaxiom/;
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;
// 回傳錯誤訊息字串；合法回傳 ''
// allowBrand：true 時略過品牌字樣檢查（給已鎖定代稱的舊網站重新驗證用）
export function slugError(slug, { allowBrand = false } = {}) {
  const s = String(slug == null ? '' : slug);
  if (!s) return '請填網址代稱';
  if (s.length < 3 || s.length > 30) return '網址代稱要 3–30 個字';
  if (!/^[a-z0-9-]+$/.test(s)) return '只能使用小寫英文、數字與連字號（-）';
  if (s.startsWith('-') || s.endsWith('-')) return '開頭與結尾不能是連字號';
  if (s.includes('--')) return '不能連續兩個連字號';
  if (RESERVED_SLUGS.includes(s) || (!allowBrand && BRAND_RE.test(s))) return '這個名稱是系統保留字，請換一個';
  return '';
}
