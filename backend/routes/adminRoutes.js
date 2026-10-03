import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  getOverviewStats,
  getCharts,
  getUsers,
  getUserDetail,
  getUserExpenses,
  updateUserStatus,
  updateUserRole,
  resetUserPassword,
  deleteUser,
  getAiUsage,
  getAuditLogs,
} from '../controllers/adminController.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin requests. Please try again shortly.' },
});

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const rangeQuery = {
  query: z.object({
    range: z.enum(['7d', '30d', '90d', '12m']).optional(),
  }).passthrough(),
};
const usersQuery = {
  query: z.object({
    search: z.string().max(120).optional(),
    role: z.enum(['all', 'admin', 'user']).optional(),
    status: z.enum(['all', 'active', 'suspended']).optional(),
    sort: z.string().max(30).optional(),
    page: z.coerce.number().int().min(1).max(100000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }).passthrough(),
};

router.use(adminLimiter, authenticate, requireAdmin);

router.get('/stats', validate(rangeQuery), getOverviewStats);
router.get('/charts', validate(rangeQuery), getCharts);
router.get('/users', validate(usersQuery), getUsers);
router.get('/users/:userId', validate({ params: z.object({ userId: objectId }) }), getUserDetail);
router.get('/users/:userId/expenses', validate({ params: z.object({ userId: objectId }) }), getUserExpenses);
router.patch(
  '/users/:userId/status',
  validate({
    params: z.object({ userId: objectId }),
    body: z.object({ suspended: z.boolean() }),
  }),
  updateUserStatus
);
router.patch(
  '/users/:userId/role',
  validate({
    params: z.object({ userId: objectId }),
    body: z.object({ isAdmin: z.boolean() }),
  }),
  updateUserRole
);
router.post(
  '/users/:userId/reset-password',
  validate({ params: z.object({ userId: objectId }), body: z.object({}).passthrough() }),
  resetUserPassword
);
router.delete(
  '/users/:userId',
  validate({
    params: z.object({ userId: objectId }),
    body: z.object({ confirmEmail: z.string().email() }),
  }),
  deleteUser
);
router.get('/ai-usage', getAiUsage);
router.get('/audit-logs', getAuditLogs);

export default router;
