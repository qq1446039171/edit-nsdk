/**
 * Finnhub 行情（免费档可用接口）
 *
 * 免费档无法使用 /stock/candle（会 403），因此：
 * - 最新价、日涨跌幅：GET /api/v1/quote
 * - 高点锚点：GET /api/v1/stock/metric 的 52WeekHigh / 52WeekHighDate（近1年高点）
 *
 * 与原先 Stooq 路径的差异（行为仍按同一套回撤公式计算）：
 * - 高点为「52 周最高」，与“近1年高点”口径基本一致。
 * - 配置为纳指指数（NDX、^NDX 等）时，免费档无可用指数 candle/metric，实际请求 **QQQ**（纳指100 ETF）作为代理，推送里
 *   `code` 仍与 Stooq 约定一致（如 ^NDX），与旧版展示对齐。
 *
 * @see https://finnhub.io/docs/api/quote
 * @see https://finnhub.io/docs/api/stock-metrics
 */

const parseNumber = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
};

const getJson = async (url) => {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = json?.error || text.slice(0, 200);
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return json;
};

/** 实际请求 Finnhub 的美股代码（免费档指数常不可用） */
const resolveFinnhubInstrument = (symbol) => {
  const s = String(symbol || '').trim();
  const up = s.toUpperCase();
  if (up === 'QQQ' || up === 'QQQ.US') return 'QQQ';
  if (up === 'NDX' || up === '^NDX' || up === 'IXIC' || up === '^IXIC' || up === '^NDQ') return 'QQQ';
  return s || 'QQQ';
};

/** 与 stooq.normalizeSymbol 结果对齐，供推送/日志里的 benchmark.code */
const displayBenchmarkCode = (symbol) => {
  const s = String(symbol || '').trim();
  const up = s.toUpperCase();
  if (up === 'QQQ') return 'QQQ.US';
  if (up === 'IXIC' || up === '^IXIC') return '^NDQ';
  if (up === 'NDX' || up === '^NDX') return '^NDX';
  return s;
};

const getLatestDaily = async (token, symbol) => {
  if (!token || !String(token).trim()) throw new Error('Finnhub API key missing');
  const inst = resolveFinnhubInstrument(symbol);
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(inst)}&token=${encodeURIComponent(token)}`;
  const q = await getJson(url);
  if (q.error) throw new Error(String(q.error));
  const close = parseNumber(q.c);
  if (close === null || close <= 0) throw new Error('No data');
  const t = parseNumber(q.t);
  const date = t !== null ? new Date(t * 1000).toISOString().slice(0, 10) : null;
  const pct = parseNumber(q.dp);
  return {
    symbol: displayBenchmarkCode(symbol),
    date,
    close,
    pct,
  };
};

const getOneYearHighDaily = async (token, symbol) => {
  if (!token || !String(token).trim()) throw new Error('Finnhub API key missing');
  const inst = resolveFinnhubInstrument(symbol);
  const url = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(inst)}&metric=all&token=${encodeURIComponent(token)}`;
  const j = await getJson(url);
  if (j.error) throw new Error(String(j.error));
  const high = parseNumber(j.metric?.['52WeekHigh']);
  const maxDay = j.metric?.['52WeekHighDate'] ? String(j.metric['52WeekHighDate']).trim() : null;
  if (high === null) throw new Error('No data');
  return {
    maxHigh: high,
    maxDay: maxDay || null,
    points: 52,
  };
};

module.exports = {
  getLatestDaily,
  getOneYearHighDaily,
  _resolveFinnhubInstrument: resolveFinnhubInstrument,
  _displayBenchmarkCode: displayBenchmarkCode,
};
