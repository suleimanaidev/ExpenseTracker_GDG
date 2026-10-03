import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getInsight, chatInsight } from '../controllers/aiController.js';
import { authenticate } from '../middleware/auth.js';
import { enforceAiDailyLimit } from '../middleware/aiLimit.js';

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

router.use(authenticate);

router.post('/insight', aiLimiter, enforceAiDailyLimit('insight'), getInsight);
router.post('/insight/chat', aiLimiter, enforceAiDailyLimit('chat'), chatInsight);

export default router;
