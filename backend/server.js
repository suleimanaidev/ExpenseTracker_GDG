// Load `.env` before any other import. ES modules evaluate imports in source
// order, and modules such as middleware/auth.js read process.env as they are
// evaluated. Calling dotenv.config() later in this file would therefore be too
// late: the server would silently fall back to the hardcoded development
// secrets even when JWT_ACCESS_SECRET/JWT_REFRESH_SECRET are set in `.env`.
import 'dotenv/config';

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';

import { connectDB, isDBConnected, pingDB } from './config/db.js';
import { validateEnvironment } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requireOperational, readMaintenanceMode } from './middleware/maintenance.js';
import { globalLimiter, warnIfRedisMissing } from './middleware/rateLimiters.js';
import { closeRedis, pingRedis } from './config/redis.js';

import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import billRoutes from './routes/billRoutes.js';

validateEnvironment();

const app = express();

/**
 * Behind Render, Railway, Vercel or any reverse proxy, every request reaches the
 * app from the proxy's address. Without `trust proxy`, `req.ip` is that one address
 * for everybody, so all users would share a single rate-limit bucket and one noisy
 * client could lock everyone out. TRUST_PROXY is the number of proxy hops to trust
 * (default 1 in production, off in development). It must match reality: trusting too
 * many hops lets a client forge X-Forwarded-For and dodge its own limit.
 */
const parseTrustProxy = (value) => {
  if (value === undefined || value === '') return process.env.NODE_ENV === 'production' ? 1 : false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const hops = Number(value);
  return Number.isInteger(hops) && hops >= 0 ? hops : value;
};
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
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
 * Baseline abuse ceiling for the whole API (see middleware/rateLimiters.js for the
 * limit, store and 429 shape). Per-route limiters sit in front of this and are far
 * tighter where an endpoint costs money or unlocks an account.
 */
app.use('/api', globalLimiter);

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
  const [db, redis] = await Promise.all([pingDB(), pingRedis()]);
  let maintenance = false;

  if (db.ok) {
    try {
      maintenance = await readMaintenanceMode();
    } catch {
      // If the setting cannot be read, the API should keep serving rather than
      // appearing to be in maintenance.
      maintenance = false;
    }
  }

  res.status(db.ok ? 200 : 503).json({
    status: db.ok ? 'ok' : 'degraded',
    server: 'Ledger Backend (Express)',
    database: db.ok ? 'connected' : db.error,
    redis,
    maintenance,
    port: PORT,
  });
});

// Block non-admin API traffic while an administrator has maintenance mode on.
// Auth routes that let an admin sign in are exempted inside the middleware.
app.use('/api', requireOperational);

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
  warnIfRedisMissing();
  connectDB()
    .then(() => {
      const server = app.listen(PORT, () => {
        console.log(`Ledger API listening on http://localhost:${PORT}`);
      });

      const shutdown = (signal) => {
        console.log(`${signal} received, shutting down`);
        server.close(async () => {
          await closeRedis();
          await mongoose.connection.close().catch(() => {});
          process.exit(0);
        });
        // A stuck connection must not keep the process alive forever.
        setTimeout(() => process.exit(1), 10_000).unref();
      };
      process.once('SIGTERM', () => shutdown('SIGTERM'));
      process.once('SIGINT', () => shutdown('SIGINT'));

      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(
            `Port ${PORT} is already in use. The Ledger backend may already be running. ` +
            `Stop the existing process or use a different PORT before starting another server.`
          );
          process.exitCode = 1;
          server.close(() => process.exit(1));
          return;
        }
        console.error('Ledger API failed to start:', error);
      });
    })
    .catch((error) => {
      console.error('Ledger API failed to connect to MongoDB:', error.message);
      process.exitCode = 1;
    });
}

export default app;
