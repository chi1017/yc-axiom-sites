import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { esc, safeHttpsUrl, telHref, jsonForScript, len } from '../templates/shared/escape.js';
import { slugError } from '../templates/shared/slug.js';
import { normalizeContent, emptyContent, normalizeSections, LIMITS } from '../templates/shared/content.js';
import { groupHours, hoursSummary, openingHoursSpec } from '../templates/shared/hours.js';
import { validateForPublish, suggestions } from '../templates/shared/validate.js';
import { buildDescription } from '../templates/shared/seo.js';
import { cafe } from '../templates/cafe/index.js';

const sample = JSON.parse(readFileSync(new URL('../templates/cafe/sample.json', import.meta.url)));

test('esc escapes html', () => {
  assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(esc(null), '');
});
test('safeHttpsUrl only allows https', () => {
  assert.equal(safeHttpsUrl('https://example.com/a'), 'https://example.com/a');
  for (const bad of ['http://example.com', 'javascript:alert(1)', 'data:text/html,x', '//example.com', 'https://u:p@example.com', 'https://localhost', '', null, 'ftp://a.com'])
    assert.equal(safeHttpsUrl(bad), '', String(bad));
});
test('telHref', () => {
  assert.equal(telHref('07-123-4567'), 'tel:071234567');
  assert.equal(telHref('+886 7 123 4567'), 'tel:+88671234567');
  assert.equal(telHref('abc'), '');
});
test('jsonForScript cannot break out of script tag', () => {
  const s = jsonForScript({ a: '</script><script>alert(1)</script>' });
  assert.ok(!s.includes('</script>') && !s.includes('<'));
  assert.equal(JSON.parse(s).a, '</script><script>alert(1)</script>');
});
test('slugError', () => {
  assert.equal(slugError('my-cafe-01'), '');
  for (const bad of ['', 'ab', 'a'.repeat(31), 'My-Cafe', '-abc', 'abc-', 'a--b', 'admin', 'www', 'test', 'api', 'yc', 'caf_e', '咖啡店'])
    assert.notEqual(slugError(bad), '', bad);
});

test('normalizeContent never throws and enforces limits', () => {
  for (const raw of [null, undefined, 1, 'x', [], {}, { menu: 'x', faq: 5, hours: 3, photos: 7 }]) {
    const c = normalizeContent(raw);
    assert.equal(c.menu.length, 0); assert.equal(Object.keys(c.hours).length, 7);
  }
  const big = { menu: Array.from({ length: 30 }, (_, i) => ({ name: 'n' + i, price: '1,200' })), faq: Array.from({ length: 30 }, () => ({ q: 'q', a: 'a' })), news: Array.from({ length: 30 }, () => ({ date: '2026-01-01', title: 't' })) };
  const c = normalizeContent(big);
  assert.equal(c.menu.length, LIMITS.menu); assert.equal(c.faq.length, LIMITS.faq); assert.equal(c.news.length, LIMITS.news);
  assert.equal(c.menu[0].price, 1200);
});
test('normalizeContent cleans values', () => {
  const c = normalizeContent({
    name: 'x'.repeat(100), phone: 'tel:<b>07-1234</b>', booking: { label: 'go', url: 'http://bad.com' }, social: { instagram: 'javascript:1', facebook: 'https://facebook.com/a' },
    hours: { mon: { open: '25:00', close: '18:00' }, tue: { open: '09:00', close: '18:00', closed: true } },
    news: [{ date: '2026-02-30', title: 't' }], menu: [{ name: 'a', price: -5 }, { name: 'b', price: 'abc' }],
    photos: { hero: { path: '../etc/passwd' }, room: [{ path: 'a/b.webp' }, { path: '/abs' }, null] }
  });
  assert.equal(len(c.name), LIMITS.name);
  assert.equal(c.phone, '07-1234');
  assert.equal(c.booking.url, ''); assert.equal(c.social.instagram, ''); assert.equal(c.social.facebook, 'https://facebook.com/a');
  assert.equal(c.hours.mon.open, ''); assert.equal(c.hours.tue.open, ''); assert.equal(c.hours.tue.closed, true);
  assert.equal(c.news[0].date, ''); assert.equal(c.menu[0].price, null); assert.equal(c.menu[1].price, null);
  assert.equal(c.photos.hero, null); assert.equal(c.photos.room.length, 1);
});
test('normalizeSections', () => {
  assert.deepEqual(normalizeSections({ menu: false, faq: 'x' }), { menu: false, interior: true, faq: true, news: true });
});

