import stripe from '../stripe.client.js';
import { getPaymentByUserId } from '../payment.utils.js';
import errors from '../../../config/constants/errors.js';
import logFactory from '../../../utils/logger.util.js';

const log = logFactory({ name: 'updatePaymentMethod.controller' });
const resourceId = value => typeof value === 'string' ? value : value?.id;
export default async function updatePaymentMethod(req, res) {
  const { userId } = req.params;
  if (String(req.user._id) !== userId) return res.status(403).send();
  const { setupIntentId } = req.body;
  if (typeof setupIntentId !== 'string' || !setupIntentId.startsWith('seti_')) {
    return res.status(400).send({ message: 'A confirmed payment method setup is required' });
  }
  try {
    const payment = await getPaymentByUserId(userId, { isSubscription: true });
    if (!payment?.customerId || !payment.subscription?.id) return res.status(404).send();
    const intent = await stripe.setupIntents.retrieve(setupIntentId, { expand: ['payment_method'] });
    const method = intent.payment_method;
    if (intent.status !== 'succeeded' || resourceId(intent.customer) !== payment.customerId
      || intent.metadata?.userId !== userId || method?.type !== 'card'
      || resourceId(method.customer) !== payment.customerId) {
      return res.status(400).send({ message: 'Payment method setup is incomplete or belongs to another account' });
    }
    // Updating both defaults also supports subscriptions that override the customer default.
    await stripe.subscriptions.update(payment.subscription.id, { default_payment_method: method.id });
    await stripe.customers.update(payment.customerId, { invoice_settings: { default_payment_method: method.id } });
    return res.status(200).send({ updated: true });
  } catch (err) {
    log.error({ err }, 'failed to update payment method');
    return res.status(500).send(errors.ERR_SRV);
  }
}
