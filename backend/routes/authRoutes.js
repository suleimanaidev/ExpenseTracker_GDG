import { Router } from 'express';
import { z } from 'zod';
import {
  register,
  login,
  logout,
  refresh,
  getMe,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  loginEmailLimiter,
  loginIpLimiter,
  refreshLimiter,
  registerLimiter,
} from '../middleware/rateLimiters.js';

const router = Router();
const registerSchema = {
  body: z.object({
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    fullName: z.string().optional(),
  }),
};

const loginSchema = {
  body: z.object({
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
};

router.post('/register', registerLimiter, validate(registerSchema), register);
// Two independent budgets: one per IP, one per email, so a single account cannot be
// guessed from many addresses and a shared IP is not locked out by one user's typos.
router.post('/login', loginIpLimiter, loginEmailLimiter, validate(loginSchema), login);
router.post('/logout', logout);
router.post('/refresh', refreshLimiter, refresh);
router.get('/me', authenticate, getMe);

export default router;
