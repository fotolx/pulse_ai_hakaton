export function dateOffset(base, days) {
  const date = new Date(`${base}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function eventDateRange(period, today, from, to) {
  if (period === 'today') return { from: today, to: today };
  if (period === 'week') return { from: dateOffset(today, 6), to: today };
  if (period === 'month') return { from: dateOffset(today, 29), to: today };
  return { from, to };
}

export function isWithinEventDateRange(date, range) {
  return Boolean(range.from && range.to && range.from <= range.to && date >= range.from && date <= range.to);
}
