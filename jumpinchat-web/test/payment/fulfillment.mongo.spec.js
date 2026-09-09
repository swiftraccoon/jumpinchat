import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import sinon from 'sinon';
import esmock from 'esmock';
import User from '../../srv/api/user/user.model.js';
import Payment from '../../srv/api/payment/payment.model.js';
import CheckoutSession from '../../srv/api/payment/checkoutSession.model.js';

// Run only against an explicitly supplied local disposable MongoDB instance.
// The suite creates and removes its own uniquely named database.
const uri = process.env.PAYMENT_TEST_MONGO_URI;
if (!uri || !/^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\//.test(uri)) {
  throw new Error('Set PAYMENT_TEST_MONGO_URI to a disposable loopback MongoDB instance');
}
const dbName = `payment_migration_${randomUUID().replaceAll('-', '')}`;
const baseExpiry = new Date('2030-01-01T00:00:00.000Z');
const day = 86400000;
const logger = { default: () => ({ debug() {}, info() {}, warn() {}, error() {}, fatal() {} }) };
let utils, stripe, user, checkout, local;

before(async () => {
  await mongoose.connect(uri, { dbName, autoIndex: false });
  stripe = {
    checkout: { sessions: { retrieve: sinon.stub(), list: sinon.stub().resolves({ data: [], has_more: false }) } },
    invoices: { listLineItems: sinon.stub() },
  };
  utils = await esmock('../../srv/api/payment/payment.utils.js', {
    '../../srv/utils/logger.util.js': logger,
    '../../srv/api/payment/stripe.client.js': { default: stripe },
    '../../srv/api/trophy/trophy.utils.js': { default: { applyTrophy: (_id, _trophy, done) => done() } },
    '../../srv/config/env/index.js': { default: { slack: {} } },
  });
});
after(async () => {
  if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Payment.deleteMany({}), CheckoutSession.deleteMany({})]);
  user = await User.create({ username: 'local_fixture', attrs: { supportExpires: baseExpiry } });
  checkout = { id: `cs_${randomUUID()}`, customer: 'cus_fixture', mode: 'payment',
    payment_status: 'paid', currency: 'usd', amount_total: 300, client_reference_id: String(user._id) };
  local = await utils.saveCheckoutSession(user._id, checkout.id);
  stripe.checkout.sessions.retrieve.resolves(checkout);
  stripe.checkout.sessions.list.resetBehavior();
  stripe.checkout.sessions.list.resolves({ data: [], has_more: false });
});

async function makeFulfillment(overrides = {}) {
  return (await esmock('../../srv/api/payment/controllers/fulfillPayment.controller.js', {
    '../../srv/api/payment/stripe.client.js': { default: stripe }, '../../srv/api/payment/payment.utils.js': { default: { ...utils.default, ...overrides } },
    '../../srv/utils/logger.util.js': logger,
    '../../srv/api/message/utils/metaSendMessage.util.js': { default: async () => {} },
  })).default;
}

async function storedUser() {
  return User.findById(user._id).select('+attrs.appliedCheckoutSessions').lean();
}

