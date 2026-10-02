import { Router } from 'express';
import { getStats, getUsers, getUserExpenses } from '../controllers/adminController.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/stats', getStats);
router.get('/users', getUsers);
router.get('/users/:userId/expenses', getUserExpenses);

export default router;
