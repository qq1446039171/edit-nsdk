/**
 * 运行时状态（持久化到 state.json）
 *
 * state.json 记录三类信息：
 * - lastRunKeys：分钟级去重 key，避免定时器重复执行
 * - drawdownRound：本轮回撤作战快照与档位执行状态（alerted/executed）
 * - freeze：冻结状态（触发后停止主动买入提醒）
 */
const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, '..', 'state.json');

const defaultState = () => {
  return {
    // 例如：market:09:35:2026-01-16:09:35，用于“同一分钟只跑一次”
    lastRunKeys: {},
    // 每个时段的“发送尝试次数”：发送失败时只 +1、不落 lastRunKeys，
    // 让窗口内下一次 cron 自动补发；成功后清零。用于失败补发 + 重试上限。
    pushAttempts: {},
    // 本轮回撤快照（首次到 -10% 时创建），回撤修复后自动清空
    drawdownRound: null,
    // 最近一次行情快照（用于 status 展示）
    lastMarket: null,
    // 冻结开关：满足纪律条件时触发
    freeze: {
      active: false,
      reason: null,
      since: null
    }
  };
};

// 每个时段允许的最大发送尝试次数（含失败）。窗口本身是 ±30 分钟、cron 每 5 分钟，
// 正常最多约 12 次机会；设 6 次上限，避免 ServerChan 硬故障时整段窗口反复烧配额。
const MAX_PUSH_ATTEMPTS_PER_SLOT = 6;

// 是否还应为该时段尝试发送：已成功（落了 lastRunKeys）或已达重试上限则不再尝试。
const shouldAttemptSlot = (state, key, maxAttempts = MAX_PUSH_ATTEMPTS_PER_SLOT) => {
  if (state && state.lastRunKeys && state.lastRunKeys[key]) return false;
  const attempts = (state && state.pushAttempts && state.pushAttempts[key]) || 0;
  return attempts < maxAttempts;
};

// 记一次“尝试发送”（无论成败）。仅累加计数，不落去重 key。
const recordSlotAttempt = (state, key) => {
  if (!state) return;
  state.pushAttempts = state.pushAttempts || {};
  state.pushAttempts[key] = (state.pushAttempts[key] || 0) + 1;
};

// 标记该时段“已成功送达”：落去重 key，并清掉尝试计数。
const markSlotDone = (state, key) => {
  if (!state) return;
  state.lastRunKeys = state.lastRunKeys || {};
  state.lastRunKeys[key] = new Date().toISOString();
  if (state.pushAttempts) delete state.pushAttempts[key];
};

const loadState = () => {
  if (!fs.existsSync(STATE_PATH)) return defaultState();
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
};

const saveState = (state) => {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
};

module.exports = {
  STATE_PATH,
  defaultState,
  loadState,
  saveState,
  MAX_PUSH_ATTEMPTS_PER_SLOT,
  shouldAttemptSlot,
  recordSlotAttempt,
  markSlotDone,
};

