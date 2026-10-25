import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeAmount, resolveRelativeDate } from '../utils/aiInput.js';
import { validateExpenseProposal, validateBillProposal } from '../schemas/aiProposalSchema.js';
import { generateAIChatProposal } from '../services/aiService.js';

const originalGeminiKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
});

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

  it('sends chat proposals to the configured Gemini model endpoint', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Ready.' }] } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateAIChatProposal({
      question: 'How much did I spend?',
      systemInstruction: 'Answer from the ledger.',
      categories: ['Other'],
    });

    expect(result).toMatchObject({ answers: 'Ready.', isFallback: false });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/models/gemini-3.5-flash-lite:generateContent?key=test-key'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
