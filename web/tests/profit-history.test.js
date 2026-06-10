const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extract(name) {
  const match = html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(match, `${name} should exist`);
  return match[0];
}

const normalizeProfitHistory = eval(`(${extract('normalizeProfitHistory')})`);
const calculateProfitSeries = eval(`(${extract('calculateProfitSeries')})`);
const calculateYesterdayProfit = eval(`(${extract('calculateYesterdayProfit')})`);

const history = normalizeProfitHistory([
  { date: '2026-06-01', totalAssetsCny: 100000 },
  { date: 'bad-date', totalAssetsCny: 999999 },
  { date: '2026-06-02', totalAssetsCny: 100500 },
  { date: '2026-06-02', totalAssetsCny: 100800 },
  { date: '2026-06-08', totalAssetsCny: 101000 },
]);

assert.deepStrictEqual(history, [
  { date: '2026-06-01', totalAssetsCny: 100000 },
  { date: '2026-06-02', totalAssetsCny: 100800 },
  { date: '2026-06-08', totalAssetsCny: 101000 },
]);

assert.deepStrictEqual(calculateYesterdayProfit(history), {
  available: true,
  amountCny: 200,
  comparedDate: '2026-06-02',
  currentDate: '2026-06-08',
});

assert.deepStrictEqual(calculateProfitSeries(history, 7), [
  { date: '2026-06-02', totalAssetsCny: 100800, profitCny: 0 },
  { date: '2026-06-08', totalAssetsCny: 101000, profitCny: 200 },
]);

assert.deepStrictEqual(calculateProfitSeries(history, 30), [
  { date: '2026-06-01', totalAssetsCny: 100000, profitCny: 0 },
  { date: '2026-06-02', totalAssetsCny: 100800, profitCny: 800 },
  { date: '2026-06-08', totalAssetsCny: 101000, profitCny: 1000 },
]);

assert.strictEqual(calculateYesterdayProfit(history.slice(0, 1)).available, false);

console.log('profit-history.test.js passed');
