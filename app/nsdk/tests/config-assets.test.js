const assert = require('assert');
const { buildConfigFromSettings } = require('../src/config');

const baseSettings = {
  funds: { depositAmount: 0, nasdaqExposureLimitPercent: 70 },
  allocation: {
    boughtTargetPercent: 40,
    reserveCashTargetPercent: 30,
    otherCashTargetPercent: 30,
    monthlyCashflowCny: 4000,
  },
  portfolio: {
    investedNasdaqCny: 123,
    reserveCashNasdaqCny: 456,
    otherCashCny: 789,
    reserveUsedNasdaqCny: 0,
    fearOfMissingOut: false,
    assets: [
      { name: '纳指ETF', category: 'nasdaq', kind: 'exchange', shares: 1000, lastPrice: 2.5, enabled: true },
      { name: '支付宝纳指基金', category: 'nasdaq', kind: 'fund', shares: 200, lastPrice: 1.5, enabled: true },
      { name: '黄金ETF', category: 'gold', kind: 'exchange', shares: 100, lastPrice: 5, enabled: true },
      { name: '支付宝备用金', category: 'nasdaq_reserve_cash', kind: 'cash', amountCny: 60000, enabled: true },
      { name: '普通现金', category: 'cash', kind: 'cash', amountCny: 75000, enabled: true },
      { name: '关闭资产', category: 'nasdaq', kind: 'exchange', shares: 999, lastPrice: 999, enabled: false },
    ],
  },
  drawdown: { levelsPercent: [-10, -15], executedLevels: {} },
  nsdk: {
    fund: { code: '513100', secid: '1.513100', name: '纳指ETF' },
    benchmark: { provider: 'eastmoney', secid: '1.513100', name: '纳指ETF' },
    timezone: 'Asia/Shanghai',
    logDir: 'D:/log-nsdk',
    pushEnabled: false,
    serverChan: { sendKey: '' },
    dailyChecks: [],
  },
};

const cfg = buildConfigFromSettings(baseSettings);

assert.strictEqual(cfg.portfolio.investedNasdaqCny, 2800);
assert.strictEqual(cfg.portfolio.reserveCashNasdaqCny, 60000);
assert.strictEqual(cfg.portfolio.otherCashCny, 75500);
assert.strictEqual(cfg.baseTotalAssetsCny, 138300);
assert.strictEqual(cfg.portfolio.assets.length, 5);

console.log('config-assets.test.js passed');
