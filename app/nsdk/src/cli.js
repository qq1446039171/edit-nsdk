/**
 * 命令行工具（用于“确认你已执行”，保证纪律可落地）
 *
 * 为什么需要 cli：
 * - 程序不会也不应该替你下单
 * - 但纪律要求“每档只触发一次”，所以必须有一个“人工确认入口”把 executed 写入 Config/settings.json
 *
 * 常用：
 * - status：查看当前配置/状态/回撤轮
 * - set：更新你人工维护的持仓与备用金
 * - exec：确认你已完成某次买入（tier/weekly）
 */
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config');
const { loadState } = require('./state');
const { logEvent } = require('./logger');
const { computeTargets } = require('./plan');

const resolveSettingsPath = () => {
  if (process.env.SETTINGS_PATH) return path.resolve(process.env.SETTINGS_PATH);
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  return path.join(repoRoot, 'Config', 'settings.json');
};

const loadSettings = () => {
  const p = resolveSettingsPath();
  const raw = fs.readFileSync(p, 'utf8');
  return { path: p, json: JSON.parse(raw) };
};

const saveSettings = (filePath, json) => {
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
};

// 输出当前全貌（你主要看 targets / freeze / drawdownRound / lastMarket）
const cmdStatus = () => {
  const cfg = loadConfig();
  const state = loadState();
  const targets = computeTargets(cfg);

  const out = {
    fund: cfg.fund,
    benchmark: cfg.benchmark,
    timezone: cfg.timezone,
    portfolio: cfg.portfolio,
    targets,
    freeze: state.freeze,
    drawdownRound: state.drawdownRound,
    lastMarket: state.lastMarket,
  };
  console.log(JSON.stringify(out, null, 2));
};

// 更新人工输入项：已买入市值/备用金/怕踏空标记
const cmdSet = (args) => {
  const { path: settingsPath, json: settings } = loadSettings();

  const updates = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--invested') updates.investedNasdaqCny = Number(args[++i]);
    else if (a === '--reserve') updates.reserveCashNasdaqCny = Number(args[++i]);
    else if (a === '--fomo') updates.fearOfMissingOut = String(args[++i]) === 'true';
  }

  settings.portfolio = { ...(settings.portfolio || {}), ...updates };
  saveSettings(settingsPath, settings);
  logEvent({ type: 'config_update', updates });
  console.log('OK');
};

// 人工确认入口：把“已执行”写入 Config/settings.json，防止重复触发
const cmdExec = (args) => {
  const state = loadState();

  const kind = args[0];
  if (kind === 'tier') {
    const tier = String(args[1] || '');
    const cfg = loadConfig();
    const allowed = new Set((cfg.drawdownLevels || []).map((v) => String(v)));
    if (!allowed.has(tier)) throw new Error('Invalid tier');

    const { path: settingsPath, json: settings } = loadSettings();
    settings.drawdown = settings.drawdown || {};
    settings.drawdown.executedLevels = settings.drawdown.executedLevels || {};
    settings.drawdown.executedLevels[tier] = true;
    saveSettings(settingsPath, settings);

    const amountCny = state.drawdownRound?.table?.find((x) => String(x.level) === tier)?.amountCny || null;
    logEvent({ type: 'tier_executed', tier, amountCny });
    console.log('OK');
    return;
  }

  if (kind === 'weekly') {
    const amount = Number(args[1]);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid amount');
    const { path: settingsPath, json: settings } = loadSettings();
    const prev = Number(settings?.portfolio?.investedNasdaqCny);
    const next = (Number.isFinite(prev) ? prev : 0) + amount;
    settings.portfolio = settings.portfolio || {};
    settings.portfolio.investedNasdaqCny = next;
    saveSettings(settingsPath, settings);
    logEvent({ type: 'weekly_executed', amount, investedNasdaqCny: next });
    console.log('OK');
    return;
  }

  throw new Error('Usage: node src/cli.js exec tier <level> | weekly <amount>');
};

const main = () => {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = argv.slice(1);

  if (cmd === 'status') return cmdStatus();
  if (cmd === 'set') return cmdSet(args);
  if (cmd === 'exec') return cmdExec(args);

  console.error('Commands:');
  console.error('  node src/cli.js status');
  console.error('  node src/cli.js set --invested <cny> --reserve <cny> --fomo <true|false>');
  console.error('  node src/cli.js exec tier <level>');
  console.error('  node src/cli.js exec weekly <amount>');
  process.exitCode = 1;
};

main();

