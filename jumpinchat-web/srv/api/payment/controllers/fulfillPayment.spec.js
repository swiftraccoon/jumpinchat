import assert from 'node:assert/strict';
import sinon from 'sinon';
import esmock from 'esmock';
import { logger } from './paymentTestHelpers.js';

describe('Checkout fulfillment', () => {
  let checkout, local, utils, stripe, fulfill, message;
  beforeEach(async () => {
    checkout = { id: 'cs_1', customer: 'cus_1', mode: 'payment', payment_status: 'paid',
      currency: 'usd', amount_total: 600, client_reference_id: 'user_1' };
    local = { _id: 'local_1', fulfillmentVersion: 2, userId: { _id: 'user_1', username: 'payer' } };
    utils = {
      getSessionById: sinon.stub().resolves(local), claimCheckoutSession: sinon.stub().resolves('lease'),
      releaseCheckoutSession: sinon.stub().resolves(), finishCheckoutSession: sinon.stub().resolves(),
      applyCheckoutSupport: sinon.stub().resolves(true), saveCheckoutPayment: sinon.stub().resolves(),
      applySupporterTrophy: sinon.stub(), applyGiftTrophies: sinon.stub(), notifySlack: sinon.stub().resolves(),
      getPaidInvoicePeriod: sinon.stub().resolves(new Date('2027-09-01T00:00:00Z')),
    };
    stripe = { checkout: { sessions: { retrieve: sinon.stub().resolves(checkout),
      listLineItems: sinon.stub().resolves({ data: [{ price: { id: 'price_1', nickname: 'Annual' } }], has_more: false }) } },
      subscriptions: { retrieve: sinon.stub().resolves({ id: 'sub_1', customer: 'cus_1', status: 'active' }) },
      invoices: { retrieve: sinon.stub().resolves({ id: 'in_1', customer: 'cus_1', status: 'paid' }) } };
    message = sinon.stub().resolves();
    fulfill = (await esmock('./fulfillPayment.controller.js', {
      '../stripe.client.js': { default: stripe }, '../payment.utils.js': { default: utils },
      '../../../utils/logger.util.js': logger, '../../message/utils/metaSendMessage.util.js': { default: message },
    })).default;
  });
  it('retrieves the pinned current session and uses amount_total instead of removed display_items', async () => {
    assert.equal(await fulfill({ id: 'cs_1' }), true);
    sinon.assert.calledWith(stripe.checkout.sessions.retrieve, 'cs_1');
    sinon.assert.calledWith(utils.applyCheckoutSupport, 'user_1', 'cs_1', { duration: 28 * 86400000, expiresAt: undefined, isGold: false });
    sinon.assert.callOrder(utils.applyCheckoutSupport, utils.saveCheckoutPayment, utils.finishCheckoutSession, message);
  });
  it('does not fulfill delayed payment completion before payment succeeds', async () => {
    checkout.payment_status = 'unpaid';
    assert.equal(await fulfill(checkout), false);
    sinon.assert.notCalled(utils.claimCheckoutSession);
    sinon.assert.notCalled(utils.applyCheckoutSupport);
  });
  it('requires explicit reconciliation of historical sessions', async () => {
    delete local.fulfillmentVersion;
    await assert.rejects(fulfill(checkout), /Legacy checkout/);
    sinon.assert.notCalled(utils.applyCheckoutSupport);
  });
  it('does not replay a completed checkout or resend its notifications', async () => {
    local.fulfilledAt = new Date();
    assert.equal(await fulfill(checkout), true);
    sinon.assert.notCalled(utils.claimCheckoutSession);
    sinon.assert.notCalled(message);
  });
  it('waits for a concurrent fulfillment instead of acknowledging an unfinished grant', async () => {
    utils.claimCheckoutSession.rejects(new Error('already in progress'));
    await assert.rejects(fulfill(checkout), /already in progress/);
    sinon.assert.notCalled(utils.applyCheckoutSupport);
  });
  it('releases the lease and propagates a failure after the grant so Stripe retries', async () => {
    utils.saveCheckoutPayment.onFirstCall().rejects(new Error('database unavailable'));
    await assert.rejects(fulfill(checkout), /database unavailable/);
    sinon.assert.calledWith(utils.releaseCheckoutSession, 'local_1', 'lease');
    sinon.assert.notCalled(utils.finishCheckoutSession);
    utils.applyCheckoutSupport.resolves(false); // atomic marker makes the next grant a no-op
    await fulfill(checkout);
    sinon.assert.calledOnce(utils.finishCheckoutSession);
  });
  it('fulfills gifts for the recipient and acknowledges both participants', async () => {
    local.beneficiary = { _id: 'recipient', username: 'gifted' };
    await fulfill(checkout);
    assert.equal(utils.applyCheckoutSupport.firstCall.args[0], 'recipient');
    sinon.assert.calledWith(utils.applyGiftTrophies, 'user_1', 'recipient');
    assert.equal(message.firstCall.args[0], 'recipient');
    assert.match(message.firstCall.args[1], /\/profile\/payer/);
    assert.equal(message.secondCall.args[0], 'user_1');
  });
  it('uses the actual paid annual invoice period, preserving annual coverage', async () => {
    Object.assign(checkout, { mode: 'subscription', subscription: 'sub_1', invoice: 'in_1' });
    await fulfill(checkout);
    assert.deepEqual(utils.applyCheckoutSupport.firstCall.args[2], {
      duration: undefined, expiresAt: new Date('2027-09-01T00:00:00Z'), isGold: true,
    });
    assert.equal(utils.saveCheckoutPayment.firstCall.args[2], 'price_1');
  });
  it('does not resurrect a subscription canceled before its checkout event', async () => {
    Object.assign(checkout, { mode: 'subscription', subscription: 'sub_1', invoice: 'in_1' });
    local.subscriptionCanceledAt = new Date();
    await fulfill(checkout);
    assert.equal(utils.applyCheckoutSupport.firstCall.args[2].isGold, false);
    assert.deepEqual(utils.saveCheckoutPayment.firstCall.args[3], { subscriptionActive: false });
  });
  it('rejects inconsistent paid amounts and payer identities without granting support', async () => {
    checkout.amount_total = 0;
    await assert.rejects(fulfill(checkout), /Invalid paid/);
    checkout.amount_total = 300;
    checkout.client_reference_id = 'other';
    await assert.rejects(fulfill(checkout), /payer mismatch/);
    sinon.assert.notCalled(utils.applyCheckoutSupport);
  });
  it('keeps successful durable fulfillment when a notification fails', async () => {
    message.rejects(new Error('notification unavailable'));
    assert.equal(await fulfill(checkout), true);
    sinon.assert.calledOnce(utils.finishCheckoutSession);
    sinon.assert.notCalled(utils.releaseCheckoutSession);
  });
});
