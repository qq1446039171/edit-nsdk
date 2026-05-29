/**
 * 交易纪律的“执行引擎”
 *
 * 这个文件做三件事：
 * 1) 例行行情检查：获取 513100 当前价 + 近 5 个月高点，计算回撤%
 * 2) 回撤快照机制：首次到 -10% 时锁定“本轮作战储备金快照”，并生成档位买入表
 * 3) 提醒与冻结：按纪律推送提醒；满足冻结条件时停止所有主动买入提醒
 *
 * 注意：
 * - 本程序只负责“提醒 + 记录 + 防重复”，不直接下单
 * - 你执行完买入后，用配置器或 cli 命令确认（把 executed 标记写入 Config/settings.json），保证“每档只触发一次”
 */
const { getLatestPrice, getOneYearHigh } = require('./market/eastmoney');
const { getLatestDaily, getOneYearHighDaily } = require('./market/stooq');
const { getLatestDaily: getLatestDailyFinnhub, getOneYearHighDaily: getOneYearHighDailyFinnhub } = require('./market/finnhub');
const { getVixLast7 } = require('./market/vix');
const { computeTargets, computeDrawdown, buildTierTable, nextTierToTrigger } = require('./plan');
const { logEvent } = require('./logger');
const { push } = require('./push');

const fmtCny = (n) => {
  if (n === null || n === undefined) return 'N/A';
  return Number(n).toLocaleString('zh-CN');
};

const fmtPercent = (n) => {
  if (n === null || n === undefined) return 'N/A';
  const v = Number(n);
  if (!Number.isFinite(v)) return 'N/A';
  return String(Math.round(v * 100) / 100);
};

const resolveBenchmarkLabel = (cfg) => {
  const provider = cfg?.benchmark?.provider;
  if (provider === 'stooq' || provider === 'finnhub') return cfg?.benchmark?.name || cfg?.benchmark?.symbol || 'Benchmark';
  if (provider === 'eastmoney') return cfg?.benchmark?.name || cfg?.fund?.name || 'Eastmoney';
  return cfg?.benchmark?.name || 'Benchmark';
};

const fetchBenchmarkMarket = async (cfg) => {
  const provider = cfg?.benchmark?.provider;
  if (provider === 'stooq') {
    const [latest, high] = await Promise.all([
      getLatestDaily(cfg.benchmark.symbol),
      getOneYearHighDaily(cfg.benchmark.symbol),
    ]);
    return {
      provider,
      code: latest.symbol,
      name: resolveBenchmarkLabel(cfg),
      price: latest.close,
      pct: latest.pct,
      high1y: high.maxHigh,
      high1yDay: high.maxDay,
    };
  }

  if (provider === 'finnhub') {
    const token = cfg.finnhubApiKey;
    const [latest, high] = await Promise.all([
      getLatestDailyFinnhub(token, cfg.benchmark.symbol),
      getOneYearHighDailyFinnhub(token, cfg.benchmark.symbol),
    ]);
    // QQQ 与 NDX 指数有稳定比例关系（~41.1），用于把 QQQ 的美元价换算成指数级显示
    const QQQ_NDX_RATIO = 41.1016;
    const rawPrice = latest.close;
    const rawHigh = high.maxHigh;
    const displayPrice = Math.round(rawPrice * QQQ_NDX_RATIO);
    const displayHigh = Math.round(rawHigh * QQQ_NDX_RATIO);
    return {
      provider,
      code: latest.symbol,
      name: resolveBenchmarkLabel(cfg),
      price: displayPrice,
      pct: latest.pct,
      high1y: displayHigh,
      high1yDay: high.maxDay,
      // 保留原始 QQQ 数据供调试
      _rawPrice: rawPrice,
      _rawHigh: rawHigh,
    };
  }

  const [latest, high] = await Promise.all([
    getLatestPrice(cfg.benchmark.secid),
    getOneYearHigh(cfg.benchmark.secid),
  ]);
  return {
    provider: 'eastmoney',
    code: cfg?.benchmark?.secid || cfg?.fund?.code || 'secid',
    name: resolveBenchmarkLabel(cfg),
    price: latest.price,
    pct: latest.pct,
    high1y: high.maxHigh,
    high1yDay: high.maxDay,
  };
};

