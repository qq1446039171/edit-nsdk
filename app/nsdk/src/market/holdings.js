/**
 * 持仓最新价刷新（用于让手机推送与网页看到同一天的行情）
 *
 * 背景：推送侧原本只读 settings.json 里存档的 lastPrice（可能是几周前的），
 * 导致「纳指已投资金额」与网页实时刷新的数值对不上。本模块在推送发出前，
 * 用与网页同源的东财接口重新拉取每只持仓的最新价，只在内存里更新，不回写文件。
 *
 * 数据源与网页 index.html 完全一致：
 * - 场内（exchange）：push2.eastmoney.com（复用 eastmoney.getLatestPrice）
 * - 失败回退到场外基金净值：fundgz.1234567.com.cn/js/{code}.js（jsonpgz 包裹）
 */
const { getLatestPrice } = require('./eastmoney');
const { summarizePortfolioAssets } = require('../config');

const round4 = (n) => Math.round(Number(n) * 10000) / 10000;

const isCashAsset = (asset) => asset && (asset.kind === 'cash' || asset.category === 'cash' || asset.category === 'nasdaq_reserve_cash');

// 场外基金净值：镜像网页 fetchFundPrice，取 gsz（估算净值）优先，回退 dwjz（单位净值）
const fetchFundNav = async (code) => {
  const c = String(code || '').trim();
  if (!c) throw new Error('缺少基金代码');
  const url = `https://fundgz.1234567.com.cn/js/${encodeURIComponent(c)}.js?rt=${1}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://fund.eastmoney.com/',
      'Accept': '*/*',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const m = text.match(/jsonpgz\((.*)\)/s);
  if (!m) throw new Error('基金净值响应格式异常');
  const data = JSON.parse(m[1]);
  const price = Number(data.gsz || data.dwjz);
  if (!Number.isFinite(price) || price <= 0) throw new Error('基金净值无效');
  return price;
};

/**
 * 取单只资产的最新价。
 * deps 用于测试注入：{ getLatestPrice, fetchFundNav }
 */
const fetchHoldingPrice = async (asset, deps = {}) => {
  const _getLatest = deps.getLatestPrice || getLatestPrice;
  const _fetchFund = deps.fetchFundNav || fetchFundNav;

  const secid = asset && asset.secid ? String(asset.secid).trim() : '';
  const code = asset && asset.code ? String(asset.code).trim() : '';

  // 主路径：东财 push2（与网页 fetchExchangePrice 同源）
  if (secid) {
    try {
      const quote = await _getLatest(secid);
      const price = Number(quote && quote.price);
      if (Number.isFinite(price) && price > 0) return price;
    } catch (err) {
      // 落到基金净值回退
    }
  }

  // 回退：场外基金净值
  if (code) {
    const navPrice = await _fetchFund(code);
    if (Number.isFinite(navPrice) && navPrice > 0) return navPrice;
  }

  throw new Error(`无法获取最新价：${asset && (asset.name || asset.code || asset.secid) || '未知资产'}`);
};

/**
 * 遍历资产，原地刷新非现金、启用中的持仓价。
 * - 现金 / 停用资产跳过
 * - 单只失败：保留旧价并计入 failed，不中断整体
 * 返回 { ok, failed }
 */
const refreshHoldingsPrices = async (assets, deps = {}) => {
  let ok = 0;
  let failed = 0;
  if (!Array.isArray(assets)) return { ok, failed };

  for (const asset of assets) {
    if (!asset || asset.enabled === false) continue;
    if (isCashAsset(asset)) continue;
    try {
      const price = await fetchHoldingPrice(asset, deps);
      asset.lastPrice = round4(price);
      asset.lastPriceAt = new Date().toISOString();
      asset.lastPriceError = '';
      ok += 1;
    } catch (err) {
      asset.lastPriceError = (err && err.message) || String(err);
      failed += 1;
    }
  }
  return { ok, failed };
};

/**
 * 刷新 cfg.portfolio.assets 的最新价，并用 summarizePortfolioAssets 重算汇总，
 * 把结果写回 cfg（仅内存）：investedNasdaqCny / reserveCashNasdaqCny / otherCashCny / baseTotalAssetsCny。
 * 返回 { ok, failed }
 */
const applyFreshHoldings = async (cfg, deps = {}) => {
  const assets = cfg && cfg.portfolio && Array.isArray(cfg.portfolio.assets) ? cfg.portfolio.assets : null;
  if (!assets || assets.length === 0) return { ok: 0, failed: 0 };

  const result = await refreshHoldingsPrices(assets, deps);
  const summary = summarizePortfolioAssets(assets);

  cfg.portfolio.investedNasdaqCny = summary.investedNasdaqCny;
  cfg.portfolio.reserveCashNasdaqCny = summary.reserveCashNasdaqCny;
  cfg.portfolio.otherCashCny = summary.otherCashCny;
  cfg.portfolio.assets = summary.assets;
  cfg.portfolio.assetSummary = summary;
  cfg.baseTotalAssetsCny = Math.round(
    summary.investedNasdaqCny + summary.reserveCashNasdaqCny + summary.otherCashCny
  );

  return result;
};

module.exports = {
  fetchFundNav,
  fetchHoldingPrice,
  refreshHoldingsPrices,
  applyFreshHoldings,
};
