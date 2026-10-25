const DEVELOPMENT_SECRETS = new Set([
  'ledger_access_secret_key_development_32chars_long_123',
  'ledger_refresh_secret_key_development_32chars_long_456',
]);

export function validateEnvironment(environment = process.env) {
  if (environment.NODE_ENV !== 'production') return;

  const required = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'FRONTEND_URL'];
  const missing = required.filter((name) => !environment[name]?.trim());
  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }

  for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const value = environment[name];
    if (value.length < 32 || DEVELOPMENT_SECRETS.has(value)) {
      throw new Error(`${name} must be a unique production secret of at least 32 characters.`);
    }
  }

  new URL(environment.FRONTEND_URL);
}
