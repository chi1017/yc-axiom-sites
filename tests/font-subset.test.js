// Edge Function font-subset 需要的原始檔都在：每個內建標題字型都有對應的 sfnt 檔，且 harfbuzz wasm 存在
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { FONT_FILES } from '../build/lib/heading-font.mjs';

const fn = readFileSync(new URL('../supabase/functions/font-subset/index.ts', import.meta.url), 'utf8');
const dir = new URL('../templates/base/fonts/sfnt/', import.meta.url);

test('font-subset：每個內建字型都有 sfnt 原始檔', () => {
  for (const [key, woff2] of Object.entries(FONT_FILES)) {
    const m = fn.match(new RegExp(key + ': \\{ file: "([^"]+)"'));
    assert.ok(m, key + ' 沒有在 font-subset 裡設定');
    assert.equal(m[1].replace(/\.(otf|ttf)$/, ''), woff2.replace(/\.woff2$/, ''));
    const buf = readFileSync(new URL(m[1], dir));
    const sig = buf.subarray(0, 4).toString('latin1');
    assert.ok(sig === 'OTTO' || sig === '\0\x01\0\0', m[1] + ' 不是 OpenType／TrueType');
  }
  assert.ok(existsSync(new URL('hb-subset.wasm', dir)));
});
