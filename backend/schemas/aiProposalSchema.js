import { z } from 'zod';
import { normalizeAmount, resolveRelativeDate } from '../utils/aiInput.js';

const expenseItem = z.object({
  amount: z.union([z.number(), z.string()]).transform(normalizeAmount).refine((value) => value !== null && value > 0 && value <= 1000000000),
  note: z.string().max(500).nullable().optional().transform((value) => value || ''),
  category: z.string().max(50).nullable().optional(),
  date: z.string().max(40).nullable().optional().transform((value) => resolveRelativeDate(value)),
  confidence: z.number().min(0).max(1).optional().default(0.5),
});

export const expenseProposalSchema = z.object({
  items: z.array(expenseItem).min(1).max(20),
});

const billItem = z.object({
  description: z.string().max(300).default(''),
  quantity: z.number().positive().max(10000).default(1),
  unitPrice: z.number().nonnegative().max(1000000000).default(0),
  lineTotal: z.number().nonnegative().max(1000000000).default(0),
});

export const billProposalSchema = z.object({
  vendor: z.string().max(200).default(''),
  invoiceNumber: z.string().max(120).nullable().optional(),
  issueDate: z.string().max(40).nullable().optional().transform((value) => value ? resolveRelativeDate(value) : null),
  dueDate: z.string().max(40).nullable().optional().transform((value) => value ? resolveRelativeDate(value) : null),
  currency: z.enum(['PKR', 'USD', 'EUR', 'GBP', 'INR']).default('PKR'),
  items: z.array(billItem).max(200).default([]),
  subtotal: z.number().nonnegative().nullable().optional(),
  tax: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
  total: z.number().nonnegative(),
  suggestedCategory: z.string().max(50).nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
  warnings: z.array(z.string().max(300)).max(20).default([]),
});

export const validateExpenseProposal = (value, categories) => {
  const parsed = expenseProposalSchema.parse(value);
  const allowed = new Set(categories);
  return {
    items: parsed.items.map((item) => ({
      ...item,
      category: item.category && allowed.has(item.category) ? item.category : null,
      date: resolveRelativeDate(item.date),
    })),
  };
};

export const validateBillProposal = (value, categories) => {
  const parsed = billProposalSchema.parse(value);
  const warnings = [...parsed.warnings];
  if (parsed.items.length > 0 && parsed.total > 0) {
    const lineTotal = parsed.items.reduce((sum, item) => sum + item.lineTotal, 0);
    if (Math.abs(lineTotal + parsed.tax - parsed.discount - parsed.total) > Math.max(parsed.total * 0.01, 1)) {
      warnings.push('The line items do not match the printed total. Review before saving.');
    }
  }
  return {
    ...parsed,
    suggestedCategory: parsed.suggestedCategory && categories.includes(parsed.suggestedCategory) ? parsed.suggestedCategory : null,
    warnings,
  };
};
