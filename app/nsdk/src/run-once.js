const { loadConfig } = require('./config');
const { loadState, saveState, shouldAttemptSlot, recordSlotAttempt, markSlotDone } = require('./state');
const { marketCheck, weeklyActiveReminder, tryRealtimeDrawdownAlert } = require('./actions');
const { getParts, isWeekday } = require('./time');

const runKeyForTarget = (parts, name, t) => {
  const hh = String(t.hour).padStart(2, '0');
  const mm = String(t.minute).padStart(2, '0');
  return `${name}:${parts.ymd}:${hh}:${mm}`;
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
    // 已成功（落 key）或已达重试上限则跳过；否则记一次尝试后发送。
    if (!shouldAttemptSlot(state, key)) continue;
    recordSlotAttempt(state, key);
    const pushed = await marketCheck(cfg, state);
    // 仅当真正送达才落去重 key；失败时不落 key，窗口内下一次 cron 自动补发。
    if (pushed) {
      markSlotDone(state, key);
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

