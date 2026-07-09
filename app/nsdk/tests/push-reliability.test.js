const assert = require('assert');
const { interpretServerChanResponse } = require('../src/serverchan');
const {
  shouldAttemptSlot,
  recordSlotAttempt,
  markSlotDone,
  defaultState,
} = require('../src/state');

// ============ interpretServerChanResponse：识别 ServerChan 真实成败 ============
// ServerChan 配额用尽时会返回 HTTP 200 + 非 0 的 code，只看 res.ok 会误判成功。
(() => {
  const okResp = interpretServerChanResponse({
    httpOk: true,
    status: 200,
    text: '{"code":0,"message":"","data":{"pushid":"x","errno":0}}',
  });
  assert.strictEqual(okResp.ok, true, 'code=0 应判成功');
  assert.strictEqual(okResp.code, 0, '应解析出 code=0');

  const quotaResp = interpretServerChanResponse({
    httpOk: true,
    status: 200,
    text: '{"code":40001,"message":"今日推送数量已达上限"}',
  });
  assert.strictEqual(quotaResp.ok, false, 'HTTP200 但 code!=0（配额满）应判失败');
  assert.strictEqual(quotaResp.code, 40001, '应解析出错误 code');

  const badJson = interpretServerChanResponse({ httpOk: true, status: 200, text: 'gateway timeout' });
  assert.strictEqual(badJson.ok, true, '非 JSON 但 HTTP200 时回退按 res.ok 判成功（避免误判重发）');
  assert.strictEqual(badJson.code, null, '无 code 时为 null');

  const http500 = interpretServerChanResponse({ httpOk: false, status: 500, text: '{"code":0}' });
  assert.strictEqual(http500.ok, false, 'HTTP 非 2xx 一律失败');

  console.log('ok - interpretServerChanResponse 正确识别配额满/网络失败/成功');
})();

// ============ 时段重试：失败不落 key（补发）、成功落 key、有重试上限（省配额）============
(() => {
  const state = defaultState();
  const key = 'market:2026-07-09:10:00';

  assert.strictEqual(shouldAttemptSlot(state, key), true, '全新时段应允许尝试');

  // 连续失败：只记 attempt、不落 lastRunKeys → 下一次 cron 仍会补发
  recordSlotAttempt(state, key);
  assert.strictEqual(shouldAttemptSlot(state, key), true, '失败 1 次后仍允许补发');
  assert.strictEqual(state.lastRunKeys[key], undefined, '失败时不应落去重 key');

  // 达到上限后停止尝试（防止硬故障时无限烧配额）
  for (let i = 0; i < 5; i += 1) recordSlotAttempt(state, key); // 累计 6 次
  assert.strictEqual(shouldAttemptSlot(state, key), false, '达到重试上限(6)后当日不再尝试');

  console.log('ok - 失败自动补发 + 重试上限省配额');
})();

(() => {
  const state = defaultState();
  const key = 'market:2026-07-09:14:00';

  recordSlotAttempt(state, key);
  markSlotDone(state, key); // 发送成功

  assert.ok(state.lastRunKeys[key], '成功后应落去重 key');
  assert.strictEqual(state.pushAttempts[key], undefined, '成功后应清掉该时段的尝试计数');
  assert.strictEqual(shouldAttemptSlot(state, key), false, '已成功的时段不再重复发送');

  console.log('ok - 成功落 key 且清理计数、不再重复发送');
})();

console.log('push-reliability.test.js: all assertions passed');
