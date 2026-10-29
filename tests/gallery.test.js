// 版型展示：每個行業都要有範例內容，且內容能通過一般網站的建置
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INDUSTRIES } from '../templates/shared/industries.js';
import { SAMPLES, HOURS } from '../templates/gallery/samples.mjs';

test('每個行業都有版型展示範例', () => {
  const keys = new Set(SAMPLES.map((s) => s.k));
  for (const i of INDUSTRIES) assert.ok(keys.has(i.key), '缺少範例：' + i.key);
  assert.equal(keys.size, SAMPLES.length, '範例的行業代碼重複');
});
test('範例欄位完整', () => {
  for (const s of SAMPLES) {
    assert.ok(s.name && s.tag && s.intro && s.area && s.q, s.k);
    assert.ok(s.items.length >= 4 && s.faq.length >= 2, s.k);
    assert.ok(HOURS[s.h], s.k + ' 營業時間類型不存在：' + s.h);
  }
});
