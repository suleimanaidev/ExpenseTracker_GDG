const plural = (count, unit) => `${count} ${unit}${count === 1 ? '' : 's'}`;

/** "45 seconds", "1 minute", "5 minutes", "2 hours": a wait a person can plan around. */
export function formatWait(seconds) {
  const value = Math.max(1, Math.ceil(Number(seconds) || 0));
  if (value < 60) return plural(value, 'second');
  const minutes = Math.ceil(value / 60);
  if (minutes < 60) return plural(minutes, 'minute');
  return plural(Math.ceil(minutes / 60), 'hour');
}

export const rateLimitMessage = (seconds) =>
  seconds > 0
    ? `Too many attempts, try again in ${formatWait(seconds)}.`
    : 'Too many attempts, please wait a moment and try again.';

/** The longest the UI keeps a button disabled; the server message still states the full wait. */
export const COOLDOWN_CAP_SECONDS = 30;
