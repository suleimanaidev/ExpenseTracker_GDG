import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { scanBill } from '../controllers/billScanController.js';
import {
  createBill,
  getBills,
  getBillById,
  getBillFile,
  getBillSummary,
  updateBill,
  patchBillStatus,
  deleteBill,
} from '../controllers/billController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { handleBillUpload, verifyBillFile, verifyOptionalBillFile } from '../middleware/upload.js';
import { SUPPORTED_CURRENCIES } from '../utils/billCalculations.js';

const router = Router();

/**
 * Scan quota.
 *
 * Each call is a paid multimodal inference, so the budget is far tighter than
 * the general API limiter — 10/hour keyed per user, meaning one person's
 * scanning cannot exhaust another's allowance. IP-keyed is the fallback for the
 * case where authentication has not resolved yet.
 */
const scanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: {
    error: 'You have reached the hourly bill-scan limit (10 per hour). You can still create a bill manually.',
    code: 'SCAN_RATE_LIMITED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication runs before multer, so an unauthenticated upload is rejected
// without buffering a single byte.
router.use(authenticate);

// ────────────────────────── validation schemas ──────────────────────────

const idParamSchema = z.object({
  id: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid bill id'),
});

/**
 * Money arriving as JSON number or as a multipart form-data string.
 * `formData` is the only way to send a bill and its attachment in one request.
 */
const money = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === '') return undefined;
    return typeof v === 'number' ? v : String(v).trim();
  })
  .refine(
    (v) => {
      if (v === undefined) return true;
      const n = typeof v === 'number' ? v : Number.parseFloat(v);
      return Number.isFinite(n) && n >= 0;
    },
    { message: 'Must be a non-negative amount' }
  );

const lineItemSchema = z.object({
  description: z.string().max(300).optional().default(''),
  quantity: z.union([z.number(), z.string()]).nullish(),
  unitPrice: z.union([z.number(), z.string()]).nullish(),
  lineTotal: z.union([z.number(), z.string()]).nullish(),
});

/**
 * Line items as JSON.
 *
 * multipart/form-data can only carry flat fields, so a client that saves a bill
 * together with its attachment has to send `items` as a JSON string. A JSON
 * request sends the real array and passes straight through.
 */
const itemsSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value; // let the array check below report the failure
    }
  },
  z.array(lineItemSchema).max(200).optional()
);

/**
 * Strict field allowlist.
 *
 * Anything not named here is dropped by Zod before it reaches the controller:
 * `user`, `expense`, `file`, `confidence` and `_id` cannot be set by a client.
 */
const billBodySchema = z.object({
  vendor: z.string().max(200).optional(),
  invoiceNumber: z.union([z.string(), z.null()]).optional(),
  issueDate: z.union([z.string(), z.null()]).optional(),
  dueDate: z.union([z.string(), z.null()]).optional(),
  currency: z.enum(SUPPORTED_CURRENCIES).nullish(),
  category: z.string().max(50).optional(),
  status: z.enum(['paid', 'unpaid', 'overdue']).optional(),
  source: z.enum(['scanned', 'manual']).optional(),
  confidence: z.union([z.number(), z.string()]).nullish(),
  notes: z.string().max(500).optional(),
  taxRatePercent: z.union([z.number(), z.string()]).nullish(),
  subtotal: money,
  tax: money,
  discount: money,
  total: money,
  items: itemsSchema,
  // Set by the client only to override the soft duplicate check after the user
  // has been shown the match and chosen to proceed anyway. It cannot override
  // the unique (user, vendor, invoiceNumber) index.
  saveAnyway: z.union([z.boolean(), z.string()]).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(['paid', 'unpaid', 'overdue']).optional(),
  vendor: z.string().max(200).optional(),
  from: z.string().max(30).optional(),
  to: z.string().max(30).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// ────────────────────────── routes ──────────────────────────

/**
 * POST /api/bills/scan
 * multipart/form-data, field name "bill". Accepts JPG, PNG, WEBP and PDF up to
 * 8 MB, verified by magic bytes. Returns the extracted bill for review and
 * persists nothing.
 */
router.post('/scan', scanLimiter, handleBillUpload, verifyBillFile, scanBill);

// Declared before `/:id` so "summary" and "export" are not read as an id.
router.get('/summary', getBillSummary);

/**
 * POST /api/bills
 * multipart/form-data (optional "bill" file) or JSON. Creates the Bill and its
 * one linked Expense together, or not at all.
 */
router.post(
  '/',
  handleBillUpload,
  verifyOptionalBillFile,
  validate({ body: billBodySchema }),
  createBill
);

/** GET /api/bills — filters: status, vendor, from, to, search, page, limit. */
router.get('/', validate({ query: listQuerySchema }), getBills);

/** GET /api/bills/:id/file — authenticated, owner-scoped attachment stream. */
router.get('/:id/file', validate({ params: idParamSchema, query: z.object({ download: z.string().optional() }) }), getBillFile);

router.get('/:id', validate({ params: idParamSchema }), getBillById);

/** PUT /api/bills/:id — allowlisted fields only; keeps the expense in sync. */
router.put(
  '/:id',
  validate({ params: idParamSchema, body: billBodySchema }),
  updateBill
);

/** PATCH /api/bills/:id/status */
router.patch(
  '/:id/status',
  validate({
    params: idParamSchema,
    body: z.object({ status: z.enum(['paid', 'unpaid', 'overdue']) }),
  }),
  patchBillStatus
);

/** DELETE /api/bills/:id — removes the attachment and the linked expense. */
router.delete('/:id', validate({ params: idParamSchema }), deleteBill);

export default router;