import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
import { stripeEvents } from '../payment.constants.js';

describe('stripeHook controller', () => {
  let req;
  let res;
  let resSend;
  let resStatus;

  const createController = async (overrides = {}) => {
    const constructEventStub = overrides.constructEvent
      || sinon.stub().returns({
        type: stripeEvents.SESSION_COMPLETED,
        data: { object: { customer: 'cust_123' } },
      });

    const mocks = {
      stripe: function StripeMock() {
        return {
          webhooks: {
            constructEvent: constructEventStub,
          },
        };
      },
      '../../../config/env/index.js': {
        default: {
          payment: {
            stripe: {
              secretKey: 'sk_test',
              whKey: 'whsec_test',
            },
          },
        },
      },
      '../../../utils/logger.util.js': { default: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {} }) },
      './fulfillPayment.controller.js': {
        default: overrides.fulfillPayment || sinon.stub().resolves(),
      },
      '../payment.utils.js': {
        deletePayment: overrides.deletePayment || sinon.stub().resolves(),
        getPaymentByCustomerId: overrides.getPaymentByCustomerId || sinon.stub().resolves({ _id: 'pay_1' }),
        updateExpire: overrides.updateExpire || sinon.stub().resolves(),
      },
    };

    const mod = await esmock('./stripeHook.controller.js', mocks);
    return mod.default;
  };

  beforeEach(() => {
    resSend = sinon.stub();
    resStatus = sinon.stub().returns({ send: resSend });
    req = {
      body: 'raw_body',
      headers: { 'stripe-signature': 'sig_test' },
    };
    res = { status: resStatus };
  });

  it('should return 400 if constructEvent throws', async () => {
    const constructEvent = sinon.stub().throws(new Error('bad sig'));
    const controller = await createController({ constructEvent });
    await controller(req, res);
    expect(resStatus.calledWith(400)).to.equal(true);
  });

  describe('SUBSCRIPTION_DELETE event', () => {
    it('should delete payment when payment exists', async () => {
      const deletePayment = sinon.stub().resolves();
      const getPaymentByCustomerId = sinon.stub().resolves({ _id: 'pay_1' });
      const constructEvent = sinon.stub().returns({
        type: stripeEvents.SUBSCRIPTION_DELETE,
        data: { object: { customer: 'cust_123' } },
      });
      const controller = await createController({
        constructEvent,
        deletePayment,
        getPaymentByCustomerId,
      });
      await controller(req, res);
      expect(getPaymentByCustomerId.calledWith('cust_123')).to.equal(true);
      expect(deletePayment.calledWith('pay_1')).to.equal(true);
      expect(resStatus.calledWith(200)).to.equal(true);
    });

    it('should not call deletePayment when no payment found', async () => {
      const deletePayment = sinon.stub().resolves();
      const getPaymentByCustomerId = sinon.stub().resolves(null);
      const constructEvent = sinon.stub().returns({
        type: stripeEvents.SUBSCRIPTION_DELETE,
        data: { object: { customer: 'cust_123' } },
      });
      const controller = await createController({
        constructEvent,
        deletePayment,
        getPaymentByCustomerId,
      });
      await controller(req, res);
      expect(deletePayment.called).to.equal(false);
      expect(resStatus.calledWith(200)).to.equal(true);
    });
  });

  describe('INVOICE_PAID event', () => {
    it('should update expiry when payment exists', async () => {
      const updateExpire = sinon.stub().resolves();
      const getPaymentByCustomerId = sinon.stub().resolves({ _id: 'pay_1', userId: 'user_1' });
      const constructEvent = sinon.stub().returns({
        type: stripeEvents.INVOICE_PAID,
        data: { object: { customer: 'cust_123' } },
      });
      const controller = await createController({
        constructEvent,
        updateExpire,
        getPaymentByCustomerId,
      });
      await controller(req, res);
      expect(updateExpire.calledWith('pay_1', 'user_1')).to.equal(true);
      expect(resStatus.calledWith(200)).to.equal(true);
    });

    it('should not update expiry when no payment exists', async () => {
      const updateExpire = sinon.stub().resolves();
      const getPaymentByCustomerId = sinon.stub().resolves(null);
      const constructEvent = sinon.stub().returns({
        type: stripeEvents.INVOICE_PAID,
        data: { object: { customer: 'cust_123' } },
      });
      const controller = await createController({
        constructEvent,
        updateExpire,
        getPaymentByCustomerId,
      });
      await controller(req, res);
      expect(updateExpire.called).to.equal(false);
      expect(resStatus.calledWith(200)).to.equal(true);
    });
  });

  describe('SESSION_COMPLETED event', () => {
    it('should fulfill payment and return 200 on success', async () => {
      const fulfillPayment = sinon.stub().resolves();
      const constructEvent = sinon.stub().returns({
        type: stripeEvents.SESSION_COMPLETED,
        data: { object: { id: 'sess_1', customer: 'cust_1' } },
      });
      const controller = await createController({ constructEvent, fulfillPayment });
      await controller(req, res);
      expect(fulfillPayment.calledWith({ id: 'sess_1', customer: 'cust_1' })).to.equal(true);
      expect(resStatus.calledWith(200)).to.equal(true);
    });

    it('should return 500 when fulfillPayment throws', async () => {
      const fulfillPayment = sinon.stub().rejects(new Error('fail'));
      const constructEvent = sinon.stub().returns({
        type: stripeEvents.SESSION_COMPLETED,
        data: { object: { id: 'sess_1', customer: 'cust_1' } },
      });
      const controller = await createController({ constructEvent, fulfillPayment });
      await controller(req, res);
      expect(resStatus.calledWith(500)).to.equal(true);
    });
  });

  it('should return 200 for unknown event types', async () => {
    const constructEvent = sinon.stub().returns({
      type: 'unknown.event',
      data: { object: {} },
    });
    const controller = await createController({ constructEvent });
    await controller(req, res);
    expect(resStatus.calledWith(200)).to.equal(true);
  });
});
