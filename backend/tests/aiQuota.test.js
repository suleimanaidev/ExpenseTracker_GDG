import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../server.js';
import { User } from '../models/User.js';
import { AiDailyCounter } from '../models/AiDailyCounter.js';
import { generateAccessToken } from '../middleware/auth.js';
import { generateAIInsight } from '../services/aiService.js';
import { scanBillWithGemini } from '../services/billScanService.js';
import { karachiDay, reserveClaudeCall, reserveDailyAiRequest } from '../services/aiQuota.js';

let mongoServer;

const ENV_KEYS = ['GLOBAL_AI_DAILY_CAP', 'CLAUDE_BACKUP_DAILY_CAP', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  await mongoose.connect(mongoServer.getUri());
  await AiDailyCounter.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), AiDailyCounter.deleteMany({})]);
  delete process.env.GLOBAL_AI_DAILY_CAP;
  delete process.env.CLAUDE_BACKUP_DAILY_CAP;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

const makeUser = async (email, extra = {}) =>
  User.create({ email, passwordHash: await User.hashPassword('Password123!'), ...extra });

const as = (user) => ({ Authorization: `Bearer ${generateAccessToken(user)}` });

const oid = () => new mongoose.Types.ObjectId();

describe('Karachi day', () => {
  it('rolls over at midnight in Pakistan, not at UTC midnight', () => {
    expect(karachiDay(new Date('2026-10-24T18:59:00Z'))).toBe('2026-10-24');
    expect(karachiDay(new Date('2026-10-24T19:01:00Z'))).toBe('2026-10-25');
  });
});

describe('daily AI counter', () => {
  it('lets exactly `limit` of many concurrent requests through', async () => {
    const userId = oid();
    const results = await Promise.all(
      Array.from({ length: 30 }, () => reserveDailyAiRequest({ userId, limit: 5 }))
    );

    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.filter((r) => !r.ok && r.reason === 'user')).toHaveLength(25);
    expect((await AiDailyCounter.findOne({ scope: 'user', user: userId })).count).toBe(5);
  });

  it('does not lose requests when the first ones of the day race to create the document', async () => {
    const userId = oid();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => reserveDailyAiRequest({ userId, limit: 12 }))
    );
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("keeps one user's limit separate from another's", async () => {
    const a = oid();
    const b = oid();
    for (let i = 0; i < 3; i += 1) await reserveDailyAiRequest({ userId: a, limit: 3 });

    expect((await reserveDailyAiRequest({ userId: a, limit: 3 })).ok).toBe(false);
    expect((await reserveDailyAiRequest({ userId: b, limit: 3 })).ok).toBe(true);
  });

  it('blocks a user whose limit is zero', async () => {
    expect((await reserveDailyAiRequest({ userId: oid(), limit: 0 })).ok).toBe(false);
  });

  it('enforces the platform-wide cap and says which limit was hit', async () => {
    process.env.GLOBAL_AI_DAILY_CAP = '3';
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push(await reserveDailyAiRequest({ userId: oid(), limit: 100 }));

    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok).every((r) => r.reason === 'global')).toBe(true);
  });

  it('hands the platform unit back when the user is over their own limit', async () => {
    process.env.GLOBAL_AI_DAILY_CAP = '2';
    const heavy = oid();
    await reserveDailyAiRequest({ userId: heavy, limit: 1 });
    await reserveDailyAiRequest({ userId: heavy, limit: 1 });
    await reserveDailyAiRequest({ userId: heavy, limit: 1 });

    const global = await AiDailyCounter.findOne({ scope: 'global' });
    expect(global.count).toBe(1);
    expect((await reserveDailyAiRequest({ userId: oid(), limit: 5 })).ok).toBe(true);
  });

  it('caps the paid Claude backup separately', async () => {
    process.env.CLAUDE_BACKUP_DAILY_CAP = '2';
    expect(await reserveClaudeCall()).toBe(true);
    expect(await reserveClaudeCall()).toBe(true);
    expect(await reserveClaudeCall()).toBe(false);
  });

  it('has no Claude cap unless one is configured', async () => {
    for (let i = 0; i < 5; i += 1) expect(await reserveClaudeCall()).toBe(true);
    expect(await AiDailyCounter.countDocuments({ scope: 'claude' })).toBe(0);
  });
});