test('hours grouping / summary / schema', () => {
  const c = normalizeContent(sample.content);
  assert.equal(hoursSummary(c.hours), '週一 公休；週二至週五 09:00–18:00；週六、週日 10:00–20:00');
  const spec = openingHoursSpec(c.hours);
  assert.equal(spec.length, 2);
  assert.deepEqual(spec[0].dayOfWeek, ['https://schema.org/Tuesday', 'https://schema.org/Wednesday', 'https://schema.org/Thursday', 'https://schema.org/Friday']);
  assert.equal(groupHours(emptyContent().hours).length, 0);
  const split = emptyContent(); split.hours.mon = { open: '09:00', close: '18:00', closed: false }; split.hours.wed = { open: '09:00', close: '18:00', closed: false };
  assert.equal(groupHours(split.hours).length, 2, 'non-adjacent days are not merged');
});

test('description is 80–160 chars for sparse and rich content', () => {
  const rich = normalizeContent(sample.content);
  const sparse = normalizeContent({ name: '小店', address: '高雄市苓雅區某路1號', hours: { mon: { open: '09:00', close: '18:00' } } });
  const long = normalizeContent({ ...sample.content, tagline: '很長'.repeat(30), intro: '這是一段很長的介紹'.repeat(40) });
  const noRegion = normalizeContent({ name: '小店', address: '某某路1號' });
  for (const c of [rich, sparse, long, noRegion]) {
    const d = buildDescription(c, cafe);
    assert.ok(len(d) >= 80 && len(d) <= 160, len(d) + ': ' + d);
  }
});

test('validateForPublish', () => {
  const ok = normalizeContent(sample.content);
  assert.equal(validateForPublish(ok, sample.sections, '午後').ok, false);
  assert.equal(validateForPublish(ok, sample.sections, 'wuhou-cafe').ok, true);
  const empty = validateForPublish(emptyContent(), normalizeSections({}), 'wuhou-cafe');
  assert.deepEqual(empty.errors.map((e) => e.field).sort(), ['address', 'hours', 'name', 'photos.hero']);
  const bad = normalizeContent(sample.content);
  bad.booking.label = '訂位'; bad.booking.url = '';
  bad.menu.push({ name: '無價格', price: null }); bad.faq.push({ q: '有問題？', a: '' }); bad.news.push({ date: '', title: '沒日期' });
  const f = validateForPublish(bad, sample.sections, 'wuhou-cafe').errors.map((e) => e.field);
  for (const k of ['booking', 'menu.7', 'faq.4', 'news.2']) assert.ok(f.includes(k), k);
  // 不合格的網址要明確指出（正規化會把它丟掉，所以要帶 raw）
  const rawBad = { ...sample.content, booking: { label: '訂位', url: 'http://x.com' }, social: { instagram: 'javascript:1', facebook: '', line: '' } };
  const e2 = validateForPublish(normalizeContent(rawBad), sample.sections, 'wuhou-cafe', rawBad).errors.map((e) => e.field);
  assert.ok(e2.includes('booking.url') && !e2.includes('booking') && e2.includes('social.instagram'));
  // 關掉的區塊不檢查
  assert.equal(validateForPublish(bad, { menu: false, interior: true, faq: false, news: false }, 'wuhou-cafe').errors.some((e) => /^(menu|faq|news)/.test(e.field)), false);
});

test('SQL reserved slug list matches slug.js', async () => {
  const { RESERVED_SLUGS } = await import('../templates/shared/slug.js');
  const sql = readFileSync(new URL('../supabase/migrations/005_rental.sql', import.meta.url), 'utf8');
  const m = sql.match(/array\[([^\]]+)\]\)\)/);
  const inSql = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual(inSql, [...RESERVED_SLUGS].sort());
});

test('suggestions: sparse content gets hints, rich sample gets none of the important ones', () => {
  const sparse = normalizeContent({ name: '小店' });
  const f = suggestions(sparse, normalizeSections({})).map((x) => x.field);
  for (const k of ['faq', 'intro', 'tagline', 'menu', 'phone']) assert.ok(f.includes(k), k);
  assert.deepEqual(suggestions(normalizeContent(sample.content), sample.sections), []);
});
