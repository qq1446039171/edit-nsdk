const fs = require('fs');
const path = require('path');

const clampNumber = (v, fallback = 0) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n;
};

const normalizeLevels = (levels) => {
  if (!Array.isArray(levels)) return null;
  const list = levels
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .map((v) => Math.abs(v))
    .filter((v) => v > 0);
  if (!list.length) return null;
  const uniq = Array.from(new Set(list));
  uniq.sort((a, b) => a - b);
  return uniq.length ? uniq : null;
};

const normalizeExecutedLevels = (executedLevels, levels) => {
  const normalized = {};
  for (const level of levels) {
    normalized[String(level)] = Boolean(executedLevels && executedLevels[String(level)]);
  }
  return normalized;
};

const safeGet = (obj, pathParts, fallback = undefined) => {
  let cur = obj;
  for (const part of pathParts) {
    if (!cur || typeof cur !== 'object') return fallback;
    cur = cur[part];
  }
  return cur === undefined ? fallback : cur;
};

const assetMarketValue = (asset) => {
  if (!asset || asset.enabled === false) return 0;
  if (asset.kind === 'cash') return Math.max(0, clampNumber(asset.amountCny, 0));
  const shares = Math.max(0, clampNumber(asset.shares, 0));
  const price = Math.max(0, clampNumber(asset.lastPrice, 0));
  if (shares <= 0 || price <= 0) return 0;
  return shares * price;
};

const summarizePortfolioAssets = (assets) => {
  const summary = {
    investedNasdaqCny: 0,
    reserveCashNasdaqCny: 0,
    otherCashCny: 0,
    totalAssetsCny: 0,
    assets: [],
  };
  if (!Array.isArray(assets)) return summary;

  for (const asset of assets) {
    if (!asset || asset.enabled === false) continue;
    const value = assetMarketValue(asset);
    const normalized = {
      id: asset.id || asset.code || asset.name || `asset-${summary.assets.length + 1}`,
      name: asset.name || asset.code || '未命名资产',
      category: asset.category || 'stock',
      kind: asset.kind || 'exchange',
      code: asset.code || '',
      secid: asset.secid || '',
      shares: clampNumber(asset.shares, 0),
      amountCny: clampNumber(asset.amountCny, 0),
      lastPrice: clampNumber(asset.lastPrice, 0),
      marketValueCny: Math.round(value * 100) / 100,
      enabled: true,
    };
    summary.assets.push(normalized);
    summary.totalAssetsCny += value;
    if (normalized.category === 'nasdaq') summary.investedNasdaqCny += value;
    else if (normalized.category === 'nasdaq_reserve_cash') summary.reserveCashNasdaqCny += value;
    else summary.otherCashCny += value;
  }

  summary.investedNasdaqCny = Math.round(summary.investedNasdaqCny);
  summary.reserveCashNasdaqCny = Math.round(summary.reserveCashNasdaqCny);
  summary.otherCashCny = Math.round(summary.otherCashCny);
  summary.totalAssetsCny = Math.round(summary.totalAssetsCny);
  return summary;
};

const readJsonIfExists = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
};

const resolveSettingsPath = () => {
  if (process.env.SETTINGS_PATH) return path.resolve(process.env.SETTINGS_PATH);

  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const candidate = path.join(repoRoot, 'Config', 'settings.json');
  if (fs.existsSync(candidate)) return candidate;

  const cwdCandidate = path.join(process.cwd(), 'Config', 'settings.json');
  if (fs.existsSync(cwdCandidate)) return cwdCandidate;

  return candidate;
};

