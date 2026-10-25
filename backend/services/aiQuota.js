import { AiDailyCounter } from '../models/AiDailyCounter.js';

/**
 * Daily AI quotas, counted in MongoDB.
 *
 * "Today" is the calendar day in Asia/Karachi, so every limit resets at local
 * midnight rather than at UTC midnight (05:00 in Pakistan).
 *
 * Check and increment happen in a single atomic findOneAndUpdate: the filter only
 * matches while `count < limit`, so of N concurrent requests exactly `limit` win.
 * When the document already sits at the limit the filter matches nothing, the
 * upsert tries to insert, and the unique `key` index rejects it (E11000), which is
 * how "limit reached" is detected without a read-then-write race.
 */

const TIME_ZONE = 'Asia/Karachi';
const KEEP_DAYS = 3;

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const karachiDay = (date = new Date()) => dayFormatter.format(date);

const expiryFor = () => new Date(Date.now() + KEEP_DAYS * 24 * 60 * 60 * 1000);

export class AiCapError extends Error {
  constructor(publicCode, message) {
    super(message);
    this.name = 'AiCapError';
    this.statusCode = 429;
    this.publicCode = publicCode;
  }
}

/** Optional cap from the environment; unset, empty or non-positive means "no cap". */
const capFromEnv = (name) => {
  const parsed = Number.parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/** Reserves one unit on `key` if it is still under `limit`. Resolves true or false. */
async function reserve({ key, scope, user = null, day, limit }) {
  if (limit <= 0) return false;

  // A duplicate-key error means either "already at the limit" or "another request
  // created today's document a moment ago". Retrying tells them apart: in the second
  // case the filter now matches the new document and the update succeeds.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await AiDailyCounter.findOneAndUpdate(
        { key, count: { $lt: limit } },
        {
          $inc: { count: 1 },
          $setOnInsert: { scope, user, day, expiresAt: expiryFor() },
        },
        { upsert: true }
      );
      return true;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  return false;
}

async function release(key) {
  await AiDailyCounter.updateOne({ key, count: { $gt: 0 } }, { $inc: { count: -1 } });
}

/**
 * Takes one AI request from today's budget: the platform cap first, then the user's.
 * If the user is over their own limit the platform unit is handed back, so a
 * blocked user never eats shared capacity.
 *
 * @returns {Promise<{ok: true} | {ok: false, reason: 'user' | 'global'}>}
 */
export async function reserveDailyAiRequest({ userId, limit }) {
  const day = karachiDay();
  const globalCap = capFromEnv('GLOBAL_AI_DAILY_CAP');
  const globalKey = `global:${day}`;

  if (globalCap !== null) {
    const ok = await reserve({ key: globalKey, scope: 'global', day, limit: globalCap });
    if (!ok) return { ok: false, reason: 'global' };
  }

  const ok = await reserve({
    key: `user:${userId}:${day}`,
    scope: 'user',
    user: userId,
    day,
    limit,
  });

  if (!ok) {
    if (globalCap !== null) await release(globalKey);
    return { ok: false, reason: 'user' };
  }
  return { ok: true };
}

/** One call to the paid Claude backup. False once today's cap is spent. */
export async function reserveClaudeCall() {
  const cap = capFromEnv('CLAUDE_BACKUP_DAILY_CAP');
  if (cap === null) return true;

  const day = karachiDay();
  return reserve({ key: `claude:${day}`, scope: 'claude', day, limit: cap });
}

export const BACKUP_CAP_MESSAGE =
  'The backup AI service has reached its daily limit. Please try again tomorrow, or enter the details manually.';

export const GLOBAL_CAP_MESSAGE =
  'Ledger AI has reached its daily capacity. Please try again tomorrow.';
