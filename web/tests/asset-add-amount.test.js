const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/function calculateAssetAddition\(asset, amountCny\) \{[\s\S]*?\n    \}/);
const paymentMatch = html.match(/function calculatePaymentAccountAdjustment\(account, amountCny\) \{[\s\S]*?\n    \}/);

assert.ok(match, 'calculateAssetAddition should exist');
assert.ok(paymentMatch, 'calculatePaymentAccountAdjustment should exist');

const assetInputMode = (category) => (
  category === 'cash' || category === 'nasdaq_reserve_cash' ? 'cash' : 'quoted'
);
const calculateAssetAddition = eval(`(${match[0]})`);
const calculatePaymentAccountAdjustment = eval(`(${paymentMatch[0]})`);

assert.deepStrictEqual(
  calculateAssetAddition({ category: 'nasdaq', shares: 100, lastPrice: 2 }, 1000),
  {
    ok: true,
    mode: 'quoted',
    amountCny: 1000,
    addedShares: 500,
    nextShares: 600,
  },
);

assert.deepStrictEqual(
  calculateAssetAddition({ category: 'cash', amountCny: 1200 }, 300),
  {
    ok: true,
    mode: 'cash',
    amountCny: 300,
    nextAmountCny: 1500,
  },
);

assert.deepStrictEqual(
  calculateAssetAddition({ category: 'nasdaq', shares: 100, lastPrice: 2 }, -100),
  {
    ok: true,
    mode: 'quoted',
    amountCny: -100,
    addedShares: -50,
    nextShares: 50,
  },
);

assert.strictEqual(
  calculateAssetAddition({ category: 'nasdaq', shares: 10, lastPrice: 2 }, -100).ok,
  false,
);

assert.strictEqual(
  calculateAssetAddition({ category: 'cash', amountCny: 100 }, -200).ok,
  false,
);

assert.strictEqual(
  calculateAssetAddition({ category: 'stock', shares: 10, lastPrice: 0 }, 500).ok,
  false,
);

assert.deepStrictEqual(
  calculatePaymentAccountAdjustment({ category: 'cash', amountCny: 1200 }, 300),
  {
    ok: true,
    amountCny: 300,
    nextAmountCny: 900,
  },
);

assert.deepStrictEqual(
  calculatePaymentAccountAdjustment({ category: 'cash', amountCny: 1200 }, -300),
  {
    ok: true,
    amountCny: -300,
    nextAmountCny: 1500,
  },
);

assert.strictEqual(
  calculatePaymentAccountAdjustment({ category: 'cash', amountCny: 100 }, 200).ok,
  false,
);

console.log('asset-add-amount.test.js passed');
