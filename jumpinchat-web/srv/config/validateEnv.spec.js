import { expect } from 'chai';
import { validateEnv } from './validateEnv.js';

const REQUIRED_VARS = [
  'JWT_SECRET',
  'COOKIE_SECRET',
  'SHARED_SECRET',
  'MONGODB_URI',
  'REDIS_URI',
  'FILE_TOKEN_SECRET',
  'JANUS_TOKEN_SECRET',
];

const KNOWN_DEFAULTS = [
  'foo',
  'jwtsecret',
  'secret',
  'dev-jwt-secret-change-me',
  'dev-cookie-secret-change-me',
  'dev-file-token-secret-change-me',
  'gO0g$I3qkEWr0X&C92*P/=aiL8NAV-',
];

function makeValidEnv() {
  return {
    JWT_SECRET: 'real-jwt-secret-abc123',
    COOKIE_SECRET: 'real-cookie-secret-xyz789',
    SHARED_SECRET: 'real-shared-secret-def456',
    MONGODB_URI: 'mongodb://prod-host:27017/jic',
    REDIS_URI: 'redis://prod-host:6379',
    FILE_TOKEN_SECRET: 'real-file-token-secret-ghi012',
    JANUS_TOKEN_SECRET: 'real-janus-token-secret-jkl345',
  };
}

describe('validateEnv', () => {
  describe('in production', () => {
    it('should not throw when all required vars are set to non-default values', () => {
      expect(() => validateEnv('production', makeValidEnv())).to.not.throw();
    });

    REQUIRED_VARS.forEach((varName) => {
      it(`should throw when ${varName} is missing`, () => {
        const env = makeValidEnv();
        delete env[varName];
        expect(() => validateEnv('production', env)).to.throw(Error, varName);
      });

      it(`should throw when ${varName} is empty string`, () => {
        const env = makeValidEnv();
        env[varName] = '';
        expect(() => validateEnv('production', env)).to.throw(Error, varName);
      });
    });

    KNOWN_DEFAULTS.forEach((defaultVal) => {
      it(`should throw when any var is set to known default "${defaultVal}"`, () => {
        const env = makeValidEnv();
        env.JWT_SECRET = defaultVal;
        expect(() => validateEnv('production', env)).to.throw(Error, 'JWT_SECRET');
      });
    });

    it('should list all failures in the error message when multiple vars are invalid', () => {
      const env = makeValidEnv();
      delete env.JWT_SECRET;
      delete env.COOKIE_SECRET;
      env.SHARED_SECRET = 'foo';

      try {
        validateEnv('production', env);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.include('JWT_SECRET');
        expect(err.message).to.include('COOKIE_SECRET');
        expect(err.message).to.include('SHARED_SECRET');
      }
    });

    it('should distinguish missing vars from default-value vars in the error', () => {
      const env = makeValidEnv();
      delete env.MONGODB_URI;
      env.REDIS_URI = 'secret';

      try {
        validateEnv('production', env);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.include('MONGODB_URI');
        expect(err.message).to.include('REDIS_URI');
      }
    });
  });

  describe('in non-production environments', () => {
    it('should not throw in development even with missing vars', () => {
      expect(() => validateEnv('development', {})).to.not.throw();
    });

    it('should not throw in test even with missing vars', () => {
      expect(() => validateEnv('test', {})).to.not.throw();
    });

    it('should not throw in development even with known default values', () => {
      const env = {};
      REQUIRED_VARS.forEach((v) => { env[v] = 'foo'; });
      expect(() => validateEnv('development', env)).to.not.throw();
    });
  });
});
