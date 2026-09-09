import stripe from '../stripe.client.js';
import paymentUtils from '../payment.utils.js';
import logFactory from '../../../utils/logger.util.js';
import metaSendMessage from '../../message/utils/metaSendMessage.util.js';
import { PAYMENT_ONETIME, PAYMENT_GIFT_SENDER } from '../../message/message.constants.js';

const log = logFactory({ name: 'fulfillPayment.controller' });
const resourceId = value => typeof value === 'string' ? value : value?.id;

export default async function fulfillPayment(eventSession) {
  // Retrieve the current object: webhook endpoint versions are configured separately.
  const checkout = await stripe.checkout.sessions.retrieve(eventSession.id);
  if (!['payment', 'subscription'].includes(checkout.mode)) throw new Error('Unsupported checkout mode');
  if (!['paid', 'no_payment_required'].includes(checkout.payment_status)) return false;
  const session = await paymentUtils.getSessionById(checkout.id);
  if (!session?.userId) throw new Error('Checkout session or payer no longer exists');
  if (session.fulfilledAt) return true;
  if (session.fulfillmentVersion !== 2) throw new Error('Legacy checkout requires operator reconciliation before fulfillment');
  const token = await paymentUtils.claimCheckoutSession(session);
  if (!token) return true;

  let price;
  const isSubscription = checkout.mode === 'subscription';
  let isGold = isSubscription;
  const recipient = session.beneficiary || session.userId;
  try {
    if (checkout.client_reference_id && checkout.client_reference_id !== String(session.userId._id)) {
      throw new Error('Checkout payer mismatch');
    }
    if (isSubscription && session.beneficiary) throw new Error('Subscription gifts are unsupported');
    let expiresAt;
    let duration;
    if (isSubscription) {
      const subscription = await stripe.subscriptions.retrieve(resourceId(checkout.subscription));
      const currentSession = await paymentUtils.getSessionById(checkout.id);
      isGold = !currentSession.subscriptionCanceledAt && !['canceled', 'incomplete_expired'].includes(subscription.status);
      if (resourceId(subscription.customer) !== resourceId(checkout.customer)) throw new Error('Subscription customer mismatch');
      const items = await stripe.checkout.sessions.listLineItems(checkout.id, { limit: 2 });
      if (items.data.length !== 1 || items.has_more) throw new Error('Unexpected checkout line items');
      price = items.data[0].price;
      const invoice = await stripe.invoices.retrieve(resourceId(checkout.invoice));
      if (resourceId(invoice.customer) !== resourceId(checkout.customer)) throw new Error('Invoice customer mismatch');
      expiresAt = await paymentUtils.getPaidInvoicePeriod(invoice, subscription.id);
    } else {
      if (checkout.currency !== 'usd' || !Number.isInteger(checkout.amount_total)
        || checkout.amount_total < 300 || checkout.amount_total > 5000) throw new Error('Invalid paid checkout amount');
      duration = 1000 * 60 * 60 * 24 * 14 * (checkout.amount_total / 300);
    }
    await paymentUtils.applyCheckoutSupport(recipient._id, checkout.id, { duration, expiresAt, isGold });
    await paymentUtils.saveCheckoutPayment(session, checkout, resourceId(price), { subscriptionActive: isGold });
    await paymentUtils.finishCheckoutSession(session._id, token);
  } catch (err) {
    try { await paymentUtils.releaseCheckoutSession(session._id, token); }
    catch (releaseError) { log.error({ err: releaseError }, 'failed to release fulfillment lease; it will expire'); }
    throw err;
  }

  // Grants and payment records are durable before best-effort notifications.
  // A crashed notification is not replayed with a second financial grant.
  try {
    paymentUtils.applySupporterTrophy(recipient._id, isGold);
    if (session.beneficiary) {
      paymentUtils.applyGiftTrophies(session.userId._id, recipient._id);
      await metaSendMessage(recipient._id,
        `[${session.userId.username}](/profile/${session.userId.username}) has gifted you $${checkout.amount_total / 100} worth of site supporter status`);
      await metaSendMessage(session.userId._id, PAYMENT_GIFT_SENDER);
    } else await metaSendMessage(recipient._id, PAYMENT_ONETIME);
    await paymentUtils.notifySlack(session.userId, { nickname: price?.nickname || `single donation of $${checkout.amount_total / 100}` });
  } catch (err) {
    log.error({ err, checkoutSessionId: checkout.id }, 'failed to send payment notification');
  }
  return true;
}
