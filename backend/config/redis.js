import Redis from 'ioredis';

/**
 * Shared Redis client.
 *
 * Redis holds only disposable data: rate-limit counters and a short admin cache.
 * Nothing durable lives here (the daily AI quota and account lockouts are in
 * MongoDB), so losing Redis degrades limiting to per-process memory and never
 * takes the API down. The connection string is never logged.
 */

const CONNECT_TIMEOUT_MS = 5000;
const WARN_EVERY_MS = 60_000;

let client = null;
let injected = false;
let lastWarnAt = 0;

export const isRedisConfigured = () => injected || Boolean(process.env.REDIS_URL?.trim());

/** Key prefix shared by every limiter, so deployments can share one Redis safely. */
export const redisKeyPrefix = () => {
  const configured = process.env.RATE_LIMIT_PREFIX?.trim();
  return configured || 'ledger:rl:';
};

/** At most one warning a minute, so an outage does not flood the logs. */
export const warnThrottled = (message) => {
  const now = Date.now();
  if (now - lastWarnAt < WARN_EVERY_MS) return;
  lastWarnAt = now;
  console.warn(`[redis] ${message}`);
};

const createClient = () => {
  const redis = new Redis(process.env.REDIS_URL.trim(), {
    connectTimeout: CONNECT_TIMEOUT_MS,
    // Fail commands immediately while disconnected instead of queueing them, so a
    // Redis outage costs one fast error per request, not a stalled request.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    // Exponential backoff, capped: reconnects quickly after a blip, gently during
    // a long outage.
    retryStrategy: (attempt) => Math.min(200 * 2 ** Math.min(attempt, 6), 10_000),
    reconnectOnError: () => false,
  });

  // Never log the error object verbatim: connection errors can echo the URL.
  redis.on('error', (error) => warnThrottled(`connection problem (${error.code || error.name})`));
  redis.on('ready', () => console.log('[redis] connected'));
  return redis;
};

/** Created on first use, or null when REDIS_URL is not set. */
export const getRedis = () => {
  if (client) return client;
  if (!process.env.REDIS_URL?.trim()) return null;
  client = createClient();
  return client;
};

export const isRedisReady = () => Boolean(client) && client.status === 'ready';

/** Tests inject a mock client; pass null to reset. */
export const setRedisClientForTests = (mock) => {
  client = mock;
  injected = Boolean(mock);
};

export async function pingRedis() {
  if (!isRedisConfigured()) return { configured: false, ok: false };

  const redis = getRedis();
  const startedAt = Date.now();
  try {
    await redis.ping();
    return { configured: true, ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { configured: true, ok: false, error: error.code || error.name || 'unreachable' };
  }
}

export async function closeRedis() {
  if (!client) return;
  const redis = client;
  client = null;
  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
}
