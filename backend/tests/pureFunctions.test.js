import { describe, it, expect } from 'vitest';
import {
  amountToMinor,
  minorToAmount,
  calculateBudgetStatus,
  calculateSafeToSpendToday,
  estimateRunwayDate,
} from '../utils/financeCalculations.js';

describe('Financial Calculations (Pure Functions)', () => {
  it('converts amounts to minor units correctly and eliminates float issues', () => {
    expect(amountToMinor(12.34)).toBe(1234);
    expect(amountToMinor('50.75')).toBe(5075);
    expect(amountToMinor(0)).toBe(0);
    expect(minorToAmount(1234)).toBe(12.34);
    expect(minorToAmount(5075)).toBe(50.75);
  });

  it('throws on negative or invalid amount in amountToMinor', () => {
    expect(() => amountToMinor(-10)).toThrow();
    expect(() => amountToMinor('abc')).toThrow();
  });

  it('calculates budget status correctly when within budget', () => {
    const status = calculateBudgetStatus(30000, 50000);
    expect(status.exceeded).toBe(false);
    expect(status.remaining).toBe(20000);
    expect(status.percentUsed).toBe(60);
    expect(status.warning).toBeNull();
  });

  it('calculates budget status correctly when exceeding budget', () => {
    const status = calculateBudgetStatus(55000, 50000);
    expect(status.exceeded).toBe(true);
    expect(status.remaining).toBe(-5000);
    expect(status.percentUsed).toBe(100);
    expect(status.warning).toContain('Warning: You have exceeded your monthly budget');
  });

  it('calculates safe to spend today accurately', () => {
    // 10,000 remaining with 5 days left -> 2,000 / day
    expect(calculateSafeToSpendToday(10000, 5)).toBe(2000);
    // Over budget (negative remaining) -> 0
    expect(calculateSafeToSpendToday(-2000, 5)).toBe(0);
    // 0 days left falls back safely to 1
    expect(calculateSafeToSpendToday(500, 0)).toBe(500);
  });

  it('estimates budget runway date when spending exceeds daily rate', () => {
    // Current day 10, spent 30,000 out of 50,000 budget (3,000/day).
    // Budget exhausted on day 16 (50,000 / 3,000 ≈ 16)
    const baseDate = new Date(2026, 9, 10); // Oct 10, 2026
    const runway = estimateRunwayDate(50000, 30000, 10, 31, baseDate);
    expect(runway).toBeDefined();
    expect(typeof runway).toBe('string');
  });

  it('returns within budget when burn rate will not exhaust monthly budget', () => {
    const baseDate = new Date(2026, 9, 10);
    const runway = estimateRunwayDate(100000, 10000, 10, 31, baseDate);
    expect(runway).toBe('Within budget this month');
  });
});
