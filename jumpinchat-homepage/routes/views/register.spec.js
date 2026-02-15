import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

function createReq(overrides = {}) {
  return {
    signedCookies: {},
    user: null,
    path: '/register',
    query: {},
    body: {},
    session: {},
    method: 'GET',
    flash: sinon.spy(),
    headers: {},
    connection: { remoteAddress: '127.0.0.1' },
    ...overrides,
  };
}

function createRes(overrides = {}) {
  const res = {
    locals: {},
    status: sinon.stub().returnsThis(),
    send: sinon.stub().returnsThis(),
    end: sinon.stub().returnsThis(),
    redirect: sinon.stub(),
    render: sinon.stub(),
    cookie: sinon.stub(),
    ...overrides,
  };
  return res;
}

function stubLogger() {
  return () => ({
    debug: sinon.spy(),
    warn: sinon.spy(),
    error: sinon.spy(),
    fatal: sinon.spy(),
    info: sinon.spy(),
    trace: sinon.spy(),
  });
}

describe('register view', () => {
  describe('GET /register', () => {
    it('should render register template', async () => {
      const register = (await esmock('./register.js', {
        'axios': { default: sinon.stub() },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: { ERR_VALIDATION: 'Invalid details', ERR_SRV: 'Something went wrong' },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
        '../../utils/userUtils.js': { getRemoteIpFromReq: sinon.stub().returns('127.0.0.1') },
      })).default;

      const req = createReq({ method: 'GET', user: null });
      const res = createRes();

      await register(req, res);

      expect(res.render.calledOnce).to.equal(true);
      expect(res.render.firstCall.args[0]).to.equal('register');
      expect(res.locals.section).to.equal('Create an account');
      expect(res.locals.description).to.include('Create an account');
      expect(res.locals.error).to.equal(null);
    });

    it('should set error from query param', async () => {
      const register = (await esmock('./register.js', {
        'axios': { default: sinon.stub() },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: { ERR_VALIDATION: 'Invalid details', ERR_SRV: 'Something went wrong' },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
        '../../utils/userUtils.js': { getRemoteIpFromReq: sinon.stub().returns('127.0.0.1') },
      })).default;

      const req = createReq({ method: 'GET', query: { error: 'Some error' } });
      const res = createRes();

      await register(req, res);

      expect(res.locals.error).to.equal('Some error');
      expect(res.render.calledWith('register')).to.equal(true);
    });

    it('should redirect to / when user is already logged in', async () => {
      const register = (await esmock('./register.js', {
        'axios': { default: sinon.stub() },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: { ERR_VALIDATION: 'Invalid details', ERR_SRV: 'Something went wrong' },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
        '../../utils/userUtils.js': { getRemoteIpFromReq: sinon.stub().returns('127.0.0.1') },
      })).default;

      const req = createReq({
        method: 'GET',
        user: { username: 'alice' },
        signedCookies: { 'jic.ident': 'user123' },
      });
      const res = createRes();

      await register(req, res);

      expect(res.redirect.calledWith('/')).to.equal(true);
      expect(res.render.called).to.equal(false);
    });
  });

  describe('POST /register', () => {
    it('should call API, set cookie, and redirect to /{username} on success', async () => {
      const axiosStub = sinon.stub();
      // First call: registration
      axiosStub.onFirstCall().resolves({
        status: 200,
        data: {
          data: {
            user: {
              _id: 'newuser123',
              username: 'newuser',
            },
          },
        },
      });
      // Second call: verification email
      axiosStub.onSecondCall().resolves({
        status: 200,
        data: { success: true },
      });

      const register = (await esmock('./register.js', {
        'axios': { default: axiosStub },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: { ERR_VALIDATION: 'Invalid details', ERR_SRV: 'Something went wrong' },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
        '../../utils/userUtils.js': { getRemoteIpFromReq: sinon.stub().returns('10.0.0.1') },
      })).default;

      const req = createReq({
        method: 'POST',
        body: {
          action: 'register',
          username: 'NewUser',
          email: 'new@example.com',
          password: 'securepassword123',
          receiveUpdates: true,
          phone6tY4bPYk: '',
        },
        session: { fingerprint: 'fp123' },
      });
      const res = createRes();

      await register(req, res);

      // Verify registration API call
      expect(axiosStub.calledTwice).to.equal(true);
      const regCall = axiosStub.firstCall.args[0];
      expect(regCall.method).to.equal('POST');
      expect(regCall.url).to.equal('http://api:80/api/user/register');
      expect(regCall.data.username).to.equal('newuser');
      expect(regCall.data.password).to.equal('securepassword123');
      expect(regCall.data.email).to.equal('new@example.com');
      expect(regCall.data.ip).to.equal('10.0.0.1');
      expect(regCall.data.fingerprint).to.equal('fp123');

      // Verify cookie
      expect(res.cookie.calledOnce).to.equal(true);
      expect(res.cookie.firstCall.args[0]).to.equal('jic.ident');
      expect(res.cookie.firstCall.args[1]).to.equal('newuser123');
      expect(res.cookie.firstCall.args[2]).to.deep.include({
        maxAge: 86400000,
        signed: true,
        httpOnly: true,
      });

      // Verify redirect to /{username} (uses original body username)
      expect(res.redirect.calledWith('/NewUser')).to.equal(true);
    });

    it('should redirect with API error message on registration failure', async () => {
      const axiosStub = sinon.stub().resolves({
        status: 409,
        data: { message: 'ERR_USER_EXISTS' },
      });

      const register = (await esmock('./register.js', {
        'axios': { default: axiosStub },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: {
            ERR_VALIDATION: 'Invalid details',
            ERR_SRV: 'Something went wrong',
            ERR_USER_EXISTS: 'Username already exists',
          },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
        '../../utils/userUtils.js': { getRemoteIpFromReq: sinon.stub().returns('127.0.0.1') },
      })).default;

      const req = createReq({
        method: 'POST',
        body: {
          action: 'register',
          username: 'existingUser',
          email: 'existing@example.com',
          password: 'securepassword123',
          receiveUpdates: false,
          phone6tY4bPYk: '',
        },
        session: { fingerprint: 'fp456' },
      });
      const res = createRes();

      await register(req, res);

      expect(res.redirect.calledOnce).to.equal(true);
      const redirectUrl = res.redirect.firstCall.args[0];
      expect(redirectUrl).to.include('error=');
      expect(redirectUrl).to.include('Username');
      expect(res.cookie.called).to.equal(false);
    });

    it('should redirect with fallback message when API error has no message', async () => {
      const axiosStub = sinon.stub().resolves({
        status: 500,
        data: {},
      });

      const register = (await esmock('./register.js', {
        'axios': { default: axiosStub },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: { ERR_VALIDATION: 'Invalid details', ERR_SRV: 'Something went wrong' },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
        '../../utils/userUtils.js': { getRemoteIpFromReq: sinon.stub().returns('127.0.0.1') },
      })).default;

      const req = createReq({
        method: 'POST',
        body: {
          action: 'register',
          username: 'newuser',
          email: 'new@example.com',
          password: 'securepassword123',
          receiveUpdates: false,
          phone6tY4bPYk: '',
        },
        session: { fingerprint: 'fp789' },
      });
      const res = createRes();

      await register(req, res);

      expect(res.redirect.calledOnce).to.equal(true);
      const redirectUrl = res.redirect.firstCall.args[0];
      expect(redirectUrl).to.include('Registration%20failed');
    });

    it('should redirect with validation error for invalid input', async () => {
      const register = (await esmock('./register.js', {
        'axios': { default: sinon.stub() },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: { ERR_VALIDATION: 'Invalid details', ERR_SRV: 'Something went wrong' },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
        '../../utils/userUtils.js': { getRemoteIpFromReq: sinon.stub().returns('127.0.0.1') },
      })).default;

      const req = createReq({
        method: 'POST',
        body: {
          action: 'register',
          username: '',
          email: 'not-an-email',
          password: 'short',
          receiveUpdates: false,
          phone6tY4bPYk: '',
        },
        session: {},
      });
      const res = createRes();

      await register(req, res);

      expect(res.redirect.calledOnce).to.equal(true);
      const redirectUrl = res.redirect.firstCall.args[0];
      expect(redirectUrl).to.include('error=');
      expect(res.cookie.called).to.equal(false);
    });

    it('should reject honeypot field with non-empty value', async () => {
      const register = (await esmock('./register.js', {
        'axios': { default: sinon.stub() },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: { ERR_VALIDATION: 'Invalid details', ERR_SRV: 'Something went wrong' },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
        '../../utils/userUtils.js': { getRemoteIpFromReq: sinon.stub().returns('127.0.0.1') },
      })).default;

      const req = createReq({
        method: 'POST',
        body: {
          action: 'register',
          username: 'newuser',
          email: 'new@example.com',
          password: 'securepassword123',
          receiveUpdates: false,
          phone6tY4bPYk: 'bot-filled-value',
        },
        session: {},
      });
      const res = createRes();

      await register(req, res);

      expect(res.redirect.calledOnce).to.equal(true);
      const redirectUrl = res.redirect.firstCall.args[0];
      expect(redirectUrl).to.include('error=');
      expect(res.cookie.called).to.equal(false);
    });

    it('should return 500 when axios throws a network error', async () => {
      const axiosStub = sinon.stub().rejects(new Error('ECONNREFUSED'));

      const register = (await esmock('./register.js', {
        'axios': { default: axiosStub },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: { ERR_VALIDATION: 'Invalid details', ERR_SRV: 'Something went wrong' },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
        '../../utils/userUtils.js': { getRemoteIpFromReq: sinon.stub().returns('127.0.0.1') },
      })).default;

      const req = createReq({
        method: 'POST',
        body: {
          action: 'register',
          username: 'newuser',
          email: 'new@example.com',
          password: 'securepassword123',
          receiveUpdates: false,
          phone6tY4bPYk: '',
        },
        session: { fingerprint: 'fp' },
      });
      const res = createRes();

      await register(req, res);

      expect(res.status.calledWith(500)).to.equal(true);
      expect(res.send.calledOnce).to.equal(true);
    });

    it('should handle verification email failure gracefully', async () => {
      const axiosStub = sinon.stub();
      // First call: registration success
      axiosStub.onFirstCall().resolves({
        status: 200,
        data: {
          data: {
            user: {
              _id: 'newuser123',
              username: 'newuser',
            },
          },
        },
      });
      // Second call: verification email fails
      axiosStub.onSecondCall().resolves({
        status: 500,
        data: { message: 'Email service down' },
      });

      const register = (await esmock('./register.js', {
        'axios': { default: axiosStub },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: { ERR_VALIDATION: 'Invalid details', ERR_SRV: 'Something went wrong' },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
        '../../utils/userUtils.js': { getRemoteIpFromReq: sinon.stub().returns('10.0.0.1') },
      })).default;

      const req = createReq({
        method: 'POST',
        body: {
          action: 'register',
          username: 'NewUser',
          email: 'new@example.com',
          password: 'securepassword123',
          receiveUpdates: true,
          phone6tY4bPYk: '',
        },
        session: { fingerprint: 'fp123' },
      });
      const res = createRes();

      await register(req, res);

      // Registration should still succeed even if verification email fails
      expect(res.cookie.calledOnce).to.equal(true);
      expect(res.redirect.calledWith('/NewUser')).to.equal(true);
    });
  });
});
