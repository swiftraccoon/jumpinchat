import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

function createReq(overrides = {}) {
  return {
    signedCookies: {},
    user: null,
    unreadMessages: null,
    path: '/',
    query: {},
    body: {},
    session: {},
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
    set: sinon.stub(),
    clearCookie: sinon.stub(),
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

describe('middleware', () => {
  describe('checkUserSession', () => {
    it('should call next() when no jic.ident cookie is present', async () => {
      const { checkUserSession } = await esmock('./middleware.js', {
        '../utils/userUtils.js': {
          getUserById: sinon.stub(),
        },
        '../utils/messageUtils.js': {
          getUnreadMessages: sinon.stub(),
        },
        '../config/index.js': { default: { stripe: { publicKey: 'pk_test' }, auth: {} } },
        '../utils/logger.js': { default: stubLogger() },
        'multer': { default: () => ({ any: () => (req, res, next) => next() }) },
      });

      const req = createReq({ signedCookies: {} });
      const res = createRes();
      const next = sinon.spy();

      await checkUserSession(req, res, next);

      expect(next.calledOnce).to.equal(true);
      expect(req.user).to.equal(null);
    });

    it('should attach user to req when valid cookie and user found', async () => {
      const mockUser = {
        username: 'testuser',
        attrs: { last_active: new Date(), userLevel: 10 },
        profile: { bio: 'hello' },
        save: sinon.stub().resolves(),
      };

      const { checkUserSession } = await esmock('./middleware.js', {
        '../utils/userUtils.js': {
          getUserById: sinon.stub().resolves(mockUser),
        },
        '../utils/messageUtils.js': {
          getUnreadMessages: sinon.stub().resolves({ unread: 3 }),
        },
        '../config/index.js': { default: { stripe: { publicKey: 'pk_test' }, auth: {} } },
        '../utils/logger.js': { default: stubLogger() },
        'multer': { default: () => ({ any: () => (req, res, next) => next() }) },
      });

      const req = createReq({ signedCookies: { 'jic.ident': 'user123' } });
      const res = createRes();
      const next = sinon.spy();

      await checkUserSession(req, res, next);

      expect(req.user).to.equal(mockUser);
      expect(req.unreadMessages).to.equal(3);
      expect(mockUser.save.calledOnce).to.equal(true);
      expect(next.calledOnce).to.equal(true);
    });

    it('should assign default profile when user has no profile', async () => {
      const mockUser = {
        username: 'olduser',
        attrs: { last_active: new Date() },
        profile: null,
        save: sinon.stub().resolves(),
      };

      const { checkUserSession } = await esmock('./middleware.js', {
        '../utils/userUtils.js': {
          getUserById: sinon.stub().resolves(mockUser),
        },
        '../utils/messageUtils.js': {
          getUnreadMessages: sinon.stub().resolves({ unread: 0 }),
        },
        '../config/index.js': { default: { stripe: { publicKey: 'pk_test' }, auth: {} } },
        '../utils/logger.js': { default: stubLogger() },
        'multer': { default: () => ({ any: () => (req, res, next) => next() }) },
      });

      const req = createReq({ signedCookies: { 'jic.ident': 'user456' } });
      const res = createRes();
      const next = sinon.spy();

      await checkUserSession(req, res, next);

      expect(req.user).to.deep.include({
        profile: {
          bio: null,
          dob: { month: null, day: null },
          location: null,
        },
      });
      // unreadMessages should NOT be set when user has no profile (code path)
      expect(req.unreadMessages).to.equal(null);
      expect(next.calledOnce).to.equal(true);
    });

    it('should clear cookie and call next() when user not found', async () => {
      const { checkUserSession } = await esmock('./middleware.js', {
        '../utils/userUtils.js': {
          getUserById: sinon.stub().resolves(null),
        },
        '../utils/messageUtils.js': {
          getUnreadMessages: sinon.stub().resolves({ unread: 0 }),
        },
        '../config/index.js': { default: { stripe: { publicKey: 'pk_test' }, auth: {} } },
        '../utils/logger.js': { default: stubLogger() },
        'multer': { default: () => ({ any: () => (req, res, next) => next() }) },
      });

      const req = createReq({ signedCookies: { 'jic.ident': 'nonexistent' } });
      const res = createRes();
      const next = sinon.spy();

      await checkUserSession(req, res, next);

      expect(res.clearCookie.calledWith('jic.ident')).to.equal(true);
      expect(next.calledOnce).to.equal(true);
      expect(req.user).to.equal(null);
    });

    it('should return 500 when getUserById rejects', async () => {
      const { checkUserSession } = await esmock('./middleware.js', {
        '../utils/userUtils.js': {
          getUserById: sinon.stub().rejects(new Error('DB error')),
        },
        '../utils/messageUtils.js': {
          getUnreadMessages: sinon.stub().resolves({ unread: 0 }),
        },
        '../config/index.js': { default: { stripe: { publicKey: 'pk_test' }, auth: {} } },
        '../utils/logger.js': { default: stubLogger() },
        'multer': { default: () => ({ any: () => (req, res, next) => next() }) },
      });

      const req = createReq({ signedCookies: { 'jic.ident': 'user789' } });
      const res = createRes();
      const next = sinon.spy();

      await checkUserSession(req, res, next);

      expect(res.status.calledWith(500)).to.equal(true);
      expect(res.end.calledOnce).to.equal(true);
      expect(next.called).to.equal(false);
    });

    it('should return 500 when user.save() rejects', async () => {
      const mockUser = {
        username: 'testuser',
        attrs: { last_active: new Date() },
        profile: { bio: 'hello' },
        save: sinon.stub().rejects(new Error('Save failed')),
      };

      const { checkUserSession } = await esmock('./middleware.js', {
        '../utils/userUtils.js': {
          getUserById: sinon.stub().resolves(mockUser),
        },
        '../utils/messageUtils.js': {
          getUnreadMessages: sinon.stub().resolves({ unread: 0 }),
        },
        '../config/index.js': { default: { stripe: { publicKey: 'pk_test' }, auth: {} } },
        '../utils/logger.js': { default: stubLogger() },
        'multer': { default: () => ({ any: () => (req, res, next) => next() }) },
      });

      const req = createReq({ signedCookies: { 'jic.ident': 'user789' } });
      const res = createRes();
      const next = sinon.spy();

      await checkUserSession(req, res, next);

      expect(res.status.calledWith(500)).to.equal(true);
      expect(res.send.calledOnce).to.equal(true);
      expect(next.called).to.equal(false);
    });
  });

  describe('initLocals', () => {
    it('should set res.locals with path, navLinks, description, user, unreadMessages, stripeKey, and asset()', async () => {
      const { initLocals } = await esmock('./middleware.js', {
        '../utils/userUtils.js': { getUserById: sinon.stub() },
        '../utils/messageUtils.js': { getUnreadMessages: sinon.stub() },
        '../config/index.js': { default: { stripe: { publicKey: 'pk_test_abc' }, auth: {} } },
        '../utils/logger.js': { default: stubLogger() },
        'multer': { default: () => ({ any: () => (req, res, next) => next() }) },
      });

      const mockUser = { username: 'alice' };
      const req = createReq({ path: '/settings', user: mockUser, unreadMessages: 5 });
      const res = createRes();
      const next = sinon.spy();

      initLocals(req, res, next);

      expect(res.locals.path).to.equal('/settings');
      expect(res.locals.navLinks).to.deep.equal([
        { label: 'Home', key: 'home', href: '/' },
      ]);
      expect(res.locals.description).to.include('free group video chat');
      expect(res.locals.user).to.equal(mockUser);
      expect(res.locals.unreadMessages).to.equal(5);
      expect(res.locals.stripeKey).to.equal('pk_test_abc');
      expect(res.locals.asset).to.be.a('function');
      expect(next.calledOnce).to.equal(true);
    });

    it('should return the path unchanged from asset() in non-production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      const { initLocals } = await esmock('./middleware.js', {
        '../utils/userUtils.js': { getUserById: sinon.stub() },
        '../utils/messageUtils.js': { getUnreadMessages: sinon.stub() },
        '../config/index.js': { default: { stripe: { publicKey: 'pk_test' }, auth: {} } },
        '../utils/logger.js': { default: stubLogger() },
        'multer': { default: () => ({ any: () => (req, res, next) => next() }) },
      });

      const req = createReq();
      const res = createRes();
      const next = sinon.spy();

      initLocals(req, res, next);

      expect(res.locals.asset('/css/site.css')).to.equal('/css/site.css');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('initErrorHandlers', () => {
    it('should attach res.err and res.notfound functions and call next()', async () => {
      const { initErrorHandlers } = await esmock('./middleware.js', {
        '../utils/userUtils.js': { getUserById: sinon.stub() },
        '../utils/messageUtils.js': { getUnreadMessages: sinon.stub() },
        '../config/index.js': { default: { stripe: { publicKey: 'pk_test' }, auth: {} } },
        '../utils/logger.js': { default: stubLogger() },
        'multer': { default: () => ({ any: () => (req, res, next) => next() }) },
      });

      const req = createReq();
      const res = createRes();
      const next = sinon.spy();

      initErrorHandlers(req, res, next);

      expect(res.err).to.be.a('function');
      expect(res.notfound).to.be.a('function');
      expect(next.calledOnce).to.equal(true);
    });

    it('res.err should render 500 page with status 500', async () => {
      const { initErrorHandlers } = await esmock('./middleware.js', {
        '../utils/userUtils.js': { getUserById: sinon.stub() },
        '../utils/messageUtils.js': { getUnreadMessages: sinon.stub() },
        '../config/index.js': { default: { stripe: { publicKey: 'pk_test' }, auth: {} } },
        '../utils/logger.js': { default: stubLogger() },
        'multer': { default: () => ({ any: () => (req, res, next) => next() }) },
      });

      const req = createReq();
      const res = createRes();
      res.render = sinon.stub();
      const next = sinon.spy();

      initErrorHandlers(req, res, next);
      res.err(new Error('boom'), 'Error Title', 'Error message');

      expect(res.status.calledWith(500)).to.equal(true);
      expect(res.render.calledWith('errors/500')).to.equal(true);
    });

    it('res.notfound should render 404 page with status 404', async () => {
      const { initErrorHandlers } = await esmock('./middleware.js', {
        '../utils/userUtils.js': { getUserById: sinon.stub() },
        '../utils/messageUtils.js': { getUnreadMessages: sinon.stub() },
        '../config/index.js': { default: { stripe: { publicKey: 'pk_test' }, auth: {} } },
        '../utils/logger.js': { default: stubLogger() },
        'multer': { default: () => ({ any: () => (req, res, next) => next() }) },
      });

      const req = createReq({ user: { username: 'bob' } });
      const res = createRes();
      res.render = sinon.stub();
      const next = sinon.spy();

      initErrorHandlers(req, res, next);
      res.notfound('Not Found', 'Page not found');

      expect(res.status.calledWith(404)).to.equal(true);
      expect(res.render.calledWith('errors/404')).to.equal(true);
      const renderArgs = res.render.firstCall.args[1];
      expect(renderArgs.user).to.deep.equal({ username: 'bob' });
    });
  });

  describe('validateUserIsAdmin', () => {
    let validateUserIsAdmin;

    before(async () => {
      ({ validateUserIsAdmin } = await esmock('./middleware.js', {
        '../utils/userUtils.js': { getUserById: sinon.stub() },
        '../utils/messageUtils.js': { getUnreadMessages: sinon.stub() },
        '../config/index.js': { default: { stripe: { publicKey: 'pk_test' }, auth: {} } },
        '../utils/logger.js': { default: stubLogger() },
        'multer': { default: () => ({ any: () => (req, res, next) => next() }) },
      }));
    });

    it('should redirect with 403 if no user', () => {
      const req = createReq({ user: null });
      const res = createRes();
      const next = sinon.spy();

      validateUserIsAdmin(req, res, next);

      expect(res.status.calledWith(403)).to.equal(true);
      expect(res.redirect.calledWith('/')).to.equal(true);
      expect(next.called).to.equal(false);
    });

    it('should redirect with 403 if userLevel < 30', () => {
      const req = createReq({ user: { attrs: { userLevel: 20 } } });
      const res = createRes();
      const next = sinon.spy();

      validateUserIsAdmin(req, res, next);

      expect(res.status.calledWith(403)).to.equal(true);
      expect(res.redirect.calledWith('/')).to.equal(true);
      expect(next.called).to.equal(false);
    });

    it('should call next() if userLevel >= 30', () => {
      const req = createReq({ user: { attrs: { userLevel: 30 } } });
      const res = createRes();
      const next = sinon.spy();

      validateUserIsAdmin(req, res, next);

      expect(next.calledOnce).to.equal(true);
      expect(res.status.called).to.equal(false);
    });

    it('should call next() if userLevel > 30', () => {
      const req = createReq({ user: { attrs: { userLevel: 50 } } });
      const res = createRes();
      const next = sinon.spy();

      validateUserIsAdmin(req, res, next);

      expect(next.calledOnce).to.equal(true);
    });
  });

  describe('validateUserIsSiteMod', () => {
    let validateUserIsSiteMod;

    before(async () => {
      ({ validateUserIsSiteMod } = await esmock('./middleware.js', {
        '../utils/userUtils.js': { getUserById: sinon.stub() },
        '../utils/messageUtils.js': { getUnreadMessages: sinon.stub() },
        '../config/index.js': { default: { stripe: { publicKey: 'pk_test' }, auth: {} } },
        '../utils/logger.js': { default: stubLogger() },
        'multer': { default: () => ({ any: () => (req, res, next) => next() }) },
      }));
    });

    it('should redirect with 403 if no user', () => {
      const req = createReq({ user: null });
      const res = createRes();
      const next = sinon.spy();

      validateUserIsSiteMod(req, res, next);

      expect(res.status.calledWith(403)).to.equal(true);
      expect(res.redirect.calledWith('/')).to.equal(true);
      expect(next.called).to.equal(false);
    });

    it('should redirect with 403 if userLevel < 20', () => {
      const req = createReq({ user: { attrs: { userLevel: 10 } } });
      const res = createRes();
      const next = sinon.spy();

      validateUserIsSiteMod(req, res, next);

      expect(res.status.calledWith(403)).to.equal(true);
      expect(res.redirect.calledWith('/')).to.equal(true);
      expect(next.called).to.equal(false);
    });

    it('should call next() if userLevel >= 20', () => {
      const req = createReq({ user: { attrs: { userLevel: 20 } } });
      const res = createRes();
      const next = sinon.spy();

      validateUserIsSiteMod(req, res, next);

      expect(next.calledOnce).to.equal(true);
      expect(res.status.called).to.equal(false);
    });

    it('should call next() if userLevel > 20', () => {
      const req = createReq({ user: { attrs: { userLevel: 30 } } });
      const res = createRes();
      const next = sinon.spy();

      validateUserIsSiteMod(req, res, next);

      expect(next.calledOnce).to.equal(true);
    });
  });

  describe('requireUser', () => {
    let requireUser;

    before(async () => {
      ({ requireUser } = await esmock('./middleware.js', {
        '../utils/userUtils.js': { getUserById: sinon.stub() },
        '../utils/messageUtils.js': { getUnreadMessages: sinon.stub() },
        '../config/index.js': { default: { stripe: { publicKey: 'pk_test' }, auth: {} } },
        '../utils/logger.js': { default: stubLogger() },
        'multer': { default: () => ({ any: () => (req, res, next) => next() }) },
      }));
    });

    it('should redirect to /login if no user', () => {
      const req = createReq({ user: null });
      const res = createRes();
      const next = sinon.spy();

      requireUser(req, res, next);

      expect(req.flash.calledWith('error', 'Please sign in to access this page.')).to.equal(true);
      expect(res.redirect.calledWith('/login')).to.equal(true);
      expect(next.called).to.equal(false);
    });

    it('should call next() if user exists', () => {
      const req = createReq({ user: { username: 'alice' } });
      const res = createRes();
      const next = sinon.spy();

      requireUser(req, res, next);

      expect(next.calledOnce).to.equal(true);
      expect(res.redirect.called).to.equal(false);
    });
  });

  describe('noFollow', () => {
    it('should set X-Robots-Tag header and call next()', async () => {
      const { noFollow } = await esmock('./middleware.js', {
        '../utils/userUtils.js': { getUserById: sinon.stub() },
        '../utils/messageUtils.js': { getUnreadMessages: sinon.stub() },
        '../config/index.js': { default: { stripe: { publicKey: 'pk_test' }, auth: {} } },
        '../utils/logger.js': { default: stubLogger() },
        'multer': { default: () => ({ any: () => (req, res, next) => next() }) },
      });

      const req = createReq();
      const res = createRes();
      const next = sinon.spy();

      noFollow(req, res, next);

      expect(res.set.calledWith('X-Robots-Tag', 'noindex,nofollow')).to.equal(true);
      expect(next.calledOnce).to.equal(true);
    });
  });
});
