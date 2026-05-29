/**
 * 纯计算模块（不做 IO）
 *
 * - computeTargets：把“总资产基准 + 比例”换算成金额目标
 * - computeDrawdown：把“近1年高点”和“当前价”换算成回撤百分比（例如 3.84 表示 -3.84%）
 * - buildTierTable：用“本轮回撤快照储备金”一次性生成四档买入金额（20/30/30/20）
 * - nextTierToTrigger：给定当前回撤%，找出下一档“未提醒且未执行”的档位
 */
const round2 = (n) => {
  return Math.round(Number(n) * 100) / 100;
};

const normalizeLevels = (levels) => {
  if (!Array.isArray(levels)) return [10, 15, 20, 25];
  const list = levels
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .map((v) => Math.abs(v))
    .filter((v) => v > 0);
  if (!list.length) return [10, 15, 20, 25];
  const uniq = Array.from(new Set(list));
  uniq.sort((a, b) => a - b);
  return uniq.length ? uniq : [10, 15, 20, 25];
};

// 把基准总资产转换成金额目标：40% 持仓、30% 备用金、70% 持仓敞口上限。
const computeTargets = (cfg) => {
  const total = Number(cfg.baseTotalAssetsCny);
  const activeTarget = total * Number(cfg.activeMaxInvestRatio);
  const reserveTarget = total * Number(cfg.reserveRatio);
  const exposureMax = total * Number(cfg.maxNasdaqExposureRatio);
  return {
    total,
    activeTarget,
    reserveTarget,
    exposureMax,
  };
};

// 回撤% = (高点-现价)/高点 * 100
const computeDrawdown = ({ current, high }) => {
  if (!current || !high) return null;
  const dd = (high - current) / high;
  return round2(dd * 100);
};

// 用“本轮快照储备金”固定算出四档金额，这张表在本轮回撤中不再变化
const buildTierTable = (snapshotReserveCny, levels) => {
  const base = Number(snapshotReserveCny);
  const normalized = normalizeLevels(levels);
  const defaultRatios = [0.2, 0.3, 0.3, 0.2];
  const ratios = normalized.length === defaultRatios.length
    ? defaultRatios
    : Array(normalized.length).fill(1 / normalized.length);
  return normalized.map((level, index) => ({
    level,
    ratio: ratios[index],
    amountCny: Math.round(base * ratios[index]),
  }));
};

// 规则：每档只触发一次（alerted/executed 任意为 true 都视为“本档已处理”）
const nextTierToTrigger = (drawdownPct, drawdownRound) => {
  if (!drawdownRound || !Array.isArray(drawdownRound.table)) return null;
  const levels = drawdownRound.table
    .map((row) => Number(row?.level))
    .filter((v) => Number.isFinite(v));
  const tiers = Array.from(new Set(levels)).sort((a, b) => a - b);
  for (const t of tiers) {
    const executed = Boolean(drawdownRound.executed?.[String(t)]);
    const alerted = Boolean(drawdownRound.alerted?.[String(t)]);
    if (drawdownPct >= t && !executed && !alerted) return t;
  }
  return null;
};

module.exports = {
  computeTargets,
  computeDrawdown,
  buildTierTable,
  nextTierToTrigger,
};

