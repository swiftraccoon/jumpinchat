import { randomUUID } from 'node:crypto';
import axios from 'axios';
import config from '../../config/env/index.js';
import trophyUtils from '../trophy/trophy.utils.js';
import User from '../user/user.model.js';
import logFactory from '../../utils/logger.util.js';
import Payment from './payment.model.js';
import CheckoutSession from './checkoutSession.model.js';
import stripe from './stripe.client.js';

const log = logFactory({ name: 'payment.utils' });
const resourceId = value => typeof value === 'string' ? value : value?.id;

let paymentIndexReady;
export function ensurePaymentIndexes() {
  // Production disables automatic schema indexes. Do not accept new payments
  // until Mongo has created/verified the index used by fulfillment retries.
  paymentIndexReady ??= Payment.collection.createIndex({ checkoutSessionId: 1 }, {
    name: 'payment_checkout_session_unique', unique: true,
    partialFilterExpression: { checkoutSessionId: { $type: 'string' } },
  }).catch(err => { paymentIndexReady = undefined; throw err; });
  return paymentIndexReady;
}

export function saveCheckoutSession(userId, checkoutSessionId, beneficiary) {
  return CheckoutSession.create({ userId, checkoutSessionId, beneficiary, fulfillmentVersion: 2 });
}

export function getPaymentByUserId(userId, { isSubscription = false } = {}) {
  const query = { userId };
  if (isSubscription) query['subscription.id'] = { $ne: null };
  return Payment.findOne(query).sort({ createdAt: -1 }).exec();
}

export function getPaymentBySubscriptionId(subscriptionId) {
  return Payment.findOne({ 'subscription.id': subscriptionId }).exec();
}

export function getSessionById(checkoutSessionId) {
  return CheckoutSession.findOne({ checkoutSessionId })
    .populate({ path: 'beneficiary', select: ['username'] })
    .populate({ path: 'userId', select: ['username'] }).exec();
}

export async function claimCheckoutSession(session) {
  const token = randomUUID();
  const now = new Date();
  const claimed = await CheckoutSession.findOneAndUpdate({
    _id: session._id,
    fulfilledAt: null,
    $or: [{ fulfillmentClaimUntil: null }, { fulfillmentClaimUntil: { $lte: now } }],
  }, { $set: { fulfillmentClaimToken: token, fulfillmentClaimUntil: new Date(now.getTime() + 120000) } },
  { returnDocument: 'after' }).exec();
  if (!claimed) {
    const current = await CheckoutSession.findById(session._id).exec();
    if (current?.fulfilledAt) return null;
    throw new Error('Checkout fulfillment is already in progress; retry this delivery');
  }
  return token;
}

export async function finishCheckoutSession(sessionId, token) {
  const result = await CheckoutSession.updateOne({ _id: sessionId, fulfillmentClaimToken: token }, {
    $set: { fulfilledAt: new Date() },
    $unset: { fulfillmentClaimToken: '', fulfillmentClaimUntil: '' },
  }).exec();
  if (!result.matchedCount) throw new Error('Checkout fulfillment lease changed; retry this delivery');
}

export function releaseCheckoutSession(sessionId, token) {
  return CheckoutSession.updateOne({ _id: sessionId, fulfillmentClaimToken: token }, {
    $unset: { fulfillmentClaimToken: '', fulfillmentClaimUntil: '' },
  }).exec();
}

