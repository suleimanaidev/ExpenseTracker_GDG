import { Router } from 'express';
import { z } from 'zod';
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
} from '../controllers/expenseController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const createExpenseSchema = {
  body: z.object({
    amount: z.union([z.number(), z.string()]).refine((val) => {
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return !isNaN(num) && num > 0 && num <= 1000000000;
    }, 'Amount must be a positive number under 1,000,000,000'),
    category: z.string().min(1, 'Category is required').max(50),
    category_id: z.string().nullable().optional(),
    note: z.string().max(500).optional(),
    spent_at: z.string().optional(),
    date: z.string().optional(),
  }),
};

const updateExpenseSchema = {
  body: z.object({
    amount: z.union([z.number(), z.string()]).refine((val) => {
      if (val === undefined) return true;
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return !isNaN(num) && num > 0 && num <= 1000000000;
    }, 'Amount must be a positive number under 1,000,000,000').optional(),
    category: z.string().min(1).max(50).optional(),
    category_id: z.string().nullable().optional(),
    note: z.string().max(500).optional(),
    spent_at: z.string().optional(),
    date: z.string().optional(),
  }),
};

router.use(authenticate);

router.get('/', getExpenses);
router.post('/', validate(createExpenseSchema), createExpense);
router.put('/:id', validate(updateExpenseSchema), updateExpense);
router.delete('/:id', deleteExpense);

export default router;
