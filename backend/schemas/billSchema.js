import { z } from 'zod';
import {
  SUPPORTED_CURRENCIES,
  coerceAmount,
  coerceConfidence,
  coerceIsoDate,
  roundMoney,
} from '../utils/billCalculations.js';

/**
 * Zod schema for the structured bill payload.
 *
 * Two deliberate relaxations, both followed by an explicit warning rather than a
 * silent fix:
 *   - `total` is declared non-nullable in the API contract, but an unreadable
 *     total degrades to 0 plus a warning instead of failing the whole scan.
 *   - `suggestedCategory` is resolved against the user's real categories after
 *     parsing, so an unmatched guess falls back instead of 400-ing.
 */

const nullableString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const trimmed = String(v).trim();
    return trimmed === '' ? null : trimmed.slice(0, 300);
  });

const nullableAmount = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    const num = coerceAmount(v);
    return num === null ? null : roundMoney(num);
  });

export const billItemSchema = z.object({
  description: z
    .string()
    .optional()
    .transform((v) => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 300) : 'Item')),
  quantity: nullableAmount,
  unitPrice: nullableAmount,
  lineTotal: nullableAmount,
});

export const billScanSchema = z.object({
  vendor: z
    .string()
    .optional()
    .transform((v) => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 200) : 'Unknown vendor')),
  invoiceNumber: nullableString,
  issueDate: z
    .union([z.string(), z.null()])
    .optional()
    .transform(coerceIsoDate),
  dueDate: z
    .union([z.string(), z.null()])
    .optional()
    .transform(coerceIsoDate),
  currency: z
    .union([z.enum(SUPPORTED_CURRENCIES), z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (typeof v !== 'string') return null;
      const upper = v.trim().toUpperCase();
      return SUPPORTED_CURRENCIES.includes(upper) ? upper : null;
    }),
  items: z
    .array(billItemSchema)
    .optional()
    .transform((v) => (Array.isArray(v) ? v : [])),
  subtotal: nullableAmount,
  tax: nullableAmount,
  discount: nullableAmount,
  total: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      const num = coerceAmount(v);
      return num === null ? 0 : roundMoney(num);
    }),
  suggestedCategory: z
    .string()
    .optional()
    .transform((v) => (typeof v === 'string' ? v.trim().slice(0, 60) : '')),
  confidence: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => roundMoney(coerceConfidence(v))),
  warnings: z
    .array(z.string())
    .optional()
    .transform((v) => (Array.isArray(v) ? v.map((w) => String(w).slice(0, 300)) : [])),
});

/**
 * Normalizes and validates raw model output into the exact documented contract.
 *
 * @param {unknown} raw Parsed JSON from Gemini.
 * @returns {{ ok: true, data: object } | { ok: false, error: string, issues: object[] }}
 */
export const parseBillScanResult = (raw) => {
  const result = billScanSchema.safeParse(raw);

  if (!result.success) {
    return {
      ok: false,
      error: 'The AI bill reader returned an unexpected structure.',
      issues: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  return { ok: true, data: result.data };
};

/**
 * JSON Schema sent to Gemini as `responseSchema` so the model is constrained to
 * the contract instead of free-text prose.
 *
 * Note: this is the OpenAPI subset Gemini accepts, which has no `nullable`
 * keyword. Nullable fields are therefore omitted from `required` (so the model
 * may skip them) and described as "null when absent". `parseBillScanResult`
 * restores the exact `string | null` shape on the way back in.
 */
export const GEMINI_BILL_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    vendor: {
      type: 'string',
      description:
        'Company or shop name that issued the bill. Use "Unknown vendor" if it cannot be read.',
    },
    invoiceNumber: {
      type: 'string',
      description:
        'Invoice, bill, receipt or reference number exactly as printed. Omit if not present on the document.',
    },
    issueDate: {
      type: 'string',
      description:
        'Date the bill was issued as YYYY-MM-DD. Omit if not present. Do not guess from a due date.',
    },
    dueDate: {
      type: 'string',
      description: 'Payment due date as YYYY-MM-DD. Omit if the bill shows none.',
    },
    currency: {
      type: 'string',
      enum: SUPPORTED_CURRENCIES,
      description:
        'ISO currency code. Use PKR for "Rs.", "Rs", "PKR", "₨", or Pakistani utility bills. Omit if the bill states no currency.',
    },
    items: {
      type: 'array',
      description: 'Every line item on the bill. Empty array if the bill has no itemized list.',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Item name or service as printed.' },
          quantity: {
            type: 'number',
            description: 'Quantity billed, as a plain number. Omit if not shown.',
          },
          unitPrice: {
            type: 'number',
            description: 'Price per unit as a plain number. Omit if not shown.',
          },
          lineTotal: {
            type: 'number',
            description: 'Total for this line as a plain number. Omit if not shown.',
          },
        },
        required: ['description'],
      },
    },
    subtotal: {
      type: 'number',
      description:
        'Subtotal / net amount / taxable value before tax and discount, as a plain number. Omit if absent.',
    },
    tax: {
      type: 'number',
      description:
        'Total tax, including GST, VAT, sales tax, withholding or provincial tax. Omit if none is shown.',
    },
    discount: {
      type: 'number',
      description:
        'Total discount, rebate or "bijay" amount subtracted before tax. Omit if none is shown.',
    },
    total: {
      type: 'number',
      description: 'Grand total actually payable, as a plain number. Never include a currency symbol.',
    },
    suggestedCategory: {
      type: 'string',
      description:
        'The single best matching category name from the provided list of allowed categories. Copy it exactly.',
    },
    confidence: {
      type: 'number',
      description:
        'Overall confidence in the extraction from 0 to 1, where 1 means every field was clearly legible.',
    },
    warnings: {
      type: 'array',
      description:
        'Short notes about anything unclear, cropped, or contradictory on the document. Empty array if everything was legible.',
      items: { type: 'string' },
    },
  },
  required: ['vendor', 'items', 'total', 'suggestedCategory', 'confidence', 'warnings'],
};