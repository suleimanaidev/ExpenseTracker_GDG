import { Router } from 'express';
import { z } from 'zod';
import {
  getProfile,
  updateProfile,
  updateBudget,
  clearUserData,
} from '../controllers/profileController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const updateProfileSchema = {
  body: z.object({
    fullName: z.string().max(100).optional(),
    full_name: z.string().max(100).optional(),
    monthlyBudget: z.number().min(0).optional(),
    monthly_budget: z.number().min(0).optional(),
    currency: z.enum(['PKR', 'USD', 'EUR', 'GBP', 'INR']).optional(),
  }),
};

router.use(authenticate);

router.get('/profile', getProfile);
router.put('/profile', validate(updateProfileSchema), updateProfile);
router.put('/settings/budget', updateBudget);
router.delete('/profile/clear', clearUserData);

export default router;
