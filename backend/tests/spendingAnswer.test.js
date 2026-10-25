import { describe, expect, it } from 'vitest';
import { buildSpendingAnswer, matchCategory } from '../utils/spendingAnswer.js';

const ctx = {
  currency: 'PKR',
  totalSpent: 50000,
  remaining: 0,
  categoryTotals: { 'Food & Dining': 13400, Transport: 6600, Utilities: 30000 },
  categoryCounts: { 'Food & Dining': 5, Transport: 1, Utilities: 2 },
};

describe('buildSpendingAnswer', () => {
  it('answers a category question with that category only', () => {
    const answer = buildSpendingAnswer(ctx, { category: 'Food' }, 'Roman Urdu');
    expect(answer).toContain('Food & Dining');
    expect(answer).toContain('PKR 13,400');
    expect(answer).toContain('5 transactions');
    expect(answer).not.toMatch(/budget|bacha|remaining/i);
    expect(answer).not.toContain('50,000');
  });

  it('uses the singular for one transaction, in English', () => {
    const answer = buildSpendingAnswer(ctx, { category: 'transport' }, 'English');
    expect(answer).toContain('1 transaction,');
    expect(answer).toContain('PKR 6,600');
  });

  it('gives the overall summary only when no category is asked for', () => {
    const answer = buildSpendingAnswer(ctx, {}, 'English');
    expect(answer).toContain('PKR 50,000');
    expect(answer).toContain('remaining');
  });

  it('says so when the category has no spending, without quoting the total', () => {
    const answer = buildSpendingAnswer(ctx, { category: 'Shopping' }, 'English');
    expect(answer).toContain('Shopping');
    expect(answer).not.toContain('50,000');
  });
});

describe('matchCategory', () => {
  it('does not guess when a fragment is ambiguous', () => {
    expect(matchCategory('o', ['Food & Dining', 'Transport'])).toBeNull();
  });
});
