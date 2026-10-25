import { getRedis, isRedisReady, warnThrottled } from '../config/redis.js';

/**
 * Small read-through cache for expensive, non-critical reads (admin aggregates).
 *
 * Redis when it is connected, so every server instance shares one copy; otherwise a
 * per-process Map with the same TTL. A Redis error is never surfaced: the value is
 * simply computed (or served from memory), so a cache problem cannot take an admin
 * page down. Nothing that must be exact (quotas, lockouts) goes through here.
 */

const memory = new Map();

const namespace = () => process.env.CACHE_PREFIX?.trim() || 'ledger:cache:';
const redisKey = (key) => `${namespace()}${key}`;

export async function get(key) {
  if (isRedisReady()) {
    try {
      const raw = await getRedis().get(redisKey(key));
      return raw === null ? null : JSON.parse(raw);
    } catch (error) {
      warnThrottled(`cache read skipped (${error.code || error.name})`);
    }
  }

  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

export async function set(key, value, ttlSeconds = 60) {
  if (isRedisReady()) {
    try {
      await getRedis().set(redisKey(key), JSON.stringify(value), 'EX', ttlSeconds);
      return;
    } catch (error) {
      warnThrottled(`cache write skipped (${error.code || error.name})`);
    }
  }
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/** Removes one key, or every key that starts with `prefix` when `{ prefix: true }`. */
export async function invalidate(key, { prefix = false } = {}) {
  for (const stored of [...memory.keys()]) {
    if (prefix ? stored.startsWith(key) : stored === key) memory.delete(stored);
  }

  if (!isRedisReady()) return;
  try {
    const redis = getRedis();
    if (!prefix) {
      await redis.del(redisKey(key));
      return;
    }
    const keys = await redis.keys(`${redisKey(key)}*`);
    if (keys.length) await redis.del(...keys);
  } catch (error) {
    warnThrottled(`cache invalidate skipped (${error.code || error.name})`);
  }
}

/** Returns the cached value, or computes it, stores it and returns it. */
export async function remember(key, ttlSeconds, compute) {
  const cached = await get(key);
  if (cached !== null) return cached;
  const value = await compute();
  await set(key, value, ttlSeconds);
  return value;
}

export const clearMemoryCache = () => memory.clear();