export async function applyCheckoutSupport(userId, checkoutSessionId, { duration, expiresAt, isGold }) {
  const currentExpiry = { $ifNull: ['$attrs.supportExpires', new Date(0)] };
  const expiry = expiresAt ? { $max: [currentExpiry, expiresAt] }
    : { $add: [{ $max: [currentExpiry, '$$NOW'] }, duration] };
  // The grant and its replay marker are one atomic document update. A crash
  // before session completion can be retried without extending time again.
  const result = await User.updateOne({ _id: userId, 'attrs.appliedCheckoutSessions': { $ne: checkoutSessionId } }, [{
    $set: {
      'attrs.isSupporter': true,
      ...(isGold ? { 'attrs.isGold': true } : {}),
      'attrs.supportExpires': expiry,
      'attrs.appliedCheckoutSessions': {
        $concatArrays: [{ $ifNull: ['$attrs.appliedCheckoutSessions', []] }, [checkoutSessionId]],
      },
    },
  }], { updatePipeline: true }).exec();
  if (!result.matchedCount && !await User.exists({ _id: userId })) throw new Error('Support recipient no longer exists');
  return result.modifiedCount > 0;
}

export async function saveCheckoutPayment(session, checkout, priceId, { subscriptionActive = true } = {}) {
  await ensurePaymentIndexes();
  const payment = {
    userId: session.userId._id,
    customerId: resourceId(checkout.customer),
    checkoutSessionId: checkout.id,
    beneficiary: session.beneficiary?._id,
    ...(checkout.mode === 'subscription' && subscriptionActive ? {
      subscription: { id: resourceId(checkout.subscription), planId: priceId },
    } : {}),
  };
  try {
    return await Payment.updateOne({ checkoutSessionId: checkout.id }, { $setOnInsert: payment }, { upsert: true }).exec();
  } catch (err) {
    // An expired worker can overlap its retry; the unique session key makes
    // the payment record idempotent as well as the user grant.
    if (err.code !== 11000) throw err;
    const existing = await Payment.findOne({ checkoutSessionId: checkout.id }).exec();
    if (!existing) throw err;
    return existing;
  }
}

export async function deletePayment(id) {
  const payment = await Payment.findById(id).exec();
  if (!payment) return;
  const other = await Payment.exists({ _id: { $ne: id }, userId: payment.userId, 'subscription.id': { $ne: null } });
  if (!other) await User.updateOne({ _id: payment.userId }, { $set: { 'attrs.isGold': false } }).exec();
  // Retain the checkout key as a tombstone. An expired fulfillment worker's
  // $setOnInsert retry must not recreate canceled subscription metadata.
  await Payment.updateOne({ _id: id }, { $unset: { subscription: '' } }).exec();
}

export async function handleSubscriptionDeleted(subscription) {
  const payment = await getPaymentBySubscriptionId(subscription.id);
  if (payment) return deletePayment(payment._id);
  // A cancellation can precede checkout fulfillment. Serialize it with the
  // same lease so fulfillment cannot resurrect gold after the deletion event.
  const sessions = await stripe.checkout.sessions.list({ subscription: subscription.id, limit: 100 });
  if (sessions.has_more) throw new Error('Unexpected subscription checkout history');
  for (const checkout of sessions.data) {
    const local = await getSessionById(checkout.id);
    if (!local) throw new Error('Checkout session has not been recorded yet');
    if (local.fulfilledAt || local.fulfillmentVersion !== 2) continue;
    const token = await claimCheckoutSession(local);
    if (!token) continue;
    try {
      await CheckoutSession.updateOne({ _id: local._id, fulfillmentClaimToken: token }, {
        $set: { subscriptionCanceledAt: new Date() },
      }).exec();
    } finally {
      await releaseCheckoutSession(local._id, token);
    }
  }
  // Fulfillment may have completed while listing/claiming sessions above.
  const completedPayment = await getPaymentBySubscriptionId(subscription.id);
  if (completedPayment) await deletePayment(completedPayment._id);
}

export async function cancelSubscription(userId) {
  const payment = await getPaymentByUserId(userId, { isSubscription: true });
  if (!payment) throw Object.assign(new Error('Payment not found'), { name: 'NotFoundError' });
  await stripe.subscriptions.cancel(payment.subscription.id);
  await deletePayment(payment._id);
  return true;
}

