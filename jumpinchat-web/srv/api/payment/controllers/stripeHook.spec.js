import assert from 'node:assert/strict';
import sinon from 'sinon';
import esmock from 'esmock';
import Stripe from 'stripe';
import { logger, response } from './paymentTestHelpers.js';

const signatureClient = new Stripe('sk_test_local_fixture');
const signingSecret = 'whsec_local_fixture_only';
function signedRequest(type, object = { id: 'cs_1' }, timestamp = Math.floor(Date.now() / 1000)) {
  const payload = JSON.stringify({ id: 'evt_fixture', object: 'event', type, data: { object } });
  return { body: Buffer.from(payload), headers: { 'stripe-signature':
    signatureClient.webhooks.generateTestHeaderString({ payload, secret: signingSecret, timestamp }) } };
}

describe('signed Stripe webhook delivery', () => {
  let res, fulfill, utils, stripe, hook, config;
  beforeEach(async () => {
    res = response();
    fulfill = sinon.stub().resolves(true);
    utils = { handleSubscriptionDeleted: sinon.stub().resolves(), renewSubscription: sinon.stub().resolves() };
    stripe = { webhooks: signatureClient.webhooks, invoices: { retrieve: sinon.stub().resolves({ id: 'in_1', status: 'paid' }) } };
    config = { payment: { stripe: { whKey: signingSecret } } };
    hook = (await esmock('./stripeHook.controller.js', {
      '../stripe.client.js': { default: stripe }, '../payment.utils.js': utils,
      './fulfillPayment.controller.js': { default: fulfill },
      '../../../config/env/index.js': { default: config }, '../../../utils/logger.util.js': logger,
    })).default;
  });
  for (const type of ['checkout.session.completed', 'checkout.session.async_payment_succeeded']) {
    it(`accepts a real SDK signature for ${type}`, async () => {
      await hook(signedRequest(type), res);
      assert.equal(res.status.firstCall.args[0], 200);
      sinon.assert.calledWith(fulfill, { id: 'cs_1' });
    });
  }
  it('rejects changed, missing, expired and pre-parsed signatures without processing', async () => {
    const changed = signedRequest('checkout.session.completed');
    changed.body = Buffer.from('{}');
    const missing = signedRequest('checkout.session.completed');
    delete missing.headers['stripe-signature'];
    const parsed = signedRequest('checkout.session.completed');
    parsed.body = JSON.parse(parsed.body.toString());
    for (const req of [changed, missing, parsed, signedRequest('checkout.session.completed', {}, Math.floor(Date.now() / 1000) - 600)]) {
      await hook(req, res);
      assert.equal(res.status.lastCall.args[0], 400);
    }
    sinon.assert.notCalled(fulfill);
  });
  it('returns a retriable failure for fulfillment errors', async () => {
    fulfill.rejects(new Error('private database details'));
    await hook(signedRequest('checkout.session.completed'), res);
    assert.equal(res.status.firstCall.args[0], 500);
    assert.deepEqual(res.send.firstCall.args[0], { message: 'Payment event could not be processed' });
  });
  it('rehydrates invoice objects through the pinned API before renewal', async () => {
    await hook(signedRequest('invoice.payment_succeeded', { id: 'in_1' }), res);
    sinon.assert.calledWith(stripe.invoices.retrieve, 'in_1');
    sinon.assert.calledWith(utils.renewSubscription, { id: 'in_1', status: 'paid' });
    assert.equal(res.status.firstCall.args[0], 200);
  });
  it('returns a retriable failure for renewal and cancellation database failures', async () => {
    utils.renewSubscription.rejects(new Error('retry invoice'));
    await hook(signedRequest('invoice.payment_succeeded', { id: 'in_1' }), res);
    assert.equal(res.status.lastCall.args[0], 500);
    utils.handleSubscriptionDeleted.rejects(new Error('retry deletion'));
    await hook(signedRequest('customer.subscription.deleted', { id: 'sub_1' }), res);
    assert.equal(res.status.lastCall.args[0], 500);
  });
  it('acknowledges irrelevant signed event types', async () => {
    await hook(signedRequest('customer.created'), res);
    assert.equal(res.status.firstCall.args[0], 200);
    sinon.assert.notCalled(fulfill);
  });
  it('returns 503 without attempting verification when the webhook is disabled', async () => {
    config.payment.stripe.whKey = '';
    await hook({ headers: {}, body: Buffer.from('{}') }, res);
    assert.equal(res.status.firstCall.args[0], 503);
  });
});
