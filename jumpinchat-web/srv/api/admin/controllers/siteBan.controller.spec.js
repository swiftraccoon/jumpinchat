import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('siteBan.controller', () => {
  let siteBan;
  let req;
  let res;
  let BanlistModelCreateStub;
  let getBanlistItemStub;
  let getUserByIdStub;
  let closeRoomStub;
  let getReportByIdStub;
  let resolveReportStub;
  let addModActivityStub;
  let callPromiseStub;
  let getRoomsByUserStub;
  let getSocketIoStub;

  const validBody = {
    userId: 'user123',
    reason: 'spam',
    sessionId: 'session123',
    socketId: 'socket123',
    ip: '1.2.3.4',
    restrictBroadcast: true,
    restrictJoin: false,
  };

  function createRes() {
    return {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis(),
    };
  }

  beforeEach(async () => {
    BanlistModelCreateStub = sinon.stub().resolves({ _id: 'ban123' });
    getBanlistItemStub = sinon.stub().resolves(null);
    getUserByIdStub = sinon.stub().resolves({
      _id: 'user123',
      username: 'testuser',
      auth: { email: 'test@test.com', latestFingerprint: 'fp123' },
    });
    closeRoomStub = sinon.stub().resolves();
    getReportByIdStub = sinon.stub().resolves(null);
    resolveReportStub = sinon.stub().resolves();
    addModActivityStub = sinon.stub().resolves();
    callPromiseStub = sinon.stub().resolves(null);
    getRoomsByUserStub = sinon.stub().resolves([]);
    getSocketIoStub = sinon.stub().returns({
      to: sinon.stub().returns({
        emit: sinon.stub(),
      }),
      in: sinon.stub().returns({
        disconnectSockets: sinon.stub(),
      }),
    });

    const mod = await esmock('./siteBan.controller.js', {
      '../../../utils/logger.util.js': { default: () => ({ debug: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub(), fatal: sinon.stub() }) },
      '../../../utils/utils.js': { default: { messageFactory: (msg) => msg } },
      '../../../utils/redis.util.js': { default: { callPromise: callPromiseStub } },
      '../../../config/env/index.js': { default: { siteban: { defaultExpire: 300 } } },
      '../../../config/constants/errors.js': { default: { ERR_SRV: { code: 'ERR_SRV', message: 'server error' } } },
      '../../user/user.utils.js': { getUserById: getUserByIdStub },
      '../../siteban/siteban.model.js': { default: { create: BanlistModelCreateStub } },
      '../../siteban/siteban.utils.js': { default: { getBanlistItem: getBanlistItemStub } },
      '../admin.utils.js': { default: { addModActivity: addModActivityStub } },
      '../../report/report.utils.js': { default: { getReportById: getReportByIdStub, resolveReport: resolveReportStub } },
      '../../report/report.constants.js': {
        resolutionOutcomes: {
          RESOLUTION_BAN_BROADCAST: 'RESOLUTION_BAN_BROADCAST',
          RESOLUTION_BAN_JOIN: 'RESOLUTION_BAN_JOIN',
        },
      },
      '../admin.constants.js': { default: { activity: { SITE_BAN: 'Banlist' } } },
      '../../roomClose/roomClose.utils.js': { default: { closeRoom: closeRoomStub } },
      '../admin.controller.js': { getSocketIo: getSocketIoStub },
      '../../room/room.utils.js': { getRoomsByUser: getRoomsByUserStub },
    });

    siteBan = mod.default;

    res = createRes();
    req = {
      body: { ...validBody },
      user: { _id: 'admin123' },
    };
  });

  describe('validation', () => {
    it('should return 400 if reason is missing', async () => {
      req.body = { sessionId: 'sess', socketId: 'sock', ip: '1.2.3.4' };

      await siteBan(req, res);

      expect(res.status.calledWith(400)).to.equal(true);
      expect(res.send.calledWith('ERR_VALIDATION')).to.equal(true);
    });

    it('should return 400 if sessionId is missing', async () => {
      req.body = { reason: 'spam', socketId: 'sock', ip: '1.2.3.4' };

      await siteBan(req, res);

      expect(res.status.calledWith(400)).to.equal(true);
      expect(res.send.calledWith('ERR_VALIDATION')).to.equal(true);
    });

    it('should return 400 if socketId is missing', async () => {
      req.body = { reason: 'spam', sessionId: 'sess', ip: '1.2.3.4' };

      await siteBan(req, res);

      expect(res.status.calledWith(400)).to.equal(true);
      expect(res.send.calledWith('ERR_VALIDATION')).to.equal(true);
    });

    it('should return 400 if ip is missing', async () => {
      req.body = { reason: 'spam', sessionId: 'sess', socketId: 'sock' };

      await siteBan(req, res);

      expect(res.status.calledWith(400)).to.equal(true);
      expect(res.send.calledWith('ERR_VALIDATION')).to.equal(true);
    });

    it('should return 400 if ip is not a valid IP address', async () => {
      req.body = { ...validBody, ip: 'notanip' };

      await siteBan(req, res);

      expect(res.status.calledWith(400)).to.equal(true);
      expect(res.send.calledWith('ERR_VALIDATION')).to.equal(true);
    });
  });

  describe('happy path - new ban', () => {
    it('should create a new ban entry and return 201', async () => {
      await siteBan(req, res);

      expect(BanlistModelCreateStub.calledOnce).to.equal(true);
      expect(res.status.calledWith(201)).to.equal(true);
    });

    it('should pass correct ban fields to BanlistModel.create', async () => {
      await siteBan(req, res);

      const banEntry = BanlistModelCreateStub.firstCall.args[0];
      expect(banEntry.userId).to.equal('user123');
      expect(banEntry.username).to.equal('testuser');
      expect(banEntry.reason).to.equal('spam');
      expect(banEntry.sessionId).to.equal('session123');
      expect(banEntry.ip).to.equal('1.2.3.4');
      expect(banEntry.restrictions.broadcast).to.equal(true);
      expect(banEntry.restrictions.join).to.equal(false);
      expect(banEntry.fingerprint).to.equal('fp123');
    });

    it('should add mod activity after creating a ban', async () => {
      await siteBan(req, res);

      expect(addModActivityStub.calledOnce).to.equal(true);
      expect(addModActivityStub.firstCall.args[0]).to.equal('admin123');
      expect(addModActivityStub.firstCall.args[1]).to.deep.equal({
        type: 'Banlist',
        id: 'ban123',
      });
    });

    it('should allow userId to be empty string', async () => {
      req.body = { ...validBody, userId: '' };
      getUserByIdStub.resolves(null);

      await siteBan(req, res);

      expect(res.status.calledWith(201)).to.equal(true);
    });
  });

  describe('existing ban', () => {
    it('should update and return existing ban if one exists', async () => {
      const existingBan = {
        restrictions: { broadcast: false, join: false },
        expiresAt: null,
        save: sinon.stub().resolves({ _id: 'existing', restrictions: { broadcast: true, join: false } }),
      };
      getBanlistItemStub.resolves(existingBan);

      await siteBan(req, res);

      expect(existingBan.save.calledOnce).to.equal(true);
      expect(existingBan.restrictions.broadcast).to.equal(true);
      expect(res.status.calledWith(201)).to.equal(true);
      // Should NOT call BanlistModel.create
      expect(BanlistModelCreateStub.called).to.equal(false);
    });
  });

  describe('with restrictJoin', () => {
    it('should close the user room when restrictJoin is true and user exists', async () => {
      req.body = { ...validBody, restrictJoin: true };

      await siteBan(req, res);

      expect(closeRoomStub.calledOnce).to.equal(true);
      expect(closeRoomStub.firstCall.args[0]).to.equal('testuser');
      expect(closeRoomStub.firstCall.args[1]).to.equal('spam');
    });

    it('should not close room when restrictJoin is false', async () => {
      req.body = { ...validBody, restrictJoin: false };

      await siteBan(req, res);

      expect(closeRoomStub.called).to.equal(false);
    });
  });

  describe('with reportId', () => {
    it('should resolve the report when reportId is provided', async () => {
      const report = { _id: 'report123', target: { fingerprint: 'fpR' } };
      getReportByIdStub.resolves(report);
      req.body = { ...validBody, reportId: 'report123', restrictBroadcast: true };

      await siteBan(req, res);

      expect(resolveReportStub.calledOnce).to.equal(true);
      expect(resolveReportStub.firstCall.args[0]).to.equal('report123');
      expect(resolveReportStub.firstCall.args[1]).to.equal('admin123');
      expect(resolveReportStub.firstCall.args[2]).to.equal('RESOLUTION_BAN_BROADCAST');
    });
  });

  describe('error handling', () => {
    it('should return 500 if getUserById throws', async () => {
      getUserByIdStub.rejects(new Error('db error'));

      await siteBan(req, res);

      expect(res.status.calledWith(500)).to.equal(true);
    });

    it('should return 500 if getBanlistItem throws', async () => {
      getBanlistItemStub.rejects(new Error('db error'));

      await siteBan(req, res);

      expect(res.status.calledWith(500)).to.equal(true);
    });

    it('should return 500 if BanlistModel.create throws', async () => {
      BanlistModelCreateStub.rejects(new Error('create error'));

      await siteBan(req, res);

      expect(res.status.calledWith(500)).to.equal(true);
    });

    it('should return 500 if addModActivity throws', async () => {
      addModActivityStub.rejects(new Error('activity error'));

      await siteBan(req, res);

      expect(res.status.calledWith(500)).to.equal(true);
    });
  });
});
