const { loadConfig } = require('./config');
const { loadState, saveState } = require('./state');
const { marketCheck, weeklyActiveReminder, tryRealtimeDrawdownAlert } = require('./actions');
const { getParts, isWeekday } = require('./time');

const runKeyForTarget = (parts, name, t) => {
  const hh = String(t.hour).padStart(2, '0');
  const mm = String(t.minute).padStart(2, '0');
  return `${name}:${parts.ymd}:${hh}:${mm}`;
};

const shouldRunOnce = (state, key) => {
  if (state.lastRunKeys[key]) return false;
  state.lastRunKeys[key] = new Date().toISOString();
  return true;
};

const isWithinWindow = (parts, t, windowMinutes) => {
  const h = Number(parts.hour);
  const m = Number(parts.minute);
  const th = Number(t.hour);
  const tm = Number(t.minute);
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(th) || !Number.isFinite(tm)) return false;
  const current = h * 60 + m;
  const target = th * 60 + tm;
  return Math.abs(current - target) <= windowMinutes;
};

const maybeRunDailyMarketCheck = async (cfg, state) => {
  const parts = getParts(new Date(), cfg.timezone);
  if (!isWeekday(parts.weekday)) return false;

  for (const t of cfg.dailyChecks || []) {
    if (!isWithinWindow(parts, t, 30)) continue;
    const key = runKeyForTarget(parts, 'market', t);
    if (state.lastRunKeys[key]) continue;
    const pushed = await marketCheck(cfg, state);
    if (pushed) {
      state.lastRunKeys[key] = new Date().toISOString();
      return true;
    }
  }
  return false;
};

const main = async () => {
  const cfg = loadConfig();
  const state = loadState();

  const mode = process.argv[2] || 'market';
  if (mode === 'once') {
    await marketCheck(cfg, state);
  } else if (mode === 'weekly') {
    await weeklyActiveReminder(cfg, state);
  } else if (mode === 'realtime') {
    try {
      await tryRealtimeDrawdownAlert(cfg, state);
    } catch (err) {
      console.error('[realtime] drawdown alert failed:', err);
    }
    await maybeRunDailyMarketCheck(cfg, state);
  } else {
    const pushed = await maybeRunDailyMarketCheck(cfg, state);
    if (!pushed) {
      console.log('[run-once] current time is outside nsdk.dailyChecks window, skip market push');
    }
  }
  saveState(state);
};

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