describe('MongoDB payment durability and concurrency', () => {
  it('creates the required unique partial index with autoIndex disabled and excludes historical rows', async () => {
    await Payment.create([{ userId: user._id }, { userId: user._id }]);
    await utils.ensurePaymentIndexes();
    const index = (await Payment.collection.indexes()).find(value => value.name === 'payment_checkout_session_unique');
    assert.equal(index.unique, true);
    assert.deepEqual(index.partialFilterExpression, { checkoutSessionId: { $type: 'string' } });
    await Payment.create({ checkoutSessionId: 'cs_unique' });
    await assert.rejects(Payment.create({ checkoutSessionId: 'cs_unique' }), error => error.code === 11000);
  });

  it('executes the date pipeline atomically for concurrent deliveries of the same checkout', async () => {
    const results = await Promise.all(Array.from({ length: 24 }, () =>
      utils.applyCheckoutSupport(user._id, checkout.id, { duration: 14 * day, isGold: false })));
    assert.equal(results.filter(Boolean).length, 1);
    const stored = await storedUser();
    assert.equal(stored.attrs.supportExpires.getTime(), baseExpiry.getTime() + 14 * day);
    assert.deepEqual(stored.attrs.appliedCheckoutSessions, [checkout.id]);
  });

  it('preserves distinct simultaneous gifts without losing either extension', async () => {
    await Promise.all(Array.from({ length: 8 }, (_, index) =>
      utils.applyCheckoutSupport(user._id, `cs_gift_${index}`, { duration: day, isGold: false })));
    const stored = await storedUser();
    assert.equal(stored.attrs.supportExpires.getTime(), baseExpiry.getTime() + 8 * day);
    assert.equal(stored.attrs.appliedCheckoutSessions.length, 8);
  });

  it('recovers after a failure between user grant and payment recording without adding time twice', async () => {
    let attempts = 0;
    const fulfill = await makeFulfillment({ saveCheckoutPayment: async (...args) => {
      attempts += 1;
      if (attempts === 1) throw new Error('injected database write failure');
      return utils.saveCheckoutPayment(...args);
    } });
    await assert.rejects(fulfill(checkout), /injected database/);
    assert.equal((await CheckoutSession.findById(local._id)).fulfillmentClaimToken, undefined);
    await fulfill(checkout);
    const stored = await storedUser();
    assert.equal(stored.attrs.supportExpires.getTime(), baseExpiry.getTime() + 14 * day);
    assert.equal(stored.attrs.appliedCheckoutSessions.length, 1);
    assert.equal(await Payment.countDocuments({ checkoutSessionId: checkout.id }), 1);
    assert.ok((await CheckoutSession.findById(local._id)).fulfilledAt);
  });

  it('serializes simultaneous full fulfillments and safely acknowledges a later retry', async () => {
    const fulfill = await makeFulfillment();
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => fulfill(checkout)));
    assert.ok(results.some(value => value.status === 'fulfilled'));
    for (const value of results.filter(result => result.status === 'rejected')) {
      assert.match(value.reason.message, /already in progress/);
    }
    await fulfill(checkout);
    assert.equal((await storedUser()).attrs.supportExpires.getTime(), baseExpiry.getTime() + 14 * day);
    assert.equal(await Payment.countDocuments({ checkoutSessionId: checkout.id }), 1);
  });

  it('lets an expired lease recover while fencing off stale completion', async () => {
    const first = await utils.claimCheckoutSession(local);
    await assert.rejects(utils.claimCheckoutSession(local), /already in progress/);
    await CheckoutSession.updateOne({ _id: local._id }, { $set: { fulfillmentClaimUntil: new Date(0) } });
    const replacement = await utils.claimCheckoutSession(local);
    assert.notEqual(first, replacement);
    await assert.rejects(utils.finishCheckoutSession(local._id, first), /lease changed/);
    await utils.finishCheckoutSession(local._id, replacement);
    assert.equal(await utils.claimCheckoutSession(local), null);
  });

  it('deduplicates overlapping payment-record retries using the runtime-created index', async () => {
    const populated = await utils.getSessionById(checkout.id);
    await Promise.all(Array.from({ length: 12 }, () => utils.saveCheckoutPayment(populated, checkout)));
    assert.equal(await Payment.countDocuments({ checkoutSessionId: checkout.id }), 1);
  });

  it('hides replay markers from normal queries and user document serialization', async () => {
    await utils.applyCheckoutSupport(user._id, checkout.id, { duration: day, isGold: false });
    const normal = await User.findById(user._id).lean();
    assert.equal(normal.attrs.appliedCheckoutSessions, undefined);
    const selected = await User.findById(user._id).select('+attrs.appliedCheckoutSessions');
    assert.equal(selected.toJSON().attrs.appliedCheckoutSessions, undefined);
    assert.equal(selected.toObject().attrs.appliedCheckoutSessions, undefined);
    assert.equal(new User({ attrs: { appliedCheckoutSessions: ['internal'] } }).toJSON().attrs.appliedCheckoutSessions, undefined);
  });

  it('uses annual paid-through dates and does not shorten later gift or renewal coverage', async () => {
    await utils.applyCheckoutSupport(user._id, checkout.id, { expiresAt: new Date('2031-01-01Z'), isGold: true });
    await Payment.create({ userId: user._id, customerId: 'cus_fixture', subscription: { id: 'sub_fixture' } });
    const invoice = { id: 'in_fixture', status: 'paid', customer: 'cus_fixture', parent: { subscription_details: { subscription: 'sub_fixture' } } };
    stripe.invoices.listLineItems.resolves({ has_more: false, data: [{
      parent: { subscription_item_details: { subscription: 'sub_fixture' } }, period: { end: Date.parse('2032-01-01Z') / 1000 },
    }] });
    await utils.renewSubscription(invoice);
    await utils.renewSubscription(invoice);
    stripe.invoices.listLineItems.resolves({ has_more: false, data: [{
      parent: { subscription_item_details: { subscription: 'sub_fixture' } }, period: { end: Date.parse('2031-01-01Z') / 1000 },
    }] });
    await utils.renewSubscription(invoice);
    assert.equal((await storedUser()).attrs.supportExpires.toISOString(), '2032-01-01T00:00:00.000Z');
  });

  it('requests invoice redelivery if its subscription checkout has not yet fulfilled', async () => {
    stripe.checkout.sessions.list.resolves({ data: [{ id: checkout.id }], has_more: false });
    await assert.rejects(utils.renewSubscription({ id: 'in_later', status: 'paid', customer: 'cus_fixture',
      parent: { subscription_details: { subscription: 'sub_fixture' } } }), /fulfillment is pending/);
  });

  it('records an early cancellation under the fulfillment lease and retries one racing fulfillment', async () => {
    stripe.checkout.sessions.list.resolves({ data: [{ id: checkout.id }], has_more: false });
    const token = await utils.claimCheckoutSession(local);
    await assert.rejects(utils.handleSubscriptionDeleted({ id: 'sub_fixture' }), /already in progress/);
    await utils.releaseCheckoutSession(local._id, token);
    await utils.handleSubscriptionDeleted({ id: 'sub_fixture' });
    assert.ok((await CheckoutSession.findById(local._id)).subscriptionCanceledAt);
    assert.equal((await CheckoutSession.findById(local._id)).fulfillmentClaimToken, undefined);
  });

  it('reconciles cancellation when fulfillment finishes during checkout lookup', async () => {
    stripe.checkout.sessions.list.callsFake(async () => {
      await User.updateOne({ _id: user._id }, { $set: { 'attrs.isGold': true } });
      await Payment.create({ userId: user._id, customerId: 'cus_fixture', subscription: { id: 'sub_racing' } });
      await CheckoutSession.updateOne({ _id: local._id }, { $set: { fulfilledAt: new Date() } });
      return { data: [{ id: checkout.id }], has_more: false };
    });
    await utils.handleSubscriptionDeleted({ id: 'sub_racing' });
    assert.equal((await storedUser()).attrs.isGold, false);
    assert.equal(await Payment.countDocuments({ 'subscription.id': 'sub_racing' }), 0);
  });

  it('retains a checkout tombstone so a stale payment save cannot restore a canceled subscription', async () => {
    const populated = await utils.getSessionById(checkout.id);
    const paid = { ...checkout, mode: 'subscription', subscription: 'sub_stale' };
    await User.updateOne({ _id: user._id }, { $set: { 'attrs.isGold': true } });
    await utils.saveCheckoutPayment(populated, paid, 'price_fixture');
    await utils.handleSubscriptionDeleted({ id: 'sub_stale' });
    // Simulate a worker resuming its record-write step after its lease expired.
    await utils.saveCheckoutPayment(populated, paid, 'price_fixture');
    assert.equal(await Payment.countDocuments({ checkoutSessionId: checkout.id }), 1);
    assert.equal(await Payment.countDocuments({ 'subscription.id': 'sub_stale' }), 0);
    assert.equal((await storedUser()).attrs.isGold, false);
  });

  it('keeps a newer subscription gold when an older subscription is deleted', async () => {
    await User.updateOne({ _id: user._id }, { $set: { 'attrs.isGold': true } });
    await Payment.create([
      { userId: user._id, customerId: 'cus_fixture', subscription: { id: 'sub_old' } },
      { userId: user._id, customerId: 'cus_fixture', subscription: { id: 'sub_new' } },
    ]);
    await utils.handleSubscriptionDeleted({ id: 'sub_old' });
    assert.equal((await storedUser()).attrs.isGold, true);
    assert.equal(await Payment.countDocuments({ 'subscription.id': 'sub_old' }), 0);
  });
});
