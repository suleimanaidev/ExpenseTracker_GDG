import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../server.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), AuditLog.deleteMany({})]);
});

const register = (email) => request(app).post('/api/auth/register').send({ email, password: 'Password123!' });

describe('Admin security boundaries', () => {
  it('rejects regular users from every protected admin surface', async () => {
    const response = await register('regular-admin-test@ledger.app');
    const token = response.body.accessToken;
    const routes = ['/stats', '/charts', '/users', '/expenses', '/bills', '/ai-usage', '/audit-logs', '/health', '/settings'];

    for (const route of routes) {
      const result = await request(app).get(`/api/admin${route}`).set('Authorization', `Bearer ${token}`);
      expect(result.status).toBe(403);
    }
  });

  it('blocks suspended users from login and refresh', async () => {
    const response = await register('suspended-admin-test@ledger.app');
    const user = await User.findOne({ email: 'suspended-admin-test@ledger.app' });
    user.isSuspended = true;
    await user.save();

    const login = await request(app).post('/api/auth/login').send({
      email: 'suspended-admin-test@ledger.app',
      password: 'Password123!',
    });
    expect(login.status).toBe(403);
    expect(login.body.code).toBe('ACCOUNT_SUSPENDED');

    const refresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', response.headers['set-cookie']);
    expect(refresh.status).toBe(403);
    expect(refresh.body.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('writes audit records for admin data views', async () => {
    const passwordHash = await User.hashPassword('Admin1234!');
    const admin = await User.create({ email: 'audit-admin-test@ledger.app', passwordHash, isAdmin: true });
    const login = await request(app).post('/api/auth/login').send({
      email: admin.email,
      password: 'Admin1234!',
    });

    const response = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(response.status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'user.list.view' })).toBe(1);
  });
});
