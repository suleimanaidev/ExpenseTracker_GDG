import { describe, expect, it } from 'vitest';
import { normalizeAmount, resolveRelativeDate } from '../utils/aiInput.js';
import { validateExpenseProposal, validateBillProposal } from '../schemas/aiProposalSchema.js';

describe('AI input helpers', () => {
  it('normalizes common local amounts', () => {
    expect(normalizeAmount('3k')).toBe(3000);
    expect(normalizeAmount('1.5k')).toBe(1500);
    expect(normalizeAmount('dedh hazar')).toBe(1500);
    expect(normalizeAmount('do sau')).toBe(200);
  });

  it('resolves relative dates', () => {
    expect(resolveRelativeDate('kal', new Date('2026-10-03T12:00:00Z'))).toBe('2026-10-02');
    expect(resolveRelativeDate('aaj', new Date('2026-10-03T12:00:00Z'))).toBe('2026-10-03');
  });

  it('rejects invalid and unknown proposal categories safely', () => {
    const proposal = validateExpenseProposal({
      items: [{ amount: '200', category: 'Unknown', note: 'chai', confidence: 0.4 }],
    }, ['Food & Dining']);
    expect(proposal.items[0].category).toBeNull();
  });

  it('adds a bill arithmetic warning instead of silently changing totals', () => {
    const proposal = validateBillProposal({
      vendor: 'Shop',
      currency: 'PKR',
      items: [{ description: 'Item', quantity: 1, unitPrice: 100, lineTotal: 100 }],
      subtotal: 100,
      tax: 0,
      discount: 0,
      total: 500,
      suggestedCategory: 'Other',
      confidence: 0.8,
    }, ['Other']);
    expect(proposal.warnings.length).toBeGreaterThan(0);
  });
});
