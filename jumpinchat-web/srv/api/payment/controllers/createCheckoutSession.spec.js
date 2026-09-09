import assert from 'node:assert/strict';
import sinon from 'sinon';
import esmock from 'esmock';
import { logger, response, user } from './paymentTestHelpers.js';

describe('hosted Checkout creation', () => {
  let req, res, stripe, utils, getUserById, controller;
  beforeEach(async () => {
    req = { user: { _id: 'user_1' }, body: { product: 'onetime', amount: '600' } };
    res = response();
    stripe = { checkout: { sessions: { create: sinon.stub().resolves({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' }) } } };
    utils = { getPaymentByUserId: sinon.stub().resolves(null), saveCheckoutSession: sinon.stub().resolves() };
    getUserById = sinon.stub().resolves(user);
    controller = (await esmock('./createCheckoutSession.controller.js', {
      '../stripe.client.js': { default: stripe },
      '../payment.utils.js': { default: utils },
      '../../user/user.utils.js': { getUserById },
      '../../../utils/logger.util.js': logger,
      '../../../utils/utils.js': { getHostDomain: () => 'https://example.test' },
    })).default;
  });
  it('returns hosted URL and persists the local session before returning success', async () => {
    await controller(req, res);
    assert.equal(res.status.firstCall.args[0], 201);
    assert.deepEqual(res.send.firstCall.args[0], { id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' });
    const options = stripe.checkout.sessions.create.firstCall.args[0];
    assert.equal(options.line_items[0].price_data.unit_amount, 600);
    assert.equal(options.customer_creation, 'always');
    assert.equal(options.customer_email, user.auth.email);
    sinon.assert.calledWith(utils.saveCheckoutSession, 'user_1', 'cs_1', undefined);
    sinon.assert.callOrder(utils.saveCheckoutSession, res.send);
  });
  for (const amount of [299, 5001, 300.5, 'invalid', '', null, undefined]) {
    it(`rejects invalid one-off amount ${String(amount)}`, async () => {
      req.body.amount = amount;
      await controller(req, res);
      assert.equal(res.status.firstCall.args[0], 400);
      sinon.assert.notCalled(stripe.checkout.sessions.create);
    });
  }
  it('rejects unknown and inherited product names', async () => {
    for (const product of ['missing', 'constructor', undefined]) {
      req.body.product = product;
      await controller(req, res);
      assert.equal(res.status.lastCall.args[0], 400);
    }
    sinon.assert.notCalled(stripe.checkout.sessions.create);
  });
  it('uses the subscription price without caller amount and reuses a customer', async () => {
    req.body = { product: 'annual' };
    utils.getPaymentByUserId.onFirstCall().resolves({ customerId: 'cus_existing' });
    await controller(req, res);
    const options = stripe.checkout.sessions.create.firstCall.args[0];
    assert.equal(options.mode, 'subscription');
    assert.equal(options.line_items[0].price, 'plan_DioVHqZfPGjykw');
    assert.equal(options.customer, 'cus_existing');
    assert.equal(options.customer_creation, undefined);
    assert.equal(options.customer_email, undefined);
  });
  it('blocks a second subscription even if the gold attribute is stale', async () => {
    req.body = { product: 'monthly' };
    utils.getPaymentByUserId.onSecondCall().resolves({ subscription: { id: 'sub_existing' } });
    await controller(req, res);
    assert.equal(res.status.firstCall.args[0], 422);
    sinon.assert.notCalled(stripe.checkout.sessions.create);
  });
  it('rejects subscription gifts and missing recipients', async () => {
    req.body = { product: 'monthly', beneficiary: 'recipient' };
    await controller(req, res);
    assert.equal(res.status.lastCall.args[0], 400);
    req.body = { product: 'onetime', amount: 300, beneficiary: 'recipient' };
    getUserById.onSecondCall().resolves(null);
    await controller(req, res);
    assert.equal(res.status.lastCall.args[0], 400);
    sinon.assert.notCalled(stripe.checkout.sessions.create);
  });
  it('fails closed when the session cannot be saved', async () => {
    utils.saveCheckoutSession.rejects(new Error('database unavailable'));
    await controller(req, res);
    assert.equal(res.status.firstCall.args[0], 500);
  });
  it('fails closed when Stripe omits its hosted URL', async () => {
    stripe.checkout.sessions.create.resolves({ id: 'cs_1', url: null });
    await controller(req, res);
    assert.equal(res.status.firstCall.args[0], 500);
    sinon.assert.notCalled(utils.saveCheckoutSession);
  });
});
