import assert from 'node:assert/strict';
import sinon from 'sinon';
import esmock from 'esmock';
import { logger, response, accountPayment } from './paymentTestHelpers.js';

describe('current subscription details', () => {
  let req, res, stripe, getPaymentByUserId, controller, subscription;
  beforeEach(async () => {
    req = { user: { _id: 'user_1' }, params: { userId: 'user_1' } };
    res = response();
    subscription = { id: 'sub_1', status: 'active', customer: 'cus_1', default_payment_method: {
      id: 'pm_1', card: { last4: '4242', brand: 'visa', exp_month: 1, exp_year: 2030 },
    }, items: { data: [{ price: { id: 'price_1', unit_amount: 500, nickname: 'Monthly', recurring: { interval: 'month' } } }] } };
    stripe = { subscriptions: { retrieve: sinon.stub().resolves(subscription) },
      customers: { retrieve: sinon.stub().resolves({ id: 'cus_1', invoice_settings: {} }) },
      paymentMethods: { retrieve: sinon.stub().resolves(subscription.default_payment_method) },
      prices: { retrieve: sinon.stub() } };
    getPaymentByUserId = sinon.stub().resolves(accountPayment);
    controller = (await esmock('./getSubscription.controller.js', {
      '../stripe.client.js': { default: stripe }, '../payment.utils.js': { getPaymentByUserId },
      '../../../utils/logger.util.js': logger,
    })).default;
  });
  it('returns the expanded subscription price and PaymentMethod card without customer arrays', async () => {
    await controller(req, res);
    assert.equal(res.status.firstCall.args[0], 200);
    assert.equal(res.send.firstCall.args[0].source.last4, '4242');
    assert.equal(res.send.firstCall.args[0].plan.interval, 'month');
    sinon.assert.notCalled(stripe.customers.retrieve);
  });
  it('falls back to the customer invoice default PaymentMethod', async () => {
    subscription.default_payment_method = null;
    stripe.customers.retrieve.resolves({ invoice_settings: { default_payment_method: 'pm_1' } });
    await controller(req, res);
    sinon.assert.calledWith(stripe.paymentMethods.retrieve, 'pm_1');
    assert.equal(res.status.firstCall.args[0], 200);
  });
  it('keeps subscriptions manageable when there is no modern saved card', async () => {
    subscription.default_payment_method = null;
    await controller(req, res);
    assert.equal(res.status.firstCall.args[0], 200);
    assert.equal(res.send.firstCall.args[0].source, null);
  });
  it('rejects another account before querying payment data', async () => {
    req.params.userId = 'other';
    await controller(req, res);
    assert.equal(res.status.firstCall.args[0], 403);
    sinon.assert.notCalled(getPaymentByUserId);
  });
  it('returns 404 for missing and canceled subscriptions', async () => {
    getPaymentByUserId.resolves(null);
    await controller(req, res);
    assert.equal(res.status.lastCall.args[0], 404);
    getPaymentByUserId.resolves(accountPayment);
    subscription.status = 'canceled';
    await controller(req, res);
    assert.equal(res.status.lastCall.args[0], 404);
  });
  it('does not return details from a mismatched customer', async () => {
    subscription.customer = 'cus_other';
    await controller(req, res);
    assert.equal(res.status.firstCall.args[0], 500);
  });
});
