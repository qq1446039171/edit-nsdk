const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert.match(html, /assetRowsCollapsed:\s*false/, 'asset rows should start expanded');
assert.match(html, /data-action="toggle-assets"/, 'asset section should include a collapse toggle');
assert.match(html, /state\.assetRowsCollapsed \?/, 'asset section should render collapsed and expanded states');
assert.match(html, /balancesHidden:\s*false/, 'balances should start visible');
assert.match(html, /data-action="toggle-balances"/, 'overview should include an eye button to hide balances');
assert.match(html, /state\.balancesHidden \? "\*\*\*\*\*\*"/, 'money formatter should mask balances when hidden');
assert.match(html, /categoryAmount\("gold"\)/, 'overview should surface gold allocation');
assert.match(html, /categoryAmount\("stock"\)/, 'overview should surface other stock and ETF allocation');
assert.match(html, /--gold-deg/, 'donut should include gold allocation as a visible segment');
assert.match(html, /data-action="open-other-detail"/, 'other assets card should expose a detail button');
assert.match(html, /renderOtherDetailModal/, 'other asset details should render in a modal');
assert.match(html, /其他资产与现金/, 'overview should label the combined non-NASDAQ bucket clearly');
assert.doesNotMatch(html, /<div class="stat-label">黄金<\/div>/, 'gold should not be shown as a standalone overview card');
assert.doesNotMatch(html, /<div class="stat-label">其他股票\/ETF<\/div>/, 'other stock and ETF should not be shown as a standalone overview card');

const tableMatch = html.match(/<table class="data-table asset-table"[\s\S]*?<\/table>/);
assert.ok(tableMatch, 'asset table should use a dedicated asset-table class');

const table = tableMatch[0];
assert.ok(table.includes('<colgroup>'), 'asset table should define column widths with colgroup');

const expectedWidths = {
  category: 130,
  code: 92,
  shares: 92,
  amount: 110,
};

for (const [column, width] of Object.entries(expectedWidths)) {
  assert.match(
    table,
    new RegExp(`<col class="asset-col-${column}" style="width:${width}px"`),
    `${column} column should be ${width}px wide`,
  );
}

console.log('asset-table-layout.test.js passed');
