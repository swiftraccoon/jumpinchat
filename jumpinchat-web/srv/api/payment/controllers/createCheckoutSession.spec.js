import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
import { productIds, productTypes, products } from '../payment.constants.js';

describe('createCheckoutSession controller', () => {
  let req;
  let res;
  let resSend;
  let resStatus;

  const createController = async (overrides = {}) => {
    const sessionsCreate = overrides.sessionsCreate
      || sinon.stub().resolves({ id: 'cs_test_session' });

    const mocks = {
      stripe: function StripeMock() {
        return {
          checkout: {
            sessions: {
              create: sessionsCreate,
            },
          },
        };
      },
      '../../../utils/logger.util.js': { default: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {} }) },
      '../../../utils/utils.js': {
        getHostDomain: sinon.stub().returns('https://example.com'),
      },
      '../../../config/constants/errors.js': {
        default: {
          ERR_SRV: { code: 'ERR_SRV', message: 'server error' },
          ERR_NO_USER: { code: 'ERR_NO_USER', message: 'no user found' },
        },
      },
      '../../../config/env/index.js': {
        default: {
          payment: {
            stripe: { secretKey: 'sk_test' },
          },
        },
      },
      '../../user/user.utils.js': {
        getUserById: overrides.getUserById || sinon.stub().resolves({
          _id: 'user_1',
          auth: { email: 'test@test.com', email_is_verified: true },
          attrs: { isGold: false },
        }),
      },
      '../payment.utils.js': {
        default: {
          getPaymentByUserId: overrides.getPaymentByUserId || sinon.stub().resolves(null),
          saveCheckoutSession: overrides.saveCheckoutSession || sinon.stub().resolves(),
        },
      },
    };

    const mod = await esmock('./createCheckoutSession.controller.js', mocks);
    return mod.default;
  };

  beforeEach(() => {
    resSend = sinon.stub();
    resStatus = sinon.stub().returns({ send: resSend });
    req = {
      body: {
        product: productIds.SUPPORT_MONTHLY,
        amount: 500,
      },
      user: { _id: 'user_1' },
    };
    res = { status: resStatus };
  });

  it('should return 400 if product is missing', async () => {
    const controller = await createController();
    req.body.product = undefined;
    await controller(req, res);
    expect(resStatus.calledWith(400)).to.equal(true);
    expect(resSend.firstCall.args[0].error).to.equal('ERR_NO_PRODUCT');
  });

  it('should return 400 if amount is below 300', async () => {
    const controller = await createController();
    req.body.amount = 100;
    await controller(req, res);
    expect(resStatus.calledWith(400)).to.equal(true);
    expect(resSend.firstCall.args[0].error).to.equal('ERR_INVALID_AMOUNT');
  });

  it('should return 400 if amount is above 5000', async () => {
    const controller = await createController();
    req.body.amount = 10000;
    await controller(req, res);
    expect(resStatus.calledWith(400)).to.equal(true);
    expect(resSend.firstCall.args[0].error).to.equal('ERR_INVALID_AMOUNT');
  });

  it('should return 400 if one-time product with no amount', async () => {
    const controller = await createController();
    req.body.product = productIds.SUPPORT_ONE_TIME;
    req.body.amount = undefined;
    await controller(req, res);
    expect(resStatus.calledWith(400)).to.equal(true);
    expect(resSend.firstCall.args[0].error).to.equal('ERR_NO_AMOUNT');
  });

  it('should return 500 if getPaymentByUserId throws', async () => {
    const getPaymentByUserId = sinon.stub().rejects(new Error('db error'));
    const controller = await createController({ getPaymentByUserId });
    await controller(req, res);
    expect(resStatus.calledWith(500)).to.equal(true);
  });

  it('should return 500 if getUserById returns null', async () => {
    const getUserById = sinon.stub().resolves(null);
    const controller = await createController({ getUserById });
    await controller(req, res);
    expect(resStatus.calledWith(500)).to.equal(true);
  });

  it('should return 422 if user is already gold on plan product', async () => {
    const getPaymentByUserId = sinon.stub().resolves({ customerId: 'cust_1' });
    const getUserById = sinon.stub().resolves({
      _id: 'user_1',
      auth: { email: 'test@test.com', email_is_verified: true },
      attrs: { isGold: true },
    });
    const controller = await createController({ getPaymentByUserId, getUserById });
    await controller(req, res);
    expect(resStatus.calledWith(422)).to.equal(true);
    expect(resSend.firstCall.args[0].error).to.equal('ERR_SUBSCRIPTION_EXISTS');
  });

  it('should create subscription checkout session for plan product', async () => {
    const saveCheckoutSession = sinon.stub().resolves();
    const sessionsCreate = sinon.stub().resolves({ id: 'cs_test' });
    const controller = await createController({ saveCheckoutSession, sessionsCreate });
    await controller(req, res);
    expect(sessionsCreate.called).to.equal(true);
    const opts = sessionsCreate.firstCall.args[0];
    expect(opts.mode).to.equal('subscription');
    expect(resStatus.calledWith(201)).to.equal(true);
    expect(resSend.firstCall.args[0]).to.equal('cs_test');
  });

  it('should create payment checkout session for one-time product', async () => {
    req.body.product = productIds.SUPPORT_ONE_TIME;
    req.body.amount = 500;
    const saveCheckoutSession = sinon.stub().resolves();
    const sessionsCreate = sinon.stub().resolves({ id: 'cs_onetime' });
    const controller = await createController({ saveCheckoutSession, sessionsCreate });
    await controller(req, res);
    expect(sessionsCreate.called).to.equal(true);
    const opts = sessionsCreate.firstCall.args[0];
    expect(opts.mode).to.equal('payment');
    expect(resStatus.calledWith(201)).to.equal(true);
    expect(resSend.firstCall.args[0]).to.equal('cs_onetime');
  });

  it('should include existing customer id if payment exists', async () => {
    const getPaymentByUserId = sinon.stub().resolves({ customerId: 'cust_existing' });
    const sessionsCreate = sinon.stub().resolves({ id: 'cs_test' });
    const saveCheckoutSession = sinon.stub().resolves();
    const controller = await createController({
      getPaymentByUserId,
      sessionsCreate,
      saveCheckoutSession,
    });
    await controller(req, res);
    expect(sessionsCreate.called).to.equal(true);
    const opts = sessionsCreate.firstCall.args[0];
    expect(opts.customer).to.equal('cust_existing');
  });
});
