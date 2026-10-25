import jwt from 'jsonwebtoken';
import { PlatformSettings } from '../models/PlatformSettings.js';
import { User } from '../models/User.js';
import { getAccessTokenSecret } from './auth.js';

/**
 * Platform-wide maintenance switch.
 *
 * The admin console writes `maintenanceMode` to PlatformSettings, so the value
 * has to be honoured by the API itself — otherwise the toggle would be a lie.
 *
 * The flag is cached briefly because this middleware runs on every API request;
 * `updateAdminSettings` clears the cache so a toggle takes effect immediately.
 */

const CACHE_TTL_MS = 10_000;

// Authentication has to stay reachable so an administrator can sign in and turn
// maintenance back off. Registration stays blocked while maintenance is on.
const BYPASS_PATHS = new Set(['/auth/login', '/auth/refresh', '/auth/logout']);

let cachedMode = false;
let cachedAt = 0;

export const invalidateMaintenanceCache = () => {
  cachedAt = 0;
};

export const readMaintenanceMode = async () => {
  if (cachedAt && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedMode;
  }

  const settings = await PlatformSettings.findOne({ key: 'default' })
    .select('maintenanceMode')
    .lean();

  cachedMode = Boolean(settings?.maintenanceMode);
  cachedAt = Date.now();
  return cachedMode;
};

const isAdminRequest = async (req) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return false;

  try {
    const decoded = jwt.verify(header.slice(7), getAccessTokenSecret());
    const user = await User.findById(decoded.id).select('isAdmin isSuspended').lean();
    return Boolean(user?.isAdmin && !user?.isSuspended);
  } catch {
    return false;
  }
};

export const requireOperational = async (req, res, next) => {
  try {
    if (BYPASS_PATHS.has(req.path)) return next();
    if (!(await readMaintenanceMode())) return next();
    if (await isAdminRequest(req)) return next();

    return res.status(503).json({
      error: 'Ledger is temporarily in maintenance mode. Please try again shortly.',
      code: 'MAINTENANCE_MODE',
    });
  } catch (err) {
    return next(err);
  }
};
