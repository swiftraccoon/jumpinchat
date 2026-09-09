import assert from 'node:assert/strict';
import sinon from 'sinon';
import esmock from 'esmock';
import { logger, response, accountPayment } from './paymentTestHelpers.js';

describe('SetupIntent payment method changes', () => {
  let req, res, stripe, utils, intent, update, setup;
  beforeEach(async () => {
    req = { user: { _id: 'user_1' }, params: { userId: 'user_1' }, body: { setupIntentId: 'seti_1' } };
    res = response();
    intent = { id: 'seti_1', status: 'succeeded', customer: 'cus_1', metadata: { userId: 'user_1' },
      payment_method: { id: 'pm_1', customer: 'cus_1', type: 'card' } };
    stripe = { setupIntents: { create: sinon.stub().resolves({ client_secret: 'fixture_client_secret' }), retrieve: sinon.stub().resolves(intent) },
      customers: { update: sinon.stub().resolves() }, subscriptions: { update: sinon.stub().resolves() } };
    utils = { getPaymentByUserId: sinon.stub().resolves(accountPayment) };
    const mocks = { '../stripe.client.js': { default: stripe }, '../payment.utils.js': utils, '../../../utils/logger.util.js': logger };
    update = (await esmock('./updateSource.controller.js', mocks)).default;
    setup = (await esmock('./createSetupIntent.controller.js', mocks)).default;
  });
  it('creates an off-session card setup bound to the authenticated account and customer', async () => {
    await setup(req, res);
    sinon.assert.calledWith(stripe.setupIntents.create, { customer: 'cus_1', usage: 'off_session', payment_method_types: ['card'], metadata: { userId: 'user_1' } });
    assert.equal(res.status.firstCall.args[0], 201);
    assert.deepEqual(res.send.firstCall.args[0], { clientSecret: 'fixture_client_secret' });
  });
  it('sets both subscription and invoice defaults after successful confirmation', async () => {
    await update(req, res);
    assert.equal(res.status.firstCall.args[0], 200);
    sinon.assert.calledWith(stripe.subscriptions.update, 'sub_1', { default_payment_method: 'pm_1' });
    sinon.assert.calledWith(stripe.customers.update, 'cus_1', { invoice_settings: { default_payment_method: 'pm_1' } });
  });
  for (const change of [
    value => { value.status = 'requires_action'; },
    value => { value.customer = 'cus_other'; },
    value => { value.metadata.userId = 'other'; },
    value => { value.payment_method.customer = 'cus_other'; },
    value => { value.payment_method.type = 'us_bank_account'; },
    value => { value.payment_method = null; },
  ]) {
    it('rejects an incomplete or unrelated confirmed method', async () => {
      change(intent);
      await update(req, res);
      assert.equal(res.status.firstCall.args[0], 400);
      sinon.assert.notCalled(stripe.customers.update);
      sinon.assert.notCalled(stripe.subscriptions.update);
    });
  }
  it('rejects legacy source tokens without contacting Stripe', async () => {
    req.body = { stripeToken: 'src_legacy' };
    await update(req, res);
    assert.equal(res.status.firstCall.args[0], 400);
    sinon.assert.notCalled(stripe.setupIntents.retrieve);
  });
  it('authorizes both endpoints before loading the customer', async () => {
    req.params.userId = 'other';
    await setup(req, res);
    await update(req, res);
    assert.deepEqual(res.status.args, [[403], [403]]);
    sinon.assert.notCalled(utils.getPaymentByUserId);
  });
  it('returns 404 when the user has no subscription', async () => {
    utils.getPaymentByUserId.resolves(null);
    await setup(req, res);
    await update(req, res);
    assert.deepEqual(res.status.args, [[404], [404]]);
  });
  it('allows retry when updating the second default fails', async () => {
    stripe.customers.update.onFirstCall().rejects(new Error('temporary failure'));
    await update(req, res);
    assert.equal(res.status.lastCall.args[0], 500);
    await update(req, res);
    assert.equal(res.status.lastCall.args[0], 200);
  });
});
