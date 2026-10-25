import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LAYOUTS, PAGE_KEYS, PAGES, normalizeLayout, normalizePages, defaultPages, pagesFromSections, canChangeLayout, enabledPages } from '../templates/shared/pages.js';

test('layout: only single / multi, default single', () => {
  assert.deepEqual(LAYOUTS, ['single', 'multi']);
  for (const bad of [undefined, null, '', 'MULTI', 'double', 1, {}]) assert.equal(normalizeLayout(bad), 'single');
  assert.equal(normalizeLayout('multi'), 'multi');
});

test('pages: six selectable pages, unique keys and paths, no home', () => {
  assert.deepEqual(PAGE_KEYS, ['about', 'menu', 'interior', 'news', 'faq', 'visit']);
  assert.equal(new Set(PAGES.map((p) => p.path)).size, PAGES.length);
  for (const p of PAGES) assert.match(p.path, /^[a-z]+\/$/);
  assert.ok(!PAGE_KEYS.includes('home'));
});

test('normalizePages keeps known boolean keys, drops the rest, defaults to on', () => {
  assert.deepEqual(normalizePages(null), defaultPages());
  assert.deepEqual(normalizePages([true]), defaultPages());
  const p = normalizePages({ menu: false, faq: 'no', home: false, evil: true, news: false });
  assert.deepEqual(p, { about: true, menu: false, interior: true, news: false, faq: true, visit: true });
});

test('upgrade defaults follow the one-page section switches; about and visit always on', () => {
  assert.deepEqual(pagesFromSections({ menu: false, interior: true, faq: false, news: true }),
    { about: true, menu: false, interior: true, news: true, faq: false, visit: true });
  assert.deepEqual(pagesFromSections(undefined), defaultPages());
});

test('layout can only go single → multi', () => {
  assert.equal(canChangeLayout('single', 'multi'), true);
  assert.equal(canChangeLayout('single', 'single'), true);
  assert.equal(canChangeLayout('multi', 'multi'), true);
  assert.equal(canChangeLayout('multi', 'single'), false);
});

test('enabledPages: home always first; single has only home', () => {
  assert.deepEqual(enabledPages('single', { menu: true }).map((p) => p.key), ['home']);
  assert.deepEqual(enabledPages('multi', { menu: false, faq: false }).map((p) => p.key), ['home', 'about', 'interior', 'news', 'visit']);
  assert.deepEqual(enabledPages('multi', { about: false, menu: false, interior: false, news: false, faq: false, visit: false }).map((p) => p.key), ['home']);
});

test('SQL allowed page keys match pages.js', () => {
  const sql = readFileSync(new URL('../supabase/migrations/010_layout_pages.sql', import.meta.url), 'utf8');
  const m = sql.match(/rental_page_keys\(\)[\s\S]*?array\[([^\]]+)\]/);
  assert.ok(m, 'page key list found in 010');
  assert.deepEqual([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]), PAGE_KEYS);
});
