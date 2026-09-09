import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
import stripe from '../stripe.client.js';
import { getPaymentByUserId } from '../payment.utils.js';

const log = logFactory({ name: 'getSubscription.controller' });
const resourceId = value => typeof value === 'string' ? value : value?.id;

export default async function getSubscription(req, res) {
  const { userId } = req.params;
  if (String(req.user._id) !== userId) return res.status(403).send();
  try {
    const payment = await getPaymentByUserId(userId, { isSubscription: true });
    if (!payment?.customerId || !payment.subscription?.id) return res.status(404).send();
    const subscription = await stripe.subscriptions.retrieve(payment.subscription.id, {
      expand: ['default_payment_method', 'items.data.price'],
    });
    if (resourceId(subscription.customer) !== payment.customerId) throw new Error('Subscription customer mismatch');
    if (subscription.status === 'canceled') return res.status(404).send();
    let method = subscription.default_payment_method;
    if (!method) {
      const customer = await stripe.customers.retrieve(payment.customerId);
      if (customer.deleted) return res.status(404).send();
      method = customer.invoice_settings?.default_payment_method;
    }
    if (typeof method === 'string') method = await stripe.paymentMethods.retrieve(method);
    const card = method?.card;
    const price = subscription.items?.data[0]?.price;
    const plan = typeof price === 'object' ? price
      : await stripe.prices.retrieve(price || payment.subscription.planId);
    return res.status(200).send({
      paymentId: payment._id,
      plan: { id: plan.id, name: plan.nickname, amount: plan.unit_amount,
        created: payment.createdAt, interval: plan.recurring?.interval },
      source: card ? { last4: card.last4, expiry: { month: card.exp_month, year: card.exp_year }, brand: card.brand } : null,
    });
  } catch (err) {
    log.error({ err, userId }, 'failed to fetch subscription');
    return res.status(500).send(errors.ERR_SRV);
  }
}
