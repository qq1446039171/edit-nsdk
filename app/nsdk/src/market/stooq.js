const parseNumber = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
};

const detectDelimiter = (text) => {
  const lines = String(text).split(/\r?\n/).filter(Boolean);
  const first = lines[0] || '';
  if (first.includes(';')) return ';';
  return ',';
};

const parseDailyCsv = (text) => {
  const delimiter = detectDelimiter(text);
  const lines = String(text).split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) throw new Error('Empty CSV');

  const headerCols = lines[0].split(delimiter).map(s => s.trim().toLowerCase());
  const hasHeader = headerCols[0] === 'date';
  const startIndex = hasHeader ? 1 : 0;
  const rows = [];

  for (let i = startIndex; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(s => s.trim());
    if (cols.length < 5) continue;
    const [date, open, high, low, close, volume] = cols;
    rows.push({
      date,
      open: parseNumber(open),
      high: parseNumber(high),
      low: parseNumber(low),
      close: parseNumber(close),
      volume: parseNumber(volume),
    });
  }

  return rows.filter(r => r.date && r.close !== null);
};

const getText = async (url) => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'text/csv,text/plain,*/*',
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.text();
};

const normalizeSymbol = (symbol) => {
  const s = String(symbol || '').trim();
  const up = s.toUpperCase();
  if (up === 'QQQ') return 'QQQ.US';
  if (up === 'IXIC' || up === '^IXIC') return '^NDQ';
  if (up === 'NDX' || up === '^NDX') return '^NDX';
  return s;
};

const getLatestDaily = async (symbol) => {
  const sym = normalizeSymbol(symbol);
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d&c=5`;
  const text = await getText(url);
  const rows = parseDailyCsv(text);
  if (rows.length === 0) throw new Error('No data');
  const last = rows[rows.length - 1];
  const prev = rows.length >= 2 ? rows[rows.length - 2] : null;
  const pct = prev && prev.close ? ((last.close - prev.close) / prev.close) * 100 : null;
  return {
    symbol: sym,
    date: last.date,
    close: last.close,
    pct,
  };
};

const getOneYearHighDaily = async (symbol) => {
  const sym = normalizeSymbol(symbol);
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d&c=300`;
  const text = await getText(url);
  const rows = parseDailyCsv(text);
  if (rows.length === 0) throw new Error('No data');
  const tail = rows.slice(-260);
  let maxHigh = -Infinity;
  let maxDay = null;
  for (const r of tail) {
    if (r.high !== null && r.high > maxHigh) {
      maxHigh = r.high;
      maxDay = r.date;
    }
  }
  if (!Number.isFinite(maxHigh)) throw new Error('Invalid high');
  return { maxHigh, maxDay, points: tail.length };
};

module.exports = {
  getLatestDaily,
  getOneYearHighDaily,
  _parseDailyCsv: parseDailyCsv,
  _normalizeSymbol: normalizeSymbol,
};

