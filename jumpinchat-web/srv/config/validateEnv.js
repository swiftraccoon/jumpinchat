const REQUIRED_VARS = [
  'JWT_SECRET',
  'COOKIE_SECRET',
  'SHARED_SECRET',
  'MONGODB_URI',
  'REDIS_URI',
  'FILE_TOKEN_SECRET',
  'JANUS_TOKEN_SECRET',
];

const KNOWN_DEFAULTS = new Set([
  'foo',
  'jwtsecret',
  'secret',
  'dev-jwt-secret-change-me',
  'dev-cookie-secret-change-me',
  'dev-file-token-secret-change-me',
  'gO0g$I3qkEWr0X&C92*P/=aiL8NAV-',
]);

/**
 * Validate that required environment variables are set and not using known
 * insecure defaults. Only enforced in production.
 *
 * @param {string} env - The current NODE_ENV value
 * @param {object} processEnv - The process.env object (or a plain object for testing)
 * @throws {Error} if any validation failures are found in production
 */
export function validateEnv(env, processEnv) {
  if (env !== 'production') {
    return;
  }

  const failures = [];

  for (const varName of REQUIRED_VARS) {
    const value = processEnv[varName];

    if (!value) {
      failures.push(`${varName} is not set`);
    } else if (KNOWN_DEFAULTS.has(value)) {
      failures.push(`${varName} is set to a known insecure default`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Environment validation failed:\n  - ${failures.join('\n  - ')}`,
    );
  }
}
