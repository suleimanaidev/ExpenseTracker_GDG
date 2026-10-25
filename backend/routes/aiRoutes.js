import { Router } from 'express';
import { getInsight, chatInsight } from '../controllers/aiController.js';
import { authenticate } from '../middleware/auth.js';
import { enforceAiDailyLimit } from '../middleware/aiLimit.js';
import { handleBillUpload, verifyBillFile } from '../middleware/upload.js';
import { aiAttachBurstLimiter, aiFileLimiter, aiLimiter } from '../middleware/rateLimiters.js';

const router = Router();

router.use(authenticate);

router.post('/insight', aiLimiter, enforceAiDailyLimit('insight'), getInsight);
router.post('/insight/chat', aiLimiter, enforceAiDailyLimit('chat'), handleBillUpload, aiAttachBurstLimiter, aiFileLimiter, (req, res, next) => {
  if (!req.file) return next();
  return verifyBillFile(req, res, next);
}, chatInsight);

export default router;
