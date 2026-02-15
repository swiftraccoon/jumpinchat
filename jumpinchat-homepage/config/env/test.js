export default {
  auth: {
    sharedSecret: 'test-shared-secret',
    jwtSecret: 'test-jwt-secret',
    cookieSecret: 'test-cookie-secret',
    cookieTimeout: 1000 * 60 * 60 * 24,
  },
  stripe: {
    publicKey: 'pk_test_dummy',
  },
};
