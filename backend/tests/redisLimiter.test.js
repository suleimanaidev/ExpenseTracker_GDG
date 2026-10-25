import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import { createLimiter } from '../middleware/rateLimiters.js';
import { pingRedis, setRedisClientForTests } from '../config/redis.js';
import * as cache from '../utils/cache.js';

/**
 * ioredis-mock cannot run Lua (SCRIPT / EVALSHA), which rate-limit-redis relies on, so
 * this thin client answers those commands itself and keeps the data in an ioredis-mock
 * instance. It exercises the real store's command protocol (SCRIPT LOAD, EVALSHA, DECR,
 * DEL); what it cannot prove is Redis's own Lua execution.
 */
class FakeRedis {
  constructor() {
    this.data = new RedisMock();
    this.status = 'ready';
  }

  async call(command, ...args) {
    switch (command.toUpperCase()) {
      case 'SCRIPT':
        return args[1].includes('INCR') ? 'sha-increment' : 'sha-get';
      case 'EVALSHA': {
        const [sha, , key, resetOnChange, windowMs] = args;
        if (sha === 'sha-increment') {
          const hits = await this.data.incr(key);
          let ttl = await this.data.pttl(key);
          if (ttl <= 0 || resetOnChange === '1') {
            await this.data.pexpire(key, Number(windowMs));
            ttl = Number(windowMs);
          }
          return [hits, ttl];
        }
        const value = await this.data.get(key);
        return [value === null ? false : Number(value), await this.data.pttl(key)];
      }
      case 'DECR':
        return this.data.decr(args[0]);
      case 'DEL':
        return this.data.del(args[0]);
      default:
        throw new Error(`unsupported command ${command}`);
    }
  }

  ping() {
    return this.data.ping();
  }

  get(...args) {
    return this.data.get(...args);
  }

  set(...args) {
    return this.data.set(...args);
  }

  del(...args) {
    return this.data.del(...args);
  }

  keys(...args) {
    return this.data.keys(...args);
  }

  ttl(...args) {
    return this.data.ttl(...args);
  }
}

const mockRedis = async () => new FakeRedis();
const appWith = (limiter) => {
  const app = express();
  app.get('/ping', limiter, (req, res) => res.json({ ok: true }));
  return app;
};

const limiterFor = (name, limit = 2) =>
  createLimiter({ name, windowMs: 60_000, limit, keyGenerator: () => 'same-client' });

const hit = (app, times) => {
  const results = [];
  const run = async () => {
    for (let i = 0; i < times; i += 1) results.push((await request(app).get('/ping')).status);
    return results;
  };
  return run();
};

beforeEach(() => {
  process.env.ENABLE_RATE_LIMITS_IN_TESTS = 'true';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  cache.clearMemoryCache();
});

afterEach(() => {
  delete process.env.ENABLE_RATE_LIMITS_IN_TESTS;
  setRedisClientForTests(null);
  vi.restoreAllMocks();
});

describe('without Redis', () => {
  it('limits with the in-memory store', async () => {
    setRedisClientForTests(null);
    expect(await hit(appWith(limiterFor('mem-only')), 3)).toEqual([200, 200, 429]);
  });

  it('reports Redis as not configured', async () => {
    expect(await pingRedis()).toEqual({ configured: false, ok: false });
  });
});

describe('with Redis', () => {
  it('counts in Redis under a namespaced key, shared by every limiter instance of that name', async () => {
    const redis = await mockRedis();
    setRedisClientForTests(redis);

    expect(await hit(appWith(limiterFor('shared-name')), 3)).toEqual([200, 200, 429]);

    const keys = await redis.keys('ledger:rl:shared-name:*');
    expect(keys.length).toBeGreaterThan(0);

    // A second process would build its own limiter with the same name and see the same count.
    const secondProcess = appWith(limiterFor('shared-name'));
    expect((await request(secondProcess).get('/ping')).status).toBe(429);
  });

  it('keeps different limiters apart', async () => {
    setRedisClientForTests(await mockRedis());
    expect(await hit(appWith(limiterFor('limiter-one')), 3)).toEqual([200, 200, 429]);
    expect(await hit(appWith(limiterFor('limiter-two')), 1)).toEqual([200]);
  });

  it('answers a ping with latency', async () => {
    setRedisClientForTests(await mockRedis());
    const result = await pingRedis();
    expect(result).toMatchObject({ configured: true, ok: true });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('when Redis breaks at runtime', () => {
  const brokenClient = () => ({
    status: 'ready',
    call: vi.fn(async () => {
      throw new Error('connection lost');
    }),
    get: vi.fn(async () => {
      throw new Error('connection lost');
    }),
    set: vi.fn(async () => {
      throw new Error('connection lost');
    }),
    ping: vi.fn(async () => {
      throw Object.assign(new Error('connection lost'), { code: 'ECONNRESET' });
    }),
  });

  it('keeps limiting from memory instead of failing or letting everything through', async () => {
    setRedisClientForTests(brokenClient());

    const statuses = await hit(appWith(limiterFor('broken')), 3);
    expect(statuses).toEqual([200, 200, 429]);
  });

  it('never answers 500 because of Redis', async () => {
    setRedisClientForTests(brokenClient());
    const statuses = await hit(appWith(limiterFor('broken-2', 5)), 4);
    expect(statuses.every((status) => status === 200)).toBe(true);
  });

  it('reports the outage in the ping without throwing', async () => {
    setRedisClientForTests(brokenClient());
    expect(await pingRedis()).toMatchObject({ configured: true, ok: false, error: 'ECONNRESET' });
  });

  it('serves the cache from memory', async () => {
    setRedisClientForTests(brokenClient());
    let computed = 0;
    const compute = async () => ({ n: ++computed });

    expect(await cache.remember('k', 60, compute)).toEqual({ n: 1 });
    expect(await cache.remember('k', 60, compute)).toEqual({ n: 1 });
    expect(computed).toBe(1);
  });
});

describe('cache helper', () => {
  it('stores in Redis with a TTL, returns it, and invalidates a key or a prefix', async () => {
    const redis = await mockRedis();
    setRedisClientForTests(redis);

    await cache.set('admin:stats:30d', { users: 5 }, 60);
    await cache.set('admin:stats:7d', { users: 2 }, 60);
    await cache.set('other', { x: 1 }, 60);

    expect(await cache.get('admin:stats:30d')).toEqual({ users: 5 });
    expect(await redis.ttl('ledger:cache:admin:stats:30d')).toBeGreaterThan(0);

    await cache.invalidate('admin:stats:30d');
    expect(await cache.get('admin:stats:30d')).toBeNull();
    expect(await cache.get('admin:stats:7d')).toEqual({ users: 2 });

    await cache.invalidate('admin:', { prefix: true });
    expect(await cache.get('admin:stats:7d')).toBeNull();
    expect(await cache.get('other')).toEqual({ x: 1 });
  });

  it('expires memory entries after their TTL', async () => {
    setRedisClientForTests(null);
    vi.useFakeTimers();
    await cache.set('short', { v: 1 }, 1);
    expect(await cache.get('short')).toEqual({ v: 1 });
    vi.advanceTimersByTime(1500);
    expect(await cache.get('short')).toBeNull();
    vi.useRealTimers();
  });
});