const getDrawdownLevels = (cfg) => {
  const levels = Array.isArray(cfg?.drawdownLevels) ? cfg.drawdownLevels : null;
  if (!levels || levels.length === 0) return [10, 15, 20, 25];
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

const buildTierFlags = (levels) => {
  const flags = {};
  for (const t of levels) {
    flags[String(t)] = false;
  }
  return flags;
};

const mergeExecutedFlags = (levels, executedInSettings, executedInRound) => {
  const merged = {};
  for (const level of levels) {
    const key = String(level);
    merged[key] = Boolean(executedInSettings?.[key] || executedInRound?.[key]);
  }
  return merged;
};

const getRoundLevels = (round) => {
  if (!round || !Array.isArray(round.table)) return [];
  const levels = round.table.map((row) => Number(row?.level)).filter((v) => Number.isFinite(v));
  const uniq = Array.from(new Set(levels));
  uniq.sort((a, b) => a - b);
  return uniq;
};

const findNextLevel = (round) => {
  if (!round) return null;
  const levels = getRoundLevels(round);
  for (const t of levels) {
    const executed = Boolean(round.executed?.[String(t)]);
    const alerted = Boolean(round.alerted?.[String(t)]);
    if (!executed && !alerted) return t;
  }
  return null;
};

const getMarketSnapshot = async (cfg) => {
  let buyLatest = null;
  let benchmarkMarket = null;
  const errors = [];

  try {
    buyLatest = await getLatestPrice(cfg.fund.secid);
  } catch (err) {
    errors.push(String(err?.message || err));
  }

  try {
    benchmarkMarket = await fetchBenchmarkMarket(cfg);
  } catch (err) {
    errors.push(String(err?.message || err));
  }

  if (!benchmarkMarket) {
    const msg = errors.length ? errors.join('; ') : 'benchmark_missing';
    throw new Error(msg);
  }

  const drawdownPct = computeDrawdown({ current: benchmarkMarket.price, high: benchmarkMarket.high1y });
  const buy = {
    code: cfg.fund.code,
    name: buyLatest?.name || cfg.fund.name,
    price: buyLatest?.price ?? null,
    pct: buyLatest?.pct ?? null,
  };
  const benchmark = {
    ...benchmarkMarket,
    drawdownPct,
  };
  const market = { benchmark, buy };
  return { market, benchmark, buy, drawdownPct };
};

const pushTierAlert = async (cfg, state, benchmark, buy, tier) => {
  const row = state.drawdownRound?.table?.find(x => x.level === tier);
  state.drawdownRound.alerted[String(tier)] = true;

  let vixLine = 'VIX恐慌指数（近7日）：N/A';
  try {
    const vixData = await getVixLast7();
    if (vixData && vixData.length > 0) {
      vixLine = 'VIX恐慌指数（近7日）：' + vixData.map(r => r.close).join('  ');
    }
  } catch { /* silent */ }

  const title = `回撤基准 ${benchmark.name} ≥-${tier}%：执行一次性买入`;
  const body = [
    `回撤基准：${benchmark.name}（${benchmark.code}）`,
    vixLine,
    `当前：${benchmark.price}，近1年高点：${benchmark.high1y}（${benchmark.high1yDay}）`,
    `回撤：-${benchmark.drawdownPct}%`,
    `买入工具：${buy.name}（${buy.code}）`,
    `本轮回撤快照储备金：${fmtCny(state.drawdownRound.snapshotReserveCny)} 元`,
    `本档买入金额：${fmtCny(row?.amountCny)} 元`,
    `规则：每档只触发一次；不回补、不重复、不预判`,
    `确认执行后：在配置器里将 Config/settings.json 的 drawdown.executedLevels.${tier} 标记为 true`
  ].join('\n\n');

  const pushRet = await push(cfg, { title, body });
  logEvent({ type: 'tier_alert', tier, amountCny: row?.amountCny || null, pushRet });
};

// 冻结条件（安全阀）：触发后“停止所有主动买入提醒”，但不涉及卖出
const ensureFreezeState = (cfg, state) => {
  const targets = computeTargets(cfg);
  const invested = Number(cfg.portfolio.investedNasdaqCny);
  const fear = Boolean(cfg.portfolio.fearOfMissingOut);

  let reason = null;
  if (invested >= targets.activeTarget) reason = '已买入纳指≥40%';
  else if (invested >= targets.exposureMax) reason = '纳指持仓敞口≥70%';
  else if (fear) reason = '连续上涨触发怕踏空（手动标记）';

  if (reason) {
    if (!state.freeze.active) {
      state.freeze = { active: true, reason, since: new Date().toISOString() };
      logEvent({ type: 'freeze_on', reason });
    }
    return;
  }

  if (state.freeze.active) {
    state.freeze = { active: false, reason: null, since: null };
    logEvent({ type: 'freeze_off' });
  }
};

const ensureDrawdownRound = (cfg, state, drawdownPct, levels) => {
  if (drawdownPct === null) return;
  const thresholds = Array.isArray(levels) && levels.length ? levels : getDrawdownLevels(cfg);
  if (state.drawdownRound && drawdownPct < 1) {
    const startedAt = new Date(state.drawdownRound.startedAt);
    const ageMs = Date.now() - startedAt.getTime();
    if (Number.isFinite(ageMs) && ageMs > 24 * 60 * 60 * 1000) {
      logEvent({ type: 'drawdown_round_end', reason: 'drawdown_recovered', drawdownPct });
      state.drawdownRound = null;
    }
  }

  const triggerLevel = thresholds[0];
  if (drawdownPct >= triggerLevel && !state.drawdownRound) {
    const reserveNow = Number(cfg.portfolio.reserveCashNasdaqCny);
    const table = buildTierTable(reserveNow, thresholds);
    state.drawdownRound = {
      startedAt: new Date().toISOString(),
      snapshotReserveCny: reserveNow,
      table,
      alerted: buildTierFlags(thresholds),
      executed: mergeExecutedFlags(thresholds, cfg.drawdownExecutedLevels, null),
    };
    logEvent({ type: 'drawdown_round_start', snapshotReserveCny: reserveNow, table });
  }

  if (state.drawdownRound) {
    state.drawdownRound.executed = mergeExecutedFlags(
      thresholds,
      cfg.drawdownExecutedLevels,
      state.drawdownRound.executed
    );
  }
};

const tryRealtimeDrawdownAlert = async (cfg, state) => {
  const { market, benchmark, buy, drawdownPct } = await getMarketSnapshot(cfg);
  state.lastMarket = { ...market, at: new Date().toISOString() };
  logEvent({ type: 'market_check', market: state.lastMarket });
  if (drawdownPct === null) return false;

  const levels = getDrawdownLevels(cfg);
  ensureDrawdownRound(cfg, state, drawdownPct, levels);
  const t = nextTierToTrigger(drawdownPct, state.drawdownRound);
  if (t && state.drawdownRound) {
    await pushTierAlert(cfg, state, benchmark, buy, t);
    return true;
  }
  return false;
};

// 例行行情检查：计算回撤%，必要时触发“档位提醒”
const marketCheck = async (cfg, state) => {
  ensureFreezeState(cfg, state);

  const targets = computeTargets(cfg);
  const totalAssets = Number(cfg.baseTotalAssetsCny);
  const invested = Number(cfg.portfolio.investedNasdaqCny);
  const reserveCash = Number(cfg.portfolio.reserveCashNasdaqCny);
  const reserveUsed = Number(cfg.portfolio.reserveUsedNasdaqCny);

  const investedPercent = totalAssets > 0 ? (invested / totalAssets) * 100 : null;
  const remainingInvestAmount = Math.max(0, Math.round(targets.activeTarget - invested));
  const remainingInvestPercent = totalAssets > 0 ? (remainingInvestAmount / totalAssets) * 100 : null;

  const reserveUsedPercentOfTarget = targets.reserveTarget > 0 ? (reserveUsed / targets.reserveTarget) * 100 : null;

  let buyLatest = null;
  let benchmarkMarket = null;
  let vixData = null;
  const errors = [];

  try {
    buyLatest = await getLatestPrice(cfg.fund.secid);
  } catch (err) {
    errors.push(String(err?.message || err));
  }

  try {
    benchmarkMarket = await fetchBenchmarkMarket(cfg);
  } catch (err) {
    errors.push(String(err?.message || err));
  }

  try {
    vixData = await getVixLast7();
  } catch (err) {
    // VIX 获取失败不影响主流程，只在 body 里显示 N/A
  }

  if (!benchmarkMarket) {
    logEvent({ type: 'market_check_failed', errors });
    return false;
  }

  const drawdownPct = computeDrawdown({ current: benchmarkMarket.price, high: benchmarkMarket.high1y });
  const buy = {
    code: cfg.fund.code,
    name: buyLatest?.name || cfg.fund.name,
    price: buyLatest?.price ?? null,
    pct: buyLatest?.pct ?? null,
  };
  const benchmark = {
    ...benchmarkMarket,
    drawdownPct,
  };
  const market = { benchmark, buy };

  state.lastMarket = { ...market, at: new Date().toISOString() };
  logEvent({ type: 'market_check', market: state.lastMarket });

  if (drawdownPct === null) return false;

  const levels = getDrawdownLevels(cfg);
  ensureDrawdownRound(cfg, state, drawdownPct, levels);

  const t = nextTierToTrigger(drawdownPct, state.drawdownRound);
  if (t && state.drawdownRound) {
    await pushTierAlert(cfg, state, benchmark, buy, t);
    return true;
  }

  // 未触发档位时，推送例行状态（帮助你“只盯规则，不盯盘”）
  const title = `每日:回撤-${benchmark.drawdownPct}%`;
  const round = state.drawdownRound;
  const next = round ? findNextLevel(round) : null;
  const vixLine = (() => {
    if (!vixData || vixData.length === 0) return 'VIX恐慌指数（近7日）：N/A';
    const parts = vixData.map(r => r.close);
    return `VIX恐慌指数（近7日）：${parts.join('  ')}`;
  })();

  const body = [
    `回撤基准：${benchmark.name}（${benchmark.code}）`,
    vixLine,
    `当前：${benchmark.price}（${benchmark.pct ?? 'N/A'}%）`,
    `近1年高点：${benchmark.high1y}（${benchmark.high1yDay}）`,
    `回撤：-${benchmark.drawdownPct}%`,
    `买入工具：${buy.name}（${buy.code}） 当前 ${buy.price ?? 'N/A'}（${buy.pct ?? 'N/A'}%）`,
    `纳指已投资金额：¥${fmtCny(invested)}（${fmtPercent(investedPercent)}%）· 还能投资 ${fmtPercent(remainingInvestPercent)}% / ¥${fmtCny(remainingInvestAmount)}`,
    `备用金纳指金额：¥${fmtCny(reserveCash)} · 已使用额度 ${fmtPercent(reserveUsedPercentOfTarget)}% / ¥${fmtCny(reserveUsed)}`,
    round ? `本轮回撤快照储备金：${fmtCny(round.snapshotReserveCny)} 元` : '本轮回撤快照：未启动（需先到 -10%）',
    next ? `下一档位：-${next}%（到位才触发）` : '下一档位：N/A',
    state.freeze.active ? `冻结：是（${state.freeze.reason}）` : '冻结：否',
    '纪律句：坚持价值投资，十年后你会感谢今天的自己'
  ].join('\n\n');
  const pushRet = await push(cfg, { title, body });
  logEvent({ type: 'market_report_push', pushRet, drawdownPct });
  return true;
};

// 每周一次主动建仓提醒（阶段一：只到 40%），并自动遵守“冻结/回撤优先”纪律
const weeklyActiveReminder = async (cfg, state) => {
  ensureFreezeState(cfg, state);

  const invested = Number(cfg.portfolio.investedNasdaqCny);
  const targets = computeTargets(cfg);
  const remaining = Math.max(0, Math.round(targets.activeTarget - invested));

  const anyDrawdownPending = Boolean(state.drawdownRound) && getRoundLevels(state.drawdownRound).some(t => {
    const executed = Boolean(state.drawdownRound.executed?.[String(t)]);
    const alerted = Boolean(state.drawdownRound.alerted?.[String(t)]);
    return alerted && !executed;
  });

  if (state.freeze.active) {
    const title = '主动买入停止：冻结条件触发';
    const body = [
      `原因：${state.freeze.reason}`,
      `已买入纳指：${fmtCny(invested)} 元`,
      `40%目标：${fmtCny(Math.round(targets.activeTarget))} 元`,
      `月度现金流：¥${fmtCny(cfg.monthlyCashflowCny)}，冻结期全进其他现金`,
    ].join('\n\n');
    const pushRet = await push(cfg, { title, body });
    logEvent({ type: 'weekly_active_frozen', pushRet, invested, targets });
    return;
  }

  if (anyDrawdownPending) {
    const title = '本周主动加仓跳过：回撤规则优先';
    const body = '本周已触发回撤档位提醒，按纪律：优先执行回撤规则，本周不再额外加仓。';
    const pushRet = await push(cfg, { title, body });
    logEvent({ type: 'weekly_active_skipped_due_to_drawdown', pushRet });
    return;
  }

  const minCny = Number(cfg.weeklyActiveBuy.minCny);
  const maxCny = Number(cfg.weeklyActiveBuy.maxCny);
  const amount = Math.min(maxCny, remaining);

  if (remaining <= 0 || amount < minCny) {
    const title = '主动建仓完成：已接近或达到 40%';
    const body = [
      `已买入纳指：${fmtCny(invested)} 元`,
      `40%目标：${fmtCny(Math.round(targets.activeTarget))} 元`,
      `停止所有主动买入；月度 ¥${fmtCny(cfg.monthlyCashflowCny)} 全进其他现金。`
    ].join('\n\n');
    const pushRet = await push(cfg, { title, body });
    logEvent({ type: 'weekly_active_done', pushRet, invested, targets });
    return;
  }

  const title = '本周主动建仓提醒：按上限一次买入';
  const body = [
    `工具：513100`,
    `本周建议买入：${fmtCny(amount)} 元（单周范围 ${fmtCny(minCny)}–${fmtCny(maxCny)}）`,
    `当前已买入：${fmtCny(invested)} 元`,
    `40%目标：${fmtCny(Math.round(targets.activeTarget))} 元`,
    `执行后运行：node src/cli.js exec weekly ${amount}`
  ].join('\n\n');
  const pushRet = await push(cfg, { title, body });
  logEvent({ type: 'weekly_active_reminder', pushRet, amount, invested, targets });
};

module.exports = {
  marketCheck,
  tryRealtimeDrawdownAlert,
  weeklyActiveReminder,
  ensureFreezeState,
};

