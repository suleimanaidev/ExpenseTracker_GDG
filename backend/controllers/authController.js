import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Category, DEFAULT_CATEGORIES } from '../models/Category.js';
import {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenSecret,
} from '../middleware/auth.js';
import { PlatformSettings } from '../models/PlatformSettings.js';

// Built per call so NODE_ENV is read after environment loading, and so the
// `secure` flag is accurate in production deployments.
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});

// Express clearCookie must receive matching cookie attributes, but not maxAge.
const clearCookieOptions = () => {
  const { httpOnly, secure, sameSite } = cookieOptions();
  return { httpOnly, secure, sameSite };
};

export const register = async (req, res, next) => {
  try {
    const { email, password, fullName } = req.body;

    const platformSettings = await PlatformSettings.findOne({ key: 'default' }).lean();
    if (platformSettings?.allowNewSignups === false) {
      return res.status(503).json({
        error: 'New account registration is temporarily unavailable.',
        code: 'SIGNUPS_DISABLED',
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'This email address is already registered.' });
    }

    const passwordHash = await User.hashPassword(password);

    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      fullName: fullName ? fullName.trim() : '',
      isAdmin: false,
      monthlyBudget: 50000,
      currency: 'PKR',
      // The admin console's default only matters for accounts created after it
      // changes; the env fallback keeps fresh installs predictable.
      aiDailyLimit:
        platformSettings?.defaultAiDailyLimit ??
        (Number.parseInt(process.env.DEFAULT_AI_DAILY_LIMIT, 10) || 100),
    });

    // Sequential category seeding with rollback on failure
    try {
      const defaultCats = DEFAULT_CATEGORIES.map((c) => ({
        user: user._id,
        name: c.name,
        color: c.color,
        icon: c.icon,
      }));
      await Category.insertMany(defaultCats);
    } catch (seedErr) {
      console.error('Failed to seed categories on signup, rolling back user creation:', seedErr);
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({ error: 'Failed to initialize account defaults' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie('refreshToken', refreshToken, cookieOptions());

    return res.status(201).json({
      user: user.toJSON(),
      accessToken,
    });
  } catch (err) {
    next(err);
  }
};

// A real bcrypt hash (cost 12) of a throwaway string. Unknown emails are compared
// against it so they cost as much time as a wrong password: otherwise response
// time would reveal which emails have accounts.
const TIMING_DUMMY_HASH = '$2a$12$Kds1pkseHdxaJvKxeMZKv.PzoRh3BUrKOwU6j6bpimHO.kURXCCH2';

const maxFailedLogins = () => Number.parseInt(process.env.MAX_FAILED_LOGINS, 10) || 10;
const lockMinutes = () => Number.parseInt(process.env.LOGIN_LOCK_MINUTES, 10) || 15;

const invalidCredentials = (res) => res.status(401).json({ error: 'Invalid email or password' });

const lockedResponse = (res, lockUntil) => {
  const seconds = Math.max(1, Math.ceil((lockUntil.getTime() - Date.now()) / 1000));
  res.set('Retry-After', String(seconds));
  return res.status(429).json({
    error: 'Too many requests',
    code: 'RATE_LIMITED',
    retryAfterSeconds: seconds,
  });
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');

    // Unknown email: same work, same answer as a wrong password.
    if (!user) {
      await bcrypt.compare(password, TIMING_DUMMY_HASH);
      return invalidCredentials(res);
    }

    // A locked account is refused before the password is looked at, so a correct
    // guess during the lock reveals nothing. A dummy compare keeps the timing close.
    if (user.lockUntil && user.lockUntil > new Date()) {
      await bcrypt.compare(password, TIMING_DUMMY_HASH);
      return lockedResponse(res, user.lockUntil);
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      // Atomic, so parallel guesses cannot all read the same count and slip under the limit.
      const updated = await User.findOneAndUpdate(
        { _id: user._id },
        { $inc: { failedLoginCount: 1 } },
        { new: true }
      );

      if (updated && updated.failedLoginCount >= maxFailedLogins()) {
        const lockUntil = new Date(Date.now() + lockMinutes() * 60 * 1000);
        await User.updateOne({ _id: user._id }, { $set: { lockUntil, failedLoginCount: 0 } });
      }
      return invalidCredentials(res);
    }

    if (user.isSuspended) {
      return res.status(403).json({
        error: 'This account is suspended. Please contact an administrator.',
        code: 'ACCOUNT_SUSPENDED',
      });
    }

    user.lastLoginAt = new Date();
    user.failedLoginCount = 0;
    user.lockUntil = null;
    await user.save();

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie('refreshToken', refreshToken, cookieOptions());

    return res.json({
      user: user.toJSON(),
      accessToken,
    });
  } catch (err) {
    next(err);
  }
};
export const logout = async (req, res) => {
  res.clearCookie('refreshToken', clearCookieOptions());
  return res.json({ message: 'Successfully logged out' });
};

export const refresh = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!token) {
      return res.status(401).json({
        error: 'Refresh token missing',
        code: 'REFRESH_TOKEN_MISSING',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, getRefreshTokenSecret());
    } catch (jwtErr) {
      return res.status(401).json({
        error: 'Invalid or expired refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    if (user.isSuspended) {
      res.clearCookie('refreshToken', clearCookieOptions());
      return res.status(403).json({
        error: 'This account is suspended. Please contact an administrator.',
        code: 'ACCOUNT_SUSPENDED',
      });
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    res.cookie('refreshToken', newRefreshToken, cookieOptions());

    return res.json({
      accessToken: newAccessToken,
      user: user.toJSON(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to refresh token' });
  }
};

export const getMe = async (req, res) => {
  return res.json({
    user: req.user.toJSON(),
  });
};
