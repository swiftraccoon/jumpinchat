import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('getVerificationRequests controller', () => {
  let getVerificationRequests;
  let getRequestsStub;
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
    getRequestsStub = sinon.stub();

    const mod = await esmock('./getVerificationRequests.js', {
      '../../../utils/logger.util.js': { default: logStub },
      '../ageVerification.utils.js': { getRequests: getRequestsStub },
    });

    getVerificationRequests = mod.default;
    res = createRes();
  });

  it('should return 200 with all requests on success', async () => {
    const mockRequests = [
      { _id: 'r1', status: 'PENDING' },
      { _id: 'r2', status: 'APPROVED' },
    ];
    getRequestsStub.resolves(mockRequests);
    const req = {};

    await getVerificationRequests(req, res);

    expect(getRequestsStub.calledOnce).to.equal(true);
    expect(res.status.calledWith(200)).to.equal(true);
    expect(res.send.calledWith(mockRequests)).to.equal(true);
  });

  it('should return 200 with empty array if no requests exist', async () => {
    getRequestsStub.resolves([]);
    const req = {};

    await getVerificationRequests(req, res);

    expect(res.status.calledWith(200)).to.equal(true);
    expect(res.send.calledWith([])).to.equal(true);
  });

  it('should return 500 if getRequests throws', async () => {
    getRequestsStub.rejects(new Error('db error'));
    const req = {};

    await getVerificationRequests(req, res);

    expect(res.status.calledWith(500)).to.equal(true);
  });
});
