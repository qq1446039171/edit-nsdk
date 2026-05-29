/**
 * FRED VIX 恐慌指数（近7日）
 *
 * 数据源：美联储经济数据 https://fred.stlouisfed.org/series/VIXCLS
 * 完全免费，无需 Key，直接 GET CSV 即可。
 */

const DEBUG = process.env.DEBUG_VIX === '1';

const log = (...args) => {
  if (DEBUG) console.log('[VIX]', ...args);
};

const getJson = async (url) => {
  log('GET', url);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/csv,text/plain,*/*',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    log('HTTP error', res.status, text.slice(0, 200));
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const text = await res.text();
  log('Response length', text.length, '| first 100:', text.slice(0, 100));
  return text;
};

const parseNumber = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
};

const getLast7Days = () => {
  const days = [];
  const now = new Date();
  for (let i = 7; i >= 1; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
};

/**
 * 获取最近7个交易日的 VIX 收盘数据。
 * 带重试：首次失败等 3 秒再试一次。
 * @returns {Promise<Array<{date: string, close: number}>>}
 */
const getVixLast7 = async () => {
  const _fetch = async () => {
    // 获取最近有数据的可用日期（周末/节假日 FRED 可能无当天数据）
    const resolveEndDate = async (url) => {
      const text = await getJson(url);
      const lines = String(text).split(/\r?\n/).filter(Boolean);
      if (lines.length <= 1) return null; // 当天无数据
      return lines[lines.length - 1].split(',')[0].trim();
    };

    const today = new Date().toISOString().slice(0, 10);

    // 先尝试当天
    let dataUrl = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS&vintage_date=${today}&cosd=1970-01-01&coed=${today}`;
    let lastAvailableDate = await resolveEndDate(dataUrl);

    // 当天无数据则改为到昨天
    if (!lastAvailableDate) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yest = d.toISOString().slice(0, 10);
      lastAvailableDate = yest;
      dataUrl = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS&vintage_date=${today}&cosd=1970-01-01&coed=${yest}`;
    }

    const startDate = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 10);
      return d.toISOString().slice(0, 10);
    })();

    const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS&vintage_date=${today}&cosd=${startDate}&coed=${lastAvailableDate}`;
    const text = await getJson(url);

    const lines = String(text).split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) throw new Error('Empty VIX data');

    // 过滤掉 date 或 close 无效的行（close=0 或非正数视为异常）
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < 2) continue;
      const date = String(cols[0]).trim();
      const close = parseNumber(cols[1]);
      if (date && close !== null && close > 0) {
        rows.push({ date, close });
      }
    }

    // 取最近 7 条（已按日期升序）
    return rows.slice(-7);
  };

  try {
    return await _fetch();
  } catch (firstErr) {
    log('First attempt failed, retrying in 3s:', firstErr.message);
    await new Promise(resolve => setTimeout(resolve, 3000));
    return await _fetch();
  }
};

module.exports = { getVixLast7 };
