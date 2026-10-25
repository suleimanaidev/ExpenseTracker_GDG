import mongoose from 'mongoose';

/**
 * Durable daily AI counters: one document per user per day, one per day for the
 * whole platform, and one per day for the paid Claude backup. They live in MongoDB,
 * not Redis, because they are quota and spend controls: they must survive a Redis
 * flush, a restart and a second server instance.
 *
 * `key` is unique, which is what makes check-and-increment atomic (see aiQuota.js).
 * Documents expire on their own a few days after their day ends.
 */
const aiDailyCounterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    scope: { type: String, enum: ['user', 'global', 'claude'], required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    day: { type: String, required: true },
    count: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

aiDailyCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AiDailyCounter = mongoose.model('AiDailyCounter', aiDailyCounterSchema);
