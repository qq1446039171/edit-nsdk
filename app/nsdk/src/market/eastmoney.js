/**
 * 行情数据来源：东方财富（Eastmoney）公开接口
 *
 * 本模块只负责两件事：
 * - 获取 513100 最新价（用于 current）
 * - 获取近 1 年交易日 K 线里的最高价（作为“近1年高点锚点”）
 *
 * 备注：
 * - 部分字段会以 “价格*1000” 或 “涨跌幅*100” 的形式返回，因此需要 normalize
 * - 这里只用到最少字段，避免接口变动带来额外噪音
 */
const parseNumber = (n) => {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  if (Number.isNaN(v)) return null;
  return v;
};

// 东财有时返回价格为“真实值 * 1000”（例如 1904 -> 1.904），这里做兼容
const normalizePrice = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) > 1000) return n / 1000;
  return n;
};

// 东财涨跌幅字段有时是“真实值 * 100”（例如 16 -> 0.16），这里做兼容
const normalizePct = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) > 10) return n / 100;
  return n;
};

const getJson = async (url) => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json,text/plain,*/*',
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
};

// 最新价接口：f43=最新价，f58=名称，f170=涨跌幅
const getLatestPrice = async (secid) => {
  const fields = ['f43', 'f58', 'f170', 'f60'].join(',');
  const url = `https://push2.eastmoney.com/api/qt/stock/get?ut=fa5fd1943c7b386f172d6893dbfba10b&secid=${encodeURIComponent(secid)}&fields=${fields}`;
  const json = await getJson(url);
  const d = json?.data;
  const priceRaw = d?.f43;
  const price = normalizePrice(parseNumber(priceRaw));
  const name = d?.f58 || null;
  const pct = normalizePct(parseNumber(d?.f170));
  return {
    name,
    price,
    pct,
    raw: d || null,
  };
};

// K线接口：klt=101（日K），lmt=260（最近约 1 年交易日），取每条的 high 列做最大值
const getOneYearHigh = async (secid) => {
  const fields1 = 'f1,f2,f3,f4,f5,f6';
  const fields2 = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61';
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?ut=fa5fd1943c7b386f172d6893dbfba10b&secid=${encodeURIComponent(secid)}&fields1=${fields1}&fields2=${fields2}&klt=101&fqt=1&beg=0&end=20500101&lmt=260`;
  const json = await getJson(url);
  const klines = json?.data?.klines;
  if (!Array.isArray(klines) || klines.length === 0) {
    throw new Error('No kline data');
  }
  let maxHigh = -Infinity;
  let maxDay = null;
  for (const row of klines) {
    const cols = String(row).split(',');
    const day = cols[0];
    const high = parseNumber(cols[4]);
    if (high !== null && high > maxHigh) {
      maxHigh = high;
      maxDay = day;
    }
  }
  if (!Number.isFinite(maxHigh)) throw new Error('Invalid high');
  return { maxHigh, maxDay, points: klines.length };
};

module.exports = {
  getLatestPrice,
  getOneYearHigh,
};

