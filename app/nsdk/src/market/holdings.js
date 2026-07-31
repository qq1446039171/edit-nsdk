/**
 * 持仓最新价刷新（用于让手机推送与网页看到同一天的行情）
 *
 * 背景：推送侧原本只读 settings.json 里存档的 lastPrice（可能是几周前的），
 * 导致「纳指已投资金额」与网页实时刷新的数值对不上。本模块在推送发出前，
 * 用与网页同源的东财接口重新拉取每只持仓的最新价，只在内存里更新，不回写文件。
 *
 * 数据源与网页 index.html 完全一致：
 * - 场内（exchange）：push2.eastmoney.com（复用 eastmoney.getLatestPrice）
 * - 失败回退到场外基金净值：先 api.fund.eastmoney.com f10/lsjz 历史净值，
 *   再 fund.eastmoney.com pingzhongdata，最后用 fundmobapi.eastmoney.com FundMNFInfo 兜底
 *   （旧 fundgz JSONP 接口已下线）
 */
const { getLatestPrice } = require('./eastmoney');
const { summarizePortfolioAssets } = require('../config');

const round4 = (n) => Math.round(Number(n) * 10000) / 10000;

const isCashAsset = (asset) => asset && (asset.kind === 'cash' || asset.category === 'cash' || asset.category === 'nasdaq_reserve_cash');

const parseFundNavNumber = (...values) => {
  for (const value of values) {
    const price = Number(value);
    if (Number.isFinite(price) && price > 0) return price;
  }
  return null;
};

const parseJsonpPayload = (text) => {
  const raw = String(text || '').trim();
  const start = raw.indexOf('(');
  const end = raw.lastIndexOf(')');
  const body = start >= 0 && end > start ? raw.slice(start + 1, end) : raw;
  return JSON.parse(body);
};

const normalizeFundCode = (code) => {
  const clean = String(code || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  const match = clean.match(/\d{6}/);
  return match ? match[0] : clean;
};

const parsePingzhongFundNav = (text) => {
  const raw = String(text || '');
  const match = raw.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) throw new Error('基金页净值无数据');
  const trend = JSON.parse(match[1]);
  const latest = Array.isArray(trend) ? trend[trend.length - 1] : null;
  const price = parseFundNavNumber(latest && latest.y);
  if (!price) throw new Error('基金页净值无效');
  return price;
};

const fetchOrThrow = async (url, options = {}) => {
  if (typeof fetch !== 'function') {
    throw new Error('当前 Node 版本缺少 fetch，请使用 Node 18+ 或 GitHub Actions Node 20');
  }
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
};

const fetchFundNavFromMobile = async (code) => {
  const url = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?pageIndex=1&pageSize=1&plat=Android&appType=ttjj&product=EFund&Version=1&deviceid=nsdk&Fcodes=${encodeURIComponent(code)}`;
  const res = await fetchOrThrow(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    },
  });
  const json = await res.json();
  const item = json && json.Datas && json.Datas[0];
  if (!item) throw new Error('基金代码无数据');
  const price = parseFundNavNumber(item.GSZ, item.NAV);
  if (!price) throw new Error('基金净值无效');
  return price;
};

const fetchFundNavFromHistory = async (code) => {
  const url = `https://api.fund.eastmoney.com/f10/lsjz?callback=jQueryNsdK&fundCode=${encodeURIComponent(code)}&pageIndex=1&pageSize=1&startDate=&endDate=&_=${Date.now()}`;
  const res = await fetchOrThrow(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/javascript,text/javascript,*/*',
      'Referer': 'https://fundf10.eastmoney.com/',
    },
  });
  const json = parseJsonpPayload(await res.text());
  const item = json && json.Data && Array.isArray(json.Data.LSJZList) && json.Data.LSJZList[0];
  if (!item) throw new Error('历史净值无数据');
  const price = parseFundNavNumber(item.DWJZ);
  if (!price) throw new Error('历史净值无效');
  return price;
};

const fetchFundNavFromPingzhong = async (code) => {
  const url = `https://fund.eastmoney.com/pingzhongdata/${encodeURIComponent(code)}.js?v=${Date.now()}`;
  const res = await fetchOrThrow(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/javascript,text/javascript,*/*',
    },
  });
  return parsePingzhongFundNav(await res.text());
};

// 场外基金净值：Node 侧 lsjz 可带 Referer；再用浏览器可用的基金页脚本兜底，FundMNFInfo 最后兜底。
const fetchFundNav = async (code) => {
  const c = normalizeFundCode(code);
  if (!c) throw new Error('缺少基金代码');
  const errors = [];
  try {
    return await fetchFundNavFromHistory(c);
  } catch (err) {
    errors.push(`lsjz：${(err && err.message) || String(err)}`);
  }
  try {
    return await fetchFundNavFromPingzhong(c);
  } catch (err) {
    errors.push(`pingzhongdata：${(err && err.message) || String(err)}`);
  }
  try {
    return await fetchFundNavFromMobile(c);
  } catch (err) {
    errors.push(`FundMNFInfo：${(err && err.message) || String(err)}`);
  }
  throw new Error(errors.join('；'));
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
