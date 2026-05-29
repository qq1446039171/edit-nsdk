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
  loadState,
  saveState,
};

