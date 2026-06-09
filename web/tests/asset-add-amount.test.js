const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/function calculateAssetAddition\(asset, amountCny\) \{[\s\S]*?\n    \}/);

assert.ok(match, 'calculateAssetAddition should exist');

const assetInputMode = (category) => (
  category === 'cash' || category === 'nasdaq_reserve_cash' ? 'cash' : 'quoted'
);
const calculateAssetAddition = eval(`(${match[0]})`);

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

assert.strictEqual(
  calculateAssetAddition({ category: 'stock', shares: 10, lastPrice: 0 }, 500).ok,
  false,
);

console.log('asset-add-amount.test.js passed');
