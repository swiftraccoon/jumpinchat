import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('updateRequest controller', () => {
  let updateRequest;
  let findByIdStub;
  let applyTrophyStub;
  let getUserByIdStub;
  let emailStub;
  let res;

  const logStub = () => ({
    debug: sinon.stub(),
    info: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub(),
    fatal: sinon.stub(),
  });

  function createRes() {
    return {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis(),
    };
  }

  beforeEach(async () => {
    findByIdStub = sinon.stub();
    applyTrophyStub = sinon.stub();
    getUserByIdStub = sinon.stub();
    emailStub = {
      sendMail: sinon.stub().callsFake((msg, cb) => cb(null)),
    };

    const mod = await esmock('./updateRequest.js', {
      '../../../utils/logger.util.js': { default: logStub },
      '../ageVerification.utils.js': { findById: findByIdStub },
      '../../trophy/trophy.utils.js': { applyTrophy: applyTrophyStub },
      '../../user/user.utils.js': { getUserById: getUserByIdStub },
      '../ageVerification.const.js': {
        default: {
          statuses: {
            PENDING: 'PENDING',
            APPROVED: 'APPROVED',
            DENIED: 'DENIED',
            REJECTED: 'REJECTED',
            EXPIRED: 'EXPIRED',
          },
        },
        statuses: {
          PENDING: 'PENDING',
          APPROVED: 'APPROVED',
          DENIED: 'DENIED',
          REJECTED: 'REJECTED',
          EXPIRED: 'EXPIRED',
        },
      },
      '../../../config/email.config.js': { default: emailStub },
      '../../../config/constants/emailTemplates.js': {
        ageVerifyApprovedTemplate: sinon.stub().returns('<html>approved</html>'),
        ageVerifyRejectedTemplate: sinon.stub().returns('<html>rejected</html>'),
        ageVerifyDeniedTemplate: sinon.stub().returns('<html>denied</html>'),
      },
    });

    updateRequest = mod.default;
    res = createRes();
  });

  describe('input validation', () => {
    it('should return 400 if status query parameter is missing', async () => {
      const req = { params: { id: 'req123' }, query: {}, body: {} };

      await updateRequest(req, res);

      expect(res.status.calledWith(400)).to.equal(true);
      const body = res.send.firstCall.args[0];
      expect(body.error).to.equal('ERR_INVALID');
      expect(body.message).to.equal('status missing');
    });

    it('should return 400 if status is empty string', async () => {
      const req = { params: { id: 'req123' }, query: { status: '' }, body: {} };

      await updateRequest(req, res);

      expect(res.status.calledWith(400)).to.equal(true);
    });
  });

  describe('status transitions', () => {
    let mockRequest;

    beforeEach(() => {
      mockRequest = {
        _id: 'req123',
        user: 'user123',
        status: 'PENDING',
        save: sinon.stub(),
      };
      mockRequest.save.resolves(mockRequest);
      findByIdStub.resolves(mockRequest);
    });

    it('should update request status to APPROVED and save', async () => {
      const req = { params: { id: 'req123' }, query: { status: 'APPROVED' }, body: {} };
      applyTrophyStub.callsFake((userId, trophy, cb) => cb(null));
      getUserByIdStub.resolves({
        _id: 'user123',
        username: 'testuser',
        auth: { email: 'test@example.com' },
        attrs: {},
        save: sinon.stub().resolves(),
      });

      await updateRequest(req, res);

      expect(mockRequest.status).to.equal('APPROVED');
      expect(mockRequest.save.calledOnce).to.equal(true);
      expect(res.status.calledWith(200)).to.equal(true);
    });

    it('should update request status to REJECTED and save', async () => {
      const req = {
        params: { id: 'req123' },
        query: { status: 'REJECTED' },
        body: { reason: 'blurry photos' },
      };
      getUserByIdStub.resolves({
        _id: 'user123',
        username: 'testuser',
        auth: { email: 'test@example.com' },
      });

      await updateRequest(req, res);

      expect(mockRequest.status).to.equal('REJECTED');
      expect(mockRequest.save.calledOnce).to.equal(true);
      expect(res.status.calledWith(200)).to.equal(true);
    });

    it('should update request status to DENIED and save', async () => {
      const req = { params: { id: 'req123' }, query: { status: 'DENIED' }, body: {} };
      getUserByIdStub.resolves({
        _id: 'user123',
        username: 'testuser',
        auth: { email: 'test@example.com' },
      });

      await updateRequest(req, res);

      expect(mockRequest.status).to.equal('DENIED');
      expect(mockRequest.save.calledOnce).to.equal(true);
      expect(res.status.calledWith(200)).to.equal(true);
    });

    it('should set updatedAt on the request', async () => {
      const req = { params: { id: 'req123' }, query: { status: 'APPROVED' }, body: {} };
      applyTrophyStub.callsFake((userId, trophy, cb) => cb(null));
      getUserByIdStub.resolves({
        _id: 'user123',
        username: 'testuser',
        auth: { email: 'test@example.com' },
        attrs: {},
        save: sinon.stub().resolves(),
      });

      const before = Date.now();
      await updateRequest(req, res);

      expect(mockRequest.updatedAt).to.be.a('number');
      expect(mockRequest.updatedAt).to.be.at.least(before);
    });

    it('should return 400 for an unknown status value', async () => {
      const req = { params: { id: 'req123' }, query: { status: 'UNKNOWN' }, body: {} };

      await updateRequest(req, res);

      expect(res.status.calledWith(400)).to.equal(true);
    });
  });

  describe('APPROVED side effects', () => {
    let mockRequest;

    beforeEach(() => {
      mockRequest = {
        _id: 'req123',
        user: 'user123',
        status: 'PENDING',
        save: sinon.stub(),
      };
      mockRequest.save.resolves(mockRequest);
      findByIdStub.resolves(mockRequest);
    });

    it('should call applyTrophy with TROPHY_AGE_VERIFIED', async () => {
      const req = { params: { id: 'req123' }, query: { status: 'APPROVED' }, body: {} };
      applyTrophyStub.callsFake((userId, trophy, cb) => cb(null));
      getUserByIdStub.resolves({
        _id: 'user123',
        username: 'testuser',
        auth: { email: 'test@example.com' },
        attrs: {},
        save: sinon.stub().resolves(),
      });

      await updateRequest(req, res);

      expect(applyTrophyStub.calledOnce).to.equal(true);
      expect(applyTrophyStub.firstCall.args[0]).to.equal('user123');
      expect(applyTrophyStub.firstCall.args[1]).to.equal('TROPHY_AGE_VERIFIED');
    });
  });

  describe('error handling', () => {
    it('should return 500 if findById throws', async () => {
      findByIdStub.rejects(new Error('db error'));
      const req = { params: { id: 'req123' }, query: { status: 'APPROVED' }, body: {} };

      await updateRequest(req, res);

      expect(res.status.calledWith(500)).to.equal(true);
    });

    it('should return 500 if request.save throws', async () => {
      const mockRequest = {
        _id: 'req123',
        user: 'user123',
        status: 'PENDING',
        save: sinon.stub().rejects(new Error('save error')),
      };
      findByIdStub.resolves(mockRequest);
      const req = { params: { id: 'req123' }, query: { status: 'APPROVED' }, body: {} };

      await updateRequest(req, res);

      expect(res.status.calledWith(500)).to.equal(true);
    });
  });
});
