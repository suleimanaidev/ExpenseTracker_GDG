import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

export const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'ledger_jwt_access_secret_key_default_3821';
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'ledger_jwt_refresh_secret_key_default_9482';

export const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_EXPIRY = '7d';

/**
 * Generates an access token (15 minutes).
 */
export const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
    },
    JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

/**
 * Generates a refresh token (7 days).
 */
export const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user._id.toString(),
    },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
};

/**
 * Middleware: Authenticate request using JWT Access Token.
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid authorization header',
        code: 'UNAUTHORIZED',
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        error: 'Authorization token not provided',
        code: 'UNAUTHORIZED',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_ACCESS_SECRET);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Access token expired',
          code: 'TOKEN_EXPIRED',
        });
      }
      return res.status(401).json({
        error: 'Invalid access token',
        code: 'INVALID_TOKEN',
      });
    }

    // Load user from database to ensure fresh state and existence
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        error: 'User account not found',
        code: 'USER_NOT_FOUND',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Authentication middleware error:', err);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
};
