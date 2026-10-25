import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './motion';

const NUMBER = /-?\d[\d,]*(?:\.\d+)?/;

/**
 * Splits a formatted figure such as "PKR 27,300" into its first number and the
 * text around it, so the digits can animate while the currency symbol, the sign
 * and any suffix stay exactly as the caller formatted them.
 */
function split(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(NUMBER);
  if (!match) return null;

  const raw = match[0];
  const number = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(number)) return null;

  return {
    prefix: value.slice(0, match.index),
    suffix: value.slice(match.index + raw.length),
    number,
    decimals: raw.includes('.') ? raw.split('.')[1].length : 0,
  };
}

// Matches formatCurrency(), which groups digits the Indian way (1,00,000).
const render = (parts, number) =>
  `${parts.prefix}${number.toLocaleString('en-IN', {
    minimumFractionDigits: parts.decimals,
    maximumFractionDigits: parts.decimals,
  })}${parts.suffix}`;

/**
 * Counts a formatted figure up (or down) to its value, the way a banking app
 * settles a balance. Plays on first show and again whenever the value changes,
 * so adding an expense visibly moves the total. Values that contain no number
 * are returned untouched, and reduced motion skips the animation entirely.
 */
export function useCountUp(value, duration = 750) {
  const shown = useRef(null);
  const frame = useRef(0);

  const [display, setDisplay] = useState(() => {
    const parts = split(value);
    return parts && !prefersReducedMotion() ? render(parts, 0) : value;
  });

  useEffect(() => {
    const parts = split(value);

    if (!parts || prefersReducedMotion()) {
      shown.current = parts ? parts.number : null;
      setDisplay(value);
      return undefined;
    }

    const from = shown.current ?? 0;
    const to = parts.number;

    if (from === to) {
      setDisplay(value);
      return undefined;
    }

    const started = performance.now();

    const tick = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const current = from + (to - from) * eased;
      shown.current = current;

      if (progress < 1) {
        setDisplay(render(parts, current));
        frame.current = requestAnimationFrame(tick);
      } else {
        shown.current = to;
        setDisplay(value);
      }
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, duration]);

  return display;
}
