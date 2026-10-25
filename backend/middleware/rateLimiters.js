import rateLimit, { MemoryStore } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import {
  getRedis,
  isRedisConfigured,
  isRedisReady,
  redisKeyPrefix,
  warnThrottled,
} from '../config/redis.js';

/**
 * Every rate limiter in the API is built here, so the store, the headers and the
 * 429 body are identical everywhere.
 *
 * Store: Redis when REDIS_URL is set, so limits are shared across processes and
 * survive restarts; otherwise per-process memory. If Redis is configured but
 * unreachable, each request falls back to a per-process memory counter for that
 * limiter instead of failing or letting everything through unchecked.
 */

const isDevelopment = () => process.env.NODE_ENV !== 'production';

const envInt = (name, fallback) => {
  const parsed = Number.parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** Limiters stay off under test unless a suite opts in, so unrelated suites are not throttled. */
const bypassed = () =>
  process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMITS_IN_TESTS !== 'true';

class ResilientStore {
  constructor(name) {
    this.name = name;
    // express-rate-limit's double-count check tells stores apart by this prefix; without
    // it two limiters on the same IP would look like one limiter counting twice.
    this.prefix = `${name}:`;
    this.memory = new MemoryStore();
    this.redisStore = null;
    this.options = null;
  }

  init(options) {
    this.options = options;
    this.memory.init(options);
  }

  async redis() {
    if (!isRedisReady()) return null;
    if (!this.redisStore) {
      const store = new RedisStore({
        prefix: `${redisKeyPrefix()}${this.name}:`,
        sendCommand: (...args) => getRedis().call(...args),
      });
      store.init?.(this.options);
      this.redisStore = store;
    }
    return this.redisStore;
  }

  async run(method, key) {
    try {
      const store = await this.redis();
      if (store) return await store[method](key);
    } catch (error) {
      // Rebuilt on the next request in case the cause was a flushed script cache.
      this.redisStore = null;
      warnThrottled(`rate limiter "${this.name}" using memory fallback (${error.code || error.name})`);
    }
    return this.memory[method](key);
  }

  increment(key) {
    return this.run('increment', key);
  }

  decrement(key) {
    return this.run('decrement', key);
  }

  async resetKey(key) {
    this.memory.resetKey(key);
    try {
      const store = await this.redis();
      if (store) await store.resetKey(key);
    } catch {
      // Memory is already cleared; Redis will expire the key on its own.
    }
  }
}

/** Seconds until the client may try again, never below one. */
const retryAfterSeconds = (req) => {
  const resetTime = req.rateLimit?.resetTime;
  if (!(resetTime instanceof Date)) return 60;
  return Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
};

export const rateLimitedBody = (seconds) => ({
  error: 'Too many requests',
  code: 'RATE_LIMITED',
  retryAfterSeconds: seconds,
});

export function createLimiter({
  name,
  windowMs,
  limit,
  keyGenerator,
  skipSuccessfulRequests = false,
  skip,
}) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator,
    skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
    store: new ResilientStore(name),
    skip: (req, res) => bypassed() || Boolean(skip?.(req, res)),
    handler: (req, res) => {
      const seconds = retryAfterSeconds(req);
      res.set('Retry-After', String(seconds));
      res.status(429).json(rateLimitedBody(seconds));
    },
  });
}

export const normalizeEmail = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const byIp = (req) => req.ip;
const byUser = (req) => req.user?._id?.toString() || req.ip;
const byEmail = (req) => normalizeEmail(req.body?.email) || req.ip;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Whole API, per IP. The tighter limiters below sit in front of costly routes. */
export const globalLimiter = createLimiter({
  name: 'global',
  windowMs: MINUTE,
  limit: envInt('RATE_LIMIT_GLOBAL_PER_MIN', isDevelopment() ? 1000 : 120),
  keyGenerator: byIp,
});

/** Login, per IP. Only failed attempts count, so a shared office IP is not punished for successes. */
export const loginIpLimiter = createLimiter({
  name: 'login-ip',
  windowMs: 15 * MINUTE,
  limit: envInt('RATE_LIMIT_LOGIN_IP', 20),
  keyGenerator: byIp,
  skipSuccessfulRequests: true,
});

/** Login, per email: stops one account being guessed from many IPs. */
export const loginEmailLimiter = createLimiter({
  name: 'login-email',
  windowMs: 15 * MINUTE,
  limit: envInt('RATE_LIMIT_LOGIN_EMAIL', 8),
  keyGenerator: byEmail,
  skipSuccessfulRequests: true,
});

export const registerLimiter = createLimiter({
  name: 'register',
  windowMs: HOUR,
  limit: envInt('RATE_LIMIT_REGISTER_PER_HOUR', 5),
  keyGenerator: byIp,
});

export const refreshLimiter = createLimiter({
  name: 'refresh',
  windowMs: 15 * MINUTE,
  limit: envInt('RATE_LIMIT_REFRESH', 60),
  keyGenerator: byIp,
});

/** AI chat and insight, per user. Must run after `authenticate`. */
export const aiLimiter = createLimiter({
  name: 'ai',
  windowMs: 5 * MINUTE,
  limit: envInt('RATE_LIMIT_AI', isDevelopment() ? 100 : 20),
  keyGenerator: byUser,
});

/** Burst limit for files attached in chat. Skipped when the message has no file. */
export const aiAttachBurstLimiter = createLimiter({
  name: 'ai-attach-burst',
  windowMs: 10 * MINUTE,
  limit: envInt('RATE_LIMIT_AI_ATTACH', 5),
  keyGenerator: byUser,
  skip: (req) => !req.file,
});

/**
 * One hourly budget for every AI file read, whichever route it came through. The
 * bill-scan endpoint and a chat attachment both use this same limiter instance
 * and key, so attaching in chat cannot be used to dodge the scan limit.
 */
export const aiFileLimiter = createLimiter({
  name: 'ai-file',
  windowMs: HOUR,
  limit: envInt('RATE_LIMIT_AI_FILE_HOURLY', 10),
  keyGenerator: byUser,
  skip: (req) => req.method === 'POST' && req.originalUrl.includes('/insight/chat') && !req.file,
});

/** Admin API, per admin user. Must run after `authenticate`. */
export const adminLimiter = createLimiter({
  name: 'admin',
  windowMs: MINUTE,
  limit: envInt('ADMIN_RATE_LIMIT_PER_MINUTE', 120),
  keyGenerator: byUser,
});

export const warnIfRedisMissing = () => {
  if (isRedisConfigured()) return;
  console.warn(
    '[redis] REDIS_URL is not set: rate limits use per-process memory. That is fine for local ' +
      'development, but in production limits reset on restart and are not shared between instances.'
  );
};
