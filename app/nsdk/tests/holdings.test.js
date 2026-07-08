const assert = require('assert');
const {
  fetchHoldingPrice,
  refreshHoldingsPrices,
  applyFreshHoldings,
} = require('../src/market/holdings');
const { buildConfigFromSettings } = require('../src/config');

// ---- 测试替身：一个可控的 getLatestPrice 假实现 ----
// 记录被查询的 secid，并按 map 返回价格；缺失则抛错（模拟接口失败）。
const makeFakeGetLatestPrice = (priceBySecid, calls) => async (secid) => {
  if (calls) calls.push(secid);
  if (!(secid in priceBySecid)) throw new Error(`no quote for ${secid}`);
  const price = priceBySecid[secid];
  if (price === null) throw new Error(`quote failed for ${secid}`);
  return { name: 'X', price, pct: 0 };
};

// ============ fetchHoldingPrice：push2 主路径 ============
(async () => {
  const calls = [];
  const getLatestPrice = makeFakeGetLatestPrice({ '1.513100': 2.5 }, calls);
  const price = await fetchHoldingPrice(
    { secid: '1.513100', code: '513100', kind: 'exchange' },
    { getLatestPrice, fetchFundNav: async () => { throw new Error('不应走基金回退'); } }
  );
  assert.strictEqual(price, 2.5, 'push2 命中时应返回其价格');
  assert.deepStrictEqual(calls, ['1.513100'], 'push2 命中时不应调用基金回退');
  console.log('ok - fetchHoldingPrice 走 push2 主路径');
})();

// ============ fetchHoldingPrice：push2 失败 -> 基金净值回退 ============
(async () => {
  const getLatestPrice = makeFakeGetLatestPrice({ '0.270042': null }); // push2 抛错
  let fundCalledWith = null;
  const price = await fetchHoldingPrice(
    { secid: '0.270042', code: '270042', kind: 'exchange' },
    {
      getLatestPrice,
      fetchFundNav: async (code) => { fundCalledWith = code; return 8.2947; },
    }
  );
  assert.strictEqual(price, 8.2947, 'push2 失败时应用基金净值');
  assert.strictEqual(fundCalledWith, '270042', '基金回退应按 code 查询');
  console.log('ok - fetchHoldingPrice push2 失败回退基金净值');
})();

// ============ refreshHoldingsPrices：更新非现金、跳过现金、失败保留旧价 ============
(async () => {
  const assets = [
    { category: 'nasdaq', kind: 'exchange', secid: '1.513100', code: '513100', shares: 100, lastPrice: 2.0, enabled: true },
    { category: 'cash', kind: 'cash', secid: '', code: '', shares: 0, amountCny: 5000, lastPrice: 0, enabled: true },
    { category: 'gold', kind: 'exchange', secid: '0.000217', code: '000217', shares: 10, lastPrice: 3.0, enabled: true },
    { category: 'nasdaq', kind: 'exchange', secid: '9.999999', code: '999999', shares: 50, lastPrice: 1.5, enabled: true }, // 取价失败
    { category: 'stock', kind: 'exchange', secid: '0.110020', code: '110020', shares: 10, lastPrice: 1.0, enabled: false }, // 停用
  ];
  const getLatestPrice = makeFakeGetLatestPrice({
    '1.513100': 2.2,
    '0.000217': 3.3,
    // 9.999999 缺失 -> 失败
  });
  const res = await refreshHoldingsPrices(assets, {
    getLatestPrice,
    fetchFundNav: async () => { throw new Error('基金也失败'); },
  });
  assert.strictEqual(assets[0].lastPrice, 2.2, '纳指ETF 应更新为实时价');
  assert.ok(assets[0].lastPriceAt, '应写入 lastPriceAt');
  assert.strictEqual(assets[1].lastPrice, 0, '现金不参与刷新');
  assert.strictEqual(assets[2].lastPrice, 3.3, '黄金ETF 应更新');
  assert.strictEqual(assets[3].lastPrice, 1.5, '取价失败应保留旧价');
  assert.strictEqual(assets[4].lastPrice, 1.0, '停用资产不刷新');
  assert.strictEqual(res.ok, 2, '成功计数=2（513100 + 000217）');
  assert.strictEqual(res.failed, 1, '失败计数=1（999999）');
  console.log('ok - refreshHoldingsPrices 更新非现金/跳过现金/失败保留旧价');
})();

// ============ applyFreshHoldings：重算 invested 与 baseTotalAssetsCny ============
(async () => {
  const settings = {
    funds: { depositAmount: 0, nasdaqExposureLimitPercent: 70 },
    allocation: { boughtTargetPercent: 40, reserveCashTargetPercent: 30, otherCashTargetPercent: 30, monthlyCashflowCny: 4000 },
    portfolio: {
      investedNasdaqCny: 0,
      reserveCashNasdaqCny: 0,
      otherCashCny: 0,
      reserveUsedNasdaqCny: 0,
      fearOfMissingOut: false,
      assets: [
        { name: 'A', category: 'nasdaq', kind: 'exchange', secid: '1.513100', code: '513100', shares: 1000, lastPrice: 2.0, enabled: true },
        { name: 'B', category: 'nasdaq', kind: 'exchange', secid: '0.159941', code: '159941', shares: 1000, lastPrice: 1.0, enabled: true },
        { name: '现金', category: 'cash', kind: 'cash', secid: '', code: '', shares: 0, amountCny: 5000, lastPrice: 0, enabled: true },
      ],
    },
    nsdk: {
      fund: { code: '513100', secid: '1.513100', name: '纳指ETF' },
      benchmark: { provider: 'finnhub', symbol: 'NDX', name: '纳指100（NDX）' },
      timezone: 'Asia/Shanghai',
    },
    drawdown: { levelsPercent: [10, 15, 20, 25], executedLevels: {} },
  };
  const cfg = buildConfigFromSettings(settings);
  // 旧价：invested = 1000*2 + 1000*1 = 3000
  assert.strictEqual(cfg.portfolio.investedNasdaqCny, 3000, '前置：旧价 invested=3000');

  // 两只都跌 10%：2.0->1.8, 1.0->0.9 => invested = 1800 + 900 = 2700
  const getLatestPrice = makeFakeGetLatestPrice({ '1.513100': 1.8, '0.159941': 0.9 });
  const res = await applyFreshHoldings(cfg, {
    getLatestPrice,
    fetchFundNav: async () => { throw new Error('n/a'); },
  });
  assert.strictEqual(res.ok, 2, '两只都刷新成功');
  assert.strictEqual(cfg.portfolio.investedNasdaqCny, 2700, '刷新后 invested 应降到 2700');
  assert.strictEqual(cfg.baseTotalAssetsCny, 2700 + 5000, 'baseTotalAssetsCny = 纳指 + 现金');
  console.log('ok - applyFreshHoldings 用实时价重算 invested / baseTotalAssetsCny');
})();

console.log('holdings.test.js: all assertions scheduled');