export async function getPaidInvoicePeriod(invoice, subscriptionId) {
  if (invoice.status !== 'paid' || resourceId(invoice.parent?.subscription_details?.subscription) !== subscriptionId) {
    throw new Error('Paid subscription invoice required');
  }
  const lines = await stripe.invoices.listLineItems(invoice.id, { limit: 100 });
  if (lines.has_more) throw new Error('Unexpected invoice size');
  const periodEnds = lines.data.filter(line => resourceId(line.parent?.subscription_item_details?.subscription) === subscriptionId)
    .map(line => line.period?.end).filter(Number.isFinite);
  if (!periodEnds.length) throw new Error('Subscription invoice has no billing period');
  return new Date(Math.max(...periodEnds) * 1000);
}

export async function renewSubscription(invoice) {
  const subscriptionId = resourceId(invoice.parent?.subscription_details?.subscription);
  if (!subscriptionId || invoice.status !== 'paid') return;
  const payment = await getPaymentBySubscriptionId(subscriptionId);
  if (!payment) {
    const sessions = await stripe.checkout.sessions.list({ subscription: subscriptionId, limit: 100 });
    if (sessions.has_more) throw new Error('Unexpected subscription checkout history');
    for (const checkout of sessions.data) {
      const local = await getSessionById(checkout.id);
      if (local && !local.fulfilledAt && local.fulfillmentVersion === 2) {
        throw new Error('Subscription checkout fulfillment is pending; retry the invoice');
      }
    }
    return;
  }
  if (resourceId(invoice.customer) !== payment.customerId) throw new Error('Invoice customer mismatch');
  const expiresAt = await getPaidInvoicePeriod(invoice, subscriptionId);
  // Absolute paid-through dates make duplicate and out-of-order renewals harmless.
  await User.updateOne({ _id: payment.userId }, {
    $max: { 'attrs.supportExpires': expiresAt },
    $set: { 'attrs.isSupporter': true },
  }).exec();
}

export async function notifySlack(user, plan) {
  const hookUrl = config.slack?.hookUrl;
  if (!hookUrl) return;
  await axios.post(hookUrl, {
    username: 'Supporter bot',
    text: `New site supporter: ${user.username} (${plan.nickname})`,
  });
}

export function applySupporterTrophy(userId, isGold = false) {
  trophyUtils.applyTrophy(userId, 'TROPHY_SITE_SUPPORTER', (err) => {
    if (err) {
      log.fatal({ err }, 'failed to apply trophy');
      return;
    }

    log.debug('applied trophy');
  });

  if (isGold) {
    trophyUtils.applyTrophy(userId, 'TROPHY_SITE_SUPPORTER_GOLD', (err) => {
      if (err) {
        log.fatal({ err }, 'failed to apply trophy');
        return;
      }

      log.debug('applied trophy');
    });
  }
};

export function applyGiftTrophies(senderId, recipientId) {
  trophyUtils.applyTrophy(senderId, 'TROPHY_DID_GIFT', (err) => {
    if (err) {
      log.fatal({ err }, 'failed to apply trophy');
      return;
    }

    log.debug({ trophy: 'TROPHY_DID_GIFT', userId: senderId }, 'applied trophy');
  });

  trophyUtils.applyTrophy(recipientId, 'TROPHY_GIFTED', (err) => {
    if (err) {
      log.fatal({ err }, 'failed to apply trophy');
      return;
    }

    log.debug({ trophy: 'TROPHY_GIFTED', userId: recipientId }, 'applied trophy');
  });
};


export default { ensurePaymentIndexes, saveCheckoutSession, getPaymentByUserId, getPaymentBySubscriptionId, getSessionById,
  claimCheckoutSession, finishCheckoutSession, releaseCheckoutSession, applyCheckoutSupport,
  saveCheckoutPayment, deletePayment, handleSubscriptionDeleted, cancelSubscription, getPaidInvoicePeriod, renewSubscription,
  notifySlack, applySupporterTrophy, applyGiftTrophies };
