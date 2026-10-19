// 配色：bg / surface / text / muted / accent / onAccent / line
export const PALETTES = {
  forest:  { label: '森林綠', bg: '#F6F3EC', surface: '#EAE4D6', text: '#22301F', muted: '#4F5A4B', accent: '#2F4A3A', onAccent: '#F6F3EC', line: '#D8D1C1' },
  caramel: { label: '焦糖棕', bg: '#FBF6F0', surface: '#F0E3D3', text: '#3A2618', muted: '#6B5444', accent: '#8A5A3B', onAccent: '#FBF6F0', line: '#E2D2BE' },
  ink:     { label: '墨夜金', bg: '#17161A', surface: '#24222A', text: '#F1ECE2', muted: '#B9B2A5', accent: '#C9A66B', onAccent: '#17161A', line: '#36333C' },
  mist:    { label: '霧藍灰', bg: '#F3F5F6', surface: '#DDE5EA', text: '#1D2A33', muted: '#4C5C67', accent: '#3E5A6E', onAccent: '#F3F5F6', line: '#C9D3D9' }
};
export const PALETTE_IDS = Object.keys(PALETTES);
export function getPalette(id) { return PALETTES[id] || PALETTES.forest; }
