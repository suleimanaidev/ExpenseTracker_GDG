import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../server.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';

let mongoServer;
let counter = 0;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  await mongoose.connect(mongoServer.getUri());
  // Lets a test choose the client address with X-Forwarded-For.
  app.set('trust proxy', true);
});

afterAll(async () => {
  delete process.env.ENABLE_RATE_LIMITS_IN_TESTS;
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), AuditLog.deleteMany({})]);
});

/** A unique client address per call, so one test never spends another's IP budget. */
const freshIp = () => `10.${Math.floor(++counter / 250)}.${counter % 250}.${(counter * 7) % 250}`;

const login = (email, password, ip = freshIp()) =>
  request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send({ email, password });

const makeUser = async (email, extra = {}) => {
  const passwordHash = await User.hashPassword('Password123!');
  return User.create({ email, passwordHash, ...extra });
};

describe('login rate limits', () => {
  beforeAll(() => {
    process.env.ENABLE_RATE_LIMITS_IN_TESTS = 'true';
  });
  afterAll(() => {
    delete process.env.ENABLE_RATE_LIMITS_IN_TESTS;
  });

  it('limits failed attempts per email even when each comes from a different IP', async () => {
    await makeUser('email-limit@ledger.app');

    for (let i = 0; i < 8; i += 1) {
      const res = await login('email-limit@ledger.app', 'wrong-password');
      expect(res.status).toBe(401);
    }

    const blocked = await login('email-limit@ledger.app', 'wrong-password');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ error: 'Too many requests', code: 'RATE_LIMITED' });
    expect(blocked.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('matches the email case-insensitively and ignoring spaces', async () => {
    await makeUser('case-limit@ledger.app');
    for (let i = 0; i < 8; i += 1) await login('case-limit@ledger.app', 'nope');

    const blocked = await login('  CASE-LIMIT@ledger.app ', 'nope');
    expect(blocked.status).toBe(429);
  });

  it('limits failed attempts per IP across different emails', async () => {
    const ip = freshIp();
    for (let i = 0; i < 20; i += 1) {
      const res = await login(`nobody-${i}@ledger.app`, 'wrong-password', ip);
      expect(res.status).toBe(401);
    }

    const blocked = await login('nobody-21@ledger.app', 'wrong-password', ip);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
  });

  it('does not count successful logins', async () => {
    await makeUser('success-limit@ledger.app');
    const ip = freshIp();

    for (let i = 0; i < 25; i += 1) {
      const res = await login('success-limit@ledger.app', 'Password123!', ip);
      expect(res.status).toBe(200);
    }
  });
});

describe('account lockout', () => {
  it('locks after 10 consecutive failures, refuses even the right password, then recovers', async () => {
    const user = await makeUser('lockout@ledger.app');

    for (let i = 0; i < 10; i += 1) {
      const res = await login('lockout@ledger.app', 'wrong-password');
      expect(res.status).toBe(401);
    }

    const locked = await login('lockout@ledger.app', 'Password123!');
    expect(locked.status).toBe(429);
    expect(locked.body).toMatchObject({ error: 'Too many requests', code: 'RATE_LIMITED' });
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);

    await User.updateOne({ _id: user._id }, { $set: { lockUntil: new Date(Date.now() - 1000) } });

    const recovered = await login('lockout@ledger.app', 'Password123!');
    expect(recovered.status).toBe(200);

    const fresh = await User.findById(user._id);
    expect(fresh.failedLoginCount).toBe(0);
    expect(fresh.lockUntil).toBeNull();
  });

  it('resets the failure counter after a successful login', async () => {
    const user = await makeUser('reset-count@ledger.app');
    for (let i = 0; i < 6; i += 1) await login('reset-count@ledger.app', 'wrong-password');
    expect((await User.findById(user._id)).failedLoginCount).toBe(6);

    expect((await login('reset-count@ledger.app', 'Password123!')).status).toBe(200);
    expect((await User.findById(user._id)).failedLoginCount).toBe(0);
  });

  it('answers an unknown email and a wrong password identically', async () => {
    await makeUser('exists@ledger.app');

    const wrong = await login('exists@ledger.app', 'wrong-password');
    const unknown = await login('missing@ledger.app', 'wrong-password');

    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('lets an admin unlock an account and records it in the audit log', async () => {
    const target = await makeUser('locked-user@ledger.app', {
      failedLoginCount: 0,
      lockUntil: new Date(Date.now() + 10 * 60 * 1000),
    });
    const admin = await makeUser('unlock-admin@ledger.app', { isAdmin: true });
    const adminLogin = await login(admin.email, 'Password123!');
    expect(adminLogin.status).toBe(200);

    expect((await login(target.email, 'Password123!')).status).toBe(429);

    const unlock = await request(app)
      .post(`/api/admin/users/${target._id}/unlock`)
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .send({});
    expect(unlock.status).toBe(200);

    expect((await login(target.email, 'Password123!')).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'user.unlock', targetId: target._id })).toBe(1);
  });

  it('does not let a regular user unlock anyone', async () => {
    const target = await makeUser('stay-locked@ledger.app', {
      lockUntil: new Date(Date.now() + 10 * 60 * 1000),
    });
    const user = await makeUser('plain@ledger.app');
    const session = await login(user.email, 'Password123!');

    const res = await request(app)
      .post(`/api/admin/users/${target._id}/unlock`)
      .set('Authorization', `Bearer ${session.body.accessToken}`)
      .send({});
    expect(res.status).toBe(403);
  });
});
