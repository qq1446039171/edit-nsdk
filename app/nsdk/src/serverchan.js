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

// 发送一条推送：title 映射为 text，body 映射为 desp
const sendServerChan = async ({ envPath, sendKey, title, body }) => {
  let resolved = null;
  if (!sendKey && envPath) {
    const ret = loadSendKeyFromEnvFile(envPath);
    sendKey = ret.sendKey;
    resolved = ret.resolved;
    if (!sendKey) return { ok: false, status: 0, text: `${ret.reason}:${resolved}` };
  }

  if (!sendKey) return { ok: false, status: 0, text: 'sendkey_missing' };

  let url;
  try {
    url = buildSendUrl(sendKey);
  } catch (err) {
    return { ok: false, status: 0, text: `bad_sendkey:${String(err?.message || err)}` };
  }

  try {
    const params = new URLSearchParams({ text: title, desp: body || '' });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    return { ok: false, status: 0, text: `fetch_error:${String(err?.message || err)}` };
  }
};

module.exports = {
  sendServerChan,
};

