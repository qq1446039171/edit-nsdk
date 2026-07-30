const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { upsertProfitSnapshot, buildSnapshotFromSummary, recordDailySnapshot } = require('../src/profit-snapshot');

// ============ upsertProfitSnapshot：同日覆盖、按日期排序、上限 366 ============
(() => {
  const history = [
    { date: '2026-07-09', totalAssetsCny: 211275.02 },
    { date: '2026-07-30', totalAssetsCny: 200645.42 },
  ];
  // 新日期插入并排序
  let next = upsertProfitSnapshot(history, { date: '2026-07-15', totalAssetsCny: 205000 });
  assert.deepStrictEqual(next.map((e) => e.date), ['2026-07-09', '2026-07-15', '2026-07-30'], '应按日期排序');
  // 同日覆盖（当天 10:00 记一次、14:00 覆盖为最新）
  next = upsertProfitSnapshot(next, { date: '2026-07-30', totalAssetsCny: 201000 });
  assert.strictEqual(next.filter((e) => e.date === '2026-07-30').length, 1, '同日只保留一条');
  assert.strictEqual(next[next.length - 1].totalAssetsCny, 201000, '同日应覆盖为最新值');
  // 原数组不被修改
  assert.strictEqual(history.length, 2, '不应原地修改传入数组');
  // 上限 366 条（与网页 normalizeProfitHistory 一致）
  const big = [];
  for (let i = 0; i < 400; i += 1) {
    const d = new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    big.push({ date: d, totalAssetsCny: 1000 + i });
  }
  const trimmed = upsertProfitSnapshot(big, { date: '2026-03-01', totalAssetsCny: 9999 });
  assert.ok(trimmed.length <= 366, `应截断到 366 条以内，实际 ${trimmed.length}`);
  assert.strictEqual(trimmed[trimmed.length - 1].date, '2026-03-01', '最新日期应保留');
  console.log('ok - upsertProfitSnapshot 同日覆盖/排序/截断');
})();

// ============ buildSnapshotFromSummary：现金不进明细，字段与网页快照一致 ============
(() => {
  const summary = {
    totalAssetsCny: 200645,
    assets: [
      { id: '513100', name: '同纳指ETF', category: 'nasdaq', kind: 'exchange', shares: 13590.08, lastPrice: 2.037, marketValueCny: 27682.99, amountCny: 0 },
      { id: 'cash-1', name: '支付宝活期', category: 'cash', kind: 'cash', shares: 0, lastPrice: 0, marketValueCny: 8520, amountCny: 8520 },
      { id: 'r-1', name: '同花顺', category: 'nasdaq_reserve_cash', kind: 'cash', shares: 0, lastPrice: 0, marketValueCny: 42486, amountCny: 42486 },
    ],
  };
  const snap = buildSnapshotFromSummary('2026-07-30', summary);
  assert.strictEqual(snap.date, '2026-07-30');
  assert.strictEqual(snap.totalAssetsCny, 200645);
  assert.strictEqual(snap.assets.length, 1, '现金与备用金不进资产明细（与网页 assetProfitSnapshotRows 一致）');
  assert.deepStrictEqual(Object.keys(snap.assets[0]).sort(), ['category', 'id', 'lastPrice', 'marketValueCny', 'name', 'shares'].sort(), '明细字段与网页快照一致');
  console.log('ok - buildSnapshotFromSummary 排除现金、字段对齐');
})();

// ============ recordDailySnapshot：读写 settings.json 端到端 ============
(async () => {
  const tmp = path.join(os.tmpdir(), `nsdk-profit-test-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify({
    portfolio: {
      profitHistory: [{ date: '2026-07-09', totalAssetsCny: 211275.02 }],
    },
  }, null, 2));
  const cfg = {
    portfolio: {
      assetSummary: {
        totalAssetsCny: 200645,
        assets: [
          { id: '513100', name: '同纳指ETF', category: 'nasdaq', kind: 'exchange', shares: 100, lastPrice: 2.0, marketValueCny: 200, amountCny: 0 },
        ],
      },
    },
  };
  const okRet = recordDailySnapshot(cfg, { settingsPath: tmp, ymd: '2026-07-30' });
  assert.strictEqual(okRet, true, '写入应成功');
  const saved = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  assert.strictEqual(saved.portfolio.profitHistory.length, 2, '应追加一条快照');
  assert.strictEqual(saved.portfolio.profitHistory[1].date, '2026-07-30');
  assert.strictEqual(saved.portfolio.profitHistory[1].totalAssetsCny, 200645);
  assert.ok(saved.portfolio.profitHistory[1].assets, '应带资产明细');
  // 同日再记：覆盖不重复
  recordDailySnapshot(cfg, { settingsPath: tmp, ymd: '2026-07-30' });
  const saved2 = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  assert.strictEqual(saved2.portfolio.profitHistory.length, 2, '同日重复记录应覆盖');
  // 无 assetSummary 时安全返回 false
  assert.strictEqual(recordDailySnapshot({ portfolio: {} }, { settingsPath: tmp, ymd: '2026-07-30' }), false, '缺汇总数据应安全跳过');
  fs.unlinkSync(tmp);
  console.log('ok - recordDailySnapshot 读写 settings.json、同日覆盖、缺数据跳过');
})();

console.log('profit-snapshot.test.js: all assertions passed');