describe('daily limit over HTTP', () => {
  const stubAi = () =>
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

  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082', 'hex');

  it('answers 429 AI_DAILY_LIMIT_REACHED once the user is out, and only for that user', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    stubAi();
    const limited = await makeUser('limited@ledger.app', { aiDailyLimit: 2 });
    const other = await makeUser('other-quota@ledger.app', { aiDailyLimit: 2 });

    for (let i = 0; i < 2; i += 1) {
      expect((await request(app).post('/api/insight').set(as(limited)).send({})).status).toBe(200);
    }
    const blocked = await request(app).post('/api/insight').set(as(limited)).send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('AI_DAILY_LIMIT_REACHED');

    expect((await request(app).post('/api/insight').set(as(other)).send({})).status).toBe(200);
  });

  it('counts chat attachments and bill scans toward the same daily limit', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    stubAi();
    const user = await makeUser('shared-daily@ledger.app', { aiDailyLimit: 2 });

    const scan = await request(app)
      .post('/api/bills/scan')
      .set(as(user))
      .attach('bill', png, { filename: 'a.png', contentType: 'image/png' });
    expect(scan.status).toBe(200);

    const chat = await request(app)
      .post('/api/insight/chat')
      .set(as(user))
      .field('question', '')
      .attach('bill', png, { filename: 'b.png', contentType: 'image/png' });
    expect(chat.status).toBe(200);

    const third = await request(app)
      .post('/api/bills/scan')
      .set(as(user))
      .attach('bill', png, { filename: 'c.png', contentType: 'image/png' });
    expect(third.status).toBe(429);
    expect(third.body.code).toBe('AI_DAILY_LIMIT_REACHED');
  });

  it('answers 429 AI_GLOBAL_CAP_REACHED when the platform cap is spent', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GLOBAL_AI_DAILY_CAP = '1';
    stubAi();
    const a = await makeUser('cap-a@ledger.app');
    const b = await makeUser('cap-b@ledger.app');

    expect((await request(app).post('/api/insight').set(as(a)).send({})).status).toBe(200);
    const blocked = await request(app).post('/api/insight').set(as(b)).send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('AI_GLOBAL_CAP_REACHED');
  });
});

describe('the Claude backup cap does not stop the app', () => {
  it('skips Claude once capped and still uses the next provider', async () => {
    process.env.GEMINI_API_KEY = '';
    process.env.ANTHROPIC_API_KEY = 'c';
    process.env.CLAUDE_BACKUP_DAILY_CAP = '1';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.GROQ_API_KEY = 'g';

    const calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        calls.push(String(url));
        if (String(url).includes('anthropic')) return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ content: [{ type: 'text', text: 'claude answer' }] }) };
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: 'groq answer' } }] }) };
      })
    );

    expect((await generateAIInsight('p', 's')).insight).toBe('claude answer');
    expect((await generateAIInsight('p', 's')).insight).toBe('groq answer');
    delete process.env.GROQ_API_KEY;
  });

  it('returns a clear cap message when Claude is the only provider and it is capped', async () => {
    process.env.GEMINI_API_KEY = '';
    process.env.ANTHROPIC_API_KEY = 'c';
    process.env.CLAUDE_BACKUP_DAILY_CAP = '1';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await reserveClaudeCall();

    await expect(generateAIInsight('p', 's')).rejects.toMatchObject({ publicCode: 'AI_BACKUP_CAP_REACHED' });

    const scan = await scanBillWithGemini({ buffer: Buffer.from('x'), mimeType: 'image/png', categories: [] });
    expect(scan).toMatchObject({ ok: false, code: 'AI_BACKUP_CAP_REACHED' });
  });
});
