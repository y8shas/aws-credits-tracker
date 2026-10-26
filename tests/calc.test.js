const test = require('node:test');
const assert = require('node:assert');
const C = require('../extension/calc.js');

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const day = (date, usage, credit) => ({ TimePeriod: { Start: date }, Groups: [
  { Keys: ['Usage'], Metrics: { UnblendedCost: { Amount: String(usage) } } },
  { Keys: ['Credit'], Metrics: { UnblendedCost: { Amount: String(-credit) } } },
] });

test('parseDaily treats credits as positive and separates usage', () => {
  const days = C.parseDaily([{ ResultsByTime: [day('2026-10-25', 2, 1.5)] }]);
  near(days['2026-10-25'].usage, 2);
  near(days['2026-10-25'].credit, 1.5);
});

test('summarize: windows, balance, burn rate and expiry maths', () => {
  const results = [];
  for (let i = 1; i <= 25; i++) results.push(day(`2026-10-${String(i).padStart(2, '0')}`, 1, 1)); // $1/day, Oct 1-25
  results.push(day('2026-10-26', 0.5, 0.5));
  const days = C.parseDaily([{ ResultsByTime: results }]);
  const today = C.parseDay('2026-10-26');
  const s = C.summarize(days, { total: '100', start: '2026-10-01', expiry: '2026-11-25' }, today);

  near(s.today, 0.5);
  near(s.yesterday, 1);
  near(s.week, 6.5);            // 6 days * $1 + $0.5
  near(s.month, 25.5);
  near(s.last30, 25.5);
  near(s.totalUsed, 25.5);
  near(s.left, 74.5);
  near(s.pct, 74.5);
  assert.strictEqual(s.chart.length, 14);
  assert.strictEqual(s.expiryDays, 30);
  near(s.safePerDay, 74.5 / 30);
  assert.strictEqual(s.daysLeft, Math.floor(74.5 / (6.5 / 7)));
  assert.strictEqual(s.runsOutBeforeExpiry, false);
  assert.strictEqual(s.needStart, false);
});

test('summarize: warns when credits run out before expiry, and when expired', () => {
  const days = C.parseDaily([{ ResultsByTime: [day('2026-10-26', 20, 20)] }]);
  const today = C.parseDay('2026-10-26');
  const soon = C.summarize(days, { total: '100', start: '2026-10-01', expiry: '2026-12-31' }, today);
  assert.strictEqual(soon.runsOutBeforeExpiry, true);
  const expired = C.summarize(days, { total: '100', start: '2026-10-01', expiry: '2026-10-01' }, today);
  assert.strictEqual(expired.expired, true);
});

test('summarize: no total -> no balance, falls back to gross usage', () => {
  const days = C.parseDaily([{ ResultsByTime: [day('2026-10-26', 3, 0)] }]);
  const s = C.summarize(days, {}, C.parseDay('2026-10-26'));
  assert.strictEqual(s.hasTotal, false);
  assert.strictEqual(s.left, null);
  near(s.today, 3);
});

test('summarize: balance never goes negative and flags missing start date', () => {
  const days = C.parseDaily([{ ResultsByTime: [day('2026-10-26', 500, 500)] }]);
  const s = C.summarize(days, { total: '100' }, C.parseDay('2026-10-26'));
  assert.strictEqual(s.left, 0);
  assert.strictEqual(s.needStart, true);
});

test('parsePrices extracts the lowest positive on-demand hourly price per type', () => {
  const item = (type, usd) => JSON.stringify({
    product: { attributes: { instanceType: type } },
    terms: { OnDemand: { A: { priceDimensions: { B: { pricePerUnit: { USD: usd } } } } } },
  });
  const map = C.parsePrices([item('t3.micro', '0.0104'), item('t3.micro', '0.0200'), item('m5.large', '0.0960'), item('x1.free', '0.0000'), 'not json']);
  assert.deepStrictEqual(map, { 't3.micro': 0.0104, 'm5.large': 0.096 });
});

test('friendlyError maps common AWS failures', () => {
  assert.match(C.friendlyError({ code: 'AccessDeniedException', message: 'x' }), /IAM user/);
  assert.match(C.friendlyError({ code: 'UnrecognizedClientException', message: 'x' }), /access key/);
  assert.match(C.friendlyError({ code: 'SignatureDoesNotMatch', message: 'x' }), /clock/);
  assert.match(C.friendlyError({ code: 'NetworkError', message: 'x' }), /Network/);
  assert.strictEqual(C.friendlyError(new Error('boom')), 'boom');
});
