const assert = require('assert');
const { isSlotDue } = require('../src/time');

// isSlotDue(parts, t)：当天已到达目标时间点（now 的分钟数 >= 目标分钟数）即为“到期应发”。
// 用于把“必须落在 ±30 分钟窗口内才发”改为“到点后当天任意运行都补发”，
// 以对抗 GitHub Actions 定时任务延迟/丢弃。parts 由 time.getParts 提供（含 hour/minute）。

const P = (hh, mm) => ({ hour: String(hh).padStart(2, '0'), minute: String(mm).padStart(2, '0') });

// 未到点：不发
assert.strictEqual(isSlotDue(P(9, 59), { hour: 10, minute: 0 }), false, '09:59 未到 10:00，不应发');

// 正好到点：发
assert.strictEqual(isSlotDue(P(10, 0), { hour: 10, minute: 0 }), true, '10:00 到点应发');

// 窗口内（+15 分钟）：发
assert.strictEqual(isSlotDue(P(10, 15), { hour: 10, minute: 0 }), true, '10:15 应发');

// 大幅延迟（+95 分钟，旧的 ±30 窗口会漏掉）：仍应补发
assert.strictEqual(isSlotDue(P(11, 35), { hour: 10, minute: 0 }), true, '11:35 严重延迟仍应补发 10:00 的槽');

// 下午严重延迟补发 14:00
assert.strictEqual(isSlotDue(P(15, 27), { hour: 14, minute: 0 }), true, '15:27 应补发 14:00 的槽');

// 14:00 槽在 11:35 时尚未到点：不发（避免提前发下午的）
assert.strictEqual(isSlotDue(P(11, 35), { hour: 14, minute: 0 }), false, '11:35 未到 14:00，不应发下午槽');

// 边界：目标分钟解析
assert.strictEqual(isSlotDue(P(14, 0), { hour: 14, minute: 0 }), true, '14:00 到点应发');
assert.strictEqual(isSlotDue(P(13, 59), { hour: 14, minute: 0 }), false, '13:59 未到 14:00');

// 非法输入：不发（保守）
assert.strictEqual(isSlotDue({ hour: 'x', minute: 'y' }, { hour: 10, minute: 0 }), false, '非法时间不发');
assert.strictEqual(isSlotDue(P(10, 0), { hour: NaN, minute: 0 }), false, '非法目标不发');

console.log('ok - isSlotDue 到点即补发，未到点不发');
console.log('slot-due.test.js: all assertions passed');
