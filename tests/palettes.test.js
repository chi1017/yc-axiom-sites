import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, PALETTE_IDS, derivePalette, contrast, customPaletteId, parseCustomPalette, isValidPaletteId, getPalette } from '../templates/shared/palettes.js';
import { normalizePalette } from '../templates/shared/content.js';

test('there are 12 built-in palettes and each is readable', () => {
  assert.equal(PALETTE_IDS.length, 12);
  for (const id of PALETTE_IDS) {
    const p = PALETTES[id];
    assert.ok(contrast(p.text, p.bg) >= 7, id + ' text/bg');
    assert.ok(contrast(p.muted, p.surface) >= 4.5, id + ' muted/surface');
    assert.ok(contrast(p.accent, p.bg) >= 4.5, id + ' accent/bg');
    assert.ok(contrast(p.onAccent, p.accent) >= 4.5, id + ' onAccent/accent');
  }
});
test('custom palette: any accent colour yields readable colours (light and dark)', () => {
  const seeds = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#000000', '#FFFFFF', '#808080', '#FFD700', '#7FFF00', '#123456', '#E6E6FA'];
  for (let h = 0; h < 360; h += 15) seeds.push(hslHex(h, 90, 50), hslHex(h, 40, 80), hslHex(h, 100, 20));
  for (const s of seeds) for (const dark of [false, true]) {
    const p = derivePalette(s, dark);
    assert.ok(contrast(p.text, p.bg) >= 7, s + dark + ' text');
    assert.ok(contrast(p.muted, p.surface) >= 4.5, s + dark + ' muted');
    assert.ok(contrast(p.accent, p.bg) >= 4.5, s + dark + ' accent ' + contrast(p.accent, p.bg).toFixed(2));
    assert.ok(contrast(p.onAccent, p.accent) >= 4.5, s + dark + ' onAccent');
    for (const k of Object.values(p)) assert.match(k, /^#[0-9A-F]{6}$/);
  }
});
test('custom palette id round trip and validation', () => {
  const id = customPaletteId('#1F6F5C', true);
  assert.equal(id, 'c-1f6f5c-d');
  assert.deepEqual(parseCustomPalette(id), { accent: '#1F6F5C', dark: true });
  assert.ok(isValidPaletteId(id) && isValidPaletteId('forest'));
  for (const bad of ['c-12345-l', 'c-GGGGGG-l', 'c-1f6f5c-x', 'neon', '', null, undefined, 'c-1f6f5c-l;<script>']) assert.ok(!isValidPaletteId(bad), String(bad));
  assert.equal(normalizePalette(id), id);
  assert.equal(normalizePalette('c-zzzzzz-l'), 'forest');
  assert.equal(getPalette('c-zzzzzz-l'), PALETTES.forest);
  assert.equal(getPalette(id).accent, derivePalette('#1F6F5C', true).accent);
});
function hslHex(h, s, l) { // 小工具：產生測試用顏色
  s /= 100; l /= 100; const a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}
