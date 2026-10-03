import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import dotenv from 'dotenv';

import { connectDB, isDBConnected, pingDB } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import billRoutes from './routes/billRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const isTest = process.env.NODE_ENV === 'test';

/**
 * CORS allowlist.
 *
 * Any localhost port is accepted so a second Vite instance (5174, 5173 after a
 * port clash) keeps working in development; deployed origins must be listed.
 */
const ALLOWED_ORIGINS = [FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(Boolean);

app.use(
  helmet({
    // Bill PDFs and images are served from this origin to the SPA and previewed
    // in an <img>/<iframe>; the default same-origin policy would block them.
    crossOriginResourcePolicy: { policy: 'same-site' },
    contentSecurityPolicy: false,
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // curl, native clients, same-origin
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      if (process.env.NODE_ENV !== 'production') {
        if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          return callback(null, true);
        }
      }
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true, // required for the httpOnly refresh cookie
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(mongoSanitize());
app.use(cookieParser());

/**
 * Baseline abuse ceiling for the whole API. Per-route limiters (login, AI,
 * bill scanning) sit in front of this and are far tighter where an endpoint
 * costs money or unlocks an account.
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});

app.use('/api', generalLimiter);

// ─── Service metadata ───
app.get('/', async (req, res) => {
  res.json({
    status: 'online',
    server: 'Ledger API (Express + MongoDB)',
    database: { connected: isDBConnected() },
    endpoints: {
      auth: '/api/auth',
      profile: '/api/profile',
      categories: '/api/categories',
      expenses: '/api/expenses',
      bills: '/api/bills',
      billScan: '/api/bills/scan',
      insight: '/api/insight',
      admin: '/api/admin',
      health: '/api/health',
    },
  });
});

app.get('/api/health', async (req, res) => {
  const db = await pingDB();
  res.status(db.ok ? 200 : 503).json({
    status: db.ok ? 'ok' : 'degraded',
    server: 'Ledger Backend (Express)',
    database: db.ok ? 'connected' : db.error,
    port: PORT,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api', profileRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api', aiRoutes);
app.use('/api/admin', adminRoutes);

// Bills must be mounted before the catch-all 404 below, or Express would treat
// every /api/bills/* path as unmatched.
app.use('/api/bills', billRoutes);

// Unknown API route: JSON, never the SPA index or an HTML error page.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

app.use(errorHandler);

// ─── Start ───
if (!isTest) {
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`Ledger API listening on http://localhost:${PORT}`);
    });
  });
}

export default app;