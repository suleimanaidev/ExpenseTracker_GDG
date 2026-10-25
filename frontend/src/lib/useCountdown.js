import { useEffect, useState } from 'react';

/**
 * Seconds left until a timestamp (ms), re-rendering once a second while it counts
 * down. Zero means "not blocked". Used to disable a button briefly after the server
 * says "too many requests", instead of letting people hammer it.
 */
export function useCountdown(until) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!until || until <= Date.now()) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [until]);

  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}
