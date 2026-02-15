import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('ageVerification.utils', () => {
  let findById;
  let getRequests;
  let getRequestsByUser;
  let findRecentDeniedRequests;
  let modelStub;

  beforeEach(async () => {
    modelStub = {
      findOne: sinon.stub(),
      find: sinon.stub(),
    };

    const mod = await esmock('./ageVerification.utils.js', {
      '../../config/env/index.js': {
        default: {
          ageVerification: {
            deniedTimeout: 1000 * 60 * 60 * 24 * 14,
          },
        },
      },
      './ageVerification.const.js': {
        statuses: {
          PENDING: 'PENDING',
          APPROVED: 'APPROVED',
          DENIED: 'DENIED',
          REJECTED: 'REJECTED',
          EXPIRED: 'EXPIRED',
        },
      },
      './ageVerification.model.js': { default: modelStub },
    });

    findById = mod.findById;
    getRequests = mod.getRequests;
    getRequestsByUser = mod.getRequestsByUser;
    findRecentDeniedRequests = mod.findRecentDeniedRequests;
  });

  describe('findById', () => {
    it('should query by _id and call exec', () => {
      const mockRequest = { _id: 'req123', status: 'PENDING' };
      modelStub.findOne.returns({ exec: sinon.stub().resolves(mockRequest) });

      const result = findById('req123');

      expect(modelStub.findOne.calledOnce).to.equal(true);
      expect(modelStub.findOne.firstCall.args[0]).to.deep.equal({ _id: 'req123' });
      return result.then((r) => {
        expect(r).to.deep.equal(mockRequest);
      });
    });
  });

  describe('getRequests', () => {
    it('should call find with no filter and exec', () => {
      const mockRequests = [{ _id: 'r1' }, { _id: 'r2' }];
      modelStub.find.returns({ exec: sinon.stub().resolves(mockRequests) });

      const result = getRequests();

      expect(modelStub.find.calledOnce).to.equal(true);
      expect(modelStub.find.firstCall.args).to.have.lengthOf(0);
      return result.then((r) => {
        expect(r).to.deep.equal(mockRequests);
      });
    });
  });

  describe('getRequestsByUser', () => {
    it('should query pending requests for user that have not expired', () => {
      const sortStub = sinon.stub().returns({ exec: sinon.stub().resolves([]) });
      modelStub.find.returns({ sort: sortStub });

      getRequestsByUser('user123');

      expect(modelStub.find.calledOnce).to.equal(true);
      const query = modelStub.find.firstCall.args[0];
      expect(query.status).to.deep.equal({ $eq: 'PENDING' });
      expect(query.user).to.equal('user123');
      expect(query.expiresAt.$gt).to.be.an.instanceOf(Date);
    });

    it('should sort by updatedAt descending', () => {
      const sortStub = sinon.stub().returns({ exec: sinon.stub().resolves([]) });
      modelStub.find.returns({ sort: sortStub });

      getRequestsByUser('user123');

      expect(sortStub.calledOnce).to.equal(true);
      expect(sortStub.firstCall.args[0]).to.deep.equal({ updatedAt: -1 });
    });
  });

  describe('findRecentDeniedRequests', () => {
    it('should query denied requests for user within the denied timeout window', () => {
      const sortStub = sinon.stub().returns({ exec: sinon.stub().resolves([]) });
      modelStub.find.returns({ sort: sortStub });

      findRecentDeniedRequests('user456');

      expect(modelStub.find.calledOnce).to.equal(true);
      const query = modelStub.find.firstCall.args[0];
      expect(query.status).to.equal('DENIED');
      expect(query.user).to.equal('user456');
      expect(query.updatedAt.$gt).to.be.a('number');
    });

    it('should sort by updatedAt descending', () => {
      const sortStub = sinon.stub().returns({ exec: sinon.stub().resolves([]) });
      modelStub.find.returns({ sort: sortStub });

      findRecentDeniedRequests('user456');

      expect(sortStub.calledOnce).to.equal(true);
      expect(sortStub.firstCall.args[0]).to.deep.equal({ updatedAt: -1 });
    });
  });
});
