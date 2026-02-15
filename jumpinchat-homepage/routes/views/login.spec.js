import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

function createReq(overrides = {}) {
  return {
    signedCookies: {},
    user: null,
    path: '/login',
    query: {},
    body: {},
    session: {},
    method: 'GET',
    flash: sinon.spy(),
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

describe('login view', () => {
  describe('GET /login', () => {
    it('should render login template with correct locals', async () => {
      const login = (await esmock('./login.js', {
        'axios': { default: sinon.stub() },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: { ERR_VALIDATION: 'Invalid details' },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
      })).default;

      const req = createReq({ method: 'GET', user: null });
      const res = createRes();

      await login(req, res);

      expect(res.render.calledOnce).to.equal(true);
      expect(res.render.firstCall.args[0]).to.equal('login');
      expect(res.locals.section).to.equal('Log into your account');
      expect(res.locals.description).to.include('Log in');
      expect(res.locals.errors).to.equal(null);
    });

    it('should redirect to / when user is already logged in', async () => {
      const login = (await esmock('./login.js', {
        'axios': { default: sinon.stub() },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: { ERR_VALIDATION: 'Invalid details' },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
      })).default;

      const req = createReq({ method: 'GET', user: { username: 'alice' } });
      const res = createRes();

      await login(req, res);

      expect(res.redirect.calledWith('/')).to.equal(true);
      expect(res.render.called).to.equal(false);
    });
  });

  describe('POST /login', () => {
    it('should set cookie and redirect to / on successful login', async () => {
      const axiosStub = sinon.stub().resolves({
        status: 200,
        data: {
          data: {
            user: {
              _id: 'user123',
              auth: { totpSecret: null },
            },
          },
        },
      });

      const login = (await esmock('./login.js', {
        'axios': { default: axiosStub },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: { ERR_VALIDATION: 'Invalid details' },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
      })).default;

      const req = createReq({
        method: 'POST',
        body: { action: 'login', username: 'TestUser', password: 'password123' },
      });
      const res = createRes();

      await login(req, res);

      expect(axiosStub.calledOnce).to.equal(true);
      const axiosCall = axiosStub.firstCall.args[0];
      expect(axiosCall.method).to.equal('POST');
      expect(axiosCall.url).to.equal('http://api:80/api/user/login');
      expect(axiosCall.data.username).to.equal('testuser');

      expect(res.cookie.calledOnce).to.equal(true);
      expect(res.cookie.firstCall.args[0]).to.equal('jic.ident');
      expect(res.cookie.firstCall.args[1]).to.equal('user123');
      expect(res.cookie.firstCall.args[2]).to.deep.include({
        maxAge: 86400000,
        signed: true,
        httpOnly: true,
      });
      expect(res.redirect.calledWith('/')).to.equal(true);
    });

    it('should redirect to /login/totp when user has MFA enabled', async () => {
      const axiosStub = sinon.stub().resolves({
        status: 200,
        data: {
          data: {
            user: {
              _id: 'user456',
              auth: { totpSecret: 'JBSWY3DPEHPK3PXP' },
            },
          },
        },
      });

      const login = (await esmock('./login.js', {
        'axios': { default: axiosStub },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: { ERR_VALIDATION: 'Invalid details' },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
      })).default;

      const req = createReq({
        method: 'POST',
        body: { action: 'login', username: 'mfaUser', password: 'password123' },
        session: {},
      });
      const res = createRes();

      await login(req, res);

      expect(req.session.user).to.equal('user456');
      expect(res.redirect.calledWith('/login/totp')).to.equal(true);
      expect(res.cookie.called).to.equal(false);
    });

    it('should render login with error message on API error response', async () => {
      const axiosStub = sinon.stub().resolves({
        status: 401,
        data: { message: 'ERR_NO_USER' },
      });

      const login = (await esmock('./login.js', {
        'axios': { default: axiosStub },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: {
            ERR_VALIDATION: 'Invalid details',
            ERR_NO_USER: 'Invalid username or password',
          },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
      })).default;

      const req = createReq({
        method: 'POST',
        body: { action: 'login', username: 'nobody', password: 'wrongpass' },
      });
      const res = createRes();

      await login(req, res);

      expect(res.locals.errors).to.equal('Invalid username or password');
      expect(res.render.calledWith('login')).to.equal(true);
      expect(res.redirect.called).to.equal(false);
    });

    it('should render login with fallback message when API error has no message', async () => {
      const axiosStub = sinon.stub().resolves({
        status: 500,
        data: {},
      });

      const login = (await esmock('./login.js', {
        'axios': { default: axiosStub },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: { ERR_VALIDATION: 'Invalid details' },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
      })).default;

      const req = createReq({
        method: 'POST',
        body: { action: 'login', username: 'user', password: 'pass' },
      });
      const res = createRes();

      await login(req, res);

      expect(res.locals.errors).to.equal('Login failed');
      expect(res.render.calledWith('login')).to.equal(true);
    });

    it('should render login with ERR_VALIDATION when validation fails', async () => {
      const login = (await esmock('./login.js', {
        'axios': { default: sinon.stub() },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: { ERR_VALIDATION: 'Invalid details' },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
      })).default;

      const req = createReq({
        method: 'POST',
        body: { action: 'login', username: '', password: '' },
      });
      const res = createRes();

      await login(req, res);

      expect(res.locals.errors).to.equal('Invalid details');
      expect(res.render.calledWith('login')).to.equal(true);
    });

    it('should return 500 when axios throws a network error', async () => {
      const axiosStub = sinon.stub().rejects(new Error('ECONNREFUSED'));

      const login = (await esmock('./login.js', {
        'axios': { default: axiosStub },
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000 } } },
        '../../constants/constants.js': {
          errors: { ERR_VALIDATION: 'Invalid details' },
          api: 'http://api:80',
        },
        '../../utils/logger.js': { default: stubLogger() },
      })).default;

      const req = createReq({
        method: 'POST',
        body: { action: 'login', username: 'user', password: 'pass123' },
      });
      const res = createRes();

      await login(req, res);

      expect(res.status.calledWith(500)).to.equal(true);
      expect(res.send.calledOnce).to.equal(true);
    });
  });
});
