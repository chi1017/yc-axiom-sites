export const RESERVED_SLUGS = [
  'admin', 'administrator', 'www', 'yc', 'ycaxiom', 'yc-axiom', 'api', 'test', 'tests', 'demo', 'app', 'apps', 'mail', 'email',
  'support', 'help', 'static', 'assets', 'cdn', 'dev', 'staging', 'preview', 'dashboard', 'login', 'logout', 'signup', 'register',
  'billing', 'pay', 'payment', 'status', 'blog', 'docs', 'ftp', 'smtp', 'root', 'null', 'undefined', 'cloudflare', 'pages', 'workers',
  'builder', 'terms', 'privacy', 'about', 'contact', 'services', 'pricing', 'works', 'seo', 'geo', 'supabase', 'github'
];
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;
// 回傳錯誤訊息字串；合法回傳 ''
export function slugError(slug) {
  const s = String(slug == null ? '' : slug);
  if (!s) return '請填網址代稱';
  if (s.length < 3 || s.length > 30) return '網址代稱要 3–30 個字';
  if (!/^[a-z0-9-]+$/.test(s)) return '只能使用小寫英文、數字與連字號（-）';
  if (s.startsWith('-') || s.endsWith('-')) return '開頭與結尾不能是連字號';
  if (s.includes('--')) return '不能連續兩個連字號';
  if (RESERVED_SLUGS.includes(s)) return '這個名稱是系統保留字，請換一個';
  return '';
}