const buildConfigFromSettings = (settings) => {
  const nsdk = settings && settings.nsdk && typeof settings.nsdk === 'object' ? settings.nsdk : null;
  if (!nsdk) throw new Error('settings.json missing nsdk');

  const depositAmount = clampNumber(safeGet(settings, ['funds', 'depositAmount'], 0), 0);
  const exposureLimitPercent = clampNumber(safeGet(settings, ['funds', 'nasdaqExposureLimitPercent'], 70), 70);
  const boughtTargetPercent = clampNumber(safeGet(settings, ['allocation', 'boughtTargetPercent'], 40), 40);
  const reserveTargetPercent = clampNumber(safeGet(settings, ['allocation', 'reserveCashTargetPercent'], 30), 30);
  const otherCashTargetPercent = clampNumber(safeGet(settings, ['allocation', 'otherCashTargetPercent'], 30), 30);
  const monthlyCashflowCny = clampNumber(safeGet(settings, ['allocation', 'monthlyCashflowCny'], 4000), 4000);

  const portfolio = settings && settings.portfolio && typeof settings.portfolio === 'object' ? settings.portfolio : {};
  const assetSummary = summarizePortfolioAssets(portfolio.assets);
  const hasAssetSummary = assetSummary.assets.length > 0;
  const investedNasdaqCny = hasAssetSummary ? assetSummary.investedNasdaqCny : Math.max(0, clampNumber(portfolio.investedNasdaqCny, 0));
  const reserveCashNasdaqCny = hasAssetSummary ? assetSummary.reserveCashNasdaqCny : Math.max(0, clampNumber(portfolio.reserveCashNasdaqCny, 0));
  const otherCashCny = hasAssetSummary ? assetSummary.otherCashCny : Math.max(0, clampNumber(portfolio.otherCashCny, Math.max(0, depositAmount - investedNasdaqCny - reserveCashNasdaqCny)));
  const normalizedTotalAssetsCny = investedNasdaqCny + reserveCashNasdaqCny + otherCashCny;

  const rawBenchmark = nsdk.benchmark && typeof nsdk.benchmark === 'object' ? nsdk.benchmark : null;
  const benchmarkProvider = rawBenchmark && rawBenchmark.provider ? rawBenchmark.provider : 'eastmoney';
  const benchmark = {
    provider: benchmarkProvider,
    secid: benchmarkProvider === 'eastmoney' ? ((rawBenchmark && rawBenchmark.secid) || (nsdk.fund && nsdk.fund.secid)) : ((rawBenchmark && rawBenchmark.secid) || null),
    symbol: (rawBenchmark && rawBenchmark.symbol) || null,
    name: (rawBenchmark && rawBenchmark.name) || null,
  };
  if (benchmark.provider === 'eastmoney' && !benchmark.name) {
    benchmark.name = nsdk.fund && nsdk.fund.name ? `${nsdk.fund.name}（净值）` : null;
  }
  if ((benchmark.provider === 'stooq' || benchmark.provider === 'finnhub') && !benchmark.name) {
    const s = String(benchmark.symbol || '').trim().toUpperCase();
    if (s === 'QQQ' || s === 'QQQ.US') benchmark.name = 'QQQ';
    else if (s === 'IXIC' || s === '^IXIC' || s === '^NDQ') benchmark.name = '纳指指数（IXIC）';
    else if (s === 'NDX' || s === '^NDX') benchmark.name = '纳指100（NDX）';
    else if (s) benchmark.name = s;
    else benchmark.name = null;
  }

  const drawdownLevels = normalizeLevels(safeGet(settings, ['drawdown', 'levelsPercent'])) || [10, 15, 20, 25];
  const drawdownExecutedLevels = normalizeExecutedLevels(safeGet(settings, ['drawdown', 'executedLevels']), drawdownLevels);

  const finnhubApiKey = String(process.env.FINNHUB_API_KEY || (nsdk.finnhub && nsdk.finnhub.apiKey) || '').trim();

  const cfg = {
    fund: nsdk.fund,
    benchmark,
    finnhubApiKey,
    timezone: nsdk.timezone,
    logDir: nsdk.logDir,
    pushEnabled: nsdk.pushEnabled !== false,
    startupHeartbeatEnabled: nsdk.startupHeartbeatEnabled !== false,
    serverChan: nsdk.serverChan,
    dailyChecks: nsdk.dailyChecks || [],
    weeklyActiveBuy: nsdk.weeklyActiveBuy || null,
    otcDcaCnyPerWorkday: nsdk.otcDcaCnyPerWorkday,
    monthlyCashflowCny,
    baseTotalAssetsCny: Math.round(normalizedTotalAssetsCny || depositAmount),
    maxNasdaqExposureRatio: exposureLimitPercent / 100,
    activeMaxInvestRatio: boughtTargetPercent / 100,
    reserveRatio: reserveTargetPercent / 100,
    otherCashRatio: otherCashTargetPercent / 100,
    drawdownLevels,
    drawdownExecutedLevels,
    portfolio: {
      investedNasdaqCny: Math.round(investedNasdaqCny),
      reserveCashNasdaqCny: Math.round(reserveCashNasdaqCny),
      otherCashCny: Math.round(otherCashCny),
      reserveUsedNasdaqCny: Math.round(Math.max(0, clampNumber(portfolio.reserveUsedNasdaqCny, 0))),
      fearOfMissingOut: Boolean(portfolio.fearOfMissingOut === undefined ? false : portfolio.fearOfMissingOut),
      assets: assetSummary.assets,
      assetSummary
    }
  };

  return cfg;
};

const loadConfig = () => {
  const settingsPath = resolveSettingsPath();
  const settings = readJsonIfExists(settingsPath);
  const cfg = buildConfigFromSettings(settings);

  if (!cfg.fund || !cfg.fund.secid) throw new Error('settings.json missing nsdk.fund.secid');
  if (!cfg.timezone) throw new Error('settings.json missing nsdk.timezone');
  if (!cfg.portfolio) throw new Error('settings.json missing portfolio');
  if (!cfg.benchmark || !cfg.benchmark.provider) throw new Error('settings.json missing nsdk.benchmark.provider');
  if (cfg.benchmark.provider === 'eastmoney' && !cfg.benchmark.secid) throw new Error('settings.json missing nsdk.benchmark.secid');
  if ((cfg.benchmark.provider === 'stooq' || cfg.benchmark.provider === 'finnhub') && !cfg.benchmark.symbol) {
    throw new Error('settings.json missing nsdk.benchmark.symbol');
  }
  if (cfg.benchmark.provider === 'finnhub' && !cfg.finnhubApiKey) {
    throw new Error('Finnhub API key missing: set environment variable FINNHUB_API_KEY or nsdk.finnhub.apiKey in settings.json');
  }
  if (cfg.pushEnabled) {
    const sendKey = cfg.serverChan && cfg.serverChan.sendKey;
    if (!sendKey) throw new Error('settings.json missing nsdk.serverChan.sendKey');
  }

  return cfg;
};

module.exports = {
  buildConfigFromSettings,
  loadConfig,
  summarizePortfolioAssets,
};
