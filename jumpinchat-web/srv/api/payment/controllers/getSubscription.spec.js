import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('getSubscription controller', () => {
  let req;
  let res;
  let resSend;
  let resStatus;

  const createController = async (overrides = {}) => {
    const pricesRetrieve = overrides.pricesRetrieve || sinon.stub().resolves({
      id: 'price_1',
      nickname: 'Monthly',
      unit_amount: 500,
      recurring: { interval: 'month' },
    });

    const paymentMethodsRetrieve = overrides.paymentMethodsRetrieve || sinon.stub().resolves({
      card: {
        last4: '4242',
        exp_month: 12,
        exp_year: 2030,
        brand: 'visa',
      },
    });

    const mocks = {
      stripe: function StripeMock() {
        return {
          prices: { retrieve: pricesRetrieve },
          paymentMethods: { retrieve: paymentMethodsRetrieve },
        };
      },
      '../../../utils/logger.util.js': { default: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {} }) },
      '../../../config/env/index.js': {
        default: {
          payment: { stripe: { secretKey: 'sk_test' } },
        },
      },
      '../../../config/constants/errors.js': {
        default: {
          ERR_SRV: { code: 'ERR_SRV', message: 'server error' },
        },
      },
      '../payment.utils.js': {
        getPaymentByUserId: overrides.getPaymentByUserId || sinon.stub().resolves({
          _id: 'pay_1',
          customerId: 'cust_1',
          subscription: { planId: 'price_1' },
          createdAt: '2024-01-01',
        }),
        getCustomerByUserId: overrides.getCustomerByUserId || sinon.stub().resolves({
          id: 'cust_1',
          sources: { data: [{ card: { last4: '4242', exp_month: 12, exp_year: 2030, brand: 'visa' } }] },
          subscriptions: { data: [] },
        }),
      },
    };

    const mod = await esmock('./getSubscription.controller.js', mocks);
    return mod.default;
  };

  beforeEach(() => {
    resSend = sinon.stub();
    resStatus = sinon.stub().returns({ send: resSend });
    req = {
      params: { userId: 'user_1' },
      user: { _id: 'user_1' },
    };
    res = { status: resStatus };
  });

  it('should return 403 if user._id does not match params.userId', async () => {
    const controller = await createController();
    req.user._id = 'other_user';
    await controller(req, res);
    expect(resStatus.calledWith(403)).to.equal(true);
  });

  it('should return 500 if getPaymentByUserId throws', async () => {
    const getPaymentByUserId = sinon.stub().rejects(new Error('db err'));
    const controller = await createController({ getPaymentByUserId });
    await controller(req, res);
    expect(resStatus.calledWith(500)).to.equal(true);
  });

  it('should return 404 if no payment found', async () => {
    const getPaymentByUserId = sinon.stub().resolves(null);
    const controller = await createController({ getPaymentByUserId });
    await controller(req, res);
    expect(resStatus.calledWith(404)).to.equal(true);
  });

  it('should return 404 if payment has no customerId', async () => {
    const getPaymentByUserId = sinon.stub().resolves({ _id: 'pay_1', customerId: null });
    const controller = await createController({ getPaymentByUserId });
    await controller(req, res);
    expect(resStatus.calledWith(404)).to.equal(true);
  });

  it('should return 500 if getCustomerByUserId throws', async () => {
    const getCustomerByUserId = sinon.stub().rejects(new Error('stripe err'));
    const controller = await createController({ getCustomerByUserId });
    await controller(req, res);
    expect(resStatus.calledWith(500)).to.equal(true);
  });

  it('should return 404 if customer not found', async () => {
    const getCustomerByUserId = sinon.stub().resolves(null);
    const controller = await createController({ getCustomerByUserId });
    await controller(req, res);
    expect(resStatus.calledWith(404)).to.equal(true);
  });

  it('should return 200 with subscription details using sources', async () => {
    const controller = await createController();
    await controller(req, res);
    expect(resStatus.calledWith(200)).to.equal(true);
    const body = resSend.firstCall.args[0];
    expect(body.paymentId).to.equal('pay_1');
    expect(body.plan.id).to.equal('price_1');
    expect(body.plan.name).to.equal('Monthly');
    expect(body.plan.amount).to.equal(500);
    expect(body.plan.interval).to.equal('month');
    expect(body.source.last4).to.equal('4242');
    expect(body.source.brand).to.equal('visa');
  });

  it('should fall back to subscriptions.default_payment_method if no sources', async () => {
    const getCustomerByUserId = sinon.stub().resolves({
      id: 'cust_1',
      sources: { data: [] },
      subscriptions: {
        data: [{
          default_payment_method: 'pm_1',
        }],
      },
    });
    const paymentMethodsRetrieve = sinon.stub().resolves({
      card: {
        last4: '1234',
        exp_month: 6,
        exp_year: 2028,
        brand: 'mastercard',
      },
    });
    const controller = await createController({ getCustomerByUserId, paymentMethodsRetrieve });
    await controller(req, res);
    expect(paymentMethodsRetrieve.calledWith('pm_1')).to.equal(true);
    expect(resStatus.calledWith(200)).to.equal(true);
    const body = resSend.firstCall.args[0];
    expect(body.source.last4).to.equal('1234');
    expect(body.source.brand).to.equal('mastercard');
  });

  it('should return 404 if no card found', async () => {
    const getCustomerByUserId = sinon.stub().resolves({
      id: 'cust_1',
      sources: { data: [] },
      subscriptions: { data: [] },
    });
    const controller = await createController({ getCustomerByUserId });
    await controller(req, res);
    expect(resStatus.calledWith(404)).to.equal(true);
  });
});
