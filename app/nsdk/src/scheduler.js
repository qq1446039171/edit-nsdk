/**
 * 定时调度器（常驻进程）
 *
 * 目标：
 * - 在配置的时间点触发 “例行行情检查/回撤档位提醒”
 * - 在配置的时间点触发 “每周一次主动建仓提醒”
 *
 * 设计要点：
 * - tick 每 30 秒跑一次，但每个分钟内只允许实际执行一次（通过 lastRunKeys 去重）
 * - 使用 settings.json 的 nsdk.timezone 做“上海时间”对齐，避免 Windows 本地时区误差
 */
const { loadConfig } = require('./config');
const { loadState, saveState } = require('./state');
const { getParts, isWeekday } = require('./time');
const { marketCheck, weeklyActiveReminder, tryRealtimeDrawdownAlert } = require('./actions');
const { logEvent } = require('./logger');

// 给每个任务生成“分钟级”唯一 key，确保同一分钟只执行一次
const runKey = (parts, name) => {
  return `${name}:${parts.ymd}:${parts.hm}`;
};

const runKeyForTarget = (parts, name, t) => {
  const hh = String(t.hour).padStart(2, '0');
  const mm = String(t.minute).padStart(2, '0');
  return `${name}:${parts.ymd}:${hh}:${mm}`;
};

// 防抖：同一个 key 只允许运行一次，并把 key 写入 state.json
const shouldRunOnce = (state, key) => {
  if (state.lastRunKeys[key]) return false;
  state.lastRunKeys[key] = new Date().toISOString();
  const keys = Object.keys(state.lastRunKeys);
  if (keys.length > 500) {
    const sorted = keys.sort((a, b) => String(state.lastRunKeys[a]).localeCompare(String(state.lastRunKeys[b])));
    for (const k of sorted.slice(0, 200)) delete state.lastRunKeys[k];
  }
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
  if (current > target) return false;
  return target - current <= windowMinutes;
};

const startupHeartbeat = async (cfg, state) => {
  const enabled = cfg.startupHeartbeatEnabled !== false;
  if (!enabled) return;

  const parts = getParts(new Date(), cfg.timezone);
  const key = `heartbeat:${parts.ymd}`;
  if (!shouldRunOnce(state, key)) return;

  const title = 'NSDK 已启动（心跳）';
  const daily = (cfg.dailyChecks || []).map(t => `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`).join(', ') || 'N/A';
  const weekly = cfg.weeklyActiveBuy ? `${cfg.weeklyActiveBuy.weekday} ${String(cfg.weeklyActiveBuy.hour).padStart(2, '0')}:${String(cfg.weeklyActiveBuy.minute).padStart(2, '0')}` : 'N/A';
  const body = [
    `时间：${parts.ymd} ${parts.hm}（${cfg.timezone}）`,
    `标的：${cfg.fund?.name || ''}（${cfg.fund?.code || ''}）`,
    `例行检查：${daily}（工作日）`,
    `主动建仓提醒：${weekly}`,
    `月度现金流：¥${cfg.monthlyCashflowCny ?? 'N/A'}`,
    `日志目录：${cfg.logDir || 'logs/（默认）'}`
  ].join('\n\n');

  logEvent({ type: 'startup_heartbeat', ymd: parts.ymd, title, body });
};

// 每次 tick：读取当前时间（按 timezone），判断是否到达某个触发点
const tick = async (cfg, state) => {
  const parts = getParts(new Date(), cfg.timezone);

  try {
    await tryRealtimeDrawdownAlert(cfg, state);
  } catch (err) {
    logEvent({ type: 'error', where: 'realtimeDrawdown', message: String(err?.message || err) });
  } finally {
    saveState(state);
  }

  // 工作日两次（或多次）例行检查：用于推送“当前回撤% / 下一档位 / 是否冻结”
  for (const t of cfg.dailyChecks || []) {
    if (!isWeekday(parts.weekday)) continue;
    if (isWithinWindow(parts, t, 30)) {
      const key = runKeyForTarget(parts, 'market', t);
      if (shouldRunOnce(state, key)) {
        try {
          await marketCheck(cfg, state);
        } catch (err) {
          logEvent({ type: 'error', where: 'marketCheck', message: String(err?.message || err) });
        } finally {
          saveState(state);
        }
      }
    }
  }

  // 每周一次主动建仓提醒（阶段一），在冻结或回撤档位待执行时会自动跳过
  const w = cfg.weeklyActiveBuy;
  if (w) {
    const targetWeekday = String(w.weekday || '').trim();
    const targetHour = String(w.hour).padStart(2, '0');
    const targetMinute = String(w.minute).padStart(2, '0');

    if (parts.weekday === targetWeekday && isWithinWindow(parts, w, 30)) {
      const key = runKeyForTarget(parts, `weekly:${targetWeekday}`, w);
      if (shouldRunOnce(state, key)) {
        try {
          await weeklyActiveReminder(cfg, state);
        } catch (err) {
          logEvent({ type: 'error', where: 'weeklyActiveReminder', message: String(err?.message || err) });
        } finally {
          saveState(state);
        }
      }
    }
  }
};

const main = async () => {
  const state = loadState();

  let cfg;
  try {
    cfg = loadConfig();
  } catch (err) {
    logEvent({ type: 'error', where: 'loadConfig', message: String(err?.message || err) });
    cfg = { timezone: 'Asia/Shanghai', fund: {} };
  }

  logEvent({ type: 'scheduler_start', timezone: cfg.timezone, fund: cfg.fund });
  saveState(state);

  try {
    await startupHeartbeat(cfg, state);
  } catch (err) {
    logEvent({ type: 'error', where: 'startupHeartbeat', message: String(err?.message || err) });
  } finally {
    saveState(state);
  }

  let cfgRef = cfg;

  // 常驻：每 30 分钟检查一次是否到触发分钟
  setInterval(() => {
    try {
      tick(cfgRef, state).catch((err) => {
        logEvent({ type: 'error', where: 'tick', message: String(err?.message || err) });
      });
    } catch (err) {
      logEvent({ type: 'error', where: 'tick_outer', message: String(err?.message || err) });
    }
  }, 30 * 60 * 1000);

  // 配置重载：每 5 小时一次
  setInterval(() => {
    try {
      cfgRef = loadConfig();
      logEvent({ type: 'config_reloaded' });
    } catch (err) {
      logEvent({ type: 'error', where: 'reloadConfig', message: String(err?.message || err) });
    }
  }, 5 * 60 * 60 * 1000);
};

main();

