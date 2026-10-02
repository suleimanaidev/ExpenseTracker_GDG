import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { Category, DEFAULT_CATEGORIES } from '../models/Category.js';
import {
  generateAccessToken,
  generateRefreshToken,
  JWT_REFRESH_SECRET,
} from '../middleware/auth.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const register = async (req, res, next) => {
  try {
    const { email, password, fullName } = req.body;

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

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

    return res.status(201).json({
      user: user.toJSON(),
      accessToken,
    });
  } catch (err) {
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

    return res.json({
      user: user.toJSON(),
      accessToken,
    });
  } catch (err) {
    next(err);
  }
};

export const logout = async (req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
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
      decoded = jwt.verify(token, JWT_REFRESH_SECRET);
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

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    res.cookie('refreshToken', newRefreshToken, COOKIE_OPTIONS);

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
