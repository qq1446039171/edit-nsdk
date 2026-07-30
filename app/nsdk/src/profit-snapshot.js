/**
 * 每日总资产快照（盈利走势图数据源）
 *
 * 背景：网页盈利走势图读 settings.json 的 portfolio.profitHistory，但快照原本只在
 * 用户打开网页刷新价格并保存时记录，导致数据点稀疏（几周才一个点）。
 * 本模块让 CI 定时任务在每日例行推送后，把刷新后的总资产快照写回 settings.json；
 * workflow 的提交步骤已包含 Config/settings.json，会随运行自动入库。
 *
 * 格式与网页完全一致（normalizeProfitHistory / assetProfitSnapshotRows）：
 * { date, totalAssetsCny, assets: [{ id, name, category, shares, lastPrice, marketValueCny }] }
 * 现金/备用金不进 assets 明细；同日覆盖；按日期排序；最多保留 366 条。
 */
const fs = require('fs');

const MAX_HISTORY = 366;

const isCashLike = (asset) => asset && (asset.kind === 'cash' || asset.category === 'cash' || asset.category === 'nasdaq_reserve_cash');

// 同日覆盖 + 按日期排序 + 截断，不修改传入数组
const upsertProfitSnapshot = (history, snapshot) => {
  const byDate = {};
  if (Array.isArray(history)) {
    for (const entry of history) {
      if (entry && /^\d{4}-\d{2}-\d{2}$/.test(String(entry.date || ''))) byDate[entry.date] = entry;
    }
  }
  if (snapshot && /^\d{4}-\d{2}-\d{2}$/.test(String(snapshot.date || ''))) byDate[snapshot.date] = snapshot;
  return Object.keys(byDate).sort().map((d) => byDate[d]).slice(-MAX_HISTORY);
};

// 从 assetSummary 构造一条快照；现金/备用金不进明细（与网页 assetProfitSnapshotRows 一致）
const buildSnapshotFromSummary = (ymd, summary) => {
  const snapshot = {
    date: ymd,
    totalAssetsCny: Math.round(Number(summary.totalAssetsCny) * 100) / 100,
  };
  const assets = (Array.isArray(summary.assets) ? summary.assets : [])
    .filter((asset) => asset && !isCashLike(asset))
    .map((asset) => ({
      id: String(asset.id || asset.code || ''),
      name: String(asset.name || asset.id || ''),
      category: String(asset.category || 'stock'),
      shares: Math.max(0, Number(asset.shares) || 0),
      lastPrice: Math.max(0, Number(asset.lastPrice) || 0),
      marketValueCny: Math.max(0, Math.round((Number(asset.marketValueCny) || 0) * 100) / 100),
    }))
    .filter((asset) => asset.id);
  if (assets.length) snapshot.assets = assets;
  return snapshot;
};

/**
 * 把 cfg.portfolio.assetSummary（applyFreshHoldings 刷新后的汇总）作为当日快照
 * 写入 settings.json 的 portfolio.profitHistory。成功返回 true；缺数据/读写失败返回 false。
 */
const recordDailySnapshot = (cfg, { settingsPath, ymd }) => {
  try {
    const summary = cfg && cfg.portfolio && cfg.portfolio.assetSummary;
    const total = summary && Number(summary.totalAssetsCny);
    if (!summary || !Number.isFinite(total) || total <= 0) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return false;

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    settings.portfolio = settings.portfolio || {};
    settings.portfolio.profitHistory = upsertProfitSnapshot(
      settings.portfolio.profitHistory,
      buildSnapshotFromSummary(ymd, summary)
    );
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return true;
  } catch {
    return false; // 快照失败不影响推送主流程
  }
};

module.exports = {
  upsertProfitSnapshot,
  buildSnapshotFromSummary,
  recordDailySnapshot,
};
