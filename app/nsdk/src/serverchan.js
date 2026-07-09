/**
 * Server酱推送（与 send.js 等价）
 *
 * - 从 .env 文件里读取 SENDKEY（不依赖 process.env，避免环境差异）
 * - 兼容两种 URL 规则：
 *   1) SENDKEY 以 sctp 开头：走 ft07 分流域名
 *   2) 其他：走 sctapi.ftqq.com
 */
const fs = require('fs');
const path = require('path');
const { URLSearchParams } = require('url');

// 只解析我们需要的 .env 格式：KEY=VALUE，并兼容 export KEY=VALUE、单双引号包裹
const parseEnv = (content) => {
  const out = {};
  for (const line of String(content).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    const normalized = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;
    const idx = normalized.indexOf('=');
    if (idx < 0) continue;
    const k = normalized.slice(0, idx).trim();
    let v = normalized.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
};

// 从 envPath 指向的文件里读取 SENDKEY（配置项 serverChan.envPath）
const loadSendKeyFromEnvFile = (envPath) => {
  const resolved = path.resolve(envPath);
  try {
    const raw = fs.readFileSync(resolved, 'utf8');
    const env = parseEnv(raw);
    const sendKey = env.SENDKEY;
    if (!sendKey) return { sendKey: null, resolved, reason: 'sendkey_missing' };
    return { sendKey, resolved, reason: null };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { sendKey: null, resolved, reason: 'env_missing' };
    return { sendKey: null, resolved, reason: `env_read_error:${String(err?.code || 'unknown')}` };
  }
};

// 把 SENDKEY 转换成实际 POST 地址
const buildSendUrl = (sendKey) => {
  const key = String(sendKey);
  if (key.startsWith('sctp')) {
    const m = key.match(/^sctp(\d+)t/);
    if (!m) throw new Error('Invalid sctp SENDKEY');
    return `https://${m[1]}.push.ft07.com/send/${key}.send`;
  }
  return `https://sctapi.ftqq.com/${key}.send`;
};

// 判定 ServerChan 是否“真的送达”。
// 关键：ServerChan 配额用尽/参数错误时会返回 HTTP 200 + 非 0 的 code，
// 只看 res.ok（HTTP 层）会误判成功，导致该条推送被当成已发、不再补发。
// 规则：HTTP 必须 2xx；若响应体能解析出 code 字段则要求 code===0；
//       解析不出 code（非 JSON/网关文本）时回退按 HTTP 状态判定，避免误判成失败而重复发送。
const interpretServerChanResponse = ({ httpOk, status, text }) => {
  let code = null;
  try {
    const j = JSON.parse(text);
    if (j && (j.code !== undefined && j.code !== null)) code = j.code;
  } catch { /* 非 JSON：保持 code=null，走 HTTP 回退 */ }

  const codeOk = code === null || code === 0 || code === '0';
  return { ok: Boolean(httpOk) && codeOk, status, code, text };
};

// 发送一条推送：title 映射为 text，body 映射为 desp
const sendServerChan = async ({ envPath, sendKey, title, body, fetchImpl } = {}) => {
  const doFetch = fetchImpl || fetch;
  let resolved = null;
  if (!sendKey && envPath) {
    const ret = loadSendKeyFromEnvFile(envPath);
    sendKey = ret.sendKey;
    resolved = ret.resolved;
    if (!sendKey) return { ok: false, status: 0, code: null, text: `${ret.reason}:${resolved}` };
  }

  if (!sendKey) return { ok: false, status: 0, code: null, text: 'sendkey_missing' };

  let url;
  try {
    url = buildSendUrl(sendKey);
  } catch (err) {
    return { ok: false, status: 0, code: null, text: `bad_sendkey:${String(err?.message || err)}` };
  }

  try {
    const params = new URLSearchParams({ text: title, desp: body || '' });
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const text = await res.text();
    return interpretServerChanResponse({ httpOk: res.ok, status: res.status, text });
  } catch (err) {
    return { ok: false, status: 0, code: null, text: `fetch_error:${String(err?.message || err)}` };
  }
};

module.exports = {
  sendServerChan,
  interpretServerChanResponse,
};

