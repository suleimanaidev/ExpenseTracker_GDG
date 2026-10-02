import { Router } from 'express';
import { z } from 'zod';
import {
  getCategories,
  createCategory,
  deleteCategory,
} from '../controllers/categoryController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const createCategorySchema = {
  body: z.object({
    name: z.string().min(1, 'Category name is required').max(50, 'Name cannot exceed 50 characters'),
    color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Valid hex color required').optional(),
    emoji: z.string().max(10).optional(),
  }),
};

router.use(authenticate);

router.get('/', getCategories);
router.post('/', validate(createCategorySchema), createCategory);
router.delete('/:name', deleteCategory);

export default router;
