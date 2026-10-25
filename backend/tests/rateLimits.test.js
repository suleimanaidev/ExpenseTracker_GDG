import { vi, afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';

// Limits are read when the app loads, so small values are set before it is imported.
vi.hoisted(() => {
  process.env.ENABLE_RATE_LIMITS_IN_TESTS = 'true';
  process.env.RATE_LIMIT_AI = '3';
  process.env.RATE_LIMIT_AI_FILE_HOURLY = '4';
  process.env.RATE_LIMIT_AI_ATTACH = '50';
  process.env.RATE_LIMIT_REGISTER_PER_HOUR = '2';
  process.env.RATE_LIMIT_REFRESH = '2';
});

import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../server.js';
import { User } from '../models/User.js';
import { generateAccessToken } from '../middleware/auth.js';

let mongoServer;
let counter = 0;
const savedKey = process.env.GEMINI_API_KEY;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  await mongoose.connect(mongoServer.getUri());
  app.set('trust proxy', true);
});

afterAll(async () => {
  delete process.env.ENABLE_RATE_LIMITS_IN_TESTS;
  if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedKey;
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  process.env.GEMINI_API_KEY = 'test-key';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ isBillDocument: true, vendor: 'Shop', total: '10', currency: 'PKR' }) }],
            },
          },
        ],
      }),
    }))
  );
});

afterEach(() => vi.unstubAllGlobals());

const freshIp = () => `172.16.${Math.floor(++counter / 250)}.${counter % 250}`;
const makeUser = async (email) =>
  User.create({ email, passwordHash: await User.hashPassword('Password123!') });
const as = (user) => ({ Authorization: `Bearer ${generateAccessToken(user)}` });
const png = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082',
  'hex'
);

const insight = (user) => request(app).post('/api/insight').set(as(user)).send({});
const scan = (user) =>
  request(app).post('/api/bills/scan').set(as(user)).attach('bill', png, { filename: 'a.png', contentType: 'image/png' });
const attach = (user) =>
  request(app)
    .post('/api/insight/chat')
    .set(as(user))
    .field('question', '')
    .attach('bill', png, { filename: 'a.png', contentType: 'image/png' });

describe('429 response shape', () => {
  it('uses one body and a Retry-After header, and sends standard rate-limit headers', async () => {
    const user = await makeUser('shape@ledger.app');
    for (let i = 0; i < 3; i += 1) expect((await insight(user)).status).toBe(200);

    const blocked = await insight(user);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ error: 'Too many requests', code: 'RATE_LIMITED' });
    expect(Number.isInteger(blocked.body.retryAfterSeconds)).toBe(true);
    expect(blocked.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(Number(blocked.headers['retry-after'])).toBe(blocked.body.retryAfterSeconds);
    expect(blocked.headers['ratelimit-limit'] ?? blocked.headers['ratelimit']).toBeDefined();
    expect(blocked.headers['x-ratelimit-limit']).toBeUndefined();
  });
});

describe('per-user AI limits', () => {
  it("does not let one user's burst block another user", async () => {
    const a = await makeUser('iso-a@ledger.app');
    const b = await makeUser('iso-b@ledger.app');

    for (let i = 0; i < 3; i += 1) await insight(a);
    expect((await insight(a)).status).toBe(429);

    expect((await insight(b)).status).toBe(200);
  });
});

describe('one shared AI-file budget', () => {
  it('counts bill scans and chat attachments against the same hourly limit', async () => {
    const user = await makeUser('files@ledger.app');
    const other = await makeUser('files-other@ledger.app');

    expect((await scan(user)).status).toBe(200);
    expect((await attach(user)).status).toBe(200);
    expect((await scan(user)).status).toBe(200);
    expect((await attach(user)).status).toBe(200);

    const blockedScan = await scan(user);
    expect(blockedScan.status).toBe(429);
    expect(blockedScan.body.code).toBe('RATE_LIMITED');

    const blockedChat = await attach(user);
    expect(blockedChat.status).toBe(429);

    expect((await scan(other)).status).toBe(200);
  });

  it('does not charge the file budget for a chat message without a file', async () => {
    const user = await makeUser('textonly@ledger.app');
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app).post('/api/insight/chat').set(as(user)).send({ question: 'hello' });
      expect(res.status).toBe(200);
    }
    expect((await scan(user)).status).toBe(200);
  });
});

describe('register and refresh limits', () => {
  it('limits registrations per IP', async () => {
    const ip = freshIp();
    const register = (n) =>
      request(app)
        .post('/api/auth/register')
        .set('X-Forwarded-For', ip)
        .send({ email: `reg-${counter}-${n}@ledger.app`, password: 'Password123!' });

    expect((await register(1)).status).toBe(201);
    expect((await register(2)).status).toBe(201);
    const blocked = await register(3);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
  });

  it('limits token refreshes per IP', async () => {
    const ip = freshIp();
    const refresh = () => request(app).post('/api/auth/refresh').set('X-Forwarded-For', ip);

    await refresh();
    await refresh();
    expect((await refresh()).status).toBe(429);
  });
});
