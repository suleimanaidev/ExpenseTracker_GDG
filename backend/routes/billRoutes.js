import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { scanBill } from '../controllers/billScanController.js';
import { authenticate } from '../middleware/auth.js';
import { handleBillUpload, verifyBillFile } from '../middleware/upload.js';

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

/**
 * POST /api/bills/scan
 * multipart/form-data, field name "bill". Accepts JPG, PNG, WEBP and PDF up to
 * 8 MB, verified by magic bytes. Returns the extracted bill for review and
 * persists nothing.
 */
router.post('/scan', scanLimiter, handleBillUpload, verifyBillFile, scanBill);

export default router;