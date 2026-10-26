// 配色：bg / surface / text / muted / accent / onAccent / line
// 內建配色 + 自訂主色（id 格式 c-RRGGBB-l 或 c-RRGGBB-d；l=淺色底、d=深色底），其餘顏色由主色自動推算並保證文字對比。

// ── 色彩工具 ──
function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase(); }
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l * 100];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

// 從主色（accent）推算整組配色
export function derivePalette(accentHex, dark) {
  const [h, s0] = rgbToHsl(...hexToRgb(accentHex));
  const sBase = Math.min(s0, 100);
  let bg, surface, line, text, muted, accent;
  if (!dark) {
    bg = hslToHex(h, Math.min(sBase, 28), 96); surface = hslToHex(h, Math.min(sBase, 30), 90); line = hslToHex(h, Math.min(sBase, 24), 82);
    text = hslToHex(h, Math.min(sBase, 38), 13);
    let ml = 34; muted = hslToHex(h, Math.min(sBase, 18), ml);
    while (contrast(muted, surface) < 4.6 && ml > 10) { ml -= 2; muted = hslToHex(h, Math.min(sBase, 18), ml); }
    let al = rgbToHsl(...hexToRgb(accentHex))[2]; accent = hslToHex(h, sBase, al);
    while (contrast(accent, bg) < 4.6 && al > 8) { al -= 2; accent = hslToHex(h, sBase, al); }
  } else {
    bg = hslToHex(h, Math.min(sBase, 16), 9); surface = hslToHex(h, Math.min(sBase, 16), 14); line = hslToHex(h, Math.min(sBase, 14), 23);
    text = hslToHex(h, Math.min(sBase, 24), 93);
    let ml = 70; muted = hslToHex(h, Math.min(sBase, 14), ml);
    while (contrast(muted, surface) < 4.6 && ml < 92) { ml += 2; muted = hslToHex(h, Math.min(sBase, 14), ml); }
    let al = rgbToHsl(...hexToRgb(accentHex))[2]; accent = hslToHex(h, sBase, al);
    while (contrast(accent, bg) < 4.6 && al < 92) { al += 2; accent = hslToHex(h, sBase, al); }
  }
  const onAccent = contrast(bg, accent) >= contrast('#FFFFFF', accent) ? bg : '#FFFFFF';
  const fixed = contrast(onAccent, accent) >= 4.5 ? onAccent : (contrast('#FFFFFF', accent) >= contrast('#000000', accent) ? '#FFFFFF' : '#000000');
  return { bg, surface, text, muted, accent, onAccent: fixed, line };
}

export const PALETTES = {
  forest:  { label: '森林綠', bg: '#F6F3EC', surface: '#EAE4D6', text: '#22301F', muted: '#4F5A4B', accent: '#2F4A3A', onAccent: '#F6F3EC', line: '#D8D1C1' },
  caramel: { label: '焦糖棕', bg: '#FBF6F0', surface: '#F0E3D3', text: '#3A2618', muted: '#6B5444', accent: '#8A5A3B', onAccent: '#FBF6F0', line: '#E2D2BE' },
  ink:     { label: '墨夜金', bg: '#17161A', surface: '#24222A', text: '#F1ECE2', muted: '#B9B2A5', accent: '#C9A66B', onAccent: '#17161A', line: '#36333C' },
  mist:    { label: '霧藍灰', bg: '#F3F5F6', surface: '#DDE5EA', text: '#1D2A33', muted: '#4C5C67', accent: '#3E5A6E', onAccent: '#F3F5F6', line: '#C9D3D9' }
  ,rose:     { label: '玫瑰粉', bg: '#F8F2F3', surface: '#EDDEE2', text: '#2E151B', muted: '#66474F', accent: '#AF4B65', onAccent: '#FFFFFF', line: '#DCC6CC' }
  ,lilac:    { label: '薰衣草', bg: '#F4F2F8', surface: '#E2DEED', text: '#1D162C', muted: '#504766', accent: '#6E55A8', onAccent: '#FFFFFF', line: '#CDC6DC' }
  ,ocean:    { label: '海洋藍', bg: '#F2F6F8', surface: '#DEE7ED', text: '#15242E', muted: '#475B66', accent: '#1F6F9E', onAccent: '#FFFFFF', line: '#C6D4DC' }
  ,olive:    { label: '橄欖綠', bg: '#F7F8F2', surface: '#EAEDDE', text: '#292E15', muted: '#606647', accent: '#647227', onAccent: '#FFFFFF', line: '#D8DCC6' }
  ,clay:     { label: '陶土紅', bg: '#F8F3F2', surface: '#EDE1DE', text: '#2E1A15', muted: '#664E47', accent: '#AA5137', onAccent: '#FFFFFF', line: '#DCCBC6' }
  ,sand:     { label: '沙丘黃', bg: '#F8F6F2', surface: '#EDE8DE', text: '#2E2515', muted: '#665C47', accent: '#916511', onAccent: '#FFFFFF', line: '#DCD5C6' }
  ,graphite: { label: '石墨灰', bg: '#151719', surface: '#202427', text: '#EBEDEF', muted: '#ABB2BA', accent: '#9AA3AD', onAccent: '#151719', line: '#353A41' }
  ,midnight: { label: '夜海藍', bg: '#13171B', surface: '#1E2429', text: '#E9EDF1', muted: '#A8B3BD', accent: '#6FA8DC', onAccent: '#13171B', line: '#323B43' }

  ,matcha:   { label: '抹茶綠', bg: '#F6F7EF', surface: '#E6EAD5', text: '#1F2614', muted: '#4D5640', accent: '#4A6B22', onAccent: '#FFFFFF', line: '#D2D8BD' }
  ,lake:     { label: '湖水青', bg: '#0E1A1C', surface: '#152528', text: '#E6F1F0', muted: '#A9C0BE', accent: '#5CC8B8', onAccent: '#0E1A1C', line: '#26393C' }
  ,paper:    { label: '宣紙朱', bg: '#FAF7F0', surface: '#EFE7D6', text: '#2A241C', muted: '#5C5244', accent: '#9E2B25', onAccent: '#FFFFFF', line: '#DED3BE' }
  ,navy:     { label: '藏青金', bg: '#F7F6F1', surface: '#E8E5DB', text: '#18202F', muted: '#4A5162', accent: '#1F3B6B', onAccent: '#FFFFFF', line: '#D6D1C3' }
};
export const PALETTE_IDS = Object.keys(PALETTES);

const CUSTOM_RE = /^c-([0-9a-f]{6})-([ld])$/;
export function isCustomPalette(id) { return typeof id === 'string' && CUSTOM_RE.test(id); }
export function customPaletteId(hex, dark) { return 'c-' + String(hex).replace('#', '').toLowerCase() + '-' + (dark ? 'd' : 'l'); }
export function parseCustomPalette(id) { const m = CUSTOM_RE.exec(id || ''); return m ? { accent: '#' + m[1].toUpperCase(), dark: m[2] === 'd' } : null; }
export function isValidPaletteId(id) { return PALETTE_IDS.includes(id) || isCustomPalette(id); }
export function getPalette(id) {
  const c = parseCustomPalette(id);
  if (c) return { label: '自訂配色', ...derivePalette(c.accent, c.dark) };
  return PALETTES[id] || PALETTES.forest;
}
