import { GLOBAL_CAP_MESSAGE, reserveDailyAiRequest } from '../services/aiQuota.js';

/**
 * Daily AI allowance. One combined counter per user per day (chat, insight and
 * bill scans all draw from it, as do chat attachments), plus the platform-wide cap.
 * The counters live in MongoDB; see services/aiQuota.js.
 */
export const enforceAiDailyLimit = (type) => async (req, res, next) => {
  try {
    const limit = req.user.aiDailyLimit ?? 100;
    const result = await reserveDailyAiRequest({ userId: req.user._id, limit });

    if (result.ok) return next();

    if (result.reason === 'global') {
      return res.status(429).json({ error: GLOBAL_CAP_MESSAGE, code: 'AI_GLOBAL_CAP_REACHED' });
    }

    return res.status(429).json({
      error: `Daily ${type} limit reached. Please try again tomorrow.`,
      code: 'AI_DAILY_LIMIT_REACHED',
    });
  } catch (err) {
    return next(err);
  }
};
