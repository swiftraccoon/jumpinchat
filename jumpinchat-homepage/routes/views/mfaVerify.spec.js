import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

function createReq(overrides = {}) {
  return {
    signedCookies: {},
    user: null,
    path: '/login/totp',
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

describe('mfaVerify view', () => {
  describe('GET /login/totp', () => {
    it('should redirect to /login when no session user', async () => {
      const mfaVerify = (await esmock('./mfaVerify.js', {
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000, jwtSecret: 'testsecret' } } },
        '../../constants/constants.js': { api: 'http://api:80' },
        '../../utils/request.js': { default: sinon.stub() },
        '../../utils/logger.js': { default: stubLogger() },
      })).default;

      const req = createReq({ method: 'GET', session: {} });
      const res = createRes();

      await mfaVerify(req, res);

      expect(res.redirect.calledWith('/login')).to.equal(true);
      expect(res.render.called).to.equal(false);
    });

    it('should render mfaVerify template when session user exists', async () => {
      const mfaVerify = (await esmock('./mfaVerify.js', {
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000, jwtSecret: 'testsecret' } } },
        '../../constants/constants.js': { api: 'http://api:80' },
        '../../utils/request.js': { default: sinon.stub() },
        '../../utils/logger.js': { default: stubLogger() },
      })).default;

      const req = createReq({ method: 'GET', session: { user: 'user123' } });
      const res = createRes();

      await mfaVerify(req, res);

      expect(res.render.calledOnce).to.equal(true);
      expect(res.render.firstCall.args[0]).to.equal('mfaVerify');
      expect(res.locals.section).to.equal('Validate login');
      expect(res.locals.error).to.equal(null);
    });

    it('should pass query error to locals', async () => {
      const mfaVerify = (await esmock('./mfaVerify.js', {
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000, jwtSecret: 'testsecret' } } },
        '../../constants/constants.js': { api: 'http://api:80' },
        '../../utils/request.js': { default: sinon.stub() },
        '../../utils/logger.js': { default: stubLogger() },
      })).default;

      const req = createReq({
        method: 'GET',
        session: { user: 'user123' },
        query: { error: 'invalid token' },
      });
      const res = createRes();

      await mfaVerify(req, res);

      expect(res.locals.error).to.equal('invalid token');
      expect(res.render.calledWith('mfaVerify')).to.equal(true);
    });
  });

  describe('POST /login/totp', () => {
    it('should set cookie and redirect to / on successful verification', async () => {
      const requestStub = sinon.stub().resolves({ success: true });

      const mfaVerify = (await esmock('./mfaVerify.js', {
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000, jwtSecret: 'testsecret' } } },
        '../../constants/constants.js': { api: 'http://api:80' },
        '../../utils/request.js': { default: requestStub },
        '../../utils/logger.js': { default: stubLogger() },
      })).default;

      const req = createReq({
        method: 'POST',
        body: { action: 'verify', token: '123456' },
        session: { user: 'user789' },
      });
      const res = createRes();

      await mfaVerify(req, res);

      // Verify API call
      expect(requestStub.calledOnce).to.equal(true);
      const callArgs = requestStub.firstCall.args[0];
      expect(callArgs.method).to.equal('POST');
      expect(callArgs.url).to.equal('http://api:80/api/user/mfa/verify');
      expect(callArgs.body.token).to.equal('123456');
      expect(callArgs.headers.Authorization).to.be.a('string');

      // Verify cookie
      expect(res.cookie.calledOnce).to.equal(true);
      expect(res.cookie.firstCall.args[0]).to.equal('jic.ident');
      expect(res.cookie.firstCall.args[1]).to.equal('user789');
      expect(res.cookie.firstCall.args[2]).to.deep.include({
        maxAge: 86400000,
        signed: true,
        httpOnly: true,
      });

      // Verify redirect
      expect(res.redirect.calledWith('/')).to.equal(true);
    });

    it('should redirect with error when verification API fails', async () => {
      const requestStub = sinon.stub().rejects(new Error('Verification failed'));

      const mfaVerify = (await esmock('./mfaVerify.js', {
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000, jwtSecret: 'testsecret' } } },
        '../../constants/constants.js': { api: 'http://api:80' },
        '../../utils/request.js': { default: requestStub },
        '../../utils/logger.js': { default: stubLogger() },
      })).default;

      const req = createReq({
        method: 'POST',
        body: { action: 'verify', token: '000000' },
        session: { user: 'user789' },
      });
      const res = createRes();

      await mfaVerify(req, res);

      expect(res.redirect.calledOnce).to.equal(true);
      const redirectUrl = res.redirect.firstCall.args[0];
      expect(redirectUrl).to.include('error=');
      expect(redirectUrl).to.include('Verification');
      expect(res.cookie.called).to.equal(false);
    });

    it('should redirect with error when verification API rejects without message', async () => {
      const err = 'Some error string';
      const requestStub = sinon.stub().rejects(err);

      const mfaVerify = (await esmock('./mfaVerify.js', {
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000, jwtSecret: 'testsecret' } } },
        '../../constants/constants.js': { api: 'http://api:80' },
        '../../utils/request.js': { default: requestStub },
        '../../utils/logger.js': { default: stubLogger() },
      })).default;

      const req = createReq({
        method: 'POST',
        body: { action: 'verify', token: '111111' },
        session: { user: 'user789' },
      });
      const res = createRes();

      await mfaVerify(req, res);

      expect(res.redirect.calledOnce).to.equal(true);
      const redirectUrl = res.redirect.firstCall.args[0];
      expect(redirectUrl).to.include('error=');
      expect(res.cookie.called).to.equal(false);
    });

    it('should redirect with validation error for invalid token format', async () => {
      const mfaVerify = (await esmock('./mfaVerify.js', {
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000, jwtSecret: 'testsecret' } } },
        '../../constants/constants.js': { api: 'http://api:80' },
        '../../utils/request.js': { default: sinon.stub() },
        '../../utils/logger.js': { default: stubLogger() },
      })).default;

      const req = createReq({
        method: 'POST',
        body: { action: 'verify', token: '12' },
        session: { user: 'user789' },
      });
      const res = createRes();

      await mfaVerify(req, res);

      expect(res.redirect.calledOnce).to.equal(true);
      const redirectUrl = res.redirect.firstCall.args[0];
      expect(redirectUrl).to.include('error=');
      expect(redirectUrl).to.include('invalid');
      expect(res.cookie.called).to.equal(false);
    });

    it('should redirect with validation error for empty token', async () => {
      const mfaVerify = (await esmock('./mfaVerify.js', {
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000, jwtSecret: 'testsecret' } } },
        '../../constants/constants.js': { api: 'http://api:80' },
        '../../utils/request.js': { default: sinon.stub() },
        '../../utils/logger.js': { default: stubLogger() },
      })).default;

      const req = createReq({
        method: 'POST',
        body: { action: 'verify', token: '' },
        session: { user: 'user789' },
      });
      const res = createRes();

      await mfaVerify(req, res);

      expect(res.redirect.calledOnce).to.equal(true);
      const redirectUrl = res.redirect.firstCall.args[0];
      expect(redirectUrl).to.include('error=');
      expect(redirectUrl).to.include('invalid');
      expect(res.cookie.called).to.equal(false);
    });

    it('should redirect to /login when no session user on POST', async () => {
      const mfaVerify = (await esmock('./mfaVerify.js', {
        '../../config/index.js': { default: { auth: { cookieTimeout: 86400000, jwtSecret: 'testsecret' } } },
        '../../constants/constants.js': { api: 'http://api:80' },
        '../../utils/request.js': { default: sinon.stub() },
        '../../utils/logger.js': { default: stubLogger() },
      })).default;

      const req = createReq({
        method: 'POST',
        body: { action: 'verify', token: '123456' },
        session: {},
      });
      const res = createRes();

      await mfaVerify(req, res);

      expect(res.redirect.calledWith('/login')).to.equal(true);
      expect(res.cookie.called).to.equal(false);
    });
  });
});
