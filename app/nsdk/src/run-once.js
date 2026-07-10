const { loadConfig } = require('./config');
const { loadState, saveState, shouldAttemptSlot, recordSlotAttempt, markSlotDone } = require('./state');
const { marketCheck, weeklyActiveReminder, tryRealtimeDrawdownAlert } = require('./actions');
const { getParts, isWeekday, isSlotDue } = require('./time');

const runKeyForTarget = (parts, name, t) => {
  const hh = String(t.hour).padStart(2, '0');
  const mm = String(t.minute).padStart(2, '0');
  return `${name}:${parts.ymd}:${hh}:${mm}`;
};

const maybeRunDailyMarketCheck = async (cfg, state) => {
  const parts = getParts(new Date(), cfg.timezone);
  if (!isWeekday(parts.weekday)) return false;

  for (const t of cfg.dailyChecks || []) {
    // 到点即补发：只要当天已过目标时间且该槽今天还没成功发过就发，
    // 不再要求落在 ±30 分钟窗口内——对抗 GitHub Actions 定时任务延迟/丢弃。
    if (!isSlotDue(parts, t)) continue;
    const key = runKeyForTarget(parts, 'market', t);
    // 已成功（落 key）或已达重试上限则跳过；否则记一次尝试后发送。
    if (!shouldAttemptSlot(state, key)) continue;
    recordSlotAttempt(state, key);
    const pushed = await marketCheck(cfg, state);
    // 仅当真正送达才落去重 key；失败时不落 key，下一次 cron 自动补发。
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
      console.log('[run-once] no due dailyChecks slot to push (not yet due, or already sent today)');
    }
  }
  saveState(state);
};

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

