import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../server.js';
import { User } from '../models/User.js';
import { Category } from '../models/Category.js';
import { Expense } from '../models/Expense.js';

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  await Expense.deleteMany({});
  await Category.deleteMany({});
  await User.deleteMany({});
});

describe('Ledger MERN API Integration Tests', () => {
  describe('Authentication Flow', () => {
    it('registers a new user, seeds 9 default categories, sets refresh cookie', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'testuser@ledger.app',
          password: 'Password123!',
          fullName: 'Test User',
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('testuser@ledger.app');
      expect(res.body.user.is_admin).toBe(false);
      expect(res.body.accessToken).toBeDefined();

      // Check refreshToken cookie is set
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c) => c.includes('refreshToken='))).toBe(true);

      // Verify 9 default categories were seeded
      const cats = await Category.find({ user: res.body.user.id });
      expect(cats.length).toBe(9);
    });

    it('rejects registration with existing email', async () => {
      await request(app).post('/api/auth/register').send({
        email: 'duplicate@ledger.app',
        password: 'Password123!',
      });

      const res = await request(app).post('/api/auth/register').send({
        email: 'duplicate@ledger.app',
        password: 'Password123!',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already registered');
    });

    it('logs in an existing user with correct credentials and rejects invalid credentials', async () => {
      await request(app).post('/api/auth/register').send({
        email: 'login@ledger.app',
        password: 'CorrectPassword123!',
      });

      // Bad password
      const badRes = await request(app).post('/api/auth/login').send({
        email: 'login@ledger.app',
        password: 'WrongPassword!',
      });
      expect(badRes.status).toBe(401);
      expect(badRes.body.error).toBe('Invalid email or password');

      // Good password
      const goodRes = await request(app).post('/api/auth/login').send({
        email: 'login@ledger.app',
        password: 'CorrectPassword123!',
      });
      expect(goodRes.status).toBe(200);
      expect(goodRes.body.accessToken).toBeDefined();
    });

    it('refreshes access token via cookie and logs out', async () => {
      const reg = await request(app).post('/api/auth/register').send({
        email: 'refresh@ledger.app',
        password: 'Password123!',
      });

      const cookies = reg.headers['set-cookie'];

      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookies);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.accessToken).toBeDefined();

      const logoutRes = await request(app).post('/api/auth/logout');
      expect(logoutRes.status).toBe(200);
    });
  });

  describe('Profile & Strict Allowlist', () => {
    it('prevents privilege escalation: isAdmin and email cannot be updated via PUT /api/profile', async () => {
      const reg = await request(app).post('/api/auth/register').send({
        email: 'regular@ledger.app',
        password: 'Password123!',
      });
      const token = reg.body.accessToken;

      const updateRes = await request(app)
        .put('/api/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Suleiman Escalate',
          isAdmin: true,
          is_admin: true,
          email: 'hacked@ledger.app',
          monthlyBudget: 80000,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.full_name).toBe('Suleiman Escalate');
      expect(updateRes.body.monthly_budget).toBe(80000);
      // Ensure isAdmin is still false and email did not change
      expect(updateRes.body.is_admin).toBe(false);
      expect(updateRes.body.email).toBe('regular@ledger.app');

      // Verify in DB directly
      const dbUser = await User.findById(reg.body.user.id);
      expect(dbUser.isAdmin).toBe(false);
      expect(dbUser.email).toBe('regular@ledger.app');
    });
  });

  describe('Ownership Isolation (User A vs User B)', () => {
    it('ensures User B cannot read, update, or delete User A expenses (returns 404)', async () => {
      // User A
      const regA = await request(app).post('/api/auth/register').send({
        email: 'userA@ledger.app',
        password: 'Password123!',
      });
      const tokenA = regA.body.accessToken;

      // User B
      const regB = await request(app).post('/api/auth/register').send({
        email: 'userB@ledger.app',
        password: 'Password123!',
      });
      const tokenB = regB.body.accessToken;

      // User A creates an expense
      const expRes = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          amount: 500,
          category: 'Food & Dining',
          note: 'User A Secret Lunch',
        });
      expect(expRes.status).toBe(201);
      const expenseId = expRes.body.expense.id;

      // User B lists expenses -> should be empty
      const listB = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${tokenB}`);
      expect(listB.status).toBe(200);
      expect(listB.body.length).toBe(0);

      // User B attempts to edit User A expense -> MUST return 404 (not 403)
      const editB = await request(app)
        .put(`/api/expenses/${expenseId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ amount: 9999 });
      expect(editB.status).toBe(404);

      // User B attempts to delete User A expense -> MUST return 404
      const deleteB = await request(app)
        .delete(`/api/expenses/${expenseId}`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(deleteB.status).toBe(404);

      // Verify User A expense is still intact
      const listA = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(listA.body.length).toBe(1);
      expect(listA.body[0].amount).toBe(500);
    });
  });

  describe('Admin Authorization', () => {
    it('forbids regular users from accessing /api/admin/stats with 403', async () => {
      const reg = await request(app).post('/api/auth/register').send({
        email: 'notadmin@ledger.app',
        password: 'Password123!',
      });
      const token = reg.body.accessToken;

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Administrator privileges required');
    });

    it('allows verified admin to view platform stats and user list', async () => {
      const passwordHash = await User.hashPassword('Admin1234!');
      const admin = await User.create({
        email: 'actualadmin@ledger.app',
        passwordHash,
        isAdmin: true,
      });

      const login = await request(app).post('/api/auth/login').send({
        email: 'actualadmin@ledger.app',
        password: 'Admin1234!',
      });
      const token = login.body.accessToken;

      const statsRes = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.totalUsers).toBeGreaterThanOrEqual(1);

      const usersRes = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);
      expect(usersRes.status).toBe(200);
      expect(Array.isArray(usersRes.body.users)).toBe(true);
    });
  });

  describe('Expense Filters & Sorting', () => {
    it('correctly filters by category, note search, and sorts by amount', async () => {
      const reg = await request(app).post('/api/auth/register').send({
        email: 'filters@ledger.app',
        password: 'Password123!',
      });
      const token = reg.body.accessToken;

      // Add 3 expenses
      await request(app).post('/api/expenses').set('Authorization', `Bearer ${token}`).send({
        amount: 100,
        category: 'Food & Dining',
        note: 'Special pepperoni pizza',
        date: '2026-05-01',
      });
      await request(app).post('/api/expenses').set('Authorization', `Bearer ${token}`).send({
        amount: 800,
        category: 'Shopping',
        note: 'Laptop sleeve',
        date: '2026-05-02',
      });
      await request(app).post('/api/expenses').set('Authorization', `Bearer ${token}`).send({
        amount: 350,
        category: 'Food & Dining',
        note: 'Burger and fries',
        date: '2026-05-03',
      });

      // Filter by category
      const foodRes = await request(app)
        .get('/api/expenses?category=Food%20%26%20Dining')
        .set('Authorization', `Bearer ${token}`);
      expect(foodRes.body.length).toBe(2);

      // Search by note query
      const searchRes = await request(app)
        .get('/api/expenses?search=pizza')
        .set('Authorization', `Bearer ${token}`);
      expect(searchRes.body.length).toBe(1);
      expect(searchRes.body[0].amount).toBe(100);

      // Sort by amount descending
      const sortRes = await request(app)
        .get('/api/expenses?sortBy=amount-desc')
        .set('Authorization', `Bearer ${token}`);
      expect(sortRes.body[0].amount).toBe(800);
      expect(sortRes.body[1].amount).toBe(350);
      expect(sortRes.body[2].amount).toBe(100);
    });
  });
});
