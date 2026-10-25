/**
 * Local calendar day as YYYY-MM-DD.
 *
 * `toISOString()` is UTC. In Pakistan (UTC+5) an expense added between midnight
 * and 5 AM was stamped with yesterday's date, so it appeared on the wrong day in
 * the daily chart — and on the 1st of a month it could land in the previous
 * month and vanish from the monthly totals and the AI analysis entirely.
 */
const parseDay = (value) => {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

/** `2024-03-12` as `12 Mar 2024`, or an empty string when there is no date. */
export function formatDay(value) {
  const date = parseDay(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Whole calendar days from today until `value` (negative once it has passed).
 * Compared as local days, so a bill due today is 0 whatever the time is.
 */
export function daysUntil(value, now = new Date()) {
  const due = parseDay(value);
  if (!due) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / 86400000);
}

export function todayLocal(now = new Date()) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}
