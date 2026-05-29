const assert = require('assert');
const { buildTierTable, nextTierToTrigger } = require('./plan');
const { _parseDailyCsv, _normalizeSymbol } = require('./market/stooq');
const { _resolveFinnhubInstrument, _displayBenchmarkCode } = require('./market/finnhub');

const main = () => {
  const levels = [10, 15, 20, 25];
  const table = buildTierTable(42000, levels);
  assert.deepStrictEqual(table.map(x => x.amountCny), [8400, 12600, 12600, 8400]);
  assert.strictEqual(table.reduce((s, x) => s + x.amountCny, 0), 42000);

  const round = {
    table,
    alerted: { '10': false, '15': false, '20': false, '25': false },
    executed: { '10': false, '15': false, '20': false, '25': false },
  };

  assert.strictEqual(nextTierToTrigger(9.9, round), null);
  assert.strictEqual(nextTierToTrigger(10, round), 10);
  round.alerted['10'] = true;
  assert.strictEqual(nextTierToTrigger(15, round), 15);
  round.executed['15'] = true;
  assert.strictEqual(nextTierToTrigger(20, round), 20);

  assert.strictEqual(_normalizeSymbol('QQQ'), 'QQQ.US');
  assert.strictEqual(_normalizeSymbol('IXIC'), '^NDQ');
  assert.strictEqual(_normalizeSymbol('NDX'), '^NDX');

  assert.strictEqual(_resolveFinnhubInstrument('NDX'), 'QQQ');
  assert.strictEqual(_resolveFinnhubInstrument('^NDX'), 'QQQ');
  assert.strictEqual(_resolveFinnhubInstrument('QQQ'), 'QQQ');
  assert.strictEqual(_displayBenchmarkCode('NDX'), '^NDX');
  assert.strictEqual(_displayBenchmarkCode('QQQ'), 'QQQ.US');

  const csvComma = [
    'Date,Open,High,Low,Close,Volume',
    '2026-01-20,1,2,0.5,1.5,100',
  ].join('\n');
  const parsedComma = _parseDailyCsv(csvComma);
  assert.deepStrictEqual(parsedComma, [{ date: '2026-01-20', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }]);

  const csvSemi = [
    'Date;Open;High;Low;Close;Volume',
    '2026-01-20;1;2;0.5;1.5;100',
  ].join('\n');
  const parsedSemi = _parseDailyCsv(csvSemi);
  assert.deepStrictEqual(parsedSemi, [{ date: '2026-01-20', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }]);
};

main();
console.log('OK');
