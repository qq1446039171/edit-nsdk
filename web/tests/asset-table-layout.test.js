const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

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
