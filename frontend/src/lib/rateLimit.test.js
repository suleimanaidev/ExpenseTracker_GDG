import { describe, expect, it } from 'vitest';
import { formatWait, rateLimitMessage } from './rateLimit';

describe('formatWait', () => {
  it('speaks in seconds, minutes and hours, rounding up', () => {
    expect(formatWait(1)).toBe('1 second');
    expect(formatWait(45)).toBe('45 seconds');
    expect(formatWait(60)).toBe('1 minute');
    expect(formatWait(61)).toBe('2 minutes');
    expect(formatWait(15 * 60)).toBe('15 minutes');
    expect(formatWait(3601)).toBe('2 hours');
  });

  it('never says zero', () => {
    expect(formatWait(0)).toBe('1 second');
    expect(formatWait(undefined)).toBe('1 second');
  });
});

describe('rateLimitMessage', () => {
  it('includes the wait when it is known', () => {
    expect(rateLimitMessage(300)).toBe('Too many attempts, try again in 5 minutes.');
  });

  it('still reads well when it is not', () => {
    expect(rateLimitMessage(0)).toMatch(/wait a moment/);
  });
});
