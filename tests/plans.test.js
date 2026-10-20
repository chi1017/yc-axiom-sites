import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLANS, PLAN_IDS, EARLY_BIRD, quote, monthlyFor, isPlanId, money, YEARLY_PAID_MONTHS } from '../templates/shared/plans.js';

test('price table matches the published offer', () => {
  assert.deepEqual(PLAN_IDS, ['self', 'standard', 'pro']);
  assert.deepEqual([PLANS.self.monthly, PLANS.standard.monthly, PLANS.pro.monthly], [690, 990, 1990]);
  assert.deepEqual([PLANS.self.setup, PLANS.standard.setup, PLANS.pro.setup], [0, 3000, 3000]);
  assert.deepEqual([PLANS.self.edits, PLANS.standard.edits, PLANS.pro.edits], [0, 2, 5]);
  assert.equal(YEARLY_PAID_MONTHS, 10); assert.deepEqual(EARLY_BIRD, { plan: 'standard', monthly: 690, slots: 10 });
  assert.deepEqual([PLANS.self.domain, PLANS.standard.domain, PLANS.pro.domain], [false, true, true]);
});
test('quote: yearly = 10 months (6,900 / 9,900 / 19,900), monthly, setup only on the first payment', () => {
  assert.equal(quote({ plan: 'self', months: 12 }).rent, 6900);
  assert.equal(quote({ plan: 'standard', months: 12 }).rent, 9900);
  assert.equal(quote({ plan: 'pro', months: 12 }).rent, 19900);
  assert.equal(quote({ plan: 'standard', months: 1 }).rent, 990);
  assert.equal(quote({ plan: 'standard', months: 3, firstPayment: true }).total, 990 * 3 + 3000);
  assert.equal(quote({ plan: 'standard', months: 12, firstPayment: true }).total, 9900 + 3000);
  assert.equal(quote({ plan: 'standard', months: 12, firstPayment: false }).total, 9900);
  assert.equal(quote({ plan: 'self', months: 12, firstPayment: true }).setup, 0);
  assert.equal(quote({ plan: 'standard', months: 13 }).rent, 9900 + 990);
  assert.equal(quote({ plan: 'standard', months: 24 }).rent, 19800);
  assert.equal(quote({ plan: 'standard', months: 12 }).saved, 1980);
});
test('quote: early bird applies to standard only', () => {
  assert.equal(monthlyFor('standard', true), 690); assert.equal(monthlyFor('pro', true), 1990); assert.equal(monthlyFor('self', true), 690);
  assert.equal(quote({ plan: 'standard', months: 1, earlyBird: true, firstPayment: true }).total, 690 + 3000);
  assert.equal(quote({ plan: 'standard', months: 12, earlyBird: true }).rent, 6900);
  assert.equal(quote({ plan: 'pro', months: 1, earlyBird: true }).rent, 1990);
});
test('quote/monthlyFor reject bad input', () => {
  for (const m of [0, -1, 61, 1.5, '3', NaN, null]) assert.throws(() => quote({ plan: 'standard', months: m }), /months/);
  assert.throws(() => quote({ plan: 'gold', months: 1 }), /plan/); assert.throws(() => monthlyFor('x'));
  assert.equal(isPlanId('pro'), true); assert.equal(isPlanId('gold'), false); assert.equal(isPlanId(undefined), false);
  assert.equal(money(3000), 'NT$3,000'); assert.equal(money(19900), 'NT$19,900');
});
test('migration 009: columns, check, member RPC locked to draft/pending and own site, view keeps old columns first', () => {
  const sql = readFileSync(new URL('../supabase/migrations/009_plans.sql', import.meta.url), 'utf8');
  assert.match(sql, /add column if not exists plan text not null default 'self'/);
  assert.match(sql, /add column if not exists early_bird boolean not null default false/);
  assert.match(sql, /check \(plan in \('self', 'standard', 'pro'\)\)/);
  assert.match(sql, /status in \('draft', 'pending'\)/); assert.match(sql, /member_id = auth\.uid\(\)/); assert.match(sql, /security definer set search_path = ''/);
  assert.match(sql, /early_bird = \(early_bird and p_plan = 'standard'\)/);
  assert.match(sql, /grant execute on function public\.rental_set_plan\(uuid, text\) to authenticated/);
  const view006 = readFileSync(new URL('../supabase/migrations/006_rental_admin.sql', import.meta.url), 'utf8').match(/create or replace view public\.admin_rental_overview[\s\S]*?p\.paid_total, p\.payment_count/)[0].split('\n').slice(1).join('\n');
  const cols006 = view006.replace(/\s+/g, ' '); const view009 = sql.replace(/\s+/g, ' ');
  assert.ok(view009.includes(cols006.trim().replace(/, p\.payment_count$/, ', p.payment_count')), 'old columns unchanged and in the same order');
  assert.match(sql, /p\.paid_total, p\.payment_count,\s+s\.plan, s\.early_bird/);
});
