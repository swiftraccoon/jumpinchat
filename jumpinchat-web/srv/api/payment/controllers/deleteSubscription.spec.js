import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('deleteSubscription controller', () => {
  let req;
  let res;
  let resSend;
  let resStatus;

  const createController = async (overrides = {}) => {
    const mocks = {
      '../../../utils/logger.util.js': { default: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {} }) },
      '../../../config/constants/errors.js': {
        default: {
          ERR_SRV: { code: 'ERR_SRV', message: 'server error' },
        },
      },
      '../payment.utils.js': {
        cancelSubscription: overrides.cancelSubscription || sinon.stub().resolves(true),
      },
    };

    const mod = await esmock('./deleteSubscription.controller.js', mocks);
    return mod.default;
  };

  beforeEach(() => {
    resSend = sinon.stub();
    resStatus = sinon.stub().returns({ send: resSend });
    req = {
      params: { userId: 'user_123' },
      user: { _id: 'user_123' },
    };
    res = { status: resStatus };
  });

  it('should return 403 if user._id does not match params.userId', async () => {
    const controller = await createController();
    req.user._id = 'other_user';
    await controller(req, res);
    expect(resStatus.calledWith(403)).to.equal(true);
  });

  it('should return 204 on successful cancellation', async () => {
    const cancelSubscription = sinon.stub().resolves(true);
    const controller = await createController({ cancelSubscription });
    await controller(req, res);
    expect(cancelSubscription.calledWith('user_123')).to.equal(true);
    expect(resStatus.calledWith(204)).to.equal(true);
  });

  it('should return 500 when cancelSubscription throws', async () => {
    const cancelSubscription = sinon.stub().rejects(new Error('cancel failed'));
    const controller = await createController({ cancelSubscription });
    await controller(req, res);
    expect(resStatus.calledWith(500)).to.equal(true);
  });
});
