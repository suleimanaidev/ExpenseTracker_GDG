import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getInsight, chatInsight } from '../controllers/aiController.js';
import { authenticate } from '../middleware/auth.js';
import { enforceAiDailyLimit } from '../middleware/aiLimit.js';
import { handleBillUpload, verifyBillFile } from '../middleware/upload.js';

const router = Router();

// Per-user rate limiting for AI inference (20 requests per 5 minutes)
const aiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: { error: 'AI rate limit exceeded. Please wait a few minutes before requesting more financial analysis.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const fileAiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  skip: (req) => !req.file,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: { error: 'Attachment scan limit exceeded. Please wait before scanning another file.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(authenticate);

router.post('/insight', aiLimiter, enforceAiDailyLimit('insight'), getInsight);
router.post('/insight/chat', aiLimiter, enforceAiDailyLimit('chat'), handleBillUpload, fileAiLimiter, (req, res, next) => {
  if (!req.file) return next();
  return verifyBillFile(req, res, next);
}, chatInsight);

export default router;
