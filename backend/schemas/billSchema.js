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
  // `false` only when the model says the file is not a bill at all. Left optional
  // so a model that omits the flag does not break an otherwise valid scan; the
  // heuristic in `detectNonBill` covers that case.
  isBillDocument: z.boolean().optional(),
  documentDescription: nullableString,
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
// Amounts are requested as strings, not numbers. With 	ype: number Gemini 3
// sometimes emitted a float with no end ("650.00000000000010214...") and ran to the
// token limit, truncating the whole JSON. A string value ends at its closing quote.
// The Zod schema above already accepts numeric strings and rounds them.
export const GEMINI_BILL_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    isBillDocument: {
      type: 'boolean',
      description:
        'true only if the file is a receipt, bill or invoice. false for anything else (a photo of a person or place, a screenshot, a blank page, an unrelated document).',
    },
    documentDescription: {
      type: 'string',
      description:
        'Only when isBillDocument is false: a short noun phrase for what the file shows, for example "a photo of a beach". Omit for a real bill.',
    },
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
        'ISO currency code of the document: USD for "$", EUR for "€", GBP for "£", INR for "₹", PKR for "Rs.", "Rs", "PKR", "₨" or Pakistani bills. If nothing is printed, infer it from the country, address, phone prefix and tax names, and say so in warnings. Omit only when the currency is outside this list.',
    },
    items: {
      type: 'array',
      description: 'Every line item on the bill. Empty array if the bill has no itemized list.',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Item name or service as printed.' },
          quantity: {
            type: 'string',
            description: 'Quantity billed, as a plain decimal string with at most 2 decimals, for example "1250.50". Omit if not shown.',
          },
          unitPrice: {
            type: 'string',
            description: 'Price per unit as a plain decimal string with at most 2 decimals, for example "1250.50". Omit if not shown.',
          },
          lineTotal: {
            type: 'string',
            description: 'Total for this line as a plain decimal string with at most 2 decimals, for example "1250.50". Omit if not shown.',
          },
        },
        required: ['description'],
      },
    },
    subtotal: {
      type: 'string',
      description:
        'Subtotal / net amount / taxable value before tax and discount, as a plain decimal string with at most 2 decimals, for example "1250.50". Omit if absent.',
    },
    tax: {
      type: 'string',
      description:
        'Total tax, including GST, VAT, sales tax, withholding or provincial tax. Omit if none is shown.',
    },
    discount: {
      type: 'string',
      description:
        'Total discount, rebate or "bijay" amount subtracted before tax. Omit if none is shown.',
    },
    total: {
      type: 'string',
      description: 'Grand total actually payable, as a plain decimal string with at most 2 decimals, for example "1250.50". Never include a currency symbol.',
    },
    suggestedCategory: {
      type: 'string',
      description:
        'The single best matching category name from the provided list of allowed categories. Copy it exactly.',
    },
    confidence: {
      type: 'string',
      description:
        'Overall confidence in the extraction from 0 to 1 as a decimal string with at most 2 decimals (for example "0.85"), where 1 means every field was clearly legible.',
    },
    warnings: {
      type: 'array',
      description:
        'Short notes about anything unclear, cropped, or contradictory on the document. Empty array if everything was legible.',
      items: { type: 'string' },
    },
  },
  required: [
    'isBillDocument',
    'vendor',
    'items',
    'total',
    'suggestedCategory',
    'confidence',
    'warnings',
  ],
};

/** Codes returned when a scan is refused because the file is not a usable bill. */
export const NOT_A_BILL = 'NOT_A_BILL';
export const NOTHING_READABLE = 'NOTHING_READABLE';

const LOW_SIGNAL_CONFIDENCE = 0.3;

/**
 * One short, single-line phrase safe to show back to the user. The description
 * comes from a model that has just read an untrusted file, so it is flattened
 * and capped rather than trusted.
 */
const cleanDescription = (value) => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!]+$/, '')
    .slice(0, 80);
};

/**
 * Decides whether the model's raw output describes a real bill.
 *
 * Two independent signals, so the check holds even if the model forgets the flag:
 *   1. the model says outright that the file is not a bill, or
 *   2. nothing usable was read: no vendor, no total, no items and low confidence.
 *
 * A real bill with an unreadable total is deliberately NOT refused here: it keeps
 * its vendor or items, so the user still gets a draft to correct by hand.
 *
 * @param {unknown} raw Parsed JSON from Gemini, before schema validation.
 * @returns {null | { code: string, error: string, description: string }}
 */
export const detectNonBill = (raw) => {
  if (!raw || typeof raw !== 'object') return null;

  if (raw.isBillDocument === false) {
    const description = cleanDescription(raw.documentDescription);
    return {
      code: NOT_A_BILL,
      description,
      error: description
        ? `This looks like ${description}, not a bill, receipt or invoice, so it was not read. Upload a photo or PDF of the document itself.`
        : 'This does not look like a bill, receipt or invoice, so it was not read. Upload a photo or PDF of the document itself.',
    };
  }

  const vendor = typeof raw.vendor === 'string' ? raw.vendor.trim().toLowerCase() : '';
  const hasVendor = vendor !== '' && vendor !== 'unknown vendor' && vendor !== 'unknown';
  const total = coerceAmount(raw.total);
  const hasTotal = total !== null && total > 0;
  const hasItems = Array.isArray(raw.items) && raw.items.length > 0;
  const lowConfidence = coerceConfidence(raw.confidence) < LOW_SIGNAL_CONFIDENCE;

  if (!hasVendor && !hasTotal && !hasItems && lowConfidence) {
    return {
      code: NOTHING_READABLE,
      description: '',
      error:
        'No bill details could be read from this file. Try a clearer, well-lit photo, or enter the bill manually.',
    };
  }

  return null;
};

/**
 * A bill must always carry a currency. When the model could not name one, the
 * user's own currency is used and the review screen is told, so a guess is never
 * silent.
 */
export const ensureCurrency = (bill, fallback) => {
  if (bill.currency) return bill;
  const currency = SUPPORTED_CURRENCIES.includes(fallback) ? fallback : 'PKR';
  return {
    ...bill,
    currency,
    warnings: [
      ...bill.warnings,
      `The currency could not be read from this document, so ${currency} (your default) was used. Check it before saving.`,
    ],
  };
};
