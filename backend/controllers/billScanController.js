import { Category } from '../models/Category.js';
import { auditBillArithmetic } from '../utils/billCalculations.js';
import { parseBillScanResult } from '../schemas/billSchema.js';
import { scanBillWithGemini } from '../services/billScanService.js';

/**
 * AI bill scanner controller.
 *
 * `POST /api/bills/scan` is strictly read-only. It extracts, validates and
 * returns the bill for the user to review, and never writes to the database.
 * Persistence happens only once the user confirms, via `POST /api/bills`.
 */

/** Finds one of the user's own categories by name, case-insensitively. */
const resolveCategory = async (userId, name) => {
  if (typeof name !== 'string' || name.trim() === '') return null;
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Category.findOne({ user: userId, name: new RegExp(`^${escaped}$`, 'i') }).lean();
};

/**
 * Pins the model's suggestion to a category the user actually owns.
 *
 * The prompt already forbids inventing one, but a prompt is not a guarantee.
 * An unmatched suggestion degrades to a real category plus a warning instead of
 * creating a new one behind the user's back.
 */
const constrainCategory = async (userId, suggested, orderedNames) => {
  const match = await resolveCategory(userId, suggested);
  if (match) return { category: match.name, warning: null };

  const fallback = await resolveCategory(userId, 'Other');
  const chosen = fallback?.name || orderedNames[0] || 'Other';

  return {
    category: chosen,
    warning:
      'The scanned category did not match one of your saved categories, so a default was applied. Please confirm or change it.',
  };
};

/**
 * POST /api/bills/scan
 *
 * Magic bytes are already verified by `verifyBillFile`, so by this point the
 * bytes are a known image or PDF and the verified MIME type is what gets sent
 * to Gemini.
 */
export const scanBill = async (req, res, next) => {
  try {
    const { buffer, mimeType, size, originalName } = req.billFile;

    // Scoped to the caller and injected into the prompt, so the model can only
    // ever suggest a category this user actually has.
    const categories = await Category.find({ user: req.user._id })
      .sort({ createdAt: 1 })
      .select('name')
      .lean();

    const categoryNames = categories.map((c) => c.name);

    const result = await scanBillWithGemini({
      buffer,
      mimeType,
      categories: categoryNames,
    });

    if (!result.ok) {
      const status = result.code === 'AI_NOT_CONFIGURED' ? 503 : 502;

      // `canEnterManually` lets the UI offer the manual creator instead of a
      // dead end when the AI is down or unavailable.
      return res.status(status).json({
        error: result.error,
        code: result.code,
        attempts: result.attempts ?? 0,
        canEnterManually: true,
      });
    }

    const parsed = parseBillScanResult(result.data);
    if (!parsed.ok) {
      return res.status(502).json({
        error: parsed.error,
        code: 'AI_SCHEMA_MISMATCH',
        details: parsed.issues,
        canEnterManually: true,
      });
    }

    const bill = parsed.data;

    // Audited, never auto-corrected: the user is about to be asked to pay this
    // amount and deserves to see the model's mistake rather than a hidden fix.
    auditBillArithmetic(bill);

    if (bill.total === 0 && bill.warnings.length === 0) {
      bill.warnings.push('No total could be read from this document.');
    }

    const { category, warning } = await constrainCategory(
      req.user._id,
      bill.suggestedCategory,
      categoryNames
    );
    bill.suggestedCategory = category;
    if (warning) bill.warnings.push(warning);

    return res.json({
      bill,
      file: { originalName, mimeType, size },
      categories: categoryNames,
      // Explicit, because the review screen must not imply anything was saved.
      saved: false,
    });
  } catch (err) {
    next(err);
  }
};