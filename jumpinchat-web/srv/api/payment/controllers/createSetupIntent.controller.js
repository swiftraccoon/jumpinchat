import stripe from '../stripe.client.js';
import { getPaymentByUserId } from '../payment.utils.js';
import errors from '../../../config/constants/errors.js';
import logFactory from '../../../utils/logger.util.js';

const log = logFactory({ name: 'createSetupIntent.controller' });
export default async function createSetupIntent(req, res) {
  const { userId } = req.params;
  if (String(req.user._id) !== userId) return res.status(403).send();
  try {
    const payment = await getPaymentByUserId(userId, { isSubscription: true });
    if (!payment?.customerId || !payment.subscription?.id) return res.status(404).send();
    const intent = await stripe.setupIntents.create({
      customer: payment.customerId,
      usage: 'off_session',
      payment_method_types: ['card'],
      metadata: { userId },
    });
    return res.status(201).send({ clientSecret: intent.client_secret });
  } catch (err) {
    log.error({ err }, 'failed to create payment method setup');
    return res.status(500).send(errors.ERR_SRV);
  }
}
