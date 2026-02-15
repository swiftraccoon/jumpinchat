import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('getVerificationRequest controller', () => {
  let getVerificationRequest;
  let findByIdStub;
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

    const mod = await esmock('./getVerificationRequest.js', {
      '../../../utils/logger.util.js': { default: logStub },
      '../ageVerification.utils.js': { findById: findByIdStub },
    });

    getVerificationRequest = mod.default;
    res = createRes();
  });

  it('should return 200 with the request data on success', async () => {
    const mockRequest = { _id: 'req123', status: 'PENDING', user: 'user1' };
    findByIdStub.resolves(mockRequest);
    const req = { params: { id: 'req123' } };

    await getVerificationRequest(req, res);

    expect(findByIdStub.calledWith('req123')).to.equal(true);
    expect(res.status.calledWith(200)).to.equal(true);
    expect(res.send.calledWith(mockRequest)).to.equal(true);
  });

  it('should return 200 with null if request not found', async () => {
    findByIdStub.resolves(null);
    const req = { params: { id: 'nonexistent' } };

    await getVerificationRequest(req, res);

    expect(res.status.calledWith(200)).to.equal(true);
    expect(res.send.calledWith(null)).to.equal(true);
  });

  it('should return 500 if findById throws', async () => {
    findByIdStub.rejects(new Error('db error'));
    const req = { params: { id: 'req123' } };

    await getVerificationRequest(req, res);

    expect(res.status.calledWith(500)).to.equal(true);
  });
});
