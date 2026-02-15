import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('updateSource controller', () => {
  let req;
  let res;
  let resSend;
  let resStatus;

  const createController = async (overrides = {}) => {
    const mocks = {
      '../../../utils/logger.util.js': { default: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {} }) },
      '../../user/user.utils.js': {
        getUserById: overrides.getUserById || sinon.stub().resolves({ _id: 'user_1' }),
      },
      '../payment.utils.js': {
        default: {
          getCustomerByUserId: overrides.getCustomerByUserId || sinon.stub().resolves({ id: 'cust_1' }),
          updateCustomer: overrides.updateCustomer || sinon.stub().resolves(),
        },
      },
    };

    const mod = await esmock('./updateSource.controller.js', mocks);
    return mod.default;
  };

  beforeEach(() => {
    resSend = sinon.stub();
    resStatus = sinon.stub().returns({ send: resSend });
    req = {
      params: { userId: 'user_1' },
      body: { stripeToken: 'tok_visa' },
      user: { _id: 'user_1' },
    };
    res = { status: resStatus };
  });

  it('should return 400 if stripeToken is missing', async () => {
    const controller = await createController();
    req.body.stripeToken = undefined;
    await controller(req, res);
    expect(resStatus.calledWith(400)).to.equal(true);
    expect(resSend.firstCall.args[0].error).to.equal('ERR_NO_TOKEN');
  });

  it('should return 401 if user._id does not match params.userId', async () => {
    const controller = await createController();
    req.user._id = 'other_user';
    await controller(req, res);
    expect(resStatus.calledWith(401)).to.equal(true);
    expect(resSend.firstCall.args[0].error).to.equal('ERR_NOT_AUTHORIZED');
  });

  it('should return 200 on successful update', async () => {
    const getCustomerByUserId = sinon.stub().resolves({ id: 'cust_1' });
    const updateCustomer = sinon.stub().resolves();
    const controller = await createController({ getCustomerByUserId, updateCustomer });
    await controller(req, res);
    expect(getCustomerByUserId.calledWith('user_1')).to.equal(true);
    expect(updateCustomer.calledWith('cust_1', { source: 'tok_visa' })).to.equal(true);
    expect(resStatus.calledWith(200)).to.equal(true);
  });

  it('should return 500 when getCustomerByUserId throws', async () => {
    const getCustomerByUserId = sinon.stub().rejects(new Error('no customer'));
    const controller = await createController({ getCustomerByUserId });
    await controller(req, res);
    expect(resStatus.calledWith(500)).to.equal(true);
  });

  it('should return 500 when updateCustomer throws', async () => {
    const updateCustomer = sinon.stub().rejects(new Error('stripe err'));
    const controller = await createController({ updateCustomer });
    await controller(req, res);
    expect(resStatus.calledWith(500)).to.equal(true);
  });
});
