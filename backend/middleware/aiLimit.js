import { AiUsage } from '../models/AiUsage.js';

export const enforceAiDailyLimit = (type) => async (req, res, next) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const used = await AiUsage.countDocuments({ user: req.user._id, type, createdAt: { $gte: start } });
    if (used >= (req.user.aiDailyLimit ?? 10)) {
      return res.status(429).json({
        error: `Daily ${type} limit reached. Please try again tomorrow.`,
        code: 'AI_DAILY_LIMIT_REACHED',
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
};
