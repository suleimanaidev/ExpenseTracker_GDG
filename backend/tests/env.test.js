import { describe, expect, it, afterEach } from 'vitest';
import { validateEnvironment } from '../config/env.js';
import { getAccessTokenSecret, getRefreshTokenSecret } from '../middleware/auth.js';

describe('production environment validation', () => {
  it('does not constrain development or test environments', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('reports missing production configuration', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow('MONGODB_URI');
  });

  it('accepts a complete production configuration', () => {
    expect(() => validateEnvironment({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://database/ledger',
      JWT_ACCESS_SECRET: 'unique-access-secret-that-is-long-enough',
      JWT_REFRESH_SECRET: 'unique-refresh-secret-that-is-long-enough',
      FRONTEND_URL: 'https://ledger.example.com',
    })).not.toThrow();
  });
});

describe('JWT secret resolution', () => {
  const originalAccess = process.env.JWT_ACCESS_SECRET;
  const originalRefresh = process.env.JWT_REFRESH_SECRET;

  afterEach(() => {
    if (originalAccess === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = originalAccess;

    if (originalRefresh === undefined) delete process.env.JWT_REFRESH_SECRET;
    else process.env.JWT_REFRESH_SECRET = originalRefresh;
  });

  it('reads the configured secrets at call time, not module-load time', () => {
    process.env.JWT_ACCESS_SECRET = 'runtime-access-secret';
    process.env.JWT_REFRESH_SECRET = 'runtime-refresh-secret';

    expect(getAccessTokenSecret()).toBe('runtime-access-secret');
    expect(getRefreshTokenSecret()).toBe('runtime-refresh-secret');
  });

  it('falls back to the documented development defaults when unset', () => {
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    expect(getAccessTokenSecret()).toBe('ledger_jwt_access_secret_key_default_3821');
    expect(getRefreshTokenSecret()).toBe('ledger_jwt_refresh_secret_key_default_9482');
  });
});
