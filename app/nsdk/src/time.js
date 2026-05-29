const getParts = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date);

  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  const ymd = `${map.year}-${map.month}-${map.day}`;
  const hm = `${map.hour}:${map.minute}`;
  return {
    ...map,
    ymd,
    hm,
  };
};

const isWeekday = (weekdayShort) => {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekdayShort);
};

module.exports = {
  getParts,
  isWeekday,
};

