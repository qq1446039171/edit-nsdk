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
    // 必须用 hourCycle:'h23'，不能用 hour12:false。
    // 部分 Node/ICU（含 GitHub Actions runner）把 hour12:false 解析成 h24 时制：
    // 午夜输出 hour="24" 而不是 "00"，曾导致凌晨 00:04 被当成 24:04≥10:00/14:00 误发推送。
    hourCycle: 'h23',
  }).formatToParts(date);

  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  // 双保险：即使个别环境仍返回 "24"，也规范成 "00"（h24 的 24:xx 即午夜 00:xx）
  if (map.hour === '24') map.hour = '00';

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

// 当天是否已到达目标时间点：now 分钟数 >= 目标分钟数即为“到期应发”。
// 与旧的 isWithinWindow(±30min) 不同：这里只要“到点了”就成立，不设上限，
// 因此 GitHub Actions 严重延迟（如目标 10:00、实际 11:35 才跑）时仍能当天补发。
// 配合带日期的去重 key（同一槽当天只成功发一次），补发不会重复。
const isSlotDue = (parts, t) => {
  let h = Number(parts && parts.hour);
  const m = Number(parts && parts.minute);
  const th = Number(t && t.hour);
  const tm = Number(t && t.minute);
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(th) || !Number.isFinite(tm)) return false;
  if (h === 24) h = 0; // h24 时制的 24:xx 即午夜 00:xx，绝不能视为“已过白天时点”
  return (h * 60 + m) >= (th * 60 + tm);
};

module.exports = {
  getParts,
  isWeekday,
  isSlotDue,
};

